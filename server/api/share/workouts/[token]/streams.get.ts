import { defineEventHandler, createError, getRouterParam } from 'h3'
import { prisma } from '../../../../utils/db'
import { workoutStreamRepository } from '../../../../utils/repositories/workoutStreamRepository'
import { sportSettingsRepository } from '../../../../utils/repositories/sportSettingsRepository'
import { formatPromptPace } from '../../../../utils/ai-prompt-format'
import { analyzePacingStrategy } from '../../../../utils/pacing'
import {
  buildWorkoutAnalysisFactsV2,
  type WorkoutAnalysisFactsV2
} from '../../../../utils/workout-analysis-facts'

defineRouteMeta({
  openAPI: {
    tags: ['Public'],
    summary: 'Get public workout streams',
    description: 'Returns stream data for a publicly shared workout.',
    inputSchema: [
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

  // Get workout with streams by ID.
  //
  // `plannedWorkout` and the owner profile fields are DETECTION INPUTS ONLY: they feed the
  // v2 analysis facts builder below and are never returned. The response body is built from
  // the stream record (or, in the fallback, from hand-picked split fields), so nothing on
  // `workout` -- including `user` and `userId` -- reaches the shared payload (CW-418/CW-441).
  const workout = await (prisma as any).workout.findUnique({
    where: {
      id: shareToken.resourceId
    },
    include: {
      plannedWorkout: true,
      user: {
        select: {
          distanceUnits: true,
          weight: true,
          weightUnits: true,
          language: true
        }
      }
    }
  })

  if (!workout) {
    throw createError({
      statusCode: 404,
      message: 'Workout not found'
    })
  }

  const workoutStream = await workoutStreamRepository.findByWorkoutId(workout.id)

  // CW-441: the shared view must agree with the owner's pacing card (CW-436) and with the AI
  // analysis (CW-389) about whether this session's pacing was gradeable at all. The persisted
  // `pacingStrategy` was computed at ingestion with no facts available, so it carries an
  // ungraded verdict; the verdict is therefore recomputed here, on the same shared gate.
  //
  // This endpoint is authenticated by share token and has no session user, so the sport
  // settings the builder needs are resolved from the workout OWNER via `workout.userId` --
  // never from whoever is viewing the link (the CW-418 precedent in the sibling
  // intervals.get.ts). Those settings stay server-side; see the note on the query above.
  //
  // Built lazily and memoised, mirroring the owner endpoint: the builder runs its own
  // interval detection over the full streams, so a request with no splits to grade must not
  // pay for it, and it runs at most once per request. A failure here must never take the
  // pacing card down -- returning undefined leaves the verdict applicable, i.e. the
  // pre-CW-441 behaviour.
  let analysisFactsV2Resolved = false
  let analysisFactsV2: WorkoutAnalysisFactsV2 | undefined
  const resolveAnalysisFactsV2 = async (): Promise<WorkoutAnalysisFactsV2 | undefined> => {
    if (analysisFactsV2Resolved) return analysisFactsV2
    analysisFactsV2Resolved = true
    try {
      const ownerId = workout.userId || workout.user?.id
      analysisFactsV2 = buildWorkoutAnalysisFactsV2({
        workout: { ...workout, streams: workoutStream } as any,
        sportSettings: ownerId
          ? await sportSettingsRepository.getForActivityType(ownerId, workout.type || '')
          : null,
        plannedWorkout: workout.plannedWorkout,
        userProfile: workout.user || undefined
      })
    } catch (factsError) {
      console.error('[API] share streams.get: failed to build analysis facts v2:', factsError)
    }
    return analysisFactsV2
  }

  if (workoutStream) {
    // Return actual time-series stream data, with the split-strategy verdict re-graded on the
    // shared gate. Only `pacingStrategy` is replaced: the split rows and the raw dispersion
    // measurement (`lapSplits`, `paceVariability`, `avgPacePerKm`) are untouched, because it
    // is the grading that is withheld, not the data.
    if (workoutStream.lapSplits && Array.isArray(workoutStream.lapSplits)) {
      return {
        ...workoutStream,
        pacingStrategy: analyzePacingStrategy(
          workoutStream.lapSplits,
          await resolveAnalysisFactsV2()
        ) as any
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
        const paceSeconds = split.distance > 0 ? time / (split.distance / 1000) : 0

        // Format pace respecting the workout owner's distance unit preference
        const paceFormatted = formatPromptPace(paceSeconds, workout.user?.distanceUnits)

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

      // Use the shared utility, exactly as the owner's endpoint does for this same fallback.
      // It applies `resolveSplitPacingVerdictApplicability` internally, so the owner view and
      // the shared view reach the same verdict decision for the same workout instead of
      // drifting apart through a second, hand-rolled copy of the thresholds (CW-441).
      const pacingStrategy = analyzePacingStrategy(lapSplits, await resolveAnalysisFactsV2())

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
    message:
      'Pacing data not available for this workout. Stream data may not have been ingested yet.'
  })
})
