import type { Integration } from '@prisma/client'
import { prisma } from './db'

interface GarminTokenResponse {
  access_token: string
  expires_in: number
  refresh_token: string
  token_type: string
  scope?: string
}

interface GarminApiErrorPayload {
  errorMessage?: string
  error?: string | { message?: string }
  message?: string
}

const GARMIN_WRITE_SCOPE = 'PARTNER_WRITE'
const GARMIN_IMPORT_PERMISSIONS = new Set(['WORKOUT_IMPORT', 'COURSE_IMPORT'])

/**
 * User-level grants that `GET /wellness-api/rest/user/permissions` is authoritative for.
 * A successful live response therefore *replaces* this subset of `Integration.scope`:
 * anything here that the response omits has been revoked in Garmin Connect.
 *
 * - `ACTIVITY_EXPORT` / `HEALTH_EXPORT` — wellness + activity export consents, toggled per user.
 * - `WORKOUT_IMPORT` / `COURSE_IMPORT`  — Training/Courses push consents, toggled per user.
 *
 * Everything else stored in `Integration.scope` (notably `PARTNER_WRITE` and any OAuth/API scope
 * returned by the token endpoint at connect time) is *not* reported by that endpoint and must be
 * preserved untouched — pruning it would silently break publishing for correctly connected users.
 */
export const GARMIN_USER_PERMISSIONS = new Set([
  'ACTIVITY_EXPORT',
  'HEALTH_EXPORT',
  'WORKOUT_IMPORT',
  'COURSE_IMPORT'
])
const GARMIN_TOKEN_REFRESH_BUFFER_MS = 10 * 60 * 1000
const GARMIN_TOKEN_REQUEST_TIMEOUT_MS = 10_000
const GARMIN_TOKEN_TRANSACTION_TIMEOUT_MS = 20_000

export function parseGarminScope(scope: string | null | undefined): Set<string> {
  if (!scope) return new Set()
  return new Set(
    scope
      .split(/[,\s]+/)
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean)
  )
}

export function buildGarminTimeSlices(
  startTimestamp: number,
  endTimestamp: number,
  maxSliceSeconds = 86400
): Array<{ startTimestamp: number; endTimestamp: number }> {
  const slices: Array<{ startTimestamp: number; endTimestamp: number }> = []
  let sliceStart = startTimestamp

  while (sliceStart < endTimestamp) {
    const sliceEnd = Math.min(sliceStart + maxSliceSeconds, endTimestamp)
    slices.push({ startTimestamp: sliceStart, endTimestamp: sliceEnd })
    sliceStart = sliceEnd
  }

  return slices
}

export function mergeGarminScopes(
  ...sources: Array<string | string[] | Set<string> | null | undefined>
): Set<string> {
  const merged = new Set<string>()

  for (const source of sources) {
    if (!source) continue

    if (typeof source === 'string') {
      for (const value of parseGarminScope(source)) merged.add(value)
      continue
    }

    for (const value of source) {
      if (typeof value !== 'string') continue
      const normalized = value.trim().toUpperCase()
      if (normalized) merged.add(normalized)
    }
  }

  return merged
}

/**
 * Reconcile stored `Integration.scope` against a *successful* live Garmin user-permissions
 * response.
 *
 * Unlike {@link mergeGarminScopes} (a pure union, still correct for merging OAuth scopes at
 * connect time), this applies replacement semantics to the subset the permissions endpoint owns:
 *
 * - values in {@link GARMIN_USER_PERMISSIONS} are kept only when the live response still lists them
 *   (so a revoked grant is dropped instead of surviving forever),
 * - every other stored value (OAuth/API scopes such as `PARTNER_WRITE`) is preserved as-is,
 * - anything the live response reports is added, including permissions we do not yet know about.
 *
 * Only call this with a parsed response from a successful request — an API failure must never be
 * treated as "zero permissions", or a transient blip would revoke the user's integration.
 */
