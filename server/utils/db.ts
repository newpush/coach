import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const prismaClientSingleton = () => {
  // Check if we are in a script context where DATABASE_URL might be different or env issues
  // But standard Prisma setup should work if env is loaded.
  // The error "SCRAM-SERVER-FIRST-MESSAGE: client password must be a string" suggests
  // something about the connection string parsing or password handling in pg.
  // This often happens if the password is empty or encoded weirdly in the URL.

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
  })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

declare global {
  var prismaGlobalV2: undefined | ReturnType<typeof prismaClientSingleton>
}

export const prisma = globalThis.prismaGlobalV2 ?? prismaClientSingleton()

// Force rebuild for new client
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobalV2 = prisma
