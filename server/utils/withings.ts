import type { Integration } from '@prisma/client'
import { prisma } from './db'
import { formatUserDate } from './date'
import { IntegrationAuthError, IntegrationProviderError } from './integration-errors'
import type { IngestionCounts, IngestionResult } from '../../trigger/types'

interface WithingsTokenResponse {
  access_token: string
  expires_in: number
  refresh_token: string
  scope: string
  token_type: string
  userid: string
}

interface WithingsMeasure {
  value: number
  type: number
  unit: number
  algo?: number
  fm?: number
}

interface WithingsMeasureGroup {
  grpid: number
  attrib: number // 0: User device, 1: User ambiguous, 2: Manual, 4: Manual ambiguous
  date: number // Unix timestamp
  created: number
  modified: number
  category: number // 1: Real measure, 2: Target
  measures: WithingsMeasure[]
  comment?: string
}

interface WithingsMeasureResponse {
  status: number
  body: {
    updatetime: number
    timezone: string
    measuregrps: WithingsMeasureGroup[]
    more: boolean
    offset: number
  }
}

// Workout (Activity) interfaces
export interface WithingsActivity {
  id: number
  category: number
  timezone: string
  model: number
  attrib: number
  startdate: number // Unix timestamp
  enddate: number // Unix timestamp
  date: string // YYYY-MM-DD
  deviceid?: string
  hash_deviceid?: string
  data: {
    steps?: number
    distance?: number // meters
    elevation?: number // meters
    soft?: number
    moderate?: number
    intense?: number
    active?: number
    calories?: number
    totalcalories?: number
    hr_average?: number
    hr_min?: number
    hr_max?: number
    hr_zone_0?: number
    hr_zone_1?: number
    hr_zone_2?: number
    hr_zone_3?: number
  }
  [key: string]: any
}

interface WithingsActivityResponse {
  status: number
  body: {
    activities: WithingsActivity[]
    more: boolean
    offset: number
  }
}

// Measurement types from Withings API
export const WITHINGS_MEASURE_TYPES = {
  WEIGHT: 1,
  HEIGHT: 4,
  FAT_FREE_MASS: 5,
  FAT_RATIO: 6,
  FAT_MASS_WEIGHT: 8,
  DIASTOLIC_BP: 9,
  SYSTOLIC_BP: 10,
  HEART_RATE: 11,
  SPO2: 54,
  BODY_TEMPERATURE: 71,
  MUSCLE_MASS: 76,
  HYDRATION: 77,
  BONE_MASS: 88,
  PULSE_WAVE_VELOCITY: 91
}

/**
 * Withings-documented status code for "Too Many Requests" (application temporarily
 * rate-limited). https://developer.withings.com/api-reference/#section/Response-status
 *
 * 601 is a *deterministic* answer, not a transient fault: Withings is telling us the
 * application-wide quota is spent. The task-level retry policy in trigger.config.ts
 * (3 attempts, 1s -> 10s backoff) walks straight back into the same wall on a timescale
 * far shorter than the quota window, so the run burns its retries and then fails —
 * producing a Sentry event nobody can act on (CW-334: 780 of them in one week, which
 * also drowns out genuine Withings errors).
 *
 * The correct response is to defer the whole run: see WithingsRateLimitError and
 * buildWithingsRateLimitDeferral below, and their consumer in trigger/ingest-withings.ts.
 */
const WITHINGS_RATE_LIMIT_STATUS = 601

/**
 * Backoff used when Withings does not tell us when to come back.
 *
 * Withings does not document a `Retry-After` on 601, and in practice does not send one;
 * parseWithingsRetryAfterMs still honours it (and `X-RateLimit-Reset`) if it ever appears,
 * which is the "respect any interval the provider communicates" half of the contract.
 *
 * Absent that, 10 minutes is a deliberate choice, not a guess. The documented Withings
 * application quota is a per-minute window, so 10 minutes is an order of magnitude past
 * the reset — we are not racing it and not re-probing a wall we know is still up — while
 * remaining far shorter than the daily ingest cadence, so a deferred run lands well before
 * the next scheduled one and no measures are skipped.
 */
export const WITHINGS_RATE_LIMIT_BASE_BACKOFF_MS = 10 * 60 * 1000

/**
 * Ceiling for the exponential escalation below. Also caps a provider-supplied Retry-After,
 * so a malformed or absurd header cannot park an ingest for a day.
 */
export const WITHINGS_RATE_LIMIT_MAX_BACKOFF_MS = 60 * 60 * 1000

/**
 * Floor for a provider-supplied Retry-After.
 *
 * The deferral budget is a *count*, so it only bounds patience if each step is large. An
 * unfloored provider interval would defeat it: a `Retry-After: 3` would fire all five
 * deferrals ~3s apart and give up permanently inside ~15 seconds — strictly worse than the
 * three plain retries this replaced. Withings sends no such header today; this exists for
 * the day it starts.
 */