export function reconcileGarminScopes(
  storedScope: string | string[] | Set<string> | null | undefined,
  livePermissions: string[] | Set<string> | null | undefined
): Set<string> {
  const stored = mergeGarminScopes(storedScope)
  const live = mergeGarminScopes(livePermissions)

  const reconciled = new Set<string>()

  for (const value of stored) {
    // Dynamic user permissions are authoritative in the live response; keep the rest untouched.
    if (GARMIN_USER_PERMISSIONS.has(value)) continue
    reconciled.add(value)
  }

  for (const value of live) reconciled.add(value)

  return reconciled
}

/**
 * Serialize a scope set for storage. An empty set is stored as `null` rather than an empty string
 * so "no permissions" reads the same as a never-populated scope column.
 */
export function serializeGarminScopes(scopes: Set<string> | string[]): string | null {
  const values = Array.from(scopes)
  return values.length > 0 ? values.join(' ') : null
}

function garminScopeSetsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const value of a) {
    if (!b.has(value)) return false
  }
  return true
}

export function hasGarminPermission(
  scope: string | Set<string> | null | undefined,
  permission: string
): boolean {
  const scopes = typeof scope === 'string' || !scope ? parseGarminScope(scope) : scope
  const normalizedPermission = permission.trim().toUpperCase()

  if (scopes.has(normalizedPermission)) return true

  if (GARMIN_IMPORT_PERMISSIONS.has(normalizedPermission) && scopes.has(GARMIN_WRITE_SCOPE)) {
    return true
  }

  return false
}

/**
 * Refreshes an expired Garmin access token
 */
export async function refreshGarminToken(integration: Integration): Promise<Integration> {
  const clientId = process.env.GARMIN_CLIENT_ID
  const clientSecret = process.env.GARMIN_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Garmin credentials not configured')
  }

  const result = await prisma.$transaction(
    async (transaction) => {
      // Garmin rotates the refresh token on every refresh. Lock the integration row so refreshes
      // are serialized across Trigger workers and web processes, not only within this process.
      await transaction.$queryRaw`SELECT "id" FROM "Integration" WHERE "id" = ${integration.id} FOR UPDATE`

      const latest = await transaction.integration.findUnique({
        where: { id: integration.id }
      })
      if (!latest) {
        throw new Error('Garmin integration no longer exists')
      }

      // A caller that waited for the lock must reuse credentials written by the winner. In
      // particular, it must not retry with the now-invalid refresh token it originally received.
      if (
        latest.accessToken !== integration.accessToken ||
        latest.refreshToken !== integration.refreshToken
      ) {
        return { integration: latest }
      }

      if (!latest.refreshToken) {
        throw new Error('No refresh token available for Garmin integration')
      }

      const response = await fetch('https://diauth.garmin.com/di-oauth2-service/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: latest.refreshToken,
          client_id: clientId,
          client_secret: clientSecret
        }).toString(),
        signal: AbortSignal.timeout(GARMIN_TOKEN_REQUEST_TIMEOUT_MS)
      })

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}))
        const errorMessage = extractGarminErrorMessage(response, errorBody)

        if (response.status === 400 || response.status === 401) {
          try {
            await transaction.integration.update({
              where: { id: integration.id },
              data: {
                syncStatus: 'FAILED',
                errorMessage:
                  'Garmin authorization expired or was revoked. Please reconnect Garmin.'
              }
            })
          } catch (updateError) {
            console.error('[Garmin] Failed to mark integration as reconnect required', {
              integrationId: integration.id,
              updateError
            })
          }
        }

        // Return the error so the transaction can commit the FAILED status before it is thrown.
        return { errorMessage }
      }

      const tokenData: GarminTokenResponse = await response.json()

      const updated = await transaction.integration.update({
        where: { id: integration.id },
        data: {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt: new Date(Date.now() + tokenData.expires_in * 1000)
        }
      })
      return { integration: updated }
    },
    { maxWait: GARMIN_TOKEN_TRANSACTION_TIMEOUT_MS, timeout: GARMIN_TOKEN_TRANSACTION_TIMEOUT_MS }
  )

  if ('errorMessage' in result) {
    throw new Error(`Failed to refresh Garmin token: ${result.errorMessage}`)
  }

  return result.integration
}

/**
 * Ensures a valid token, refreshing if necessary
 */
export async function ensureValidGarminToken(integration: Integration): Promise<Integration> {
  // Re-fetch to get the latest token from DB in case another parallel request refreshed it
  const latest = await prisma.integration.findUnique({
    where: { id: integration.id }
  })
  if (!latest) return integration

  if (
    !latest.expiresAt ||
    new Date() >= new Date(latest.expiresAt.getTime() - GARMIN_TOKEN_REFRESH_BUFFER_MS)
  ) {
    return await refreshGarminToken(latest)
  }
  return latest
}

function extractGarminErrorMessage(
  response: Response,
  errorBody: GarminApiErrorPayload | Record<string, unknown>
): string {
  if (typeof errorBody?.errorMessage === 'string' && errorBody.errorMessage.trim()) {
    return errorBody.errorMessage.trim()
  }
  if (typeof errorBody?.message === 'string' && errorBody.message.trim()) {
    return errorBody.message.trim()
  }
  if (typeof errorBody?.error === 'string' && errorBody.error.trim()) {
    return errorBody.error.trim()
  }

  // Handle nested object error: { error: { message: "..." } }
  const nestedError = errorBody?.error
  if (
    nestedError &&
    typeof nestedError === 'object' &&
    'message' in nestedError &&
    typeof nestedError.message === 'string' &&
    nestedError.message.trim()
  ) {
    return nestedError.message.trim()
  }

  return response.statusText || 'Unknown error'
}

function shouldRetryGarminAuth(
  response: Response,
  errorBody: GarminApiErrorPayload | Record<string, unknown>,
  hasRetried: boolean
) {
  if (hasRetried || response.status !== 401) return false

  const message = extractGarminErrorMessage(response, errorBody).toLowerCase()
  return (
    message.includes('token is not active') ||
    message.includes('authentication credentials') ||
    message === 'unauthorized'
  )
}

/**
 * Generic fetch with retry logic
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  backoff = 2000
): Promise<Response> {
  try {
    const response = await fetch(url, options)

    // Handle rate limiting (429)
    if (response.status === 429 && retries > 0) {
      const retryAfter = response.headers.get('Retry-After')
      const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : backoff

      console.warn(
        `[Garmin API] 429 Too Many Requests. Retrying in ${waitTime}ms... (${retries} retries left)`
      )
      await new Promise((resolve) => setTimeout(resolve, waitTime))

      return fetchWithRetry(url, options, retries - 1, backoff * 2)
    }

    return response
  } catch (error) {
    if (retries > 0) {
      console.warn(
        `[Garmin API] Network error: ${error}. Retrying in ${backoff}ms... (${retries} retries left)`
      )
      await new Promise((resolve) => setTimeout(resolve, backoff))
      return fetchWithRetry(url, options, retries - 1, backoff * 2)
    }
    throw error
  }
}

/**
 * Generic fetch for Garmin API
 */
export async function fetchGarminData(
  integration: Integration,
  url: string,
  params: Record<string, string> = {}
) {
  const targetUrl = new URL(url)
  Object.entries(params).forEach(([key, value]) => targetUrl.searchParams.append(key, value))

  let activeIntegration = await ensureValidGarminToken(integration)

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetchWithRetry(targetUrl.toString(), {
        headers: {
          Authorization: `Bearer ${activeIntegration.accessToken}`
        }
      })

      if (response.ok) {
        return await response.json()
      }

      const errorBody = await response.json().catch(() => ({}))
      const errorMessage = extractGarminErrorMessage(response, errorBody)

      if (shouldRetryGarminAuth(response, errorBody, attempt > 0)) {
        activeIntegration = await refreshGarminToken(activeIntegration)
        continue
      }

      console.error(`[DEBUG] Garmin API Request Failed:`, {
        url: targetUrl.toString(),
        status: response.status,
        statusText: response.statusText,
        errorBody,
        headers: Object.fromEntries(response.headers.entries())
      })

      throw new Error(`Garmin API error (${response.status}): ${errorMessage}`)
    }

    throw new Error('Garmin API request failed after token refresh retry')
  } catch (error: any) {
    console.error(`[DEBUG] Garmin fetch exception:`, {
      url: targetUrl.toString(),
      message: error.message,
      stack: error.stack
    })
    throw error
  }
}

