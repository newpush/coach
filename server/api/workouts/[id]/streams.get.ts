import { getServerSession } from '#auth'

defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Get workout stream details',
    description: 'Returns detailed stream data (pacing, HR, power) for a specific workout.',
    parameters: [
      {
        name: 'id',
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
                time: { type: 'array', items: { type: 'number' } },
                watts: { type: 'array', items: { type: 'number' } },
                heartrate: { type: 'array', items: { type: 'number' } },
                cadence: { type: 'array', items: { type: 'number' } },
                pacingStrategy: { type: 'object' }
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' },
      403: { description: 'Forbidden' },
      404: { description: 'Workout not found or streams unavailable' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  
  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }
  
  const workoutId = getRouterParam(event, 'id')
  
  if (!workoutId) {
    throw createError({
      statusCode: 400,
      message: 'Workout ID is required'
    })
  }
  
  // Verify workout belongs to user
  const workout = await prisma.workout.findUnique({
    where: {
      id: workoutId
    }
  })
  
  if (!workout) {
    throw createError({
      statusCode: 404,
      message: 'Workout not found'
    })
  }
  
  if (workout.userId !== (session.user as any).id) {
    throw createError({
      statusCode: 403,
      message: 'Forbidden'
    })
  }
  
  // Check if we have detailed WorkoutStream data
  const workoutStream = await prisma.workoutStream.findUnique({
    where: {
      workoutId: workoutId
    }
  }).catch(() => null) // Ignore errors if table doesn't exist yet
  
  if (workoutStream) {
    // If we have pacing zones but no strategy, or if we want to ensure consistency
    // we can re-analyze here, but typically the stream ingestion handles this.
    // However, since we just updated the formula in `analyzePacingStrategy` and that is used
    // during ingestion (presumably), we might want to trigger a re-analysis if it's missing or old.
    
    // For now, let's just return the stream. The user can re-sync or we can run a backfill script
    // if we want to update all existing streams.
    
    // Actually, since the `analyzePacingStrategy` utility is used to *compute* the JSON stored in DB,
    // changing the utility doesn't automatically update the DB.
    // But if the frontend calls this endpoint, it gets the DB record.
    // If we want to see the new score immediately without re-ingesting, we should re-calculate it here on the fly
    // if the necessary data (lapSplits) is present in the stream.
    
    if (workoutStream.lapSplits && Array.isArray(workoutStream.lapSplits)) {
       const strategy = analyzePacingStrategy(workoutStream.lapSplits)
       return {
         ...workoutStream,
         pacingStrategy: strategy
       }
    }

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
        const paceMinPerKm = split.distance > 0
          ? time / 60 / (split.distance / 1000)
          : 0
        const paceSeconds = split.distance > 0
          ? (time / (split.distance / 1000))
          : 0
        
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
      const totalTime = splits.reduce((sum: number, s: any) => sum + (s.moving_time || s.elapsed_time), 0)
      const avgPaceMinPerKm = totalTime / 60 / (totalDistance / 1000)
      
      const paceSeconds = lapSplits.map((s: any) => s.paceSeconds).filter((p: number) => p > 0)
      const avgPaceSecondsValue = paceSeconds.reduce((sum: number, p: number) => sum + p, 0) / paceSeconds.length
      const paceVariability = paceSeconds.length > 1
        ? Math.sqrt(paceSeconds.reduce((sum: number, p: number) => sum + Math.pow(p - avgPaceSecondsValue, 2), 0) / paceSeconds.length)
        : 0
        
      // Use shared utility for consistent pacing analysis
      const pacingStrategy = analyzePacingStrategy(lapSplits)
      
      return {
        workoutId: workout.id,
        dataSource: 'splits_fallback',
        lapSplits,
        avgPacePerKm: avgPaceMinPerKm,
        paceVariability: paceVariability,
        pacingStrategy,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }
  }
  
  // No pacing data available at all
  throw createError({
    statusCode: 404,
    message: 'Pacing data not available for this workout. Stream data may not have been ingested yet.'
  })
})