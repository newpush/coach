import { defineEventHandler, createError, getRouterParam } from 'h3'
import { prisma } from '../../../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['Public'],
    summary: 'Get public workout streams',
    description: 'Returns stream data for a publicly shared workout.',
    parameters: [
      {
        name: 'token',
        in: 'path',
        required: true,
        schema: { type: 'string' }
      }
    ],
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                workoutId: { type: 'string' },
                time: { type: 'array' },
                watts: { type: 'array' },
                heartrate: { type: 'array' },
                cadence: { type: 'array' }
              }
            }
          }
        }
      },
      404: { description: 'Workout not found or link invalid' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) {
    throw createError({
      statusCode: 400,
      message: 'Share token is required'
    })
  }

  // Find the share token
  const shareToken = await prisma.shareToken.findUnique({
    where: { token }
  })

  if (!shareToken || shareToken.resourceType !== 'WORKOUT') {
    throw createError({
      statusCode: 404,
      message: 'Workout not found or link is invalid'
    })
  }

  // Check for expiration
  if (shareToken.expiresAt && new Date() > new Date(shareToken.expiresAt)) {
    throw createError({
      statusCode: 404,
      message: 'Share link has expired'
    })
  }

  // Get workout with streams by ID
  const workout = await (prisma as any).workout.findUnique({
    where: {
      id: shareToken.resourceId
    },
    include: {
      streams: true
    }
  })

  if (!workout) {
    throw createError({
      statusCode: 404,
      message: 'Workout not found'
    })
  }

  // Check if we have detailed WorkoutStream data
  const workoutStream = await prisma.workoutStream
    .findUnique({
      where: {
        workoutId: workout.id
      }
    })
    .catch(() => null) // Ignore errors if table doesn't exist yet

  if (workoutStream) {
    // Return actual time-series stream data
    return workoutStream
  }

  // Fallback: Extract pacing data from rawJson splits (for backwards compatibility)
  if (workout.rawJson && typeof workout.rawJson === 'object') {
    const rawData = workout.rawJson as any
    const splits = rawData.splits_metric || rawData.splits_standard

    if (splits && Array.isArray(splits) && splits.length > 0) {
      // Transform Strava splits into component-expected format
      const lapSplits = splits.map((split: any, index: number) => {
        const time = split.moving_time || split.elapsed_time
        const paceMinPerKm = split.distance > 0 ? time / 60 / (split.distance / 1000) : 0
        const paceSeconds = split.distance > 0 ? time / (split.distance / 1000) : 0

        // Format pace as "M:SS/km"
        const paceMin = Math.floor(paceMinPerKm)
        const paceSec = Math.round((paceMinPerKm - paceMin) * 60)
        const paceFormatted = `${paceMin}:${paceSec.toString().padStart(2, '0')}/km`

        return {
          lap: index + 1,
          distance: split.distance,
          time: time,
          pace: paceFormatted,
          paceSeconds: paceSeconds,
          averageHeartRate: split.average_heartrate,
          averageSpeed: split.average_speed
        }
      })

      // Calculate basic metrics from splits
      const totalDistance = splits.reduce((sum: number, s: any) => sum + s.distance, 0)
      const totalTime = splits.reduce(
        (sum: number, s: any) => sum + (s.moving_time || s.elapsed_time),
        0
      )
      const avgPaceMinPerKm = totalTime / 60 / (totalDistance / 1000)

      const paceSeconds = lapSplits.map((s: any) => s.paceSeconds).filter((p: number) => p > 0)
      const avgPaceSecondsValue =
        paceSeconds.reduce((sum: number, p: number) => sum + p, 0) / paceSeconds.length
      const paceVariability =
        paceSeconds.length > 1
          ? Math.sqrt(
              paceSeconds.reduce(
                (sum: number, p: number) => sum + Math.pow(p - avgPaceSecondsValue, 2),
                0
              ) / paceSeconds.length
            )
          : 0

      // Calculate first/second half for pacing strategy
      const halfwayIndex = Math.floor(lapSplits.length / 2)
      const firstHalf = lapSplits.slice(0, halfwayIndex)
      const secondHalf = lapSplits.slice(halfwayIndex)

      const firstHalfPace =
        firstHalf.reduce((sum: number, s: any) => sum + s.paceSeconds, 0) / firstHalf.length
      const secondHalfPace =
        secondHalf.reduce((sum: number, s: any) => sum + s.paceSeconds, 0) / secondHalf.length
      const paceDifference = secondHalfPace - firstHalfPace

      let strategy = 'even'
      let description = 'Consistent pacing throughout'
      if (paceDifference > 10) {
        strategy = 'positive_split'
        description = 'Slowed down in second half'
      } else if (paceDifference < -10) {
        strategy = 'negative_split'
        description = 'Sped up in second half'
      }

      const evenness = Math.max(
        0,
        Math.min(100, 100 - (Math.abs(paceDifference) / avgPaceSecondsValue) * 100)
      )

      return {
        workoutId: workout.id,
        dataSource: 'splits_fallback',
        lapSplits,
        avgPacePerKm: avgPaceMinPerKm,
        paceVariability: paceVariability,
        pacingStrategy: {
          strategy,
          description,
          firstHalfPace: firstHalfPace,
          secondHalfPace: secondHalfPace,
          paceDifference: paceDifference,
          evenness: Math.round(evenness)
        },
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }
  }

  // No pacing data available at all
  throw createError({
    statusCode: 404,
    message:
      'Pacing data not available for this workout. Stream data may not have been ingested yet.'
  })
})
