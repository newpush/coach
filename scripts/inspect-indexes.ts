import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Inspecting indexes...')

  const indexes = await prisma.$queryRawUnsafe(`
    SELECT tablename, indexname 
    FROM pg_indexes 
    WHERE tablename IN ('ApiKey', 'Workout', 'PlannedWorkout', 'CoachingRelationship')
  `)

  console.log(JSON.stringify(indexes, null, 2))
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
