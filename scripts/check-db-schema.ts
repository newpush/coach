import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Connecting to database...')

  try {
    // Check if Goal table exists
    console.log('Checking Goal table...')
    const goals = await prisma.goal.findMany({ take: 1 })
    console.log('Goal table accessible')
  } catch (error: any) {
    console.error('Error accessing Goal table:', error.message)
  }

  try {
    // Check User table columns
    console.log('Checking User table columns...')
    // We can't easily check columns with Prisma Client directly without raw query or introspection
    // But we can try to select a new field
    const user = await prisma.user.findFirst({
      select: {
        id: true,
        aiPersona: true,
        aiAutoAnalyzeNutrition: true
      }
    })
    console.log('User table new columns accessible')
  } catch (error: any) {
    console.error('Error accessing User table columns:', error.message)
  }

  try {
    // Check LlmUsage table columns
    console.log('Checking LlmUsage table columns...')
    const llm = await prisma.llmUsage.findFirst({
      select: {
        id: true,
        promptFull: true
      }
    })
    console.log('LlmUsage table new columns accessible')
  } catch (error: any) {
    console.error('Error accessing LlmUsage table columns:', error.message)
  }

  try {
    // Check Integration table columns - specifically initialSyncCompleted
    console.log('Checking Integration table columns...')
    const integration = await prisma.integration.findFirst({
      select: {
        id: true,
        // @ts-expect-error - checking for new column
        initialSyncCompleted: true
      }
    })
    console.log('Integration table initialSyncCompleted accessible')
  } catch (error: any) {
    console.error('Error accessing Integration table columns:', error.message)
  }
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
