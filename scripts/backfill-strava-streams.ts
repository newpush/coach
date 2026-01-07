/**
 * Backfill HR stream data for existing Strava workouts
 * Usage: npx tsx scripts/backfill-strava-streams.ts
 */

import { config } from 'dotenv'
config()

async function backfillStreams() {
  const { prisma } = await import('../server/utils/db')
  const { tasks } = await import('@trigger.dev/sdk/v3')

  console.log('🔍 Finding Strava workouts missing stream data...\n')

  // Find all Strava workouts with no streams
  const workouts = await prisma.workout.findMany({
    where: {
      source: 'strava',
      streams: null
    },
    orderBy: {
      date: 'desc'
    },
    select: {
      id: true,
      userId: true,
      externalId: true,
      title: true,
      type: true,
      date: true,
      averageHr: true,
      averageWatts: true
    }
  })

  if (workouts.length === 0) {
    console.log('✅ All workouts already have stream data!')
    return
  }

  console.log(`Found ${workouts.length} workouts missing streams:\n`)

  workouts.forEach((w, i) => {
    console.log(`${i + 1}. ${w.title} (${w.date.toLocaleDateString()})`)
    console.log(
      `   Type: ${w.type}${w.averageHr ? `, HR: ${w.averageHr}` : ''}${w.averageWatts ? `, Power: ${w.averageWatts}` : ''}`
    )
  })

  console.log(`\n🚀 Triggering stream ingestion for ${workouts.length} workouts...\n`)

  for (const workout of workouts) {
    const activityId = parseInt(workout.externalId)

    if (isNaN(activityId)) {
      console.log(`⚠️  Skipping ${workout.title} - invalid Strava ID`)
      continue
    }

    console.log(`   Triggering: ${workout.title}`)

    await tasks.trigger('ingest-strava-streams', {
      userId: workout.userId,
      workoutId: workout.id,
      activityId
    })

    // Small delay to avoid overwhelming the system
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  console.log('\n✅ All stream ingestion jobs triggered!')
  console.log('Check trigger.dev dashboard to monitor progress')

  await prisma.$disconnect()
}

backfillStreams().catch(console.error)
