import 'dotenv/config'
import { prisma } from '../server/utils/db'
import { logger } from '@trigger.dev/sdk/v3'

// Mock logger to print to console
const mockLogger = {
  log: (msg: string, meta?: any) =>
    console.log(`[LOG] ${msg}`, meta ? JSON.stringify(meta, null, 2) : ''),
  error: (msg: string, meta?: any) =>
    console.error(`[ERROR] ${msg}`, meta ? JSON.stringify(meta, null, 2) : '')
}

// Copying logic from trigger/deduplicate-workouts.ts for simulation
function calculateCompletenessScore(workout: any): number {
  let score = 0
  const log: string[] = []

  // Prefer manual input or specific sources if reliable
  // But generally trust device data more for metrics
  if (workout.source === 'intervals') {
    score += 15 // Increased trust for Intervals.icu as it often aggregates well
    log.push('Source intervals (+15)')
  } else if (workout.source === 'strava') {
    score += 10
    log.push('Source strava (+10)')
  } else if (workout.source === 'withings') {
    score += 5
    log.push('Source withings (+5)')
  }

  const isCycling =
    workout.type?.toLowerCase().includes('ride') || workout.type?.toLowerCase().includes('bike')
  const isGym =
    workout.type?.toLowerCase().includes('gym') ||
    workout.type?.toLowerCase().includes('strength') ||
    workout.type?.toLowerCase().includes('weight')
  const isSwim = workout.type?.toLowerCase().includes('swim')

  if (isCycling) {
    if (workout.averageWatts && workout.averageWatts > 0) {
      score += 40 // Power is king for cycling
      log.push('Avg Watts (+40)')
      if (workout.source === 'intervals') {
        score += 10
        log.push('Intervals Watts Bonus (+10)')
      }
    }
    if (workout.normalizedPower && workout.normalizedPower > 0) {
      score += 10
      log.push('NP (+10)')
    }
    if (workout.tss && workout.tss > 0) {
      score += 10
      log.push('TSS (+10)')
    }
  }

  if (isGym && workout.source === 'strava') {
    score += 20
    log.push('Gym Strava (+20)')
  }

  // HR Data is valuable for all types
  if (workout.averageHr && workout.averageHr > 0) {
    score += 20
    log.push('Avg HR (+20)')
  }
  if (workout.maxHr && workout.maxHr > 0) {
    score += 5
    log.push('Max HR (+5)')
  }

  if (workout.distance && workout.distance > 0) {
    score += 5
    log.push('Distance (+5)')
  }

  if (workout.elevationGain && workout.elevationGain > 0) {
    score += 5
    log.push('Elevation (+5)')
  }

  // High value for having streams (time-series data)
  if (workout.streams && workout.streams.length > 0) {
    // check length for local object or if it's an object in DB
    // In the real code it checks existence. Here we check existence/length.
    score += 50
    log.push('Streams (+50)')
  }

  if (workout.trainingLoad && workout.trainingLoad > 0) {
    score += 10
    log.push('Training Load (+10)')
  }
  if (workout.intensity && workout.intensity > 0) {
    score += 5
    log.push('Intensity (+5)')
  }

  if (workout.calories && workout.calories > 0) {
    score += 3
    log.push('Calories (+3)')
  }

  if (workout.averageSpeed && workout.averageSpeed > 0) {
    score += 3
    log.push('Avg Speed (+3)')
  }
  if (workout.maxSpeed && workout.maxSpeed > 0) {
    score += 2
    log.push('Max Speed (+2)')
  }
  if (workout.averageCadence && workout.averageCadence > 0) {
    score += 5
    log.push('Avg Cadence (+5)')
  }

  // Description might contain user notes
  if (workout.description && workout.description.length > 5) {
    score += 5
    log.push('Description (+5)')
  }

  console.log(`Scoring for ${workout.id} (${workout.source}): ${score}`)
  console.log(`Breakdown: ${log.join(', ')}`)

  return score
}

