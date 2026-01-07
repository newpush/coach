import { getServerSession } from '../../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Integrations'],
    summary: 'Authorize Whoop',
    description: 'Initiates the OAuth flow for Whoop integration. Redirects to Whoop.',
    responses: {
      302: { description: 'Redirect to Whoop' },
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
  const clientId = process.env.WHOOP_CLIENT_ID
  const redirectUri = `${config.public.siteUrl || 'http://localhost:3099'}/api/integrations/whoop/callback`

  if (!clientId) {
    throw createError({
      statusCode: 500,
      message: 'WHOOP client ID not configured'
    })
  }

  // Generate a random state parameter for CSRF protection
  const state =
    Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)

  // Store state in a secure cookie
  setCookie(event, 'whoop_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/'
  })

  // Build WHOOP OAuth authorization URL
  const authUrl = new URL('https://api.prod.whoop.com/oauth/oauth2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set(
    'scope',
    'offline read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement'
  )
  authUrl.searchParams.set('state', state)

  // Redirect to WHOOP authorization page
  return sendRedirect(event, authUrl.toString())
})
