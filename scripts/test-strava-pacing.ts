/**
 * Test script for Strava pacing data ingestion
 *
 * This script tests:
 * 1. Fetching streams from Strava API
 * 2. Calculating pacing metrics
 * 3. Storing stream data in database
 * 4. Retrieving stream data via API
 */

import { prisma } from '../server/utils/db'
import { fetchStravaActivityStreams } from '../server/utils/strava'
import {
  calculateLapSplits,
  calculatePaceVariability,
  calculateAveragePace,
  analyzePacingStrategy,
  detectSurges
} from '../server/utils/pacing'

async function testStravaPacing() {
  console.log('🧪 Testing Strava Pacing Data Implementation\n')

  // Step 1: Find a user with Strava integration
  console.log('Step 1: Finding Strava integration...')
  const integration = await prisma.integration.findFirst({
    where: { provider: 'strava' },
    include: { user: true }
  })

  if (!integration) {
    console.error('❌ No Strava integration found. Please connect Strava first.')
    return
  }

  console.log(`✅ Found Strava integration for user: ${integration.user.email}`)

  // Step 2: Find a recent workout from Strava
  console.log('\nStep 2: Finding recent Strava workout...')
  const workout = await prisma.workout.findFirst({
    where: {
      userId: integration.userId,
      source: 'strava',
      type: { in: ['Run', 'Ride', 'Walk'] } // Only activities that have pacing
    },
    orderBy: { date: 'desc' }
  })

  if (!workout) {
    console.error('❌ No Strava workouts found. Please sync some activities first.')
    return
  }

  console.log(`✅ Found workout: ${workout.title} (${workout.date.toLocaleDateString()})`)
  console.log(`   Type: ${workout.type}, Duration: ${Math.floor(workout.durationSec / 60)} min`)
  console.log(`   External ID: ${workout.externalId}`)

  // Step 3: Fetch streams from Strava
  console.log('\nStep 3: Fetching streams from Strava API...')
  try {
    const streams = await fetchStravaActivityStreams(integration, parseInt(workout.externalId), [
      'time',
      'distance',
      'velocity_smooth',
      'heartrate',
      'cadence',
      'watts',
      'altitude'
    ])

    console.log('✅ Streams fetched successfully!')
    console.log(`   Time points: ${streams.time?.data?.length || 0}`)
    console.log(`   Distance points: ${streams.distance?.data?.length || 0}`)
    console.log(`   Velocity points: ${streams.velocity_smooth?.data?.length || 0}`)
    console.log(`   Heart rate points: ${streams.heartrate?.data?.length || 0}`)
    console.log(`   Power points: ${streams.watts?.data?.length || 0}`)

    // Step 4: Calculate pacing metrics
    console.log('\nStep 4: Calculating pacing metrics...')

    const timeData = (streams.time?.data as number[]) || []
    const distanceData = (streams.distance?.data as number[]) || []
    const velocityData = (streams.velocity_smooth?.data as number[]) || []

    if (timeData.length === 0 || distanceData.length === 0) {
      console.error('❌ No time or distance data available')
      return
    }

    // Calculate lap splits
    const lapSplits = calculateLapSplits(timeData, distanceData, 1000)
    console.log(`✅ Calculated ${lapSplits.length} lap splits`)
    if (lapSplits.length > 0) {
      console.log(`   First lap: ${lapSplits[0].pace}`)
      console.log(`   Last lap: ${lapSplits[lapSplits.length - 1].pace}`)
    }

    // Calculate pace variability
    const paceVariability = calculatePaceVariability(velocityData)
    console.log(`✅ Pace variability: ${paceVariability.toFixed(2)} m/s`)

    // Calculate average pace
    const avgPacePerKm = calculateAveragePace(
      timeData[timeData.length - 1],
      distanceData[distanceData.length - 1]
    )
    const minutes = Math.floor(avgPacePerKm)
    const seconds = Math.round((avgPacePerKm - minutes) * 60)
    console.log(`✅ Average pace: ${minutes}:${seconds.toString().padStart(2, '0')}/km`)

    // Analyze pacing strategy
    if (lapSplits.length >= 2) {
      const pacingStrategy = analyzePacingStrategy(lapSplits)
      console.log(`✅ Pacing strategy: ${pacingStrategy.strategy}`)
      console.log(`   ${pacingStrategy.description}`)
      console.log(`   Evenness score: ${pacingStrategy.evenness}/100`)
    }

    // Detect surges
    if (velocityData.length > 20 && timeData.length > 20) {
      const surges = detectSurges(velocityData, timeData)
      console.log(`✅ Detected ${surges.length} pace surges`)
    }

    // Step 5: Store in database
    console.log('\nStep 5: Storing stream data in database...')

    const pacingStrategy = lapSplits.length >= 2 ? analyzePacingStrategy(lapSplits) : null
    const surges = velocityData.length > 20 ? detectSurges(velocityData, timeData) : null

    const workoutStream = await prisma.workoutStream.upsert({
      where: { workoutId: workout.id },
      create: {
        workoutId: workout.id,
        time: timeData,
        distance: distanceData,
        velocity: velocityData,
        heartrate: streams.heartrate?.data || null,
        cadence: streams.cadence?.data || null,
        watts: streams.watts?.data || null,
        altitude: streams.altitude?.data || null,
        lapSplits,
        paceVariability,
        avgPacePerKm,
        pacingStrategy,
        surges
      },
      update: {
        time: timeData,
        distance: distanceData,
        velocity: velocityData,
        heartrate: streams.heartrate?.data || null,
        cadence: streams.cadence?.data || null,
        watts: streams.watts?.data || null,
        altitude: streams.altitude?.data || null,
        lapSplits,
        paceVariability,
        avgPacePerKm,
        pacingStrategy,
        surges,
        updatedAt: new Date()
      }
    })

    console.log(`✅ Stream data stored with ID: ${workoutStream.id}`)

    // Step 6: Verify retrieval
    console.log('\nStep 6: Verifying data retrieval...')
    const retrieved = await prisma.workoutStream.findUnique({
      where: { workoutId: workout.id }
    })

    if (retrieved) {
      console.log('✅ Stream data retrieved successfully!')
      console.log(`   Average pace: ${retrieved.avgPacePerKm?.toFixed(2)} min/km`)
      console.log(`   Pace variability: ${retrieved.paceVariability?.toFixed(2)} m/s`)
      console.log(`   Lap splits: ${(retrieved.lapSplits as any)?.length || 0}`)
      console.log(`   Surges: ${(retrieved.surges as any)?.length || 0}`)
    } else {
      console.error('❌ Failed to retrieve stream data')
    }

    console.log('\n✅ All tests passed!')
    console.log(`\n🎉 Pacing data successfully ingested for workout: ${workout.title}`)
    console.log(`   You can now view pacing analysis at /workouts/${workout.id}`)
  } catch (error: any) {
    console.error('\n❌ Error during test:', error.message)
    if (error.message.includes('Rate Limit')) {
      console.log('\n⚠️  Strava API rate limit reached. Please try again later.')
    }
  } finally {
    await prisma.$disconnect()
  }
}

// Run the test
testStravaPacing().catch(console.error)
