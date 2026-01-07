import 'dotenv/config'
import { prisma } from '../server/utils/db'

async function main() {
  console.log('\n' + '='.repeat(80))
  console.log('ANALYZING MISSING FIELDS IN WORKOUT DATA')
  console.log('='.repeat(80) + '\n')

  // Get a sample of recent Strava workouts
  const stravaWorkouts = await prisma.workout.findMany({
    where: {
      source: 'strava',
      rawJson: { not: null }
    },
    orderBy: { date: 'desc' },
    take: 10
  })

  console.log(`Analyzing ${stravaWorkouts.length} recent Strava workouts...\n`)

  // Track which fields appear in rawJson
  const fieldCounts = new Map<string, number>()
  const fieldExamples = new Map<string, any>()

  for (const workout of stravaWorkouts) {
    const raw = workout.rawJson as any

    // Check interesting fields that might not be stored
    const fieldsToCheck = [
      'calories',
      'elapsed_time',
      'moving_time',
      'gear_id',
      'gear',
      'splits_metric',
      'splits_standard',
      'laps',
      'best_efforts',
      'segment_efforts',
      'perceived_exertion',
      'device_name',
      'embed_token',
      'photos',
      'achievements',
      'commute',
      'private',
      'flagged'
    ]

    for (const field of fieldsToCheck) {
      if (raw[field] !== undefined && raw[field] !== null) {
        fieldCounts.set(field, (fieldCounts.get(field) || 0) + 1)
        if (!fieldExamples.has(field)) {
          fieldExamples.set(field, raw[field])
        }
      }
    }
  }

  console.log('📊 FIELDS FOUND IN RAW DATA:')
  console.log('-'.repeat(80))

  const sortedFields = Array.from(fieldCounts.entries()).sort((a, b) => b[1] - a[1])

  for (const [field, count] of sortedFields) {
    const percentage = ((count / stravaWorkouts.length) * 100).toFixed(0)
    const example = fieldExamples.get(field)
    const exampleStr =
      typeof example === 'object'
        ? JSON.stringify(example).substring(0, 60) + '...'
        : String(example)

    console.log(`\n${field}:`)
    console.log(`  Present in: ${count}/${stravaWorkouts.length} workouts (${percentage}%)`)
    console.log(`  Example: ${exampleStr}`)
  }

  // Check Intervals.icu workouts too
  console.log('\n\n' + '='.repeat(80))
  console.log('ANALYZING INTERVALS.ICU WORKOUTS')
  console.log('='.repeat(80) + '\n')

  const intervalsWorkouts = await prisma.workout.findMany({
    where: {
      source: 'intervals',
      rawJson: { not: null }
    },
    orderBy: { date: 'desc' },
    take: 10
  })

  console.log(`Analyzing ${intervalsWorkouts.length} recent Intervals.icu workouts...\n`)

  const intervalsFieldCounts = new Map<string, number>()
  const intervalsFieldExamples = new Map<string, any>()

  for (const workout of intervalsWorkouts) {
    const raw = workout.rawJson as any

    const fieldsToCheck = [
      'calories',
      'icu_training_load',
      'training_load',
      'icu_intensity',
      'icu_ftp',
      'pace',
      'avg_speed',
      'gap',
      'work',
      'joules',
      'hrss',
      'variability_index',
      'efficiency_factor',
      'decoupling',
      'polarization_index'
    ]

    for (const field of fieldsToCheck) {
      if (raw[field] !== undefined && raw[field] !== null) {
        intervalsFieldCounts.set(field, (intervalsFieldCounts.get(field) || 0) + 1)
        if (!intervalsFieldExamples.has(field)) {
          intervalsFieldExamples.set(field, raw[field])
        }
      }
    }
  }

  console.log('📊 FIELDS FOUND IN INTERVALS.ICU DATA:')
  console.log('-'.repeat(80))

  const sortedIntervalsFields = Array.from(intervalsFieldCounts.entries()).sort(
    (a, b) => b[1] - a[1]
  )

  for (const [field, count] of sortedIntervalsFields) {
    const percentage = ((count / intervalsWorkouts.length) * 100).toFixed(0)
    const example = intervalsFieldExamples.get(field)
    const exampleStr =
      typeof example === 'object'
        ? JSON.stringify(example).substring(0, 60) + '...'
        : String(example)

    console.log(`\n${field}:`)
    console.log(`  Present in: ${count}/${intervalsWorkouts.length} workouts (${percentage}%)`)
    console.log(`  Example: ${exampleStr}`)
  }

  console.log('\n\n' + '='.repeat(80))
  console.log('RECOMMENDATIONS FOR DEDICATED COLUMNS')
  console.log('='.repeat(80))

  console.log(`
High Priority (Present in >70% of workouts):
  - calories: Track energy expenditure for nutrition correlation
  - elapsed_time: Total elapsed time (vs moving_time which we store as duration)
  - device_name: Device tracking for data quality insights
  - gear_id/gear: Equipment tracking (important for cyclists)
  
Medium Priority (Present in 30-70% of workouts):
  - perceived_exertion: Subjective difficulty (Strava's version of RPE)
  - commute: Filter commute workouts
  - laps: Lap/interval data (could be useful for structured workouts)
  
Low Priority (Present in <30% of workouts):
  - segment_efforts: Strava segments (complex data)
  - best_efforts: PR tracking
  - photos: Social features
  
Already Stored:
  ✅ moving_time → durationSec
  ✅ distance → distanceMeters
  ✅ average_heartrate → averageHr
  ✅ average_watts → averageWatts
  ✅ suffer_score → trimp
  `)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
