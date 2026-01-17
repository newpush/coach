import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

async function main() {
  const connectionString = process.env.DATABASE_URL_PROD
  if (!connectionString) {
    console.error('DATABASE_URL_PROD is not defined')
    process.exit(1)
  }

  const pool = new pg.Pool({ connectionString })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter })

  try {
    const weeklyTargets = await prisma.plannedWorkout.findMany({
      where: {
        title: 'Weekly',
        category: 'TARGET'
      },
      take: 5
    })

    console.log(`Found ${weeklyTargets.length} sample "Weekly" targets:\n`)

    for (const target of weeklyTargets) {
      console.log('---')
      console.log(`ID: ${target.id}`)
      console.log(`Date: ${target.date}`)
      console.log(`Title: ${target.title}`)
      console.log(`Category: ${target.category}`)
      console.log(`Raw JSON: `)
      console.dir(target.rawJson, { depth: null, colors: true })
    }
  } catch (error) {
    console.error(error)
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

main()
