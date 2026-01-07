import 'dotenv/config'
import { prisma } from '../server/utils/db'

async function main() {
  console.log('Checking WorkoutStream data availability...')

  const streamCount = await prisma.workoutStream.count()
  console.log(`Total WorkoutStream records: ${streamCount}`)

  if (streamCount === 0) {
    console.log('No stream data found.')
    return
  }

  // Fetch a few recent streams
  const streams = await prisma.workoutStream.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      workoutId: true,
      grade: true,
      altitude: true,
      heartrate: true,
      watts: true,
      cadence: true,
      velocity: true,
      // Check if we have any other raw data potential
      workout: {
        select: {
          source: true,
          title: true
        }
      }
    }
  })

  console.log('\nSample Stream Analysis:')

  for (const stream of streams) {
    console.log(`\nWorkout: ${stream.workout.title} (${stream.workout.source})`)

    const analyzeField = (name: string, data: any) => {
      if (!data) return `${name}: NULL`
      if (Array.isArray(data)) {
        return `${name}: Present (${data.length} points)`
      }
      return `${name}: Present (Type: ${typeof data})`
    }

    console.log(`  ${analyzeField('Heart Rate', stream.heartrate)}`)
    console.log(`  ${analyzeField('Altitude', stream.altitude)}`)
    console.log(`  ${analyzeField('Velocity', stream.velocity)}`)
    console.log(`  ${analyzeField('Power', stream.watts)}`)
    console.log(`  ${analyzeField('Cadence', stream.cadence)}`)
    console.log(`  ${analyzeField('Grade', stream.grade)}`)
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