export const WITHINGS_RATE_LIMIT_MIN_PROVIDER_BACKOFF_MS = 30 * 1000

/**
 * How many times a single ingest may defer itself before it stops re-enqueueing.
 *
 * With the escalation below that is roughly 10m + 20m + 40m + 60m + 60m ~= 3h6 of patience.
 * If the quota still has not cleared after that, something is wrong at a level a longer
 * sleep will not fix; the run gives up and the next webhook / scheduled sync picks the
 * window back up (ingestion is idempotent upserts over a date range, so nothing is lost).
 */
export const WITHINGS_MAX_RATE_LIMIT_DEFERRALS = 5

/**
 * Minimum gap between two Withings HTTP calls issued by this process.
 *
 * Withings' quota is per *application*, not per user, so every concurrent ingest run
 * competes for the same budget. The worst offender is a single run: fetchWithingsIntraday
 * is called once per workout in a loop, so one ingest can fire dozens of requests back to
 * back. Pacing them in-process removes that burst. Set WITHINGS_MIN_REQUEST_INTERVAL_MS=0
 * to disable (tests do this).
 *
 * Note this is a per-process pacer — it cannot cap concurrency *across* runs. See the
 * CW-334 PR for the follow-up on a Withings-specific queue.
 */
const DEFAULT_WITHINGS_MIN_REQUEST_INTERVAL_MS = 250

function getWithingsMinRequestIntervalMs(): number {
  const raw = process.env.WITHINGS_MIN_REQUEST_INTERVAL_MS
  if (raw === undefined || raw === '') return DEFAULT_WITHINGS_MIN_REQUEST_INTERVAL_MS
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_WITHINGS_MIN_REQUEST_INTERVAL_MS
}

let withingsRequestGate: Promise<unknown> = Promise.resolve()
let lastWithingsRequestAt = 0

/**
 * fetch() for the Withings API, serialised behind the pacer above so callers queue up
 * instead of all firing at once.
 */
async function withingsFetch(url: string, init?: RequestInit): Promise<Response> {
  const intervalMs = getWithingsMinRequestIntervalMs()
  if (intervalMs <= 0) {
    return await fetch(url, init)
  }

  const send = withingsRequestGate.then(async () => {
    const waitMs = lastWithingsRequestAt + intervalMs - Date.now()
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
    lastWithingsRequestAt = Date.now()
    return await fetch(url, init)
  })

  // Keep the chain alive even if this request rejects, otherwise one failure would
  // permanently poison the gate for every later caller in the process.
  withingsRequestGate = send.catch(() => undefined)
  return await send
}

/**
 * A Withings 601. Deliberately a subclass of IntegrationProviderError so every existing
 * `isIntegrationProviderError` check keeps working, while callers that know how to defer
 * can single it out with isWithingsRateLimitError.
 */
export class WithingsRateLimitError extends IntegrationProviderError {
  readonly rateLimited = true
  /** How long Withings wants us gone, or the documented default if it did not say. */
  readonly retryAfterMs: number
  readonly retryAfterSource: 'provider' | 'default'

  constructor(params: {
    integrationId: string
    statusCode: number
    retryAfterMs: number
    retryAfterSource: 'provider' | 'default'
  }) {
    super({
      provider: 'withings',
      integrationId: params.integrationId,
      statusCode: params.statusCode,
      message: `Withings API rate limit exceeded (Status ${params.statusCode})`
    })
    this.name = 'WithingsRateLimitError'
    this.retryAfterMs = params.retryAfterMs
    this.retryAfterSource = params.retryAfterSource
  }
}

export function isWithingsRateLimitError(error: unknown): error is WithingsRateLimitError {
  return error instanceof WithingsRateLimitError
}

type HeaderLike = { get(name: string): string | null } | null | undefined

function clampBackoffMs(ms: number): number {
  return Math.min(Math.round(ms), WITHINGS_RATE_LIMIT_MAX_BACKOFF_MS)
}

/**
 * Extracts a retry interval from the response headers, if the provider communicated one.
 * Returns null when it did not, which is the normal case for Withings today.
 */
export function parseWithingsRetryAfterMs(
  headers?: HeaderLike,
  now: number = Date.now()
): number | null {
  if (!headers || typeof headers.get !== 'function') return null

  const retryAfter = headers.get('retry-after')
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds) && seconds > 0) {
      return clampBackoffMs(seconds * 1000)
    }
    // RFC 7231 also allows an HTTP-date.
    const asDate = Date.parse(retryAfter)
    if (!Number.isNaN(asDate) && asDate - now > 0) {
      return clampBackoffMs(asDate - now)
    }
  }

  const reset = headers.get('x-ratelimit-reset') ?? headers.get('x-rate-limit-reset')
  if (reset) {
    const value = Number(reset)
    if (Number.isFinite(value) && value > 0) {
      // Reset headers are ambiguous in the wild: a small number means "seconds from now",
      // a large one is an absolute epoch-seconds timestamp.
      const ms = value > 1_000_000_000 ? value * 1000 - now : value * 1000
      if (ms > 0) return clampBackoffMs(ms)
    }
  }

  return null
}

