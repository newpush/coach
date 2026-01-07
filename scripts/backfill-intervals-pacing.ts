#!/usr/bin/env tsx
/**
 * Backfill script for Intervals.icu workout stream data
 *
 * Fetches time-series data (HR, power, pace, altitude, etc.) for existing Intervals.icu workouts
 * and populates the WorkoutStream table for timeline visualization
 *
 * Usage:
 *   npx tsx scripts/backfill-intervals-pacing.ts --limit 10
 *   npx tsx scripts/backfill-intervals-pacing.ts --dry-run
 *   npx tsx scripts/backfill-intervals-pacing.ts --user-id abc123
 */

import { PrismaClient } from '@prisma/client'
import { fetchIntervalsActivityStreams } from '../server/utils/intervals'
import {
  calculateLapSplits,
  calculatePaceVariability,
  calculateAveragePace,
  analyzePacingStrategy,
  detectSurges
} from '../server/utils/pacing'

const prisma = new PrismaClient()

interface BackfillOptions {
  limit?: number
  dryRun?: boolean
  userId?: string
}

async function backfillIntervalsPacing(options: BackfillOptions = {}) {
  const { limit, dryRun = false, userId } = options

  console.log('🔄 Starting Intervals.icu pacing data backfill...')
  console.log(`   Dry run: ${dryRun ? 'YES' : 'NO'}`)
  if (limit) console.log(`   Limit: ${limit} workouts`)
  if (userId) console.log(`   User ID: ${userId}`)

  // Find workouts that need stream data
  // Only process Run, Ride, VirtualRide, Walk, Hike types from Intervals.icu
  const pacingTypes = ['Run', 'Ride', 'VirtualRide', 'Walk', 'Hike']

  const where: any = {
    source: 'intervals',
    type: { in: pacingTypes },
    streams: null // Only process workouts without existing stream data
  }

  if (userId) {
    where.userId = userId
  }

  const workouts = await prisma.workout.findMany({
    where,
    include: {
      user: {
        include: {
          integrations: {
            where: { provider: 'intervals' }
          }
        }
      }
    },
    orderBy: { date: 'desc' },
    take: limit
  })

  console.log(`📊 Found ${workouts.length} Intervals.icu workouts needing stream data\n`)

  if (workouts.length === 0) {
    console.log('✅ No workouts to process')
    return
  }

  if (dryRun) {
    console.log('🔍 DRY RUN - Would process:')
    for (const workout of workouts) {
      console.log(
        `   - ${workout.date.toISOString().split('T')[0]} | ${workout.type} | ${workout.title} (${workout.id})`
      )
    }
    return
  }

  let processed = 0
  let succeeded = 0
  let skipped = 0
  let failed = 0

  for (const workout of workouts) {
    processed++
    const integration = workout.user.integrations[0]

    if (!integration) {
      console.log(
        `⚠️  [${processed}/${workouts.length}] No Intervals.icu integration for user ${workout.userId}`
      )
      skipped++
      continue
    }

    try {
      console.log(
        `🔄 [${processed}/${workouts.length}] Processing: ${workout.date.toISOString().split('T')[0]} | ${workout.type} | ${workout.title}`
      )

      // Fetch stream data from Intervals.icu
      const streams = await fetchIntervalsActivityStreams(integration, workout.externalId)

      // Check if we got any stream data
      if (!streams.time || !streams.time.data || streams.time.data.length === 0) {
        console.log(`   ⚠️  No stream data available`)
        skipped++
        continue
      }

      // Extract data arrays
      const timeData = (streams.time?.data as number[]) || []
      const distanceData = (streams.distance?.data as number[]) || []
      const velocityData = (streams.velocity?.data as number[]) || []
      const heartrateData = (streams.heartrate?.data as number[]) || null
      const cadenceData = (streams.cadence?.data as number[]) || null
      const wattsData = (streams.watts?.data as number[]) || null
      const altitudeData = (streams.altitude?.data as number[]) || null
      const latlngData = (streams.latlng?.data as [number, number][]) || null
      const gradeData = (streams.grade?.data as number[]) || null
      const movingData = (streams.moving?.data as boolean[]) || null

      // Calculate pacing metrics
      let lapSplits = null
      let paceVariability = null
      let avgPacePerKm = null
      let pacingStrategy = null
      let surges = null

      if (timeData.length > 0 && distanceData.length > 0) {
        lapSplits = calculateLapSplits(timeData, distanceData, 1000)

        if (velocityData.length > 0) {
          paceVariability = calculatePaceVariability(velocityData)
          avgPacePerKm = calculateAveragePace(
            timeData[timeData.length - 1],
            distanceData[distanceData.length - 1]
          )
        }

        if (lapSplits && lapSplits.length >= 2) {
          pacingStrategy = analyzePacingStrategy(lapSplits)
        }

        if (velocityData.length > 20 && timeData.length > 20) {
          surges = detectSurges(velocityData, timeData)
        }
      }

      // Store in database
      await prisma.workoutStream.create({
        data: {
          workoutId: workout.id,
          time: timeData,
          distance: distanceData,
          velocity: velocityData,
          heartrate: heartrateData,
          cadence: cadenceData,
          watts: wattsData,
          altitude: altitudeData,
          latlng: latlngData,
          grade: gradeData,
          moving: movingData,
          lapSplits,
          paceVariability,
          avgPacePerKm,
          pacingStrategy,
          surges
        }
      })

      console.log(`   ✅ Stored ${timeData.length} data points, ${lapSplits?.length || 0} laps`)
      succeeded++

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100))
    } catch (error) {
      console.error(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      failed++
    }
  }

  console.log('\n📊 Backfill Summary:')
  console.log(`   Total processed: ${processed}`)
  console.log(`   ✅ Succeeded: ${succeeded}`)
  console.log(`   ⚠️  Skipped: ${skipped}`)
  console.log(`   ❌ Failed: ${failed}`)
}

// Parse command line arguments
const args = process.argv.slice(2)
const options: BackfillOptions = {}

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit' && args[i + 1]) {
    options.limit = parseInt(args[i + 1], 10)
    i++
  } else if (args[i] === '--dry-run') {
    options.dryRun = true
  } else if (args[i] === '--user-id' && args[i + 1]) {
    options.userId = args[i + 1]
    i++
  }
}

// Run the backfill
backfillIntervalsPacing(options)
  .then(() => {
    console.log('\n✅ Backfill complete')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Backfill failed:', error)
    process.exit(1)
  })
