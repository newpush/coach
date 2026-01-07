import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function testWhoopRefresh() {
  try {
    // Find the Whoop integration
    const integration = await prisma.integration.findFirst({
      where: {
        provider: 'whoop'
      }
    })

    if (!integration) {
      console.error('No Whoop integration found')
      return
    }

    console.log('Found integration:', {
      id: integration.id,
      userId: integration.userId,
      hasAccessToken: !!integration.accessToken,
      hasRefreshToken: !!integration.refreshToken,
      expiresAt: integration.expiresAt,
      isExpired: integration.expiresAt ? new Date() >= integration.expiresAt : null
    })

    const clientId = process.env.WHOOP_CLIENT_ID
    const clientSecret = process.env.WHOOP_CLIENT_SECRET

    console.log('\nEnvironment check:', {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      clientIdLength: clientId?.length,
      clientSecretLength: clientSecret?.length
    })

    if (!integration.refreshToken) {
      console.error('No refresh token available')
      return
    }

    // Try the request without redirect_uri first
    console.log('\n=== Attempting refresh WITHOUT redirect_uri ===')
    const params1 = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: integration.refreshToken,
      client_id: clientId!,
      client_secret: clientSecret!,
      scope: 'offline'
    })

    console.log('Request params:', params1.toString())

    const response1 = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params1.toString()
    })

    console.log('Response status:', response1.status)
    const result1 = await response1.text()
    console.log('Response:', result1)

    if (!response1.ok) {
      // Try with redirect_uri
      console.log('\n=== Attempting refresh WITH redirect_uri ===')
      const siteUrl =
        process.env.NUXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'http://localhost:3099'
      const redirectUri = `${siteUrl}/api/integrations/whoop/callback`

      console.log('Using redirect_uri:', redirectUri)

      const params2 = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: integration.refreshToken,
        client_id: clientId!,
        client_secret: clientSecret!,
        scope: 'offline',
        redirect_uri: redirectUri
      })

      console.log('Request params:', params2.toString())

      const response2 = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params2.toString()
      })

      console.log('Response status:', response2.status)
      const result2 = await response2.text()
      console.log('Response:', result2)
    }
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

testWhoopRefresh()
