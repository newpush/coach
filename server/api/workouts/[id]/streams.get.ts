import { requireAuth } from '../../../utils/auth-guard'
import { workoutStreamRepository } from '../../../utils/repositories/workoutStreamRepository'
import { analyzePacingStrategy } from '../../../utils/pacing'
import {
  getZoneIndex,
  DEFAULT_HR_ZONES,
  DEFAULT_POWER_ZONES
} from '../../../utils/training-metrics'
import { sportSettingsRepository } from '../../../utils/repositories/sportSettingsRepository'
import { detectIntervals, resolveHrWorkThreshold } from '../../../utils/interval-detection'
import { detectClimbs } from '../../../utils/climb-detection'
import { formatPromptPace } from '../../../utils/ai-prompt-format'
import {
  buildWorkoutAnalysisFactsV2,
  type WorkoutAnalysisFactsV2
} from '../../../utils/workout-analysis-facts'

defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Get workout stream details',
    description: 'Returns detailed stream data (pacing, HR, power) for a specific workout.',
    inputSchema: [
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
                hrZoneTimes: { type: 'array', items: { type: 'number' } },
                powerZoneTimes: { type: 'array', items: { type: 'number' } },
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
  try {
    const authUser = await requireAuth(event, ['workout:read'])

    const workoutId = getRouterParam(event, 'id')

    if (!workoutId) {
      throw createError({
        statusCode: 400,
        message: 'Workout ID is required'
      })
    }

    // Verify workout belongs to user
    const workout = await prisma.workout.findFirst({
      where: {
        id: workoutId,
        userId: authUser.id
      },
      include: {
        // The pacing verdict is gated on the same v2 analysis facts the AI prompt
        // uses (CW-436), so the facts builder needs the plan and athlete profile
        // fields alongside the stream.
        plannedWorkout: true,
        user: {
          select: {
            ftp: true,
            maxHr: true,
            lthr: true,
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

    const user = workout.user

    const workoutStream = await workoutStreamRepository.findByWorkoutId(workoutId)

    // CW-436: the pacing card and the AI analysis must agree about whether this
    // session's pacing was gradeable at all, so both are gated on the same v2
    // analysis facts, built with the same builder the workout detail endpoint uses.
    //
    // Built lazily and memoised: the builder runs its own interval detection over
    // the full streams, so a request that has no splits to grade must not pay for
    // it. A failure here must never take the pacing card down -- returning
    // undefined leaves the verdict applicable, i.e. the pre-CW-436 behaviour.
    let analysisFactsV2Resolved = false
    let analysisFactsV2: WorkoutAnalysisFactsV2 | undefined
    const resolveAnalysisFactsV2 = async (): Promise<WorkoutAnalysisFactsV2 | undefined> => {
      if (analysisFactsV2Resolved) return analysisFactsV2
      analysisFactsV2Resolved = true
      try {
        analysisFactsV2 = buildWorkoutAnalysisFactsV2({
          workout: { ...workout, streams: workoutStream } as any,
          sportSettings: await sportSettingsRepository.getForActivityType(
            workout.userId,
            workout.type || ''
          ),
          plannedWorkout: (workout as any).plannedWorkout,
          userProfile: user || undefined
        })
      } catch (factsError) {
        console.error('[API] streams.get: failed to build analysis facts v2:', factsError)
      }
      return analysisFactsV2
    }

    if (workoutStream) {
      // ON-THE-FLY ZONE CALCULATION (Backfill)
      let zonesUpdated = false
      const updates: any = {}
      const isValidHeartRate = (value: unknown): value is number =>
        typeof value === 'number' && Number.isFinite(value) && value > 0
      const getSampledIndices = (sourceLength: number, targetPoints: number) => {
        if (sourceLength <= targetPoints) return Array.from({ length: sourceLength }, (_, i) => i)

        const step = sourceLength / targetPoints
        return Array.from({ length: targetPoints }, (_, i) => Math.floor(i * step))
      }
      const buildDownsamplingDebug = (stream: Record<string, any>, targetPoints: number) => {
        const originalLengths = {
          time: Array.isArray(stream.time) ? stream.time.length : null,
          heartrate: Array.isArray(stream.heartrate) ? stream.heartrate.length : null,
          latlng: Array.isArray(stream.latlng) ? stream.latlng.length : null
        }
        const sampledIndices =
          typeof originalLengths.time === 'number'
            ? getSampledIndices(originalLengths.time, targetPoints)
            : []

        return {
          targetPoints,
          originalLengths,
          sampledIndexPreview: {
            first: sampledIndices.slice(0, 8),
            middle: sampledIndices.slice(
              Math.max(0, Math.floor(sampledIndices.length / 2) - 4),
              Math.floor(sampledIndices.length / 2) + 4
            ),
            last: sampledIndices.slice(-8)
          }
        }
      }

      // Check if HR zones are missing but we have HR data
      if (
        (!workoutStream.hrZoneTimes ||
          (Array.isArray(workoutStream.hrZoneTimes) && workoutStream.hrZoneTimes.length === 0)) &&
        workoutStream.heartrate &&
        Array.isArray(workoutStream.heartrate) &&
        workoutStream.heartrate.length > 0
      ) {
        // Get settings for activity type
        const settings = await sportSettingsRepository.getForActivityType(
          workout.userId,
          workout.type || ''
        )
        const hrZones = (settings?.hrZones as any[]) || DEFAULT_HR_ZONES

        if (hrZones.length > 0) {
          const hrZoneTimes = new Array(hrZones.length).fill(0)
          ;(workoutStream.heartrate as number[]).forEach((hr) => {
            if (isValidHeartRate(hr)) {
              const index = getZoneIndex(hr, hrZones)
              if (index >= 0) hrZoneTimes[index]++
            }
          })
          workoutStream.hrZoneTimes = hrZoneTimes
          updates.hrZoneTimes = hrZoneTimes
          zonesUpdated = true
        }
      }

      // Check if Power zones are missing but we have Power data
      if (
        (!workoutStream.powerZoneTimes ||
          (Array.isArray(workoutStream.powerZoneTimes) &&
            workoutStream.powerZoneTimes.length === 0)) &&
        workoutStream.watts &&
        Array.isArray(workoutStream.watts) &&
        workoutStream.watts.length > 0
      ) {
        const settings = await sportSettingsRepository.getForActivityType(
          workout.userId,
          workout.type || ''
        )
        const powerZones = (settings?.powerZones as any[]) || DEFAULT_POWER_ZONES

        if (powerZones.length > 0) {
          const powerZoneTimes = new Array(powerZones.length).fill(0)
          ;(workoutStream.watts as number[]).forEach((watts) => {
            if (watts !== null && watts !== undefined) {
              const index = getZoneIndex(watts, powerZones)
              if (index >= 0) powerZoneTimes[index]++
            }
          })
          workoutStream.powerZoneTimes = powerZoneTimes
          updates.powerZoneTimes = powerZoneTimes
          zonesUpdated = true
        }
      }

      // Add zones to response for frontend mapping
      const settings = await sportSettingsRepository.getForActivityType(
        workout.userId,
        workout.type || ''
      )

      // Use JSON parse/stringify to get a clean plain object without Prisma internal state (COACH-WATTS-14)
      const processedStream: any = JSON.parse(JSON.stringify(workoutStream))

      processedStream.hrZones = (settings?.hrZones as any[]) || DEFAULT_HR_ZONES
      processedStream.powerZones = (settings?.powerZones as any[]) || DEFAULT_POWER_ZONES

      // Athlete-level HR references for interval detection, sourced from the PROFILE (the
      // sport settings loaded above, then the user record) exactly as
      // `/api/workouts/[id]/intervals` does. They feed two distinct things: the work BAR
      // (via `resolveHrWorkThreshold`, which prefers 0.82 * LTHR over 0.7 * max HR) and the
      // zone reference handed to `detectIntervals` as `hrRefs` so HR intervals carry an
      // `intensity_zone` (CW-400). Never scale these here - `resolveHrWorkThreshold` is the
      // single place that scaling happens (CW-383/CW-418).
      const hrRefs = {
        lthr: settings?.lthr ?? user.lthr,
        maxHr: settings?.maxHr ?? user.maxHr
      }
      const hrWorkThreshold = resolveHrWorkThreshold({
        ...hrRefs,
        sessionMaxHr: workout.maxHr
      })

      if (Array.isArray(workoutStream.heartrate) && processedStream.hrZones.length > 0) {
        const recalculatedHrZoneTimes = new Array(processedStream.hrZones.length).fill(0)

        ;(workoutStream.heartrate as number[]).forEach((hr) => {
          if (!isValidHeartRate(hr)) return

          const index = getZoneIndex(hr, processedStream.hrZones)
          if (index >= 0) recalculatedHrZoneTimes[index]++
        })

        processedStream.hrZoneTimes = recalculatedHrZoneTimes

        if (
          JSON.stringify(workoutStream.hrZoneTimes || []) !==
          JSON.stringify(recalculatedHrZoneTimes)
        ) {
          updates.hrZoneTimes = recalculatedHrZoneTimes
          zonesUpdated = true
        }
      }

      // Persist calculated zones if needed
      if (zonesUpdated) {
        // Run update in background to not block response
        workoutStreamRepository
          .updateMetadata(workout.id, updates)
          .catch((e) => console.error('Failed to backfill zones:', e))
      }

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
        const strategy = analyzePacingStrategy(
          workoutStream.lapSplits,
          await resolveAnalysisFactsV2()
        )

        // Downsample high-frequency streams to reduce payload size (Fixes COACH-WATTS-B)
        const TARGET_POINTS = 2000
        // Already defined processedStream above, just enrich it
        processedStream.pacingStrategy = strategy as any

        // Only downsample if time stream is long enough
        if (
          workoutStream.time &&
          Array.isArray(workoutStream.time) &&
          workoutStream.time.length > TARGET_POINTS
        ) {
          const step = workoutStream.time.length / TARGET_POINTS

          // Downsample all array fields dynamically
          Object.keys(processedStream).forEach((key) => {
            const streamData = (processedStream as any)[key]
            if (
              Array.isArray(streamData) &&
              ![
                'pacingStrategy',
                'lapSplits',
                'surges',
                'hrZones',
                'powerZones',
                'hrZoneTimes',
                'powerZoneTimes'
              ].includes(key)
            ) {
              const sampled: any[] = []
              for (let i = 0; i < TARGET_POINTS; i++) {
                const index = Math.floor(i * step)
                if (index < streamData.length) {
                  sampled.push(streamData[index])
                } else {
                  sampled.push(null)
                }
              }
              ;(processedStream as any)[key] = sampled
            }
          })

          processedStream._debugDownsampling = buildDownsamplingDebug(
            workoutStream as Record<string, any>,
            TARGET_POINTS
          )
        }

        // Enrich with detected segments
        const time = (workoutStream.time as number[]) || []
        const watts = (workoutStream.watts as number[]) || []
        const heartrate = (workoutStream.heartrate as number[]) || []
        const velocity = (workoutStream.velocity as number[]) || []
        const cadence = (workoutStream.cadence as number[]) || []
        const altitude = (workoutStream.altitude as number[]) || []
        const distance = (workoutStream.distance as number[]) || []

        if (time.length > 0) {
          // Detect Intervals
          if (watts.length === time.length) {
            ;(processedStream as any).detectedIntervals = detectIntervals(
              time,
              watts,
              'power',
              user.ftp || undefined,
              undefined,
              undefined,
              cadence
            )
          } else if (
            velocity.length === time.length &&
            (workout.type === 'Run' || workout.type === 'Swim')
          ) {
            ;(processedStream as any).detectedIntervals = detectIntervals(
              time,
              velocity,
              'pace',
              undefined,
              undefined,
              undefined,
              cadence
            )
          } else if (heartrate.length === time.length) {
            ;(processedStream as any).detectedIntervals = detectIntervals(
              time,
              heartrate,
              'heartrate',
              hrWorkThreshold,
              undefined,
              undefined,
              cadence,
              // Zone reference, kept separate from the work bar above (CW-400).
              hrRefs
            )
          }

          // Detect Climbs
          if (altitude.length === time.length && distance.length === time.length) {
            ;(processedStream as any).detectedClimbs = detectClimbs(time, altitude, distance)
          }
        }

        return processedStream
      }

      // Default downsampling if no lapSplits logic triggered
      const TARGET_POINTS = 2000
      if (
        workoutStream.time &&
        Array.isArray(workoutStream.time) &&
        workoutStream.time.length > TARGET_POINTS
      ) {
        const step = workoutStream.time.length / TARGET_POINTS

        // Downsample all array fields dynamically
        Object.keys(processedStream).forEach((key) => {
          const streamData = (processedStream as any)[key]
          if (
            Array.isArray(streamData) &&
            ![
              'pacingStrategy',
              'lapSplits',
              'surges',
              'detectedIntervals',
              'detectedClimbs',
              'hrZones',
              'powerZones',
              'hrZoneTimes',
              'powerZoneTimes'
            ].includes(key)
          ) {
            const sampled: any[] = []
            for (let i = 0; i < TARGET_POINTS; i++) {
              const index = Math.floor(i * step)
              if (index < streamData.length) {
                sampled.push(streamData[index])
              } else {
                sampled.push(null)
              }
            }
            ;(processedStream as any)[key] = sampled
          }
        })

        processedStream._debugDownsampling = buildDownsamplingDebug(
          workoutStream as Record<string, any>,
          TARGET_POINTS
        )

        const time = (workoutStream.time as number[]) || []
        const watts = (workoutStream.watts as number[]) || []
        const heartrate = (workoutStream.heartrate as number[]) || []
        const velocity = (workoutStream.velocity as number[]) || []
        const cadence = (workoutStream.cadence as number[]) || []
        const altitude = (workoutStream.altitude as number[]) || []
        const distance = (workoutStream.distance as number[]) || []

        if (time.length > 0) {
          if (watts.length === time.length) {
            ;(processedStream as any).detectedIntervals = detectIntervals(
              time,
              watts,
              'power',
              user.ftp || undefined,
              undefined,
              undefined,
              cadence
            )
          } else if (heartrate.length === time.length) {
            ;(processedStream as any).detectedIntervals = detectIntervals(
              time,
              heartrate,
              'heartrate',
              hrWorkThreshold,
              undefined,
              undefined,
              cadence,
              // Zone reference, kept separate from the work bar above (CW-400).
              hrRefs
            )
          }

          if (altitude.length === time.length && distance.length === time.length) {
            ;(processedStream as any).detectedClimbs = detectClimbs(time, altitude, distance)
          }
        }

        return processedStream
      }

      return processedStream
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

          // Format pace respecting the athlete's distance unit preference
          const paceFormatted = formatPromptPace(paceSeconds, user.distanceUnits)

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

        // Use shared utility for consistent pacing analysis
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
  } catch (error: any) {
    console.error(`[API] Error in streams.get:`, error)
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Internal Server Error'
    })
  }
})