/**
 * Fetch wellness summaries (Dailies)
 */
export async function fetchGarminDailies(
  integration: Integration,
  startTimestamp: number,
  endTimestamp: number,
  token?: string
) {
  const params: Record<string, string> = {
    uploadStartTimeInSeconds: startTimestamp.toString(),
    uploadEndTimeInSeconds: endTimestamp.toString()
  }
  if (token) params.token = token

  return fetchGarminData(integration, 'https://apis.garmin.com/wellness-api/rest/dailies', params)
}

/**
 * Fetch Sleep summaries
 */
export async function fetchGarminSleeps(
  integration: Integration,
  startTimestamp: number,
  endTimestamp: number,
  token?: string
) {
  const params: Record<string, string> = {
    uploadStartTimeInSeconds: startTimestamp.toString(),
    uploadEndTimeInSeconds: endTimestamp.toString()
  }
  if (token) params.token = token

  return fetchGarminData(integration, 'https://apis.garmin.com/wellness-api/rest/sleeps', params)
}

/**
 * Fetch HRV summaries
 */
export async function fetchGarminHRV(
  integration: Integration,
  startTimestamp: number,
  endTimestamp: number,
  token?: string
) {
  const params: Record<string, string> = {
    uploadStartTimeInSeconds: startTimestamp.toString(),
    uploadEndTimeInSeconds: endTimestamp.toString()
  }
  if (token) params.token = token

  return fetchGarminData(integration, 'https://apis.garmin.com/wellness-api/rest/hrv', params)
}

/**
 * Fetch Body Composition summaries
 */
export async function fetchGarminBodyComps(
  integration: Integration,
  startTimestamp: number,
  endTimestamp: number,
  token?: string
) {
  const params: Record<string, string> = {
    uploadStartTimeInSeconds: startTimestamp.toString(),
    uploadEndTimeInSeconds: endTimestamp.toString()
  }
  if (token) params.token = token

  return fetchGarminData(integration, 'https://apis.garmin.com/wellness-api/rest/bodyComps', params)
}

/**
 * Fetch User Metrics summaries (VO2 Max, etc.)
 */
export async function fetchGarminUserMetrics(
  integration: Integration,
  startTimestamp: number,
  endTimestamp: number,
  token?: string
) {
  const params: Record<string, string> = {
    uploadStartTimeInSeconds: startTimestamp.toString(),
    uploadEndTimeInSeconds: endTimestamp.toString()
  }
  if (token) params.token = token

  return fetchGarminData(
    integration,
    'https://apis.garmin.com/wellness-api/rest/userMetrics',
    params
  )
}

/**
 * Fetch discrete Activity summaries
 */
export async function fetchGarminActivities(
  integration: Integration,
  startTimestamp: number,
  endTimestamp: number,
  token?: string
) {
  const params: Record<string, string> = {
    uploadStartTimeInSeconds: startTimestamp.toString(),
    uploadEndTimeInSeconds: endTimestamp.toString()
  }
  if (token) params.token = token

  return fetchGarminData(
    integration,
    'https://apis.garmin.com/wellness-api/rest/activities',
    params
  )
}

/**
 * FIT file download tokens from Garmin webhooks are short-lived and single-use.
 * When queue processing is delayed, Garmin returns HTTP 400 "Invalid download token".
 */
export class GarminDownloadTokenExpiredError extends Error {
  readonly code = 'GARMIN_DOWNLOAD_TOKEN_EXPIRED' as const
  readonly statusCode: number
  readonly retryable = true

