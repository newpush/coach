import { prisma } from '../server/utils/db'
import {
  calculateLapSplits,
  calculatePaceVariability,
  calculateAveragePace,
  analyzePacingStrategy,
  detectSurges
} from '../server/utils/pacing'

async function backfillFitPacing() {
  console.log('Starting FIT file pacing backfill...')

  // Find all workouts sourced from FIT files that have streams
  const workouts = await prisma.workout.findMany({
    where: {
      source: 'fit_file',
      streams: {
        isNot: null
      }
    },
    include: {
      streams: true
    }
  })

  console.log(`Found ${workouts.length} FIT file workouts.`)

  let updatedCount = 0

  for (const workout of workouts) {
    if (!workout.streams) continue

    const streams = workout.streams

    // Check if pacing metrics are already present (simple check on lapSplits)
    // Note: We might want to force update if we're not sure, but let's check first.
    // If the issue is that they are NULL, this check is valid.
    if (streams.lapSplits && streams.paceVariability && streams.avgPacePerKm) {
      // Already calculated
      // Uncomment the next line if you want to force recalculation
      // console.log(`Skipping workout ${workout.id}, metrics already present.`);
      // continue;
    }

    console.log(`Processing workout ${workout.id} (${workout.title})...`)

    const timeData = (streams.time as number[]) || []
    const distanceData = (streams.distance as number[]) || []
    const velocityData = (streams.velocity as number[]) || []

    let lapSplits = null
    let paceVariability = null
    let avgPacePerKm = null
    let pacingStrategy = null
    let surges = null

    if (timeData.length > 0 && distanceData.length > 0) {
      // Calculate lap splits (1km intervals)
      lapSplits = calculateLapSplits(timeData, distanceData, 1000)

      // Calculate pace variability
      if (velocityData.length > 0) {
        paceVariability = calculatePaceVariability(velocityData)

        // Calculate average pace
        avgPacePerKm = calculateAveragePace(
          timeData[timeData.length - 1],
          distanceData[distanceData.length - 1]
        )
      }

      // Analyze pacing strategy
      if (lapSplits && lapSplits.length >= 2) {
        pacingStrategy = analyzePacingStrategy(lapSplits)
      }

      // Detect surges
      if (velocityData.length > 20 && timeData.length > 20) {
        surges = detectSurges(velocityData, timeData)
      }
    }

    // Update the stream
    await prisma.workoutStream.update({
      where: { id: streams.id },
      data: {
        lapSplits: lapSplits as any,
        paceVariability,
        avgPacePerKm,
        pacingStrategy: pacingStrategy as any,
        surges: surges as any
      }
    })

    updatedCount++
    console.log(`Updated metrics for workout ${workout.id}`)
  }

  console.log(`Backfill complete. Updated ${updatedCount} workouts.`)
}

backfillFitPacing()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
