import { getServerSession } from '../../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Integrations'],
    summary: 'Authorize Strava',
    description: 'Initiates the OAuth flow for Strava integration. Redirects to Strava.',
    responses: {
      302: { description: 'Redirect to Strava' },
      401: { description: 'Unauthorized' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const config = useRuntimeConfig()

  // Disable Strava on hosted version until app request is accepted
  const isHosted = config.public.siteUrl?.includes('coachwatts.com')
  if (isHosted) {
    throw createError({
      statusCode: 503,
      message: 'Strava integration is temporarily unavailable on coachwatts.com'
    })
  }

  const clientId = process.env.STRAVA_CLIENT_ID
  const redirectUri = `${config.public.siteUrl || 'http://localhost:3099'}/api/integrations/strava/callback`

  if (!clientId) {
    throw createError({
      statusCode: 500,
      message: 'Strava client ID not configured'
    })
  }

  // Generate a random state parameter for CSRF protection
  const state =
    Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)

  // Store state in a secure cookie
  setCookie(event, 'strava_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/'
  })

  // Build Strava OAuth authorization URL
  const authUrl = new URL('https://www.strava.com/oauth/authorize')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'read,activity:read_all,profile:read_all')
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('approval_prompt', 'auto')

  // Redirect to Strava authorization page
  return sendRedirect(event, authUrl.toString())
})