  constructor(message: string, statusCode = 400) {
    super(message)
    this.name = 'GarminDownloadTokenExpiredError'
    this.statusCode = statusCode
  }
}

export function isGarminDownloadTokenErrorMessage(message: string): boolean {
  return /invalid\s*(download|pull)?\s*token|invalidtokenexception|download token.*(expired|invalid)/i.test(
    message
  )
}

export function isGarminDownloadTokenError(
  error: unknown
): error is GarminDownloadTokenExpiredError {
  if (error instanceof GarminDownloadTokenExpiredError) return true
  if (!(error instanceof Error)) return false
  return isGarminDownloadTokenErrorMessage(error.message)
}

function throwGarminFileApiError(status: number, errorMessage: string): never {
  const fullMessage = `Garmin File API error (${status}): ${errorMessage}`
  if (status === 400 && isGarminDownloadTokenErrorMessage(errorMessage)) {
    throw new GarminDownloadTokenExpiredError(fullMessage, status)
  }
  throw new Error(fullMessage)
}

/**
 * Fetch raw activity file (FIT)
 */
export async function fetchGarminActivityFile(
  integration: Integration,
  fileId: string,
  pullToken?: string | null
): Promise<Buffer> {
  const url = new URL('https://apis.garmin.com/wellness-api/rest/activityFile')
  url.searchParams.set('id', fileId)
  if (pullToken) url.searchParams.set('token', pullToken)

  let activeIntegration = await ensureValidGarminToken(integration)

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetchWithRetry(url.toString(), {
      headers: {
        Authorization: `Bearer ${activeIntegration.accessToken}`
      }
    })

    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer()
      return Buffer.from(arrayBuffer)
    }

    const errorBody = await response.json().catch(() => ({}))
    const errorMessage = extractGarminErrorMessage(response, errorBody)

    if (shouldRetryGarminAuth(response, errorBody, attempt > 0)) {
      activeIntegration = await refreshGarminToken(activeIntegration)
      continue
    }

    throwGarminFileApiError(response.status, errorMessage)
  }

  throw new Error('Garmin File API request failed after token refresh retry')
}

export async function fetchGarminActivityFileByCallbackUrl(
  integration: Integration,
  callbackUrl: string
): Promise<Buffer> {
  let activeIntegration = await ensureValidGarminToken(integration)

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetchWithRetry(callbackUrl, {
      headers: {
        Authorization: `Bearer ${activeIntegration.accessToken}`
      }
    })

    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer()
      return Buffer.from(arrayBuffer)
    }

    const errorBody = await response.json().catch(() => ({}))
    const errorMessage = extractGarminErrorMessage(response, errorBody)

    if (shouldRetryGarminAuth(response, errorBody, attempt > 0)) {
      activeIntegration = await refreshGarminToken(activeIntegration)
      continue
    }

    throwGarminFileApiError(response.status, errorMessage)
  }

  throw new Error('Garmin File API request failed after token refresh retry')
}

export type GarminBackfillType =
  'activities' | 'dailies' | 'sleeps' | 'hrv' | 'bodyComps' | 'userMetrics'

/**
 * Request historical data backfill from Garmin
 */
export async function requestGarminBackfill(
  integration: Integration,
  type: GarminBackfillType,
  startTimestamp: number,
  endTimestamp: number
) {
  const url = `https://apis.garmin.com/wellness-api/rest/backfill/${type}`
  const targetUrl = new URL(url)
  targetUrl.searchParams.append('summaryStartTimeInSeconds', startTimestamp.toString())
  targetUrl.searchParams.append('summaryEndTimeInSeconds', endTimestamp.toString())

  let activeIntegration = await ensureValidGarminToken(integration)

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetchWithRetry(targetUrl.toString(), {
      headers: {
        Authorization: `Bearer ${activeIntegration.accessToken}`
      }
    })

    if (response.ok) return { success: true }
    if (response.status === 409) return { success: true, message: 'Already requested' }

    const errorBody = await response.json().catch(() => ({}))
    const errorMessage = extractGarminErrorMessage(response, errorBody)

    if (shouldRetryGarminAuth(response, errorBody, attempt > 0)) {
      activeIntegration = await refreshGarminToken(activeIntegration)
      continue
    }

    throw new Error(`Garmin Backfill API error (${response.status}): ${errorMessage}`)
  }

  throw new Error('Garmin Backfill API request failed after token refresh retry')
}

