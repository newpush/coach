import { getServerSession } from '../../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Integrations'],
    summary: 'Authorize Withings',
    description: 'Initiates the OAuth flow for Withings integration. Redirects to Withings.',
    responses: {
      302: { description: 'Redirect to Withings' },
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
  const clientId = process.env.WITHINGS_CLIENT_ID
  const redirectUri = `${config.public.siteUrl || 'http://localhost:3099'}/api/integrations/withings/callback`

  if (!clientId) {
    throw createError({
      statusCode: 500,
      message: 'Withings credentials not configured'
    })
  }

  // Generate a random state for CSRF protection
  const state = Math.random().toString(36).substring(2, 15)

  // Store state in a cookie (httpOnly, secure)
  setCookie(event, 'withings_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 10, // 10 minutes
    path: '/'
  })

  // Scopes: user.metrics for weight/body comp, user.activity for workouts
  const scope = 'user.metrics,user.activity'

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scope,
    state: state
  })

  const authUrl = `https://account.withings.com/oauth2_user/authorize2?${params.toString()}`

  return sendRedirect(event, authUrl)
})
