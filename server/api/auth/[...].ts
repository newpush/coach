import { NuxtAuthHandler } from '#auth'
import GoogleProvider from 'next-auth/providers/google'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { prisma } from '../../utils/db'

export default NuxtAuthHandler({
  adapter: PrismaAdapter(prisma),
  providers: [
    // @ts-expect-error - Types mismatch between next-auth versions
    GoogleProvider.default({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    {
      id: 'intervals',
      name: 'Intervals.icu',
      type: 'oauth',
      authorization: {
        url: 'https://intervals.icu/oauth/authorize',
        params: { scope: 'ACTIVITY:READ,ACTIVITY:WRITE,CALENDAR:READ,CALENDAR:WRITE,WELLNESS:READ,WELLNESS:WRITE' }
      },
      token: 'https://intervals.icu/api/v1/oauth/access_token',
      userinfo: 'https://intervals.icu/api/v1/athlete/current',
      clientId: process.env.INTERVALS_CLIENT_ID,
      clientSecret: process.env.INTERVALS_CLIENT_SECRET,
      profile(profile: any) {
        return {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          image: profile.profile_medium || profile.profile,
        }
      }
    }
  ],
  secret: process.env.NUXT_AUTH_SECRET,
  callbacks: {
    async session({ session, user }: any) {
      if (session.user) {
        session.user.id = user.id
        session.user.isAdmin = user.isAdmin || false
      }
      return session
    },
  },
  events: {
    async linkAccount({ user, account }: any) {
      if (account.provider === 'intervals') {
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
        } catch (error) {
          console.error('Failed to sync Intervals.icu integration:', error)
        }
      }
    }
  }
})
