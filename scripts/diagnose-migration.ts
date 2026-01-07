import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Connecting to database to diagnose migration state...')

  // 1. Check Tables
  const tables = ['ApiKey', 'CoachingRelationship', 'CoachingInvite']
  for (const table of tables) {
    try {
      await prisma.$queryRawUnsafe(`SELECT count(*) FROM "${table}" LIMIT 1`)
      console.log(`✅ Table "${table}" exists.`)
    } catch (e: any) {
      if (e.message.includes('does not exist')) {
        console.log(`❌ Table "${table}" DOES NOT exist.`)
      } else {
        console.log(`❓ Error checking table "${table}": ${e.message}`)
      }
    }
  }

  // 2. Check Columns
  const columnsToCheck = [
    { table: 'Integration', column: 'initialSyncCompleted' },
    { table: 'User', column: 'altitude' },
    { table: 'User', column: 'isAdmin' },
    { table: 'Workout', column: 'shareToken' },
    { table: 'PlannedWorkout', column: 'shareToken' }
  ]

  for (const check of columnsToCheck) {
    try {
      await prisma.$queryRawUnsafe(`SELECT "${check.column}" FROM "${check.table}" LIMIT 1`)
      console.log(`✅ Column "${check.column}" in table "${check.table}" exists.`)
    } catch (e: any) {
      if (e.message.includes('does not exist')) {
        console.log(`❌ Column "${check.column}" in table "${check.table}" DOES NOT exist.`)
      } else {
        console.log(
          `❓ Error checking column "${check.column}" in table "${check.table}": ${e.message}`
        )
      }
    }
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
