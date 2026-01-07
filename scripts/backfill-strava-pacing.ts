/**
 * Backfill Script for Strava Pacing Data
 *
 * This script adds pacing data to existing Strava workouts that don't have it yet.
 * It processes workouts in batches to respect Strava API rate limits.
 *
 * Usage:
 *   npx tsx scripts/backfill-strava-pacing.ts
 *   npx tsx scripts/backfill-strava-pacing.ts --limit 50 --batch-size 10
 *
 * Strava Rate Limits:
 *   - 100 requests per 15 minutes
 *   - 1,000 requests per day
 */

import { prisma } from '../server/utils/db'
import { tasks } from '@trigger.dev/sdk/v3'

// Parse command line arguments
const args = process.argv.slice(2)
const limitIndex = args.indexOf('--limit')
const batchSizeIndex = args.indexOf('--batch-size')
const dryRunIndex = args.indexOf('--dry-run')

const LIMIT = limitIndex >= 0 ? parseInt(args[limitIndex + 1]) : undefined
const BATCH_SIZE = batchSizeIndex >= 0 ? parseInt(args[batchSizeIndex + 1]) : 10
const DRY_RUN = dryRunIndex >= 0

// Activity types that should have pacing data
const PACING_ACTIVITY_TYPES = ['Run', 'Ride', 'Walk', 'Hike']

async function backfillPacingData() {
  console.log('🔄 Starting Strava Pacing Data Backfill')
  console.log('=====================================\n')

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No data will be modified\n')
  }

  console.log('Configuration:')
  console.log(`  Batch size: ${BATCH_SIZE} workouts`)
  console.log(`  Limit: ${LIMIT || 'No limit'}`)
  console.log(`  Activity types: ${PACING_ACTIVITY_TYPES.join(', ')}\n`)

  // Find all Strava workouts without pacing data
  console.log('Step 1: Finding workouts that need pacing data...')

  const workoutsWithoutPacing = await prisma.workout.findMany({
    where: {
      source: 'strava',
      type: { in: PACING_ACTIVITY_TYPES },
      streams: null // No pacing data yet
    },
    select: {
      id: true,
      externalId: true,
      userId: true,
      title: true,
      type: true,
      date: true,
      durationSec: true,
      distanceMeters: true
    },
    orderBy: {
      date: 'desc' // Most recent first
    },
    take: LIMIT
  })

  console.log(`✅ Found ${workoutsWithoutPacing.length} workouts without pacing data\n`)

  if (workoutsWithoutPacing.length === 0) {
    console.log('🎉 All workouts already have pacing data!')
    return
  }

  // Show sample of workouts to be processed
  console.log('Sample workouts to process:')
  const sample = workoutsWithoutPacing.slice(0, 5)
  sample.forEach((w) => {
    const distance = w.distanceMeters ? `${(w.distanceMeters / 1000).toFixed(2)}km` : 'N/A'
    const duration = `${Math.floor(w.durationSec / 60)}min`
    console.log(
      `  - ${w.title} (${w.type}, ${w.date.toLocaleDateString()}, ${distance}, ${duration})`
    )
  })

  if (workoutsWithoutPacing.length > 5) {
    console.log(`  ... and ${workoutsWithoutPacing.length - 5} more`)
  }

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN - Would process these workouts but not making any changes')
    return
  }

  // Confirm before proceeding
  console.log('\n⚠️  This will use Strava API quota:')
  console.log(`   ${workoutsWithoutPacing.length} requests for streams data`)
  console.log(`   Rate limit: 100 requests per 15 minutes\n`)

  // Process in batches
  console.log(`Step 2: Processing workouts in batches of ${BATCH_SIZE}...`)

  let processed = 0
  let successful = 0
  let failed = 0
  const errors: Array<{ workout: string; error: string }> = []

  for (let i = 0; i < workoutsWithoutPacing.length; i += BATCH_SIZE) {
    const batch = workoutsWithoutPacing.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(workoutsWithoutPacing.length / BATCH_SIZE)

    console.log(`\nBatch ${batchNum}/${totalBatches} (${batch.length} workouts)`)

    for (const workout of batch) {
      try {
        console.log(`  Triggering: ${workout.title} (${workout.type})...`)

        await tasks.trigger('ingest-strava-streams', {
          userId: workout.userId,
          workoutId: workout.id,
          activityId: parseInt(workout.externalId)
        })

        successful++
        console.log(`    ✅ Triggered successfully`)
      } catch (error: any) {
        failed++
        const errorMsg = error.message || 'Unknown error'
        console.log(`    ❌ Failed: ${errorMsg}`)
        errors.push({
          workout: `${workout.title} (${workout.id})`,
          error: errorMsg
        })
      }

      processed++

      // Small delay between triggers to avoid overwhelming the system
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    // Delay between batches to respect rate limits
    // Strava allows 100 requests per 15 minutes
    // With batch size of 10, we make ~10 requests, leaving plenty of headroom
    if (i + BATCH_SIZE < workoutsWithoutPacing.length) {
      const nextBatch = Math.floor(i / BATCH_SIZE) + 2
      console.log(`\n⏸️  Pausing 10 seconds before batch ${nextBatch}/${totalBatches}...`)
      await new Promise((resolve) => setTimeout(resolve, 10000))
    }
  }

  // Summary
  console.log('\n=====================================')
  console.log('✅ Backfill Complete!')
  console.log('=====================================\n')
  console.log('Summary:')
  console.log(`  Total workouts: ${workoutsWithoutPacing.length}`)
  console.log(`  Successfully triggered: ${successful}`)
  console.log(`  Failed: ${failed}`)
  console.log(`  Processing rate: ${processed} jobs triggered\n`)

  if (errors.length > 0) {
    console.log('⚠️  Errors encountered:')
    errors.forEach(({ workout, error }) => {
      console.log(`  - ${workout}: ${error}`)
    })
    console.log()
  }

  console.log('📊 Next Steps:')
  console.log('  1. Check Trigger.dev dashboard for job progress')
  console.log('  2. Wait for background jobs to complete (may take a few minutes)')
  console.log('  3. Pacing data will be available once jobs finish')
  console.log('  4. Check /api/workouts/:id/streams to verify data')
  console.log()
  console.log('ℹ️  Note: Background jobs will continue processing even after this script exits')
}

async function main() {
  try {
    await backfillPacingData()
  } catch (error) {
    console.error('\n❌ Fatal error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Interrupted by user. Cleaning up...')
  await prisma.$disconnect()
  process.exit(0)
})

main()