/**
 * De-register a Garmin user token from partner access.
 */
export async function deRegisterGarminUser(integration: Integration) {
  const validIntegration = await ensureValidGarminToken(integration)
  const url = 'https://apis.garmin.com/wellness-api/rest/user/registration'

  const response = await fetchWithRetry(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${validIntegration.accessToken}`
    }
  })

  // 204 is success. 401/404 can happen when already revoked/de-registered.
  if (response.ok || response.status === 401 || response.status === 404) {
    return { success: true, status: response.status }
  }

  const errorBody = await response.json().catch(() => ({}))
  const errorMessage = errorBody.errorMessage || response.statusText || 'Unknown error'
  throw new Error(`Garmin de-registration API error (${response.status}): ${errorMessage}`)
}

/**
 * Fetch current user permissions granted to this app.
 *
 * Resolves only for a successful, well-formed response — an empty array then genuinely means
 * "the user granted nothing". Request failures and unrecognized payloads throw, so callers can
 * never mistake a broken request for a full revocation.
 */
export async function fetchGarminUserPermissions(integration: Integration): Promise<string[]> {
  const url = 'https://apis.garmin.com/wellness-api/rest/user/permissions'

  let activeIntegration = await ensureValidGarminToken(integration)

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetchWithRetry(url, {
      headers: {
        Authorization: `Bearer ${activeIntegration.accessToken}`
      }
    })

    if (response.ok) {
      const data = await response.json().catch(() => undefined)
      if (Array.isArray(data)) {
        return data.filter((x) => typeof x === 'string')
      }
      if (Array.isArray(data?.permissions)) {
        return data.permissions.filter((x: unknown) => typeof x === 'string')
      }
      // A 200 we cannot parse is not evidence that every permission was revoked.
      throw new Error('Garmin permissions API returned an unrecognized payload')
    }

    const errorBody = await response.json().catch(() => ({}))
    const errorMessage = extractGarminErrorMessage(response, errorBody)

    if (shouldRetryGarminAuth(response, errorBody, attempt > 0)) {
      activeIntegration = await refreshGarminToken(activeIntegration)
      continue
    }

    throw new Error(`Garmin permissions API error (${response.status}): ${errorMessage}`)
  }

  throw new Error('Garmin permissions API request failed after token refresh retry')
}

/**
 * Best-effort reconciliation of live Garmin export permissions into Integration.scope.
 *
 * Grants are added and revoked permissions are pruned (see {@link reconcileGarminScopes}), while
 * OAuth/API scopes are preserved. Never throws — ingest/callback must keep working if permissions
 * are unreachable, and in that case the stored scope is left exactly as it was.
 */
export async function refreshGarminIntegrationPermissions(
  integration: Integration
): Promise<Integration> {
  let permissions: string[]

  try {
    permissions = await fetchGarminUserPermissions(integration)
  } catch (error) {
    // Network failure, 5xx, auth failure, unparseable body: not a revocation. Leave scope alone.
    console.warn('[Garmin] Failed to refresh user permissions', {
      integrationId: integration.id,
      error
    })
    return integration
  }

  const reconciled = reconcileGarminScopes(integration.scope, permissions)
  if (garminScopeSetsEqual(reconciled, parseGarminScope(integration.scope))) return integration

  try {
    return await prisma.integration.update({
      where: { id: integration.id },
      data: { scope: serializeGarminScopes(reconciled) }
    })
  } catch (error) {
    console.warn('[Garmin] Failed to persist refreshed user permissions', {
      integrationId: integration.id,
      error
    })
    return integration
  }
}
