import { createHash, timingSafeEqual } from 'crypto'
import { dispatchTask } from '../../../utils/task-dispatcher'
import { getServerSession } from '../../../utils/session'
import { prisma } from '../../../utils/db'
import { refreshGarminIntegrationPermissions } from '../../../utils/garmin'
import { isGarminExternalUserIdConflict } from '../../../utils/services/garminService'

defineRouteMeta({
  openAPI: {
    tags: ['Integrations'],
    summary: 'Garmin Callback',
    description: 'OAuth2 callback handler for Garmin Connect integration.',
    responses: {
      302: { description: 'Redirect to settings' },
      400: { description: 'Bad request' },
      401: { description: 'Unauthorized' }
    }
  }
})

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

function clearAuthCookies(event: any) {
  deleteCookie(event, 'garmin_code_verifier')
  deleteCookie(event, 'garmin_oauth_state')
}

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user?.id) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const { code, state, error: garminError } = getQuery(event)
  const verifier = getCookie(event, 'garmin_code_verifier')
  const savedState = getCookie(event, 'garmin_oauth_state')

  if (garminError) {
    console.error('[GarminCallback] Garmin returned authorization error:', garminError)
    clearAuthCookies(event)
    return sendRedirect(event, '/settings/apps?garmin_error=access-denied')
  }

  if (!state || !savedState || !safeCompare(state as string, savedState)) {
    console.warn('[GarminCallback] OAuth state mismatch or missing', {
      hasState: !!state,
      hasSavedState: !!savedState
    })
    clearAuthCookies(event)
    return sendRedirect(event, '/settings/apps?garmin_error=state-mismatch')
  }

  if (!code || !verifier) {
    console.warn('[GarminCallback] Missing code or verifier cookie', {
      hasCode: !!code,
      hasVerifier: !!verifier
    })
    clearAuthCookies(event)
    return sendRedirect(event, '/settings/apps?garmin_error=missing-verifier')
  }

  const clientId = process.env.GARMIN_CLIENT_ID
  const clientSecret = process.env.GARMIN_CLIENT_SECRET
  const config = useRuntimeConfig()
  const siteUrl = (config.public.siteUrl || 'http://localhost:3000').replace(/\/+$/, '')
  const redirectUri = `${siteUrl}/api/integrations/garmin/callback`

  const response = await fetch('https://diauth.garmin.com/di-oauth2-service/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code as string,
      redirect_uri: redirectUri,
      client_id: clientId!,
      client_secret: clientSecret!,
      code_verifier: verifier
    }).toString()
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error('[GarminCallback] Token exchange failed', errorData)
    deleteCookie(event, 'garmin_code_verifier')
    deleteCookie(event, 'garmin_oauth_state')
    return sendRedirect(event, '/settings/apps?garmin_error=token-exchange-failed')
  }

  const tokenData = await response.json()

  // Fetch Garmin User ID to identify the account
  const userResponse = await fetch('https://apis.garmin.com/wellness-api/rest/user/id', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  })

  if (!userResponse.ok) {
    console.error('[GarminCallback] Failed to fetch Garmin user profile', {
      status: userResponse.status
    })
    deleteCookie(event, 'garmin_code_verifier')
    deleteCookie(event, 'garmin_oauth_state')
    return sendRedirect(event, '/settings/apps?garmin_error=profile-fetch-failed')
  }

  const userData = await userResponse.json()
  const externalUserId = userData.userId as string | undefined

  if (!externalUserId) {
    console.error('[GarminCallback] Garmin user profile missing externalUserId')
    deleteCookie(event, 'garmin_code_verifier')
    deleteCookie(event, 'garmin_oauth_state')
    return sendRedirect(event, '/settings/apps?garmin_error=profile-fetch-failed')
  }

  // Best-effort pre-check: fails fast for the common case without touching
  // the write path. This is NOT the source of truth against concurrent
  // callbacks - two requests can both pass this findFirst before either has
  // written. The real guarantee is the Integration_provider_externalUserId_key
  // unique index added in CW-99 (prisma/schema.prisma), enforced by the
  // catch block around the upsert below.
  const existingOwner = await prisma.integration.findFirst({
    where: {
      provider: 'garmin',
      externalUserId,
      NOT: {
        userId: session.user.id
      }
    },
    select: {
      userId: true
    }
  })

  if (existingOwner) {
    console.error('[GarminCallback] Garmin account already connected to another user', {
      externalUserId,
      currentUserId: session.user.id,
      existingOwnerUserId: existingOwner.userId
    })
    deleteCookie(event, 'garmin_code_verifier')
    deleteCookie(event, 'garmin_oauth_state')
    return sendRedirect(event, '/settings/apps?garmin_error=account-already-linked')
  }

  let integration
  try {
    integration = await prisma.integration.upsert({
      where: { userId_provider: { userId: session.user.id, provider: 'garmin' } },
      create: {
        userId: session.user.id,
        provider: 'garmin',
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        externalUserId,
        scope: tokenData.scope || null,
        ingestWorkouts: true,
        syncStatus: 'SUCCESS',
        errorMessage: null
      },
      update: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        externalUserId,
        scope: tokenData.scope || null,
        ingestWorkouts: true,
        syncStatus: 'SUCCESS',
        errorMessage: null
      }
    })
  } catch (dbError: any) {
    // A second callback (for a different user) raced us between the
    // findFirst check above and this write, and the Integration_provider_
    // externalUserId_key unique index (CW-99) caught what the app-level
    // check couldn't. Treat it the same as the pre-check case above instead
    // of surfacing an unhandled 500.
    if (isGarminExternalUserIdConflict(dbError)) {
      console.error(
        '[GarminCallback] Garmin account already connected to another user (race detected at write time)',
        {
          externalUserId,
          currentUserId: session.user.id
        }
      )
      deleteCookie(event, 'garmin_code_verifier')
      deleteCookie(event, 'garmin_oauth_state')
      return sendRedirect(event, '/settings/apps?garmin_error=account-already-linked')
    }
    throw dbError
  }

  // Best-effort: merge export permissions (HEALTH_EXPORT, WORKOUT_IMPORT, …) into scope.
  await refreshGarminIntegrationPermissions(integration)

  // CW-513: scope the backfill's idempotency key to *this* connect, not to the user.
  //
  // The key is there to stop a single connect from queueing several expensive
  // backfills when the callback is delivered more than once (double submit, two
  // tabs, a proxy/browser retry). Keyed on the user alone with a 1h TTL it also
  // swallowed the *next* connect: since CW-95 this task can end FAILED, and
  // neither Trigger.dev nor the BullMQ `deduplication` fallback in
  // server/utils/task-dispatcher.ts releases a key early when the run behind it
  // fails. A user whose backfill failed was therefore deduplicated against that
  // dead run for the rest of the hour - and disconnect/reconnect, the one remedy
  // available to them, is exactly what the key suppressed.
  //
  // The OAuth authorization code is the right discriminator: every trip through
  // /authorize mints a fresh one, while a re-delivery of a single connect carries
  // the code we already exchanged. So any deliberate reconnect (with or without a
  // disconnect first, and regardless of whether the Integration row is recreated)
  // gets a new key and a new run, while duplicate deliveries of one connect still
  // collapse into one run. It is hashed rather than embedded verbatim because the
  // code is a single-use credential and idempotency keys are persisted and shown
  // by the task backend.
  const connectFingerprint = createHash('sha256')
    .update(code as string)
    .digest('hex')
    .slice(0, 16)

  // Start historical backfill after a short delay via Trigger.dev
  // We use a delay to ensure Garmin's Push API registration is fully propagated
  // to avoid "User not registered with consumer" (403) errors.
  try {
    await dispatchTask(
      'garmin-backfill',
      { userId: session.user.id, delaySeconds: 30 },
      {
        concurrencyKey: session.user.id,
        tags: [`user:${session.user.id}`],
        idempotencyKey: `garmin-backfill:${session.user.id}:${connectFingerprint}`,
        idempotencyKeyTTL: '1h'
      }
    )
    console.log(
      `[GarminCallback] Queued garmin-backfill for user ${session.user.id} (connect ${connectFingerprint})`
    )
  } catch (e) {
    console.error('[GarminCallback] Failed to trigger backfill task', e)
  }

  // Clear cookie
  deleteCookie(event, 'garmin_code_verifier')

  return sendRedirect(event, '/settings/apps?garmin_success=true')
})