/**
 * How long a deferred run should sleep before trying again.
 *
 * A provider-supplied interval always wins. Otherwise the documented base backoff doubles
 * with each successive deferral, capped at WITHINGS_RATE_LIMIT_MAX_BACKOFF_MS.
 *
 * Jitter is upward-only (+0-20%): every ingest that hit the same application-wide wall
 * would otherwise come back at the same instant and re-trip it, and skewing downward could
 * return before the provider said we may.
 */
export function resolveWithingsDeferralDelayMs(
  deferralCount: number,
  providerRetryAfterMs?: number | null,
  random: () => number = Math.random
): number {
  const base =
    providerRetryAfterMs != null && providerRetryAfterMs > 0
      ? Math.min(
          Math.max(providerRetryAfterMs, WITHINGS_RATE_LIMIT_MIN_PROVIDER_BACKOFF_MS),
          WITHINGS_RATE_LIMIT_MAX_BACKOFF_MS
        )
      : Math.min(
          WITHINGS_RATE_LIMIT_BASE_BACKOFF_MS *
            2 ** Math.min(Math.max(0, Math.floor(deferralCount)), 10),
          WITHINGS_RATE_LIMIT_MAX_BACKOFF_MS
        )

  // Cap the base, THEN jitter — never re-clamp. `base` is already at the ceiling from
  // deferral 3 onwards, so clamping the jittered value would round it straight back down
  // to exactly MAX and hand every deferred ingest the same wake-up instant — the precise
  // thundering herd the jitter exists to prevent, in the sustained-outage case where it
  // matters most.
  return Math.round(base * (1 + 0.2 * random()))
}

export interface WithingsDeferralContext {
  userId: string
  startDate: string
  endDate: string
  /** How many times this particular ingest window has already been deferred. */
  deferralCount?: number
}

export interface WithingsRateLimitDeferral {
  /** Safe to persist on Integration.errorMessage and show to the user. */
  message: string
  delayMs: number
  /** False once WITHINGS_MAX_RATE_LIMIT_DEFERRALS has been reached. */
  shouldReenqueue: boolean
  nextDeferralCount: number
  syncStatus: 'RATE_LIMITED'
  result: IngestionResult
}

/**
 * Turns a Withings 601 into a *deferral* instead of a failure — the counterpart to
 * buildAuthFailureResult in ./ingestion-failure.
 *
 * Returns null for anything that is not a rate limit, so a genuine error keeps falling
 * through to the caller's normal failure path (status FAILED, thrown, reported to Sentry).
 *
 * The shape here is provider-agnostic on purpose: CW-512 is the same class of problem in
 * Garmin, and this should lift into a shared helper when the second caller exists.
 */
export function buildWithingsRateLimitDeferral(
  error: unknown,
  context: WithingsDeferralContext,
  options: { counts?: IngestionCounts; skipped?: number; random?: () => number } = {}
): WithingsRateLimitDeferral | null {
  if (!isWithingsRateLimitError(error)) return null

  const deferralCount = Math.max(0, Math.floor(context.deferralCount ?? 0))
  const shouldReenqueue = deferralCount < WITHINGS_MAX_RATE_LIMIT_DEFERRALS
  const delayMs = resolveWithingsDeferralDelayMs(
    deferralCount,
    error.retryAfterSource === 'provider' ? error.retryAfterMs : null,
    options.random
  )

  const minutes = Math.max(1, Math.round(delayMs / 60_000))
  const message = shouldReenqueue
    ? `Rate limited by Withings. Sync is deferred and will resume automatically in ~${minutes} minute${
        minutes === 1 ? '' : 's'
      }.`
    : `Rate limited by Withings. Sync was deferred ${WITHINGS_MAX_RATE_LIMIT_DEFERRALS} times without the quota clearing; it will resume on the next sync.`

  return {
    message,
    delayMs,
    shouldReenqueue,
    nextDeferralCount: deferralCount + 1,
    syncStatus: 'RATE_LIMITED',
    result: {
      success: false,
      counts: options.counts ?? {},
      skipped: options.skipped ?? 0,
      message,
      error: {
        code: 'RATE_LIMITED',
        provider: 'withings',
        integrationId: error.integrationId,
        statusCode: error.statusCode,
        retryAfterMs: delayMs,
        retryAfterSource: error.retryAfterSource,
        deferred: shouldReenqueue,
        deferralCount: deferralCount + 1
      },
      userId: context.userId,
      startDate: context.startDate,
      endDate: context.endDate
    }
  }
}

