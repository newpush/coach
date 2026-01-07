import 'dotenv/config'
import { prisma } from '../server/utils/db'

async function backfillWorkoutMetadata() {
  console.log('Starting workout metadata backfill...')

  // Get all workouts with rawJson
  const workouts = await prisma.workout.findMany({
    where: {
      rawJson: { not: null }
    },
    select: {
      id: true,
      source: true,
      rawJson: true,
      calories: true,
      elapsedTimeSec: true,
      deviceName: true,
      commute: true,
      isPrivate: true,
      gearId: true
    }
  })

  console.log(`Found ${workouts.length} workouts to process`)

  let updated = 0
  let skipped = 0
  let errors = 0

  for (const workout of workouts) {
    try {
      const raw = workout.rawJson as any
      const updates: any = {}

      // Extract fields based on source
      if (workout.source === 'strava') {
        // Strava fields
        if (raw.calories !== undefined && workout.calories === null) {
          updates.calories = raw.calories
        }
        if (raw.elapsed_time !== undefined && workout.elapsedTimeSec === null) {
          updates.elapsedTimeSec = raw.elapsed_time
        }
        if (raw.device_name && workout.deviceName === null) {
          updates.deviceName = raw.device_name
        }
        if (raw.commute !== undefined && workout.commute === null) {
          updates.commute = raw.commute
        }
        if (raw.private !== undefined && workout.isPrivate === null) {
          updates.isPrivate = raw.private
        }
        if (raw.gear_id && workout.gearId === null) {
          updates.gearId = raw.gear_id
        }
      } else if (workout.source === 'intervals') {
        // Intervals.icu fields
        if (raw.calories !== undefined && workout.calories === null) {
          updates.calories = raw.calories
        }
        if (raw.elapsed_time !== undefined && workout.elapsedTimeSec === null) {
          updates.elapsedTimeSec = raw.elapsed_time
        }
        // Intervals doesn't provide device_name, commute, private, or gear_id
      }

      // Update if we have any changes
      if (Object.keys(updates).length > 0) {
        await prisma.workout.update({
          where: { id: workout.id },
          data: updates
        })
        updated++

        if (updated % 10 === 0) {
          console.log(`Progress: ${updated} workouts updated`)
        }
      } else {
        skipped++
      }
    } catch (error) {
      console.error(`Error processing workout ${workout.id}:`, error)
      errors++
    }
  }

  console.log('\nBackfill complete!')
  console.log(`Updated: ${updated}`)
  console.log(`Skipped: ${skipped}`)
  console.log(`Errors: ${errors}`)

  // Show sample of updated data
  console.log('\nSample of updated workouts:')
  const samples = await prisma.workout.findMany({
    where: {
      OR: [
        { calories: { not: null } },
        { elapsedTimeSec: { not: null } },
        { deviceName: { not: null } }
      ]
    },
    select: {
      id: true,
      source: true,
      title: true,
      date: true,
      calories: true,
      elapsedTimeSec: true,
      deviceName: true,
      commute: true,
      isPrivate: true,
      gearId: true
    },
    take: 5,
    orderBy: { date: 'desc' }
  })

  console.table(
    samples.map((w) => ({
      source: w.source,
      title: w.title.substring(0, 30),
      date: w.date.toISOString().split('T')[0],
      calories: w.calories,
      elapsed: w.elapsedTimeSec,
      device: w.deviceName?.substring(0, 20),
      commute: w.commute,
      private: w.isPrivate,
      gear: w.gearId
    }))
  )
}

backfillWorkoutMetadata()
  .then(() => {
    console.log('\n✅ Backfill script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Backfill script failed:', error)
    process.exit(1)
  })
