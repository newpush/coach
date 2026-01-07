import 'dotenv/config'
import { prisma } from '../server/utils/db'

async function main() {
  console.log('=== Auth Bypass Debug Tool ===\n')

  const bypassEmail = process.env.AUTH_BYPASS_USER

  if (!bypassEmail) {
    console.error('❌ AUTH_BYPASS_USER not set')
    return
  }

  console.log(`Bypass Email: ${bypassEmail}\n`)

  // 1. Check user
  const user = await prisma.user.findUnique({
    where: { email: bypassEmail }
  })

  if (!user) {
    console.error('❌ User not found!')
    return
  }

  console.log('✓ User found:', {
    id: user.id,
    name: user.name,
    email: user.email,
    isAdmin: user.isAdmin
  })

  // 2. Check sessions
  const sessions = await prisma.session.findMany({
    where: { userId: user.id },
    orderBy: { expires: 'desc' }
  })

  console.log(`\nFound ${sessions.length} session(s):`)
  sessions.forEach((session, i) => {
    const isValid = session.expires > new Date()
    console.log(`\n  Session ${i + 1}:`)
    console.log(`    Token: ${session.sessionToken.substring(0, 20)}...`)
    console.log(`    Expires: ${session.expires.toISOString()}`)
    console.log(`    Status: ${isValid ? '✓ VALID' : '✗ EXPIRED'}`)
  })

  // 3. Check accounts
  const accounts = await prisma.account.findMany({
    where: { userId: user.id }
  })

  console.log(`\nFound ${accounts.length} connected account(s):`)
  accounts.forEach((account: any) => {
    console.log(`  - ${account.provider} (${account.providerAccountId})`)
  })

  // 4. Test session query (simulating what next-auth does)
  console.log('\n=== Testing Session Lookup ===')
  if (sessions.length > 0) {
    const testSession = sessions[0]
    const lookupResult = await prisma.session.findUnique({
      where: { sessionToken: testSession.sessionToken },
      include: { user: true }
    })

    console.log('Session lookup result:', lookupResult ? '✓ Found' : '✗ Not found')
    if (lookupResult) {
      console.log('  User from session:', lookupResult.user.email)
    }
  }

  console.log('\n=== Recommendations ===')
  console.log('1. Check browser DevTools > Application > Cookies for localhost:3099')
  console.log('   Looking for: next-auth.session-token')
  console.log('\n2. Check browser DevTools > Network tab for /api/auth/session')
  console.log('   Should return: { user: { email: "' + bypassEmail + '" } }')
  console.log('\n3. Check server logs for "[Auth Bypass]" messages')
  console.log('\n4. Try accessing: http://localhost:3099/api/auth/session')
  console.log('   in your browser directly')
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