/**
 * Throws a WithingsRateLimitError when the Withings body-level status says the application
 * has been rate-limited. Callers must let it propagate to the task boundary, which defers
 * the run (see buildWithingsRateLimitDeferral) rather than retrying into the same wall.
 */
export function throwIfWithingsRateLimited(
  status: number,
  integrationId: string,
  headers?: HeaderLike
): void {
  if (status !== WITHINGS_RATE_LIMIT_STATUS) return

  const providerRetryAfterMs = parseWithingsRetryAfterMs(headers)

  throw new WithingsRateLimitError({
    integrationId,
    statusCode: status,
    retryAfterMs: providerRetryAfterMs ?? WITHINGS_RATE_LIMIT_BASE_BACKOFF_MS,
    retryAfterSource: providerRetryAfterMs != null ? 'provider' : 'default'
  })
}

/**
 * Refreshes an expired Withings access token using the refresh token
 */
export async function refreshWithingsToken(integration: Integration): Promise<Integration> {
  if (!integration.refreshToken) {
    throw new IntegrationAuthError({
      provider: 'withings',
      integrationId: integration.id,
      code: 'AUTH_MISSING',
      message: 'No refresh token available for Withings integration'
    })
  }

  const clientId = process.env.WITHINGS_CLIENT_ID
  const clientSecret = process.env.WITHINGS_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Withings credentials not configured')
  }

  console.log('Refreshing Withings token for integration:', integration.id)

  const response = await withingsFetch('https://wbsapi.withings.net/v2/oauth2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      action: 'requesttoken',
      grant_type: 'refresh_token',
      refresh_token: integration.refreshToken,
      client_id: clientId,
      client_secret: clientSecret
    }).toString()
  })

  const data = await response.json()

  if (data.status !== 0) {
    console.error('Withings token refresh failed:', data)

    // CW-334: 601 used to be bundled in with 401 below, which marked a perfectly healthy
    // integration FAILED and told the user to reconnect Withings — for a rate limit. It is
    // backpressure, not a revoked grant; defer like every other 601.
    throwIfWithingsRateLimited(data.status, integration.id, response.headers)

    if (data.status === 401) {
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          syncStatus: 'FAILED',
          errorMessage: `Refresh token revoked or invalid (Status ${data.status})`
        }
      })

      throw new IntegrationAuthError({
        provider: 'withings',
        integrationId: integration.id,
        statusCode: data.status,
        message: 'Withings authorization expired or was revoked. Please reconnect Withings.'
      })
    }

    if (data.status === 503 || data.status >= 500) {
      throw new IntegrationProviderError({
        provider: 'withings',
        integrationId: integration.id,
        statusCode: data.status,
        message: `Withings token refresh unavailable (Status ${data.status})`
      })
    }

    throw new Error(`Failed to refresh Withings token: Status ${data.status}`)
  }

  const tokenData: WithingsTokenResponse = data.body
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000)

  // Update the integration in the database
  const updatedIntegration = await prisma.integration.update({
    where: { id: integration.id },
    data: {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt
    }
  })

  return updatedIntegration
}

/**
 * Checks if a token is expired or about to expire (within 5 minutes)
 */
function isTokenExpired(integration: Integration): boolean {
  if (!integration.expiresAt) {
    return false // If no expiry is set, assume it's valid (though typically it should be set)
  }

  const now = new Date()
  const expiryWithBuffer = new Date(integration.expiresAt.getTime() - 5 * 60 * 1000) // 5 minutes buffer
  return now >= expiryWithBuffer
}

/**
 * Ensures the integration has a valid access token, refreshing if necessary
 */
async function ensureValidToken(integration: Integration): Promise<Integration> {
  if (isTokenExpired(integration)) {
    console.log('Withings token expired or expiring soon, refreshing...')
    return await refreshWithingsToken(integration)
  }
  return integration
}

/**
 * Fetches measurements from Withings API
 */
