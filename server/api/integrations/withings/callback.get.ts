import { getServerSession } from '#auth'

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
    console.error('Withings OAuth error:', error)
    return sendRedirect(event, '/settings?withings_error=' + encodeURIComponent(error))
  }
  
  // Verify state parameter for CSRF protection
  const storedState = getCookie(event, 'withings_oauth_state')
  if (!state || !storedState || state !== storedState) {
    console.error('Withings OAuth state mismatch')
    deleteCookie(event, 'withings_oauth_state')
    return sendRedirect(event, '/settings?withings_error=invalid_state')
  }
  
  // Clear the state cookie after validation
  deleteCookie(event, 'withings_oauth_state')
  
  if (!code) {
    return sendRedirect(event, '/settings?withings_error=no_code')
  }

  try {
    const config = useRuntimeConfig()
    const clientId = process.env.WITHINGS_CLIENT_ID
    const clientSecret = process.env.WITHINGS_CLIENT_SECRET
    const redirectUri = `${config.public.siteUrl || 'http://localhost:3099'}/api/integrations/withings/callback`

    if (!clientId || !clientSecret) {
      throw new Error('Withings credentials not configured')
    }

    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://wbsapi.withings.net/v2/oauth2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        action: 'requesttoken',
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirectUri,
      }).toString(),
    })

    const tokenData = await tokenResponse.json()
    
    if (tokenData.status !== 0) {
      console.error('Withings token exchange failed:', tokenData)
      throw new Error(`Failed to exchange authorization code: Status ${tokenData.status}`)
    }
    
    const { access_token, refresh_token, expires_in, userid } = tokenData.body

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
        provider: 'withings'
      }
    })

    const expiresAt = new Date(Date.now() + expires_in * 1000)

    if (existing) {
      // Update existing integration
      await prisma.integration.update({
        where: { id: existing.id },
        data: {
          accessToken: access_token,
          refreshToken: refresh_token,
          externalUserId: userid.toString(),
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
          provider: 'withings',
          accessToken: access_token,
          refreshToken: refresh_token,
          externalUserId: userid.toString(),
          expiresAt,
          syncStatus: 'SUCCESS',
          lastSyncAt: new Date()
        }
      })
    }
    
    // Subscribe to notifications (webhook)
    try {
      const webhookUrl = `${config.public.siteUrl || 'http://localhost:3099'}/api/integrations/withings/webhook`
      
      // Subscribe to weight (1), activity/workouts (4), and sleep (16)
      // Note: Withings requires separate subscriptions for each appli
      const applis = [1, 4, 16]
      
      for (const appli of applis) {
        // We use fetch directly as we need to sign the request or use access_token
        // For 'subscribe', we can use access_token without signature if it's health data API
        
        await fetch('https://wbsapi.withings.net/notify', {
           method: 'POST',
           headers: {
             'Content-Type': 'application/x-www-form-urlencoded',
             'Authorization': `Bearer ${access_token}`
           },
           body: new URLSearchParams({
             action: 'subscribe',
             callbackurl: webhookUrl,
             appli: appli.toString()
             // No need for signature/nonce if using access_token for user data
           }).toString()
        })
      }
      console.log('Successfully subscribed to Withings notifications')
    } catch (subError) {
      console.error('Failed to subscribe to notifications:', subError)
      // Don't fail the whole connection if subscription fails
    }

    // Redirect back to settings with success message
    return sendRedirect(event, '/settings?withings_success=true')
  } catch (error: any) {
    console.error('Failed to connect Withings:', error)
    return sendRedirect(event, '/settings?withings_error=' + encodeURIComponent(error.message || 'connection_failed'))
  }
})
