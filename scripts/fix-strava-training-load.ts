import 'dotenv/config'
import { prisma } from '../server/utils/db'

/**
 * Fix Training Load Bug in Strava Workouts
 *
 * We were incorrectly storing Strava's "calories" field (energy expenditure)
 * in the trainingLoad field (which should be Intervals.icu's training load metric).
 *
 * This script:
 * 1. Finds all Strava workouts with trainingLoad set
 * 2. Sets trainingLoad to NULL (since Strava doesn't provide this metric)
 * 3. Ensures kilojoules is properly set from the raw data if available
 */

async function main() {
  console.log('\n' + '='.repeat(80))
  console.log('FIXING STRAVA TRAINING LOAD BUG')
  console.log('='.repeat(80) + '\n')

  // Find all Strava workouts with trainingLoad set
  const stravaWorkouts = await prisma.workout.findMany({
    where: {
      source: 'strava',
      trainingLoad: {
        not: null
      }
    },
    orderBy: {
      date: 'desc'
    }
  })

  console.log(`Found ${stravaWorkouts.length} Strava workouts with trainingLoad set\n`)

  if (stravaWorkouts.length === 0) {
    console.log('✅ No workouts to fix!')
    return
  }

  console.log('Sample of workouts that will be fixed:')
  console.log('-'.repeat(80))

  const sample = stravaWorkouts.slice(0, 5)
  for (const workout of sample) {
    console.log(`${workout.date.toISOString().split('T')[0]} - ${workout.title}`)
    console.log(`  Current trainingLoad: ${workout.trainingLoad} (INCORRECT - this is calories!)`)
    console.log(`  TRIMP: ${workout.trimp}`)
    console.log(`  Kilojoules: ${workout.kilojoules}`)
    console.log()
  }

  if (stravaWorkouts.length > 5) {
    console.log(`... and ${stravaWorkouts.length - 5} more workouts\n`)
  }

  // Ask for confirmation (in a script context, we'll just proceed)
  console.log('Proceeding with fix...\n')

  let fixed = 0
  let errors = 0

  for (const workout of stravaWorkouts) {
    try {
      // Extract kilojoules from rawJson if available and not already set
      let kilojoules = workout.kilojoules
      if (!kilojoules && workout.rawJson) {
        const raw = workout.rawJson as any
        if (raw.kilojoules) {
          kilojoules = Math.round(raw.kilojoules)
        }
      }

      await prisma.workout.update({
        where: { id: workout.id },
        data: {
          trainingLoad: null, // Clear the incorrect value
          kilojoules: kilojoules || workout.kilojoules // Ensure kilojoules is set if available
        }
      })

      fixed++

      if (fixed % 10 === 0) {
        console.log(`Fixed ${fixed}/${stravaWorkouts.length} workouts...`)
      }
    } catch (error) {
      console.error(`❌ Error fixing workout ${workout.id}:`, error)
      errors++
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log('RESULTS')
  console.log('='.repeat(80))
  console.log(`✅ Fixed: ${fixed} workouts`)
  if (errors > 0) {
    console.log(`❌ Errors: ${errors} workouts`)
  }
  console.log()
  console.log('Note: Training Load is now NULL for Strava workouts.')
  console.log('This is correct - Strava does not provide this metric.')
  console.log('TRIMP (suffer_score) remains as the primary training stress metric from Strava.')
  console.log()
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