export async function fetchWithingsMeasures(
  integration: Integration,
  startDate: Date,
  endDate: Date,
  measureTypes: number[] = [WITHINGS_MEASURE_TYPES.WEIGHT, WITHINGS_MEASURE_TYPES.FAT_RATIO]
): Promise<WithingsMeasureGroup[]> {
  // Ensure we have a valid token before making the request
  const validIntegration = await ensureValidToken(integration)

  const url = new URL('https://wbsapi.withings.net/measure')
  url.searchParams.set('action', 'getmeas')
  url.searchParams.set('access_token', validIntegration.accessToken)
  url.searchParams.set('startdate', Math.floor(startDate.getTime() / 1000).toString())
  url.searchParams.set('enddate', Math.floor(endDate.getTime() / 1000).toString())
  url.searchParams.set('category', '1') // 1: Real measures, 2: User objectives

  if (measureTypes.length > 0) {
    url.searchParams.set('meastypes', measureTypes.join(','))
  }

  console.log('[Withings] Fetching measures:', {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString()
  })

  const response = await withingsFetch(url.toString())
  const data: WithingsMeasureResponse = await response.json()

  if (data.status !== 0) {
    throwIfWithingsRateLimited(data.status, validIntegration.id, response.headers)

    // 401: Invalid access token
    if (data.status === 401) {
      console.log('[Withings] Token invalid (401), attempting refresh...')
      const refreshedIntegration = await refreshWithingsToken(validIntegration)
      // Retry with new token
      url.searchParams.set('access_token', refreshedIntegration.accessToken)
      const retryResponse = await withingsFetch(url.toString())
      const retryData: WithingsMeasureResponse = await retryResponse.json()

      if (retryData.status !== 0) {
        throwIfWithingsRateLimited(retryData.status, refreshedIntegration.id, retryResponse.headers)
        throw new Error(`Withings API error after refresh: Status ${retryData.status}`)
      }

      return retryData.body.measuregrps || []
    }

    throw new Error(`Withings API error: Status ${data.status}`)
  }

  return data.body.measuregrps || []
}

/**
 * Fetches workouts (activities) from Withings API
 */
export async function fetchWithingsActivities(
  integration: Integration,
  startDate: Date,
  endDate: Date
): Promise<WithingsActivity[]> {
  // Ensure we have a valid token before making the request
  const validIntegration = await ensureValidToken(integration)

  const url = new URL('https://wbsapi.withings.net/v2/measure')
  url.searchParams.set('action', 'getactivity')
  url.searchParams.set('access_token', validIntegration.accessToken)
  // Withings accepts startdateymd/enddateymd (YYYY-MM-DD) or startdate/enddate (unix)
  // Let's use unix timestamps for consistency
  url.searchParams.set('startdate', Math.floor(startDate.getTime() / 1000).toString())
  url.searchParams.set('enddate', Math.floor(endDate.getTime() / 1000).toString())
  // Comma separated list of data fields to retrieve
  // Retrieve everything available
  url.searchParams.set(
    'data_fields',
    'steps,distance,elevation,soft,moderate,intense,active,calories,totalcalories,hr_average,hr_min,hr_max,hr_zone_0,hr_zone_1,hr_zone_2,hr_zone_3'
  )

  console.log('[Withings] Fetching activities:', {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString()
  })

  const response = await withingsFetch(url.toString())
  const data: WithingsActivityResponse = await response.json()

  if (data.status !== 0) {
    throwIfWithingsRateLimited(data.status, validIntegration.id, response.headers)

    // 401: Invalid access token
    if (data.status === 401) {
      console.log('[Withings] Token invalid (401), attempting refresh...')
      const refreshedIntegration = await refreshWithingsToken(validIntegration)
      // Retry with new token
      url.searchParams.set('access_token', refreshedIntegration.accessToken)
      const retryResponse = await withingsFetch(url.toString())
      const retryData: WithingsActivityResponse = await retryResponse.json()

      if (retryData.status !== 0) {
        throwIfWithingsRateLimited(retryData.status, refreshedIntegration.id, retryResponse.headers)
        throw new Error(`Withings API error after refresh: Status ${retryData.status}`)
      }

      return retryData.body.activities || []
    }

    throw new Error(`Withings API error: Status ${data.status}`)
  }

  return data.body.activities || []
}

/**
 * Helper to calculate actual value from value * 10^unit
 */
export function getWithingsValue(value: number, unit: number): number {
  return value * Math.pow(10, unit)
}

/**
 * Normalizes Withings data into our Wellness format
 * Note: Withings provides data points (weight, fat, etc) which might be separate or grouped.
 * This function processes a single measure group.
 */
export function normalizeWithingsMeasureGroup(group: WithingsMeasureGroup, userId: string) {
  const date = new Date(group.date * 1000)
  // Normalize to YYYY-MM-DD for storage
  const dateOnly = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))

  let weight: number | null = null
  let fatRatio: number | null = null
  let muscleMass: number | null = null
  let hydration: number | null = null
  let boneMass: number | null = null
  let heartRate: number | null = null
  let spo2: number | null = null

  for (const measure of group.measures) {
    const value = getWithingsValue(measure.value, measure.unit)

    switch (measure.type) {
      case WITHINGS_MEASURE_TYPES.WEIGHT:
        // Convert kg to our standard if needed (we store in kg)
        weight = value
        break
      case WITHINGS_MEASURE_TYPES.FAT_RATIO:
        fatRatio = value // Percentage
        break
      case WITHINGS_MEASURE_TYPES.MUSCLE_MASS:
        muscleMass = value
        break
      case WITHINGS_MEASURE_TYPES.HYDRATION:
        hydration = value
        break
      case WITHINGS_MEASURE_TYPES.BONE_MASS:
        boneMass = value
        break
      case WITHINGS_MEASURE_TYPES.HEART_RATE:
        heartRate = Math.round(value)
        break
      case WITHINGS_MEASURE_TYPES.SPO2:
        spo2 = value
        break
    }
  }

  // Only return if we have at least one meaningful metric
  if (!weight && !fatRatio && !heartRate && !spo2) {
    return null
  }

  return {
    userId,
    date: dateOnly,
    weight,
    // Store body composition in rawJson since we don't have dedicated columns for all of them yet
    // But we can extract them if we add columns later
    spO2: spo2,
    restingHr: heartRate, // If it's a resting measurement
    rawJson: {
      withings: {
        grpid: group.grpid,
        fatRatio,
        muscleMass,
        hydration,
        boneMass,
        measures: group.measures
      }
    }
  }
}

