import { getServerSession } from '../../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Integrations'],
    summary: 'Whoop callback',
    description: 'Handles the OAuth callback from Whoop.',
    parameters: [
      { name: 'code', in: 'query', schema: { type: 'string' } },
      { name: 'state', in: 'query', schema: { type: 'string' } },
      { name: 'error', in: 'query', schema: { type: 'string' } }
    ],
    responses: {
      302: { description: 'Redirect to settings' },
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

  const query = getQuery(event)
  const code = query.code as string
  const state = query.state as string
  const error = query.error as string

  if (error) {
    console.error('WHOOP OAuth error:', error)
    return sendRedirect(event, '/settings?whoop_error=' + encodeURIComponent(error))
  }

  // Verify state parameter for CSRF protection
  const storedState = getCookie(event, 'whoop_oauth_state')
  if (!state || !storedState || state !== storedState) {
    console.error('WHOOP OAuth state mismatch')
    // Clear the state cookie
    deleteCookie(event, 'whoop_oauth_state')
    return sendRedirect(event, '/settings?whoop_error=invalid_state')
  }

  // Clear the state cookie after validation
  deleteCookie(event, 'whoop_oauth_state')

  if (!code) {
    return sendRedirect(event, '/settings?whoop_error=no_code')
  }

  try {
    const config = useRuntimeConfig()
    const clientId = process.env.WHOOP_CLIENT_ID
    const clientSecret = process.env.WHOOP_CLIENT_SECRET
    const redirectUri = `${config.public.siteUrl || 'http://localhost:3099'}/api/integrations/whoop/callback`

    if (!clientId || !clientSecret) {
      throw new Error('WHOOP credentials not configured')
    }

    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri
      }).toString()
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('WHOOP token exchange failed:', errorText)
      throw new Error('Failed to exchange authorization code')
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token
    const refreshToken = tokenData.refresh_token
    const expiresIn = tokenData.expires_in

    // Fetch user profile to get user ID
    const { fetchWhoopUser } = await import('../../../utils/whoop')
    const whoopUser = await fetchWhoopUser(accessToken)

    // Find the user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      throw createError({
        statusCode: 404,
        message: 'User not found'
      })
    }

    // Check if integration already exists
    const existing = await prisma.integration.findFirst({
      where: {
        userId: user.id,
        provider: 'whoop'
      }
    })

    const expiresAt = new Date(Date.now() + expiresIn * 1000)

    if (existing) {
      // Update existing integration
      await prisma.integration.update({
        where: { id: existing.id },
        data: {
          accessToken,
          refreshToken,
          externalUserId: String(whoopUser.user_id),
          expiresAt,
          lastSyncAt: new Date(),
          syncStatus: 'SUCCESS'
        }
      })
    } else {
      // Create new integration
      await prisma.integration.create({
        data: {
          userId: user.id,
          provider: 'whoop',
          accessToken,
          refreshToken,
          externalUserId: String(whoopUser.user_id),
          expiresAt,
          syncStatus: 'SUCCESS',
          lastSyncAt: new Date()
        }
      })
    }

    // Redirect back to settings with success message
    return sendRedirect(event, '/settings?whoop_success=true')
  } catch (error: any) {
    console.error('Failed to connect WHOOP:', error)
    return sendRedirect(
      event,
      '/settings?whoop_error=' + encodeURIComponent(error.message || 'connection_failed')
    )
  }
})
