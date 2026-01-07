/**
 * Check if Strava has HR stream data for a specific workout
 * Usage: npx tsx scripts/check-strava-hr-stream.ts [workout-id]
 */

import { config } from 'dotenv'

// Load environment variables before importing anything else
config()

async function checkStravaHRStream() {
  const workoutId = process.argv[2]

  if (!workoutId) {
    console.error('❌ Please provide a workout ID')
    console.log('Usage: npx tsx scripts/check-strava-hr-stream.ts [workout-id]')
    process.exit(1)
  }

  console.log(`🔍 Checking Strava API for workout: ${workoutId}\n`)

  // Dynamically import modules to ensure env vars are available
  const { prisma } = await import('../server/utils/db')
  const { fetchStravaActivityDetails, fetchStravaActivityStreams } =
    await import('../server/utils/strava')

  try {
    // Find the workout
    const workout = await prisma.workout.findUnique({
      where: { id: workoutId },
      include: {
        user: {
          select: { email: true, name: true }
        }
      }
    })

    if (!workout) {
      console.error('❌ Workout not found in database')
      process.exit(1)
    }

    if (workout.source !== 'strava') {
      console.error(`❌ This workout is from ${workout.source}, not Strava`)
      process.exit(1)
    }

    console.log('📊 Workout Details:')
    console.log(`   Title: ${workout.title}`)
    console.log(`   Type: ${workout.type}`)
    console.log(`   Date: ${workout.date.toLocaleDateString()}`)
    console.log(`   External ID: ${workout.externalId}`)
    console.log(`   User: ${workout.user.name || workout.user.email}`)

    // Get the Strava integration
    const integration = await prisma.integration.findUnique({
      where: {
        userId_provider: {
          userId: workout.userId,
          provider: 'strava'
        }
      }
    })

    if (!integration) {
      console.error('\n❌ No Strava integration found for this user')
      process.exit(1)
    }

    const activityId = parseInt(workout.externalId)

    // Fetch activity details
    console.log('\n🔄 Fetching activity details from Strava...')
    const details = await fetchStravaActivityDetails(integration, activityId)

    console.log('✅ Activity details fetched:')
    console.log(`   Has Heartrate: ${details.has_heartrate}`)
    console.log(`   Average Heartrate: ${details.average_heartrate || 'N/A'}`)
    console.log(`   Max Heartrate: ${details.max_heartrate || 'N/A'}`)

    // Fetch streams
    console.log('\n🔄 Fetching streams from Strava...')
    const streams = await fetchStravaActivityStreams(integration, activityId, [
      'heartrate',
      'time',
      'distance',
      'velocity_smooth',
      'watts',
      'cadence',
      'altitude'
    ])

    console.log('\n💓 Heart Rate Stream Status:')

    if (streams.heartrate && streams.heartrate.data) {
      const hrData = streams.heartrate.data as number[]
      console.log('   ✅ HR stream data IS AVAILABLE from Strava!')
      console.log(`   - Data points: ${hrData.length}`)
      console.log(`   - Min HR: ${Math.min(...hrData)} bpm`)
      console.log(`   - Max HR: ${Math.max(...hrData)} bpm`)
      console.log(
        `   - Average HR: ${Math.round(hrData.reduce((a, b) => a + b, 0) / hrData.length)} bpm`
      )

      // Show a sample
      const sampleSize = Math.min(10, hrData.length)
      const sample = hrData.slice(0, sampleSize)
      console.log(`\n   First ${sampleSize} HR readings: ${sample.join(', ')} bpm`)

      console.log('\n💡 You can store this data by running:')
      console.log('   npx tsx scripts/test-strava-pacing.ts')
    } else {
      console.log('   ❌ NO HR stream data available from Strava')
      console.log('   This likely means the activity was recorded without a heart rate monitor')
    }

    // Show other available streams
    console.log('\n📊 Other streams available from Strava:')
    const availableStreams = Object.entries(streams)
      .filter(([_, stream]) => stream && stream.data)
      .map(([key, stream]) => `${key} (${stream.data.length} points)`)

    if (availableStreams.length > 0) {
      availableStreams.forEach((stream) => console.log(`   - ${stream}`))
    } else {
      console.log('   - None')
    }
  } catch (error: any) {
    console.error('\n❌ Error:', error.message)
    if (error.message.includes('Rate Limit')) {
      console.log('\n⚠️  Strava API rate limit reached. Please try again later.')
    }
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

checkStravaHRStream()