/**
 * Normalizes Withings activity data into our Workout format
 */
export function normalizeWithingsActivity(activity: WithingsActivity, userId: string) {
  // Only process if activity has meaningful data
  if (
    !activity.data ||
    (!activity.data.steps && !activity.data.active && !activity.data.totalcalories)
  ) {
    return null
  }

  // Activity type mapping (Withings 'category' is undocumented in public API docs as specific sport,
  // 'model' and 'attrib' give hints, but mostly it's just general activity unless we have more info)
  // Actually, 'getactivity' endpoint aggregates by day usually, so it's "Daily Activity"
  // But if it's broken down, it might be specific.
  // The docs say "getactivity" returns daily summaries.
  // Wait, "getactivity" returns "aggregated data". This is NOT individual workouts like a "Run".
  // It is daily steps, daily calories, etc.
  // This maps better to a "DailyMetric" or "Wellness" entry rather than a "Workout".
  // However, Withings DOES have a "getworkouts" endpoint for specific workouts.
  // The user asked for "Withings also support workouts" pointing to "measure-getmeas"?
  // No, the link provided was "measure-getmeas", but that is for body measures.
  // The link title said "measure-getmeas" but maybe they meant "v2/measure?action=getworkouts"?
  // Let's assume for now we want actual workouts if available.
  // The user linked "https://developer.withings.com/api-reference/#tag/measure/operation/measure-getmeas"
  // But that IS body measures.
  // If the user said "Withings also support workouts", they probably mean they want Workouts synced.
  // The endpoint for workouts is 'v2/measure?action=getworkouts'.
  // Let's add support for that instead of 'getactivity' which is daily summary.

  return null // Placeholder as we shouldn't use getactivity for Workouts table
}

export interface WithingsWorkout {
  id: number
  category: number // Sport category
  timezone: string
  model: number
  attrib: number
  startdate: number
  enddate: number
  date: string
  deviceid?: string
  data: {
    steps?: number
    distance?: number
    elevation?: number
    calories?: number
    hr_average?: number
    hr_min?: number
    hr_max?: number
    hr_zone_0?: number
    hr_zone_1?: number
    hr_zone_2?: number
    hr_zone_3?: number
    manual_calories?: number
    algo_pause_duration?: number
  }
}

interface WithingsWorkoutResponse {
  status: number
  body: {
    series: WithingsWorkout[]
    more: boolean
    offset: number
  }
}

/**
 * Fetches specific workouts from Withings API
 */
export async function fetchWithingsWorkouts(
  integration: Integration,
  startDate: Date,
  endDate: Date,
  timezone: string = 'UTC'
): Promise<WithingsWorkout[]> {
  const validIntegration = await ensureValidToken(integration)

  const url = new URL('https://wbsapi.withings.net/v2/measure')
  url.searchParams.set('action', 'getworkouts')
  url.searchParams.set('access_token', validIntegration.accessToken)
  url.searchParams.set('startdateymd', formatUserDate(startDate, timezone, 'yyyy-MM-dd'))
  url.searchParams.set('enddateymd', formatUserDate(endDate, timezone, 'yyyy-MM-dd'))
  url.searchParams.set(
    'data_fields',
    'steps,distance,elevation,calories,hr_average,hr_min,hr_max,hr_zone_0,hr_zone_1,hr_zone_2,hr_zone_3,manual_calories,algo_pause_duration'
  )

  console.log('[Withings] Fetching workouts:', {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  })

  const response = await withingsFetch(url.toString())
  const data: WithingsWorkoutResponse = await response.json()

  if (data.status !== 0) {
    throwIfWithingsRateLimited(data.status, validIntegration.id, response.headers)

    if (data.status === 401) {
      const refreshedIntegration = await refreshWithingsToken(validIntegration)
      url.searchParams.set('access_token', refreshedIntegration.accessToken)
      const retryResponse = await withingsFetch(url.toString())
      const retryData: WithingsWorkoutResponse = await retryResponse.json()
      if (retryData.status !== 0) {
        throwIfWithingsRateLimited(retryData.status, refreshedIntegration.id, retryResponse.headers)
        throw new Error(`Withings API error after refresh: Status ${retryData.status}`)
      }
      return retryData.body.series || []
    }
    throw new Error(`Withings API error: Status ${data.status}`)
  }

  return data.body.series || []
}

