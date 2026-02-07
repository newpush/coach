import { NuxtAuthHandler } from '#auth'
import GoogleProvider from 'next-auth/providers/google'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { prisma } from '../../utils/db'
import { tasks } from '@trigger.dev/sdk/v3'
import { getRequestIP, getRequestHeader, defineEventHandler } from 'h3'
import { logAction } from '../../utils/audit'

const adapter = PrismaAdapter(prisma)
const originalLinkAccount = adapter.linkAccount
adapter.linkAccount = (account: any) => {
  const sanitizedAccount = { ...account }
  if (sanitizedAccount.athlete) {
    delete sanitizedAccount.athlete
  }
  return originalLinkAccount!(sanitizedAccount)
}

const syncIntervalsIntegration = async (user: any, account: any) => {
  try {
    await prisma.integration.upsert({
      where: {
        userId_provider: {
          userId: user.id,
          provider: 'intervals'
        }
      },
      update: {
        accessToken: account.access_token!,
        refreshToken: account.refresh_token,
        expiresAt: account.expires_at ? new Date(account.expires_at * 1000) : undefined,
        externalUserId: account.providerAccountId,
        scope: account.scope,
        lastSyncAt: new Date(),
        syncStatus: 'SUCCESS'
      },
      create: {
        userId: user.id,
        provider: 'intervals',
        accessToken: account.access_token!,
        refreshToken: account.refresh_token,
        expiresAt: account.expires_at ? new Date(account.expires_at * 1000) : undefined,
        externalUserId: account.providerAccountId,
        scope: account.scope,
        syncStatus: 'SUCCESS',
        lastSyncAt: new Date(),
        ingestWorkouts: true
      }
    })
    console.log('Successfully synced Intervals.icu integration')

    // Trigger initial sync (last 365 days)
    const endDate = new Date().toISOString()
    const startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()

    await tasks.trigger(
      'ingest-intervals',
      {
        userId: user.id,
        startDate,
        endDate
      },
      {
        concurrencyKey: user.id,
        tags: [`user:${user.id}`]
      }
    )
    console.log('Triggered initial Intervals.icu sync')

    // Trigger profile auto-detection
    await tasks.trigger(
      'autodetect-intervals-profile',
      { userId: user.id },
      { concurrencyKey: user.id, tags: [`user:${user.id}`] }
    )
    console.log('Triggered Intervals.icu profile auto-detection')
  } catch (error) {
    console.error('Failed to sync Intervals.icu integration:', error)
  }
}

export default NuxtAuthHandler({
  adapter,
  providers: [
    // @ts-expect-error - Types mismatch between next-auth versions
    GoogleProvider.default({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true
    }),
    {
      id: 'intervals',
      name: 'Intervals.icu',
      type: 'oauth',
      authorization: {
        url: 'https://intervals.icu/oauth/authorize',
        params: { scope: 'ACTIVITY:WRITE,CALENDAR:WRITE,WELLNESS:WRITE,SETTINGS:WRITE' }
      },
      token: 'https://intervals.icu/api/oauth/token',
      userinfo: 'https://intervals.icu/api/v1/athlete/0',
      clientId: process.env.INTERVALS_CLIENT_ID,
      clientSecret: process.env.INTERVALS_CLIENT_SECRET,
      client: {
        token_endpoint_auth_method: 'client_secret_post'
      },
      allowDangerousEmailAccountLinking: true,
      profile(profile: any) {
        return {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          image: profile.profile_medium || profile.profile
        }
      }
    }
  ],
  secret: process.env.NUXT_AUTH_SECRET,
  callbacks: {
    async session({ session, user }: any) {
      if (session.user) {
        ;(session.user as any).id = user.id
        session.user.isAdmin = user.isAdmin || false
        session.user.timezone = user.timezone || null
        session.user.termsAcceptedAt = user.termsAcceptedAt || null
      }
      return session
    }
  },
  events: {
    async linkAccount({ user, account }: any) {
      if (account.provider === 'intervals') {
        await syncIntervalsIntegration(user, account)
      }
    },
    async signIn({ user, account }: any) {
      if (account?.provider === 'intervals') {
        await syncIntervalsIntegration(user, account)
      }

      // Capture login info
      try {
        // Use useEvent() with experimental.asyncContext: true enabled in nuxt.config.ts
        const event = useEvent()
        const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
        const locale = getRequestHeader(event, 'accept-language')

        // Update User model
        await prisma.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date(),
            lastLoginIp: ip
          }
        })

        // Log to AuditLog
        await logAction({
          userId: user.id,
          action: 'USER_LOGIN',
          metadata: {
            locale,
            provider: account?.provider || 'unknown'
          },
          event
        })
      } catch (error) {
        console.error('Failed to update user login info:', error)
      }
    }
  }
})
