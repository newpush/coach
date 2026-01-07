import 'dotenv/config'
import { prisma } from '../server/utils/db'

async function main() {
  const workoutId = '77db85b6-4506-493c-b365-b094a4752132'

  console.log(`Analyzing workout: ${workoutId}`)

  const workout = await prisma.workout.findUnique({
    where: { id: workoutId }
  })

  if (!workout) {
    console.error('Workout not found')
    return
  }

  console.log(`Workout found: ${workout.title}`)

  // Check for WorkoutStream
  const workoutStream = await prisma.workoutStream
    .findUnique({
      where: { workoutId }
    })
    .catch(() => null)

  if (workoutStream) {
    console.log('WorkoutStream found (using real streams)')
    console.log('Existing Pacing Strategy:', JSON.stringify(workoutStream.pacingStrategy, null, 2))

    // Let's try to recalculate it from velocity stream
    const velocityData = workoutStream.velocity as number[]
    const timeData = workoutStream.time as number[]
    const distanceData = workoutStream.distance as number[]

    if (velocityData && timeData && distanceData) {
      console.log(
        `Stream lengths: Velocity=${velocityData.length}, Time=${timeData.length}, Distance=${distanceData.length}`
      )

      // Import calculation logic from server/utils/pacing.ts
      // Since we can't easily import from utils in this script without module issues, I'll reproduce the logic here

      // 1. Calculate Lap Splits
      const splits = []
      let currentLap = 1
      let lastLapDistance = 0
      let lastLapTime = 0
      const lapDistance = 1000 // 1km

      for (let i = 0; i < distanceData.length; i++) {
        const distance = distanceData[i]
        const time = timeData[i]

        if (distance >= currentLap * lapDistance) {
          const lapTime = time - lastLapTime
          const lapDist = distance - lastLapDistance
          const paceSeconds = (lapTime / lapDist) * 1000 // seconds per 1000m

          splits.push({
            lap: currentLap,
            paceSeconds: Math.round(paceSeconds)
          })

          lastLapDistance = distance
          lastLapTime = time
          currentLap++
        }
      }

      console.log(`Calculated ${splits.length} splits from streams`)

      if (splits.length < 2) {
        console.log('Insufficient splits to calculate strategy')
      } else {
        // 2. Analyze Strategy
        const firstHalfLaps = splits.slice(0, Math.floor(splits.length / 2))
        const secondHalfLaps = splits.slice(Math.floor(splits.length / 2))

        const firstHalfAvgPace =
          firstHalfLaps.reduce((sum, lap) => sum + lap.paceSeconds, 0) / firstHalfLaps.length
        const secondHalfAvgPace =
          secondHalfLaps.reduce((sum, lap) => sum + lap.paceSeconds, 0) / secondHalfLaps.length

        const paceDifference = secondHalfAvgPace - firstHalfAvgPace

        // Calculate coefficient of variation for evenness
        const allPaces = splits.map((lap) => lap.paceSeconds)
        const avgPace = allPaces.reduce((sum, p) => sum + p, 0) / allPaces.length
        const stdDev = Math.sqrt(
          allPaces.reduce((sum, p) => sum + Math.pow(p - avgPace, 2), 0) / allPaces.length
        )
        const coefficientOfVariation = (stdDev / avgPace) * 100
        // Test different multipliers
        const multipliers = [2, 3, 4, 5, 10]
        multipliers.forEach((m) => {
          const score = Math.max(0, 100 - coefficientOfVariation * m)
          console.log(`Multiplier ${m}: Score = ${score}`)
        })

        const evennessScore = Math.max(0, 100 - coefficientOfVariation * 10) // 0-100 scale

        console.log(`First Half Pace: ${firstHalfAvgPace}`)
        console.log(`Second Half Pace: ${secondHalfAvgPace}`)
        console.log(`Pace Difference: ${paceDifference}`)
        console.log(`Avg Pace: ${avgPace}`)
        console.log(`Std Dev: ${stdDev}`)
        console.log(`CV: ${coefficientOfVariation}`)
        console.log(`Evenness Score: ${evennessScore}`)
      }
    } else {
      console.log('Missing velocity/time/distance arrays in stream')
    }
  } else {
    console.log('No WorkoutStream found (using rawJson fallback)')

    if (workout.rawJson && typeof workout.rawJson === 'object') {
      const rawData = workout.rawJson as any
      const splits = rawData.splits_metric || rawData.splits_standard

      console.log(`Found ${splits?.length || 0} splits`)

      if (splits && Array.isArray(splits) && splits.length > 0) {
        // Replicate logic from server/api/workouts/[id]/streams.get.ts

        const lapSplits = splits.map((split: any, index: number) => {
          const time = split.moving_time || split.elapsed_time
          const paceMinPerKm = split.distance > 0 ? time / 60 / (split.distance / 1000) : 0
          const paceSeconds = split.distance > 0 ? time / (split.distance / 1000) : 0

          return {
            lap: index + 1,
            distance: split.distance,
            time: time,
            paceSeconds: paceSeconds
          }
        })

        // Filter valid pace seconds
        const paceSeconds = lapSplits.map((s: any) => s.paceSeconds).filter((p: number) => p > 0)

        // Calculate average
        const avgPaceSecondsValue =
          paceSeconds.reduce((sum: number, p: number) => sum + p, 0) / paceSeconds.length

        console.log(`Average Pace (seconds/km): ${avgPaceSecondsValue}`)

        // Calculate halves
        const halfwayIndex = Math.floor(lapSplits.length / 2)
        const firstHalf = lapSplits.slice(0, halfwayIndex)
        const secondHalf = lapSplits.slice(halfwayIndex)

        const firstHalfPace =
          firstHalf.reduce((sum: number, s: any) => sum + s.paceSeconds, 0) / firstHalf.length
        const secondHalfPace =
          secondHalf.reduce((sum: number, s: any) => sum + s.paceSeconds, 0) / secondHalf.length
        const paceDifference = secondHalfPace - firstHalfPace

        console.log(`First Half Avg Pace: ${firstHalfPace}`)
        console.log(`Second Half Avg Pace: ${secondHalfPace}`)
        console.log(`Pace Difference: ${paceDifference}`)

        // The problematic formula
        const rawScore = 100 - (Math.abs(paceDifference) / avgPaceSecondsValue) * 100
        const evenness = Math.max(0, Math.min(100, rawScore))

        console.log(`Raw Score: ${rawScore}`)
        console.log(`Final Evenness Score: ${evenness}`)

        console.log('--- Splits Detail ---')
        lapSplits.forEach((s: any) => {
          console.log(
            `Lap ${s.lap}: Dist=${s.distance}m, Time=${s.time}s, Pace=${Math.round(s.paceSeconds)}s/km`
          )
        })
      } else {
        console.log('Splits array is empty or invalid')
      }
    } else {
      console.log('No rawJson or invalid format')
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