/**
 * Fetches intraday heart rate data for a specific time range
 */
export async function fetchWithingsIntraday(
  integration: Integration,
  startDate: Date,
  endDate: Date
): Promise<Record<string, any>> {
  const validIntegration = await ensureValidToken(integration)

  const url = new URL('https://wbsapi.withings.net/v2/measure')
  url.searchParams.set('action', 'getintradayactivity')
  url.searchParams.set('access_token', validIntegration.accessToken)
  // Intraday API uses startdate/enddate (unix)
  url.searchParams.set('startdate', Math.floor(startDate.getTime() / 1000).toString())
  url.searchParams.set('enddate', Math.floor(endDate.getTime() / 1000).toString())

  // Request heart rate and other available high-frequency data
  // Steps, elevation, calories, distance, stroke, pool_lap, duration, heart_rate, spo2_auto, rmssd, sdnn1, hrv_quality
  url.searchParams.set(
    'data_fields',
    'heart_rate,steps,elevation,calories,distance,duration,spo2_auto,rmssd,sdnn1,hrv_quality'
  )

  const response = await withingsFetch(url.toString())
  const data: any = await response.json()

  if (data.status !== 0) {
    throwIfWithingsRateLimited(data.status, validIntegration.id, response.headers)

    if (data.status === 401) {
      const refreshedIntegration = await refreshWithingsToken(validIntegration)
      url.searchParams.set('access_token', refreshedIntegration.accessToken)
      const retryResponse = await withingsFetch(url.toString())
      const retryData: any = await retryResponse.json()
      if (retryData.status !== 0) {
        throwIfWithingsRateLimited(retryData.status, refreshedIntegration.id, retryResponse.headers)
        throw new Error(`Withings API error after refresh: Status ${retryData.status}`)
      }
      // Return raw series object (keys are timestamps)
      return retryData.body.series || {}
    }
    throw new Error(`Withings API error: Status ${data.status}`)
  }

  // Return raw series object (keys are timestamps)
  return data.body.series || {}
}

export function normalizeWithingsWorkout(workout: WithingsWorkout, userId: string) {
  // Map Withings categories to our types
  // https://developer.withings.com/developer-guide/v3/integration-guide/public-health-data-api/data-api/all-categories-and-classification/
  const categoryMap: Record<number, string> = {
    1: 'Walk',
    2: 'Run',
    3: 'Hike',
    6: 'Ride', // Cycling
    7: 'Swim',
    9: 'Ski', // Downhill
    10: 'Rowing',
    11: 'Elliptical',
    16: 'WeightTraining', // Fitness
    18: 'Golf',
    19: 'Hike', // Trekking
    20: 'Dance',
    21: 'IceSkate',
    22: 'Pickleball', // Racquet sports approximation
    23: 'Rowing', // Indoors
    24: 'Yoga', // Yoga
    25: 'Volleyball',
    26: 'Other', // Boxing
    28: 'Other', // Other
    31: 'Kayaking',
    32: 'Kitesurf',
    33: 'Surfing',
    35: 'RockClimbing', // Climbing
    187: 'Walk', // Fruit Ninja?
    188: 'Run' // Hyrule?
    // Add more as needed
  }

  const type = categoryMap[workout.category] || 'Other'

  const startDate = new Date(workout.startdate * 1000)
  // Adjust for timezone if provided
  // Withings API documentation states 'startdate' is the number of seconds since epoch.
  // However, we've observed cases (e.g. America/New_York) where the timestamp is shifted by the timezone offset relative to true UTC.
  // e.g. 09:08 Local NY time -> 14:08 UTC stored by Withings.
  // Strava stores 09:08 UTC for the same event (implying 04:08 Local NY time, OR Strava is ignoring timezone).
  // If the user confirms Strava is correct, then Withings is +5h.
  // We stick to the provided timestamp but rely on deduplication logic to handle these shifts.

  const endDate = new Date(workout.enddate * 1000)
  let durationSec = Math.round((endDate.getTime() - startDate.getTime()) / 1000)

  // Adjust for pauses if available
  if (workout.data.algo_pause_duration) {
    durationSec -= workout.data.algo_pause_duration
  }

  return {
    userId,
    externalId: `withings-${workout.id}`,
    source: 'withings',
    date: startDate,
    title: `Withings ${type}`,
    description: `Imported from Withings. Category: ${workout.category}`,
    type,
    durationSec,
    distanceMeters: workout.data.distance,
    elevationGain: workout.data.elevation,
    calories: (workout.data.calories || 0) + (workout.data.manual_calories || 0),
    averageHr: workout.data.hr_average,
    maxHr: workout.data.hr_max,
    // Raw data
    rawJson: workout
  }
}

