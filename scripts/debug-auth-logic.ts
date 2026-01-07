import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import pg from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL

const pool = new pg.Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('--- Debug Auth Logic ---')
  console.log('Environment Variables:')
  console.log('AUTH_BYPASS_USER:', process.env.AUTH_BYPASS_USER)
  console.log('NUXT_AUTH_SECRET:', process.env.NUXT_AUTH_SECRET ? '***' : 'MISSING')

  // Check bypass user
  if (process.env.AUTH_BYPASS_USER) {
    console.log(`Checking bypass user: ${process.env.AUTH_BYPASS_USER}`)
    try {
      const user = await prisma.user.findUnique({
        where: { email: process.env.AUTH_BYPASS_USER }
      })
      if (user) {
        console.log(
          '✅ Bypass user exists:',
          user.id,
          user.email,
          'isAdmin:',
          (user as any).isAdmin
        )
      } else {
        console.log('❌ Bypass user NOT FOUND')
      }
    } catch (e) {
      console.error('Error querying bypass user:', e)
    }
  } else {
    console.log('ℹ️ AUTH_BYPASS_USER not set')
  }

  // Check DB connection
  try {
    const count = await prisma.user.count()
    console.log(`Database connected. Total users: ${count}`)
  } catch (e) {
    console.error('❌ Database connection failed:', e)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
