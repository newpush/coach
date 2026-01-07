import 'dotenv/config'
import { prisma } from '../server/utils/db'

async function main() {
  console.log('Testing Auth Bypass Configuration...\n')

  const bypassEmail = process.env.AUTH_BYPASS_USER

  if (!bypassEmail) {
    console.error('❌ AUTH_BYPASS_USER is not set in .env')
    return
  }

  console.log(`✓ AUTH_BYPASS_USER is set to: ${bypassEmail}\n`)

  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { email: bypassEmail }
  })

  if (!user) {
    console.error(`❌ User not found in database: ${bypassEmail}`)
    console.log('\nPlease ensure the user exists. You may need to:')
    console.log('1. Sign in with Google OAuth first to create the account')
    console.log('2. Or create the user manually in the database')
    return
  }

  console.log(`✓ User found in database:`)
  console.log(`  - ID: ${user.id}`)
  console.log(`  - Name: ${user.name}`)
  console.log(`  - Email: ${user.email}`)
  console.log(`  - Is Admin: ${user.isAdmin}`)

  // Check for existing sessions
  const sessions = await prisma.session.findMany({
    where: { userId: user.id }
  })

  console.log(`\n✓ Found ${sessions.length} existing session(s) for this user`)

  if (sessions.length > 0) {
    const validSessions = sessions.filter((s) => s.expires > new Date())
    const expiredSessions = sessions.filter((s) => s.expires <= new Date())

    console.log(`  - Valid: ${validSessions.length}`)
    console.log(`  - Expired: ${expiredSessions.length}`)

    if (expiredSessions.length > 0) {
      console.log('\n🧹 Cleaning up expired sessions...')
      await prisma.session.deleteMany({
        where: {
          userId: user.id,
          expires: {
            lt: new Date()
          }
        }
      })
      console.log(`✓ Deleted ${expiredSessions.length} expired session(s)`)
    }
  }

  console.log('\n✅ Auth bypass setup looks good!')
  console.log('\nNext steps:')
  console.log('1. Clear your browser cookies for localhost:3099')
  console.log('2. Restart the dev server (if running)')
  console.log('3. Navigate to http://localhost:3099/dashboard')
  console.log('4. The auth bypass plugin should automatically create a session')
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
