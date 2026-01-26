import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import chalk from 'chalk'

async function main() {
  const connectionString = process.env.DATABASE_URL_PROD
  if (!connectionString) {
    console.error('No DATABASE_URL_PROD found')
    process.exit(1)
  }

  console.log(`Connecting to PROD DB...`)

  const pool = new pg.Pool({ connectionString })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter })

  const targetId = 'ad2384b2-4e0d-4492-877b-c877f15d8efe'

  try {
    // 1. Fetch
    console.log(`Fetching ${targetId}...`)
    const workout = await prisma.plannedWorkout.findUnique({
      where: { id: targetId },
      select: { id: true, title: true, rawJson: true }
    })

    if (!workout) {
      console.error(chalk.red(`Record ${targetId} NOT FOUND.`))
      return
    }
    console.log(chalk.green(`Found: ${workout.title}`))

    // 2. Try simple update
    console.log(`Attempting touch update (updatedAt)...`)
    try {
      await prisma.plannedWorkout.update({
        where: { id: targetId },
        data: { updatedAt: new Date() }
      })
      console.log(chalk.green(`Simple update SUCCESS.`))
    } catch (e) {
      console.error(chalk.red(`Simple update FAILED:`), e)
    }
  } catch (e) {
    console.error(e)
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

main()
