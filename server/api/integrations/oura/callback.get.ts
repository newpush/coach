import { getServerSession } from '../../../utils/session'
import { fetchOuraPersonalInfo } from '../../../utils/oura'

defineRouteMeta({
  openAPI: {
    tags: ['Integrations'],
    summary: 'Oura callback',
    description: 'Handles the OAuth callback from Oura.',
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
    console.error('Oura OAuth error:', error)
    return sendRedirect(event, '/settings?oura_error=' + encodeURIComponent(error))
  }

  // Verify state parameter for CSRF protection
  const storedState = getCookie(event, 'oura_oauth_state')
  if (!state || !storedState || state !== storedState) {
    console.error('Oura OAuth state mismatch')
    // Clear the state cookie
    deleteCookie(event, 'oura_oauth_state')
    return sendRedirect(event, '/settings?oura_error=invalid_state')
  }

  // Clear the state cookie after validation
  deleteCookie(event, 'oura_oauth_state')

  if (!code) {
    return sendRedirect(event, '/settings?oura_error=no_code')
  }

  try {
    const config = useRuntimeConfig()
    const clientId = process.env.OURA_CLIENT_ID
    const clientSecret = process.env.OURA_CLIENT_SECRET
    const redirectUri = `${config.public.siteUrl || 'http://localhost:3099'}/api/integrations/oura/callback`

    if (!clientId || !clientSecret) {
      throw new Error('OURA credentials not configured')
    }

    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://api.ouraring.com/oauth/token', {
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
      console.error('Oura token exchange failed:', errorText)
      throw new Error('Failed to exchange authorization code')
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token
    const refreshToken = tokenData.refresh_token
    const expiresIn = tokenData.expires_in

    // Fetch user profile to get user ID or Email
    const personalInfo = await fetchOuraPersonalInfo(accessToken)

    // Oura V2 Personal Info usually contains 'id' (UUID) and 'email' (if scope granted)
    const externalUserId = personalInfo.id || personalInfo.email

    if (!externalUserId) {
      // Fallback: If we can't get an ID, we might not be able to store it keyed by external ID.
      // But for Oura, the ID in personal_info is robust.
      console.warn('Could not find Oura User ID in personal info:', personalInfo)
      throw new Error('Could not retrieve Oura User ID')
    }

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
        provider: 'oura'
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
          externalUserId: String(externalUserId),
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
          provider: 'oura',
          accessToken,
          refreshToken,
          externalUserId: String(externalUserId),
          expiresAt,
          syncStatus: 'SUCCESS',
          lastSyncAt: new Date()
        }
      })
    }

    // Redirect back to settings with success message
    return sendRedirect(event, '/settings?oura_success=true')
  } catch (error: any) {
    console.error('Failed to connect Oura:', error)
    return sendRedirect(
      event,
      '/settings?oura_error=' + encodeURIComponent(error.message || 'connection_failed')
    )
  }
})
