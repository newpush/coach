import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

// Use DATABASE_URL_PROD if available, otherwise DATABASE_URL
const connectionString = process.env.DATABASE_URL_PROD || process.env.DATABASE_URL

if (!connectionString) {
  console.error('No database connection string found in environment variables.')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Testing Account table queries against production database...\n')
  console.log(`Using connection string: ${connectionString.replace(/:[^:]*@/, ':****@')}`) // Mask password

  try {
    // 1. Check indexes using simpler query
    console.log('\n=== ACCOUNT TABLE INDEXES ===')
    const indexes = (await prisma.$queryRaw`
      SELECT
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = 'Account';
    `) as any[]

    console.log('Indexes:', JSON.stringify(indexes, null, 2))

    // 2. Get a sample account to test with
    console.log('\n=== SAMPLE ACCOUNT DATA ===')
    const sampleAccount = await prisma.account.findFirst({
      select: {
        provider: true,
        providerAccountId: true,
        type: true,
        userId: true
      }
    })

    if (!sampleAccount) {
      console.log('No accounts found in the database. Cannot test findUnique.')
      return
    }

    console.log('Sample account:', sampleAccount)

    // 4. Test the findUnique query (similar to what getUserByAccount does)
    console.log('\n=== TESTING findUnique QUERY ===')
    console.log(
      `Attempting to find account with provider="${sampleAccount.provider}" and providerAccountId="${sampleAccount.providerAccountId}"`
    )

    try {
      const foundAccount = await prisma.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: sampleAccount.provider,
            providerAccountId: sampleAccount.providerAccountId
          }
        }
      })

      console.log('✅ findUnique succeeded!')
      console.log(
        'Found account:',
        foundAccount
          ? {
              provider: foundAccount.provider,
              providerAccountId: foundAccount.providerAccountId,
              userId: foundAccount.userId,
              type: foundAccount.type
            }
          : 'null'
      )
    } catch (error: any) {
      console.error('❌ findUnique FAILED!')
      console.error('Error:', error.message)
      console.error('Error code:', error.code)
      console.error('Full error:', error)
    }

    // 5. Test alternative query using where clause
    console.log('\n=== TESTING findFirst ALTERNATIVE ===')
    try {
      const foundAccount = await prisma.account.findFirst({
        where: {
          provider: sampleAccount.provider,
          providerAccountId: sampleAccount.providerAccountId
        }
      })

      console.log('✅ findFirst succeeded!')
      console.log(
        'Found account:',
        foundAccount
          ? {
              provider: foundAccount.provider,
              providerAccountId: foundAccount.providerAccountId,
              userId: foundAccount.userId
            }
          : 'null'
      )
    } catch (error: any) {
      console.error('❌ findFirst FAILED!')
      console.error('Error:', error.message)
    }

    // 6. Check the Prisma schema model mapping
    console.log('\n=== PRISMA CLIENT METADATA ===')
    console.log('Model fields:', Object.keys((prisma.account as any).fields || {}))

    // 7. Raw SQL query to verify data
    console.log('\n=== RAW SQL VERIFICATION ===')
    const rawResult = (await prisma.$queryRaw`
      SELECT * FROM "Account" 
      WHERE provider = ${sampleAccount.provider} 
      AND "providerAccountId" = ${sampleAccount.providerAccountId}
      LIMIT 1;
    `) as any[]

    console.log('Raw SQL result:', rawResult[0])
  } catch (error: any) {
    console.error('Error during investigation:', error)
    console.error('Stack trace:', error.stack)
  }
}

main()
  .catch((e) => {
    console.error('Fatal error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
