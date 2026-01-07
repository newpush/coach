import { getServerSession } from '../../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Integrations'],
    summary: 'Strava callback',
    description: 'Handles the OAuth callback from Strava.',
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

  const config = useRuntimeConfig()

  // Disable Strava on hosted version until app request is accepted
  const isHosted = config.public.siteUrl?.includes('coachwatts.com')
  if (isHosted) {
    throw createError({
      statusCode: 503,
      message: 'Strava integration is temporarily unavailable on coachwatts.com'
    })
  }

  const query = getQuery(event)
  const code = query.code as string
  const state = query.state as string
  const error = query.error as string

  if (error) {
    console.error('Strava OAuth error:', error)
    return sendRedirect(event, '/settings?strava_error=' + encodeURIComponent(error))
  }

  const storedState = getCookie(event, 'strava_oauth_state')
  if (!state || !storedState || state !== storedState) {
    console.error('Strava OAuth state mismatch')
    deleteCookie(event, 'strava_oauth_state')
    return sendRedirect(event, '/settings?strava_error=invalid_state')
  }

  deleteCookie(event, 'strava_oauth_state')

  if (!code) {
    return sendRedirect(event, '/settings?strava_error=no_code')
  }

  try {
    const clientId = process.env.STRAVA_CLIENT_ID
    const clientSecret = process.env.STRAVA_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error('Strava credentials not configured')
    }

    const tokenResponse = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code'
      })
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('Strava token exchange failed:', errorText)
      throw new Error('Failed to exchange authorization code')
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token
    const refreshToken = tokenData.refresh_token
    const expiresAt = new Date(tokenData.expires_at * 1000)
    const athleteId = String(tokenData.athlete.id)

    const { fetchStravaAthlete } = await import('../../../utils/strava')
    const athlete = await fetchStravaAthlete(accessToken)

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      throw createError({
        statusCode: 404,
        message: 'User not found'
      })
    }

    const existing = await prisma.integration.findFirst({
      where: {
        userId: user.id,
        provider: 'strava'
      }
    })

    if (existing) {
      await prisma.integration.update({
        where: { id: existing.id },
        data: {
          accessToken,
          refreshToken,
          externalUserId: athleteId,
          expiresAt,
          lastSyncAt: new Date(),
          syncStatus: 'SUCCESS'
        }
      })
    } else {
      await prisma.integration.create({
        data: {
          userId: user.id,
          provider: 'strava',
          accessToken,
          refreshToken,
          externalUserId: athleteId,
          expiresAt,
          syncStatus: 'SUCCESS',
          lastSyncAt: new Date()
        }
      })
    }

    return sendRedirect(event, '/settings?strava_success=true')
  } catch (error: any) {
    console.error('Failed to connect Strava:', error)
    return sendRedirect(
      event,
      '/settings?strava_error=' + encodeURIComponent(error.message || 'connection_failed')
    )
  }
})