function areDuplicates(w1: any, w2: any): boolean {
  console.log('\n--- Duplicate Check ---')
  const timeDiff = Math.abs(new Date(w1.date).getTime() - new Date(w2.date).getTime())

  // Adjusted logic from main file
  let maxTimeDiff = 30 * 60 * 1000

  const diffInHours = timeDiff / (60 * 60 * 1000)
  const diffHoursRemainder = Math.abs(diffInHours - Math.round(diffInHours))

  const isTimezoneShift = diffInHours >= 1 && diffInHours <= 14 && diffHoursRemainder < 5 / 60

  console.log(`Time Diff: ${timeDiff}ms (${(timeDiff / 60000).toFixed(2)} min)`)
  console.log(`Diff in Hours: ${diffInHours.toFixed(4)}`)
  console.log(`Is Timezone Shift Candidate: ${isTimezoneShift}`)

  if (isTimezoneShift) {
    maxTimeDiff = timeDiff + 1000 // Allow it to pass
    console.log('Allowing large time diff due to potential timezone shift')
  }

  if (timeDiff > maxTimeDiff) {
    console.log(`Time diff too large > ${maxTimeDiff}`)
    return false
  }

  const durationDiff = Math.abs(w1.durationSec - w2.durationSec)

  const isPauseHeavy =
    w1.type?.includes('Ski') ||
    w1.type?.includes('Snowboard') ||
    w1.type?.includes('Hike') ||
    w2.type?.includes('Ski') ||
    w2.type?.includes('Snowboard') ||
    w2.type?.includes('Hike')

  let maxDurationDiff = 5 * 60 // Default 5 mins
  const tenPercent = Math.max(w1.durationSec, w2.durationSec) * 0.1
  maxDurationDiff = Math.max(maxDurationDiff, tenPercent)

  if (timeDiff < 10 * 60 * 1000) {
    if (isPauseHeavy) {
      maxDurationDiff = Math.max(60 * 60, Math.max(w1.durationSec, w2.durationSec) * 0.9)
    } else {
      maxDurationDiff = Math.max(30 * 60, Math.max(w1.durationSec, w2.durationSec) * 0.5)
    }
  }

  console.log(`Duration Diff: ${durationDiff}s (Max allowed: ${maxDurationDiff}s)`)
  console.log(`W1 Duration: ${w1.durationSec}, W2 Duration: ${w2.durationSec}`)

  if (durationDiff > maxDurationDiff) {
    console.log('Duration diff too large')
    return false
  }

  const titleSimilar =
    w1.title &&
    w2.title &&
    (w1.title.toLowerCase().includes(w2.title.toLowerCase()) ||
      w2.title.toLowerCase().includes(w1.title.toLowerCase()))

  const typeSimilar =
    w1.type &&
    w2.type &&
    (w1.type.toLowerCase() === w2.type.toLowerCase() ||
      (w1.type.toLowerCase().includes('ride') && w2.type.toLowerCase().includes('ride')) ||
      (w1.type.toLowerCase().includes('run') && w2.type.toLowerCase().includes('run')) ||
      // New mappings
      (w1.type.toLowerCase() === 'gym' && w2.type.toLowerCase().includes('weight')) ||
      (w1.type.toLowerCase().includes('weight') && w2.type.toLowerCase() === 'gym'))

  console.log(`Title Similar: ${titleSimilar} ("${w1.title}" vs "${w2.title}")`)
  console.log(`Type Similar: ${typeSimilar} ("${w1.type}" vs "${w2.type}")`)

  const isDuplicate = titleSimilar || typeSimilar
  console.log(`Is Duplicate: ${isDuplicate}`)

  return isDuplicate
}

async function main() {
  const id1 = '87a51ffb-3a65-4481-a92c-1339b352ad84'
  const id2 = 'd4c11502-aa5b-47a3-a331-ef275612aeee'

  console.log(`Fetching workouts: ${id1}, ${id2}`)

  const workouts = await prisma.workout.findMany({
    where: {
      id: { in: [id1, id2] }
    },
    include: {
      streams: { select: { id: true } }
    }
  })

  if (workouts.length !== 2) {
    console.error(`Found ${workouts.length} workouts. Expected 2.`)
    if (workouts.length > 0) {
      workouts.forEach((w) => console.log(`Found: ${w.id}`))
    }
    return
  }

  const w1 = workouts.find((w) => w.id === id1)
  const w2 = workouts.find((w) => w.id === id2)

  if (!w1 || !w2) return // Typescript check

  console.log(`\nWorkout 1 (${w1.source}): ${w1.date} (ISO: ${w1.date.toISOString()})`)
  console.log(`Workout 2 (${w2.source}): ${w2.date} (ISO: ${w2.date.toISOString()})`)

  // Check if they are duplicates
  const areDupes = areDuplicates(w1, w2)

  if (areDupes) {
    console.log('\n--- Scoring ---')
    const s1 = calculateCompletenessScore(w1)
    const s2 = calculateCompletenessScore(w2)

    let best, loser
    if (s1 >= s2) {
      best = w1
      loser = w2
      console.log(`\nWINNER: ${w1.id} (Score: ${s1})`)
      console.log(`LOSER: ${w2.id} (Score: ${s2})`)
    } else {
      best = w2
      loser = w1
      console.log(`\nWINNER: ${w2.id} (Score: ${s2})`)
      console.log(`LOSER: ${w1.id} (Score: ${s1})`)
    }

    console.log('\n--- Merge Simulation ---')
    const mergeFields = [
      'tss',
      'trainingLoad',
      'intensity',
      'kilojoules',
      'trimp',
      'averageWatts',
      'maxWatts',
      'normalizedPower',
      'weightedAvgWatts',
      'averageHr',
      'maxHr',
      'averageCadence',
      'maxCadence',
      'averageSpeed',
      'maxSpeed',
      'distanceMeters',
      'elevationGain',
      'calories',
      'rpe',
      'feel',
      'description',
      'deviceName'
    ]

    const updates: any = {}
    for (const field of mergeFields) {
      const bestVal = (best as any)[field]
      const loserVal = (loser as any)[field]

      console.log(`Field ${field}: Best=${bestVal}, Loser=${loserVal}`)

      if (bestVal === null || bestVal === undefined || bestVal === 0 || bestVal === '') {
        if (loserVal !== null && loserVal !== undefined && loserVal !== 0 && loserVal !== '') {
          updates[field] = loserVal
          console.log(`  -> Merging ${field}: ${loserVal}`)
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      console.log('Updates to be applied to best workout:', updates)
    } else {
      console.log('No fields to merge.')
    }
  } else {
    console.log('Workouts are NOT duplicates according to current logic.')
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
