/**
 * Check detailed workout stream data from database
 * Usage: npx tsx scripts/check-workout-stream-data.ts [workout-id]
 */

import { config } from 'dotenv'
config()

async function checkStreamData() {
  const workoutId = process.argv[2]

  if (!workoutId) {
    console.error('❌ Please provide a workout ID')
    console.log('Usage: npx tsx scripts/check-workout-stream-data.ts [workout-id]')
    process.exit(1)
  }

  console.log(`🔍 Checking stream data for workout: ${workoutId}\n`)

  const { prisma } = await import('../server/utils/db')

  try {
    const workout = await prisma.workout.findUnique({
      where: { id: workoutId },
      include: {
        streams: true
      }
    })

    if (!workout) {
      console.error('❌ Workout not found')
      process.exit(1)
    }

    console.log('📊 Workout Info:')
    console.log(`   Title: ${workout.title}`)
    console.log(`   Type: ${workout.type}`)
    console.log(`   Date: ${workout.date.toLocaleDateString()}`)
    console.log(`   Source: ${workout.source}`)

    if (!workout.streams) {
      console.log('\n❌ No stream data found')
      process.exit(0)
    }

    const stream = workout.streams

    console.log('\n📈 Stream Data Analysis:')
    console.log('─'.repeat(60))

    // Check each stream type
    const streamFields = [
      { name: 'time', field: stream.time },
      { name: 'distance', field: stream.distance },
      { name: 'velocity', field: stream.velocity },
      { name: 'heartrate', field: stream.heartrate },
      { name: 'cadence', field: stream.cadence },
      { name: 'watts', field: stream.watts },
      { name: 'altitude', field: stream.altitude },
      { name: 'latlng', field: stream.latlng },
      { name: 'grade', field: stream.grade },
      { name: 'moving', field: stream.moving }
    ]

    let hasAnyData = false

    for (const { name, field } of streamFields) {
      if (field && Array.isArray(field)) {
        console.log(`✅ ${name.padEnd(12)}: ${field.length} points`)
        hasAnyData = true

        // Show sample for heartrate
        if (name === 'heartrate' && field.length > 0) {
          const sample = field.slice(0, 10)
          console.log(`   Sample: [${sample.join(', ')}]`)
        }
      } else if (field !== null && field !== undefined) {
        console.log(`⚠️  ${name.padEnd(12)}: exists but not an array (${typeof field})`)
        console.log(`   Value: ${JSON.stringify(field).substring(0, 100)}`)
      } else {
        console.log(`❌ ${name.padEnd(12)}: null/undefined`)
      }
    }

    if (!hasAnyData) {
      console.log('\n⚠️  WARNING: Stream record exists but no arrays found!')
    }

    console.log('\n📊 Calculated Metrics:')
    console.log('─'.repeat(60))

    const metrics = [
      { name: 'avgPacePerKm', value: stream.avgPacePerKm },
      { name: 'paceVariability', value: stream.paceVariability },
      { name: 'lapSplits', value: stream.lapSplits },
      { name: 'pacingStrategy', value: stream.pacingStrategy },
      { name: 'surges', value: stream.surges }
    ]

    for (const { name, value } of metrics) {
      if (value !== null && value !== undefined) {
        if (Array.isArray(value)) {
          console.log(`✅ ${name.padEnd(20)}: ${value.length} items`)
        } else if (typeof value === 'object') {
          console.log(`✅ ${name.padEnd(20)}: ${JSON.stringify(value).substring(0, 80)}...`)
        } else {
          console.log(`✅ ${name.padEnd(20)}: ${value}`)
        }
      } else {
        console.log(`❌ ${name.padEnd(20)}: null/undefined`)
      }
    }

    console.log('\n🔍 Data Type Check:')
    console.log('─'.repeat(60))

    // Check if heartrate is actually an array with numbers
    if (stream.heartrate) {
      const hr = stream.heartrate as any
      console.log(`HR field type: ${typeof hr}`)
      console.log(`HR is Array: ${Array.isArray(hr)}`)
      if (Array.isArray(hr) && hr.length > 0) {
        console.log(`HR[0] type: ${typeof hr[0]}`)
        console.log(`HR[0] value: ${hr[0]}`)
      }
    }

    console.log('\n✅ Stream record found')
    console.log(`   ID: ${stream.id}`)
    console.log(`   Created: ${stream.createdAt.toISOString()}`)
    console.log(`   Updated: ${stream.updatedAt.toISOString()}`)
  } catch (error: any) {
    console.error('\n❌ Error:', error.message)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

checkStreamData()
