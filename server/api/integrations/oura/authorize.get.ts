import { getServerSession } from '../../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Integrations'],
    summary: 'Authorize Oura',
    description: 'Initiates the OAuth flow for Oura integration. Redirects to Oura.',
    responses: {
      302: { description: 'Redirect to Oura' },
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
  const clientId = process.env.OURA_CLIENT_ID
  const redirectUri = `${config.public.siteUrl || 'http://localhost:3099'}/api/integrations/oura/callback`

  if (!clientId) {
    throw createError({
      statusCode: 500,
      message: 'OURA client ID not configured'
    })
  }

  // Generate a random state parameter for CSRF protection
  const state =
    Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)

  // Store state in a secure cookie
  setCookie(event, 'oura_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/'
  })

  // Build Oura OAuth authorization URL
  const authUrl = new URL('https://cloud.ouraring.com/oauth/authorize')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  // Using minimal required scopes + email for identification
  authUrl.searchParams.set('scope', 'email personal daily heartrate workout session')
  authUrl.searchParams.set('state', state)

  // Redirect to Oura authorization page
  return sendRedirect(event, authUrl.toString())
})
