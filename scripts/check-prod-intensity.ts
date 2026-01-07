import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

async function main() {
  const connectionString = process.env.DATABASE_URL_PROD
  if (!connectionString) {
    console.error('DATABASE_URL_PROD not found in .env')
    return
  }

  const pool = new pg.Pool({ connectionString })
  const adapter = new PrismaPg(pool)
  const prismaProd = new PrismaClient({ adapter })

  try {
    console.log('Checking Production Database...')

    const plannedHighIntensity = await prismaProd.plannedWorkout.count({
      where: { workIntensity: { gt: 2 } }
    })

    const workoutHighIntensity = await prismaProd.workout.count({
      where: { intensity: { gt: 2 } }
    })

    console.log(`PlannedWorkout with intensity > 2: ${plannedHighIntensity}`)
    console.log(`Workout with intensity > 2: ${workoutHighIntensity}`)

    if (workoutHighIntensity > 0) {
      const sample = await prismaProd.workout.findMany({
        where: { intensity: { gt: 2 } },
        select: { id: true, source: true, intensity: true, externalId: true, date: true },
        take: 5
      })
      console.log('Sample high intensity workouts:', JSON.stringify(sample, null, 2))
    }
  } catch (e) {
    console.error('Error querying prod:', e)
  } finally {
    await prismaProd.$disconnect()
  }
}

main()
