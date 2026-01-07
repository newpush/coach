/*
 * Investigate workouts with null TSS
 *
 * This script checks why specific workouts don't have TSS values
 * and attempts to normalize them.
 */

import 'dotenv/config'
import { prisma } from '../server/utils/db'
import { normalizeTSS } from '../server/utils/normalize-tss'
import { calculateWorkoutStress } from '../server/utils/calculate-workout-stress'

const WORKOUT_IDS = [
  '1fdd2278-20b5-463e-a506-118885b5e68b',
  '45297229-803b-4b46-88ca-dee549c7f9d8',
  '1009135a-f620-4614-b34c-1d6eabf7df0e',
  '20a4b24b-7286-497d-9de1-a2daca726f4d',
  '1a9b7184-2203-4f10-b617-5b48d63db196',
  '3b9f208b-d173-4631-864c-398038e8256e',
  'c2264cf1-8215-4bd0-a266-988a03231f03',
  '1c7806ae-8674-42c9-81fb-5c977353ebcf',
  'c28990be-df19-401e-9908-67729c9dadbf',
  '97d33229-d94c-4bf4-9abd-31b6ab81ba81',
  '52bf0283-e1c3-4c91-83d1-7450357c8c8d',
  '2d26973a-fe90-41c5-bdf4-f2b8aabd9f0c',
  'ab04e589-cc1c-41d4-8308-87793f4ff5e3',
  '02397635-915d-4690-8ca4-eeddcaebd914',
  '2225fba6-85de-499b-894a-78f8fd864310',
  '2209931e-d09b-4402-92ff-2c871a942857',
  '1d59ab1c-93f9-4b00-baaf-93b3df77825e'
]

async function main() {
  console.log('\n' + '='.repeat(80))
  console.log('INVESTIGATING WORKOUTS WITH NULL TSS')
  console.log('='.repeat(80))
  console.log(`\nChecking ${WORKOUT_IDS.length} workouts...\n`)

  let normalized = 0
  let failed = 0

  for (const workoutId of WORKOUT_IDS) {
    console.log('-'.repeat(80))

    const workout = await prisma.workout.findUnique({
      where: { id: workoutId },
      include: { streams: true }
    })

    if (!workout) {
      console.log(`❌ Workout ${workoutId} not found`)
      failed++
      continue
    }

    console.log(`Workout: ${workout.title}`)
    console.log(`Date: ${workout.date}`)
    console.log(`Type: ${workout.type}`)
    console.log(`Source: ${workout.source}`)
    console.log(`Duration: ${Math.round(workout.durationSec / 60)} min`)
    console.log(`Current TSS: ${workout.tss ?? 'NULL'}`)
    console.log(`TRIMP: ${workout.trimp ?? 'NULL'}`)
    console.log(`Avg HR: ${workout.averageHr ?? 'NULL'}`)
    console.log(`Max HR: ${workout.maxHr ?? 'NULL'}`)

    // Check for Strava suffer score
    if (workout.rawJson) {
      const raw = workout.rawJson as any
      if (raw.suffer_score) {
        console.log(`Strava Suffer Score: ${raw.suffer_score} ✅`)
      }
    }

    // Check streams
    if (workout.streams) {
      console.log(`Has stream data: ✅`)
      const stream = workout.streams as any
      console.log(`  - HR data: ${stream.heartrate ? '✅' : '❌'}`)
      console.log(`  - Power data: ${stream.watts ? '✅' : '❌'}`)
    } else {
      console.log(`Has stream data: ❌`)
    }

    // Get user profile
    const user = await prisma.user.findUnique({
      where: { id: workout.userId },
      select: { ftp: true, maxHr: true, restingHr: true }
    })

    console.log(`User Profile:`)
    console.log(`  - FTP: ${user?.ftp ?? 'NULL'} ${user?.ftp ? '✅' : '❌'}`)
    console.log(`  - Max HR: ${user?.maxHr ?? 'NULL'} ${user?.maxHr ? '✅' : '❌'}`)
    console.log(`  - Resting HR: ${user?.restingHr ?? 'NULL'} ${user?.restingHr ? '✅' : '❌'}`)

    // Try to normalize
    console.log(`\nAttempting TSS normalization...`)
    try {
      const result = await normalizeTSS(workoutId, workout.userId)

      if (result.tss !== null) {
        console.log(`✅ SUCCESS: TSS = ${result.tss}`)
        console.log(`   Source: ${result.source}`)
        console.log(`   Method: ${result.method}`)
        console.log(`   Confidence: ${result.confidence}`)

        // Update CTL/ATL
        await calculateWorkoutStress(workoutId, workout.userId)
        console.log(`   CTL/ATL updated`)

        normalized++
      } else {
        console.log(`❌ FAILED: ${result.method}`)
        failed++
      }
    } catch (error) {
      console.log(`❌ ERROR: ${error}`)
      failed++
    }

    console.log()
  }

  console.log('='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))
  console.log(`Total: ${WORKOUT_IDS.length}`)
  console.log(`Normalized: ${normalized} ✅`)
  console.log(`Failed: ${failed} ❌`)
  console.log()

  if (normalized > 0) {
    console.log(`✓ Successfully normalized ${normalized} workouts`)
  }

  if (failed > 0) {
    console.log(`⚠ ${failed} workouts could not be normalized`)
    console.log(`  Possible reasons:`)
    console.log(`  - No power or heart rate data available`)
    console.log(`  - User profile incomplete (missing FTP, Max HR, Resting HR)`)
    console.log(`  - Very short duration (< 5 minutes)`)
    console.log(`  - No effort data recorded`)
  }

  console.log()
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
