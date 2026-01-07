/**
 * Check if a workout has HR stream data
 * Usage: npx tsx scripts/check-workout-hr-stream.ts [workout-id]
 */

import { config } from 'dotenv'

// Load environment variables before importing anything else
config()

async function getPrisma() {
  const { prisma } = await import('../server/utils/db')
  return prisma
}

async function checkWorkoutHRStream() {
  const workoutId = process.argv[2]

  if (!workoutId) {
    console.error('❌ Please provide a workout ID')
    console.log('Usage: npx tsx scripts/check-workout-hr-stream.ts [workout-id]')
    process.exit(1)
  }

  console.log(`🔍 Checking workout: ${workoutId}\n`)

  const prisma = await getPrisma()

  try {
    // Find the workout
    const workout = await prisma.workout.findUnique({
      where: { id: workoutId },
      include: {
        streams: true,
        user: {
          select: {
            email: true,
            name: true
          }
        }
      }
    })

    if (!workout) {
      console.error('❌ Workout not found')
      process.exit(1)
    }

    console.log('📊 Workout Details:')
    console.log(`   Title: ${workout.title}`)
    console.log(`   Type: ${workout.type}`)
    console.log(`   Date: ${workout.date.toLocaleDateString()}`)
    console.log(`   Source: ${workout.source}`)
    console.log(`   External ID: ${workout.externalId}`)
    console.log(`   User: ${workout.user.name || workout.user.email}`)
    console.log(`   Duration: ${Math.floor(workout.durationSec / 60)} min`)

    if (workout.averageHr) {
      console.log(`   Average HR (from workout): ${workout.averageHr} bpm`)
    }
    if (workout.maxHr) {
      console.log(`   Max HR (from workout): ${workout.maxHr} bpm`)
    }

    console.log('\n💓 Heart Rate Stream Status:')

    if (!workout.streams) {
      console.log('   ❌ No stream data found')
      console.log('\n💡 To fetch stream data:')
      if (workout.source === 'strava') {
        console.log('   Run: npx tsx scripts/test-strava-pacing.ts')
      } else if (workout.source === 'intervals') {
        console.log('   Run the intervals stream ingestion trigger')
      }
      process.exit(0)
    }

    const hrData = workout.streams.heartrate as number[] | null

    if (!hrData || hrData.length === 0) {
      console.log('   ❌ No heart rate stream data available')
      console.log('\n   Stream data exists but no HR:')
      console.log(`   - Time points: ${(workout.streams.time as number[])?.length || 0}`)
      console.log(`   - Distance points: ${(workout.streams.distance as number[])?.length || 0}`)
      console.log(`   - Velocity points: ${(workout.streams.velocity as number[])?.length || 0}`)
      console.log(`   - Power points: ${(workout.streams.watts as number[])?.length || 0}`)
    } else {
      console.log('   ✅ Heart rate stream data available!')
      console.log(`   - Data points: ${hrData.length}`)
      console.log(`   - Min HR: ${Math.min(...hrData)} bpm`)
      console.log(`   - Max HR: ${Math.max(...hrData)} bpm`)
      console.log(
        `   - Average HR: ${Math.round(hrData.reduce((a, b) => a + b, 0) / hrData.length)} bpm`
      )

      // Show a sample of the data
      const sampleSize = Math.min(10, hrData.length)
      const sample = hrData.slice(0, sampleSize)
      console.log(`\n   First ${sampleSize} HR readings: ${sample.join(', ')} bpm`)

      // Show other available streams
      console.log('\n   Other streams available:')
      console.log(`   - Time points: ${(workout.streams.time as number[])?.length || 0}`)
      console.log(`   - Distance points: ${(workout.streams.distance as number[])?.length || 0}`)
      console.log(`   - Velocity points: ${(workout.streams.velocity as number[])?.length || 0}`)

      if (workout.streams.watts) {
        console.log(`   - Power points: ${(workout.streams.watts as number[])?.length || 0}`)
      }
      if (workout.streams.cadence) {
        console.log(`   - Cadence points: ${(workout.streams.cadence as number[])?.length || 0}`)
      }
      if (workout.streams.altitude) {
        console.log(`   - Altitude points: ${(workout.streams.altitude as number[])?.length || 0}`)
      }

      // Show pacing analysis if available
      if (workout.streams.pacingStrategy) {
        console.log('\n   📈 Pacing Analysis Available:')
        const pacing = workout.streams.pacingStrategy as any
        console.log(`   - Strategy: ${pacing.strategy}`)
        console.log(`   - Evenness: ${pacing.evenness}/100`)
      }
    }
  } catch (error: any) {
    console.error('\n❌ Error:', error.message)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

checkWorkoutHRStream()