export interface WithingsSleepSummary {
  id: number
  timezone: string
  model: number
  model_id: number
  startdate: number
  enddate: number
  date: string
  created: number
  modified: number
  data: {
    total_timeinbed: number
    total_sleep_time: number
    asleepduration: number
    lightsleepduration: number
    remsleepduration: number
    deepsleepduration: number
    sleep_efficiency: number
    sleep_latency: number
    wakeup_latency: number
    wakeupduration: number
    wakeupcount: number
    waso: number
    nb_rem_episodes: number
    out_of_bed_count: number
    hr_average: number
    hr_min: number
    hr_max: number
    rr_average: number
    rr_min: number
    rr_max: number
    breathing_quality_assessment: number
    breathing_disturbances_intensity: number
    snoring: number
    snoringepisodecount: number
    sleep_score: number
    apnea_hypopnea_index: number
  }
}

interface WithingsSleepResponse {
  status: number
  body: {
    series: WithingsSleepSummary[]
    more: boolean
    offset: number
  }
}

/**
 * Fetches sleep summaries from Withings API
 */
export async function fetchWithingsSleep(
  integration: Integration,
  startDate: Date,
  endDate: Date,
  timezone: string = 'UTC'
): Promise<WithingsSleepSummary[]> {
  const validIntegration = await ensureValidToken(integration)

  const url = new URL('https://wbsapi.withings.net/v2/sleep')
  url.searchParams.set('action', 'getsummary')
  url.searchParams.set('access_token', validIntegration.accessToken)
  url.searchParams.set('startdateymd', formatUserDate(startDate, timezone, 'yyyy-MM-dd'))
  url.searchParams.set('enddateymd', formatUserDate(endDate, timezone, 'yyyy-MM-dd'))
  // Request all useful fields
  url.searchParams.set(
    'data_fields',
    'total_timeinbed,total_sleep_time,asleepduration,lightsleepduration,remsleepduration,deepsleepduration,sleep_efficiency,sleep_latency,wakeup_latency,wakeupduration,wakeupcount,waso,nb_rem_episodes,out_of_bed_count,hr_average,hr_min,hr_max,rr_average,rr_min,rr_max,breathing_quality_assessment,breathing_disturbances_intensity,snoring,snoringepisodecount,sleep_score,apnea_hypopnea_index'
  )

  console.log('[Withings] Fetching sleep:', {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  })

  const response = await withingsFetch(url.toString())
  const data: WithingsSleepResponse = await response.json()

  if (data.status !== 0) {
    throwIfWithingsRateLimited(data.status, validIntegration.id, response.headers)

    if (data.status === 401) {
      const refreshedIntegration = await refreshWithingsToken(validIntegration)
      url.searchParams.set('access_token', refreshedIntegration.accessToken)
      const retryResponse = await withingsFetch(url.toString())
      const retryData: WithingsSleepResponse = await retryResponse.json()
      if (retryData.status !== 0) {
        throwIfWithingsRateLimited(retryData.status, refreshedIntegration.id, retryResponse.headers)
        throw new Error(`Withings API error after refresh: Status ${retryData.status}`)
      }
      return retryData.body.series || []
    }
    throw new Error(`Withings API error: Status ${data.status}`)
  }

  return data.body.series || []
}

/**
 * Normalizes Withings sleep data into our Wellness format
 */
export function normalizeWithingsSleep(sleep: WithingsSleepSummary, userId: string) {
  if (!sleep.data.total_sleep_time && !sleep.data.asleepduration) {
    return null
  }

  const date = new Date(sleep.startdate * 1000)
  // Normalize to YYYY-MM-DD for storage
  // Use the date string from Withings as it represents the "night of" date usually
  const dateOnly = new Date(sleep.date)

  // Fallback if date parsing fails
  if (isNaN(dateOnly.getTime())) {
    return null
  }

  return {
    userId,
    date: dateOnly,
    sleepSeconds: sleep.data.total_sleep_time || sleep.data.asleepduration,
    sleepQuality: sleep.data.sleep_score, // 0-100
    restingHr: sleep.data.hr_average,
    // Calculate HRV from available data if possible, otherwise null
    // Withings sleep summary doesn't provide RMSSD/SDNN directly in summary unless specifically requested
    // and even then, it's often not in the standard summary fields or requires specific devices.
    // We'll leave HRV null for now unless we switch to `get` (high freq) which is heavy.

    rawJson: {
      withings_sleep: {
        id: sleep.id,
        model: sleep.model,
        data: sleep.data
      }
    }
  }
}
