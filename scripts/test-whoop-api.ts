import { config } from 'dotenv'
config()

async function testWhoopRefresh() {
  const refreshToken =
    'tI4t1h9pjY77WkJCkcjSSBbSDpQuUCSDX6gIb7mfpFA.oAbNGgYRm7niwMPMhxzrmRJ_mbM8hrE2sEKQxzlZQbI'
  const clientId = process.env.WHOOP_CLIENT_ID
  const clientSecret = process.env.WHOOP_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    console.error('Missing WHOOP_CLIENT_ID or WHOOP_CLIENT_SECRET')
    return
  }

  console.log('Environment check:', {
    hasClientId: !!clientId,
    hasClientSecret: !!clientSecret,
    clientIdLength: clientId.length,
    clientSecretLength: clientSecret.length
  })

  // Test 1: With scope='offline' only
  console.log('\n=== Test 1: scope="offline" ===')
  try {
    const params1 = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'offline'
    })

    console.log('Request body:', params1.toString())

    const response1 = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params1.toString()
    })

    console.log('Status:', response1.status)
    const result1 = await response1.text()
    console.log('Response:', result1)

    if (response1.ok) {
      console.log('✓ SUCCESS with scope="offline"')
      return
    }
  } catch (error) {
    console.error('Error:', error)
  }

  // Test 2: Without scope parameter
  console.log('\n=== Test 2: No scope parameter ===')
  try {
    const params2 = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret
    })

    console.log('Request body:', params2.toString())

    const response2 = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params2.toString()
    })

    console.log('Status:', response2.status)
    const result2 = await response2.text()
    console.log('Response:', result2)

    if (response2.ok) {
      console.log('✓ SUCCESS without scope')
      return
    }
  } catch (error) {
    console.error('Error:', error)
  }

  // Test 3: With Authorization header instead
  console.log('\n=== Test 3: Basic Auth header ===')
  try {
    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    const params3 = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })

    console.log('Request body:', params3.toString())
    console.log('Auth header: Basic ' + authString.substring(0, 20) + '...')

    const response3 = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${authString}`
      },
      body: params3.toString()
    })

    console.log('Status:', response3.status)
    const result3 = await response3.text()
    console.log('Response:', result3)

    if (response3.ok) {
      console.log('✓ SUCCESS with Basic Auth')
      return
    }
  } catch (error) {
    console.error('Error:', error)
  }

  // Test 4: With redirect_uri matching the callback
  console.log('\n=== Test 4: With redirect_uri ===')
  try {
    const siteUrl =
      process.env.NUXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'http://localhost:3099'
    const redirectUri = `${siteUrl}/api/integrations/whoop/callback`

    console.log('Using redirect_uri:', redirectUri)

    const params4 = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri
    })

    console.log('Request body:', params4.toString())

    const response4 = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params4.toString()
    })

    console.log('Status:', response4.status)
    const result4 = await response4.text()
    console.log('Response:', result4)

    if (response4.ok) {
      console.log('✓ SUCCESS with redirect_uri')
      return
    }
  } catch (error) {
    console.error('Error:', error)
  }

  console.log('\n❌ All tests failed')
}

testWhoopRefresh()
