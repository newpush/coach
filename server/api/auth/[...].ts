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
  ],
  secret: process.env.NUXT_AUTH_SECRET,
  // Trust host header to automatically determine the callback URL at runtime
  trustHost: true,
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id
      }
      return session
    },
  },
})