import './init'
import { logger, task } from '@trigger.dev/sdk/v3'
import { userIngestionQueue } from './queues'
import {
  fetchWithingsMeasures,
  fetchWithingsActivities,
  fetchWithingsSleep,
  fetchWithingsWorkouts,
  fetchWithingsIntraday,
  normalizeWithingsMeasureGroup,
  normalizeWithingsActivity,
  normalizeWithingsSleep,
  normalizeWithingsWorkout,
  WITHINGS_MEASURE_TYPES
} from '../server/utils/withings'
import { prisma } from '../server/utils/db'
import { wellnessRepository } from '../server/utils/repositories/wellnessRepository'
import { workoutRepository } from '../server/utils/repositories/workoutRepository'
import { getUserTimezone, getStartOfDayUTC } from '../server/utils/date'
import { normalizeTSS } from '../server/utils/normalize-tss'
import { calculateWorkoutStress } from '../server/utils/calculate-workout-stress'
import { roundToTwoDecimals } from '../server/utils/number'
import { triggerReadinessCheckIfNeeded } from '../server/utils/services/wellness-analysis'
import { athleteMetricsService } from '../server/utils/athleteMetricsService'
import type { IngestionResult } from './types'

export const ingestWithingsTask = task({
  id: 'ingest-withings',
  queue: userIngestionQueue,
  maxDuration: 900, // 15 minutes
  run: async (payload: {
    userId: string
    startDate: string
    endDate: string
  }): Promise<IngestionResult> => {
    const { userId, startDate, endDate } = payload

    logger.log('[Withings Ingest] Starting ingestion', {
      userId,
      startDate,
      endDate,
      daysToSync: Math.ceil(
        (new Date(endDate).getTime() - new Date(startDate).getTime()) / (24 * 60 * 60 * 1000)
      )
    })

    // Fetch integration
    const integration = await prisma.integration.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: 'withings'
        }
      }
    })

    if (!integration) {
      throw new Error('Withings integration not found for user')
    }

    // Update sync status
    await prisma.integration.update({
      where: { id: integration.id },
      data: { syncStatus: 'SYNCING' }
    })

    const timezone = await getUserTimezone(userId)

    try {
      // 1. Fetch Measure Groups (Wellness)
      // Include Weight (1), Fat Ratio (6), Muscle Mass (76), Hydration (77), Bone Mass (88)
      const measureTypes = [
        WITHINGS_MEASURE_TYPES.WEIGHT,
        WITHINGS_MEASURE_TYPES.FAT_RATIO,
        WITHINGS_MEASURE_TYPES.MUSCLE_MASS,
        WITHINGS_MEASURE_TYPES.HYDRATION,
        WITHINGS_MEASURE_TYPES.BONE_MASS
      ]

      const measureGroups = await fetchWithingsMeasures(
        integration,
        new Date(startDate),
        new Date(endDate),
        measureTypes
      )

      logger.log(`[Withings Ingest] Fetched ${measureGroups.length} measure groups`)

      // Upsert wellness data (Measures)
      let upsertedCount = 0
      let skippedCount = 0

      for (const group of measureGroups) {
        const wellness = normalizeWithingsMeasureGroup(group, userId)

        if (!wellness) {
          skippedCount++
          continue
        }

        const cleanWellness: any = {}
        Object.entries(wellness).forEach(([key, value]) => {
          if (value !== null && value !== undefined) {
            cleanWellness[key] = value
          }
        })

        if (cleanWellness.weight) {
          cleanWellness.weight = roundToTwoDecimals(cleanWellness.weight)
        }

        // Ensure userId and date are present
        cleanWellness.userId = userId
        cleanWellness.date = wellness.date

        // Fetch existing for rawJson merging
        const existingWellness = await prisma.wellness.findUnique({
          where: {
            userId_date: {
              userId,
              date: wellness.date
            }
          }
        })

        if (existingWellness && existingWellness.rawJson) {
          const existingRaw = existingWellness.rawJson as any
          cleanWellness.rawJson = {
            ...existingRaw,
            ...cleanWellness.rawJson
          }
        }

        await wellnessRepository.upsert(
          userId,
          wellness.date,
          cleanWellness as any,
          cleanWellness as any,
          'withings'
        )
        upsertedCount++

        // Also update the User profile weight if this is the most recent measurement
        const isRecent = new Date().getTime() - wellness.date.getTime() < 7 * 24 * 60 * 60 * 1000 // within 7 days
        if (isRecent && cleanWellness.weight) {
          await athleteMetricsService.updateMetrics(userId, {
            weight: cleanWellness.weight,
            date: wellness.date
          })
        }
      }

      // 2. Fetch Sleep (Wellness)
      let sleepUpsertCount = 0
      try {
        const sleepSummaries = await fetchWithingsSleep(
          integration,
          new Date(startDate),
          new Date(endDate),
          timezone
        )

        logger.log(`[Withings Ingest] Fetched ${sleepSummaries.length} sleep summaries`)

        for (const summary of sleepSummaries) {
          const wellness = normalizeWithingsSleep(summary, userId)

          if (!wellness) {
            continue
          }

          const cleanWellness: any = {}
          Object.entries(wellness).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
              cleanWellness[key] = value
            }
          })

          // Ensure userId and date are present
          cleanWellness.userId = userId
          cleanWellness.date = wellness.date

          // Fetch existing for rawJson merging
          const existingWellness = await prisma.wellness.findUnique({
            where: {
              userId_date: {
                userId,
                date: wellness.date
              }
            }
          })

          if (existingWellness && existingWellness.rawJson) {
            const existingRaw = existingWellness.rawJson as any
            cleanWellness.rawJson = {
              ...existingRaw,
              ...cleanWellness.rawJson
            }
          }

          // If restingHr is present in sleep data, it might override measure data, or vice versa.
          // We'll trust sleep resting HR if measure resting HR is not present.
          // If we already have resting HR from measures (e.g. smart scale standing heart rate), we might want to keep that or prefer sleep.
          // Generally, sleeping HR is "true" resting HR.

          await wellnessRepository.upsert(
            userId,
            wellness.date,
            cleanWellness as any,
            cleanWellness as any,
            'withings'
          )
          sleepUpsertCount++
        }
      } catch (error) {
        logger.error('[Withings Ingest] Error fetching sleep', { error })
      }

      // 3. Fetch Workouts
      let workoutUpsertCount = 0

      // Check if integration has activity scope before trying to fetch
      // But we requested both scopes in auth, so unless user unchecked it, we should have it.
      // We'll proceed and catch errors if scope is missing (API will return error).

      try {
        // Re-fetch integration to get any updated tokens
        const updatedIntegration = await prisma.integration.findUnique({
          where: { id: integration.id }
        })
        if (!updatedIntegration) throw new Error('Integration lost')

        const workouts = await fetchWithingsWorkouts(
          updatedIntegration,
          new Date(startDate),
          new Date(endDate),
          timezone
        )

        logger.log(`[Withings Ingest] Fetched ${workouts.length} workouts`)

        for (const wWorkout of workouts) {
          const normalizedWorkout = normalizeWithingsWorkout(wWorkout, userId)

          if (!normalizedWorkout) {
            continue
          }

          // Try to fetch HR stream for this workout
          try {
            // Buffer start/end by a few minutes to ensure we capture all data
            const streamStart = new Date(normalizedWorkout.date.getTime() - 5 * 60000)
            const streamEnd = new Date(
              normalizedWorkout.date.getTime() + normalizedWorkout.durationSec * 1000 + 5 * 60000
            )

            // Check if duration is within reasonable limits (e.g. < 24h)
            if (normalizedWorkout.durationSec < 24 * 3600) {
              const intradayData = await fetchWithingsIntraday(
                updatedIntegration,
                streamStart,
                streamEnd
              )

              // Process intraday data if we have any
              const timestamps = Object.keys(intradayData).sort()
              if (timestamps.length > 0) {
                // Create streams
                const hrStream: number[] = []
                const timeStream: number[] = []

                // We need to map timestamps to seconds from start
                // Intraday timestamps are unix seconds
                const startTime = normalizedWorkout.date.getTime() / 1000

                for (const tsStr of timestamps) {
                  const ts = parseInt(tsStr)
                  const point = intradayData[tsStr]

                  // Only include points within the workout window (with small buffer)
                  if (
                    ts >= startTime - 60 &&
                    ts <= startTime + normalizedWorkout.durationSec + 60
                  ) {
                    const offset = ts - startTime

                    if (point.heart_rate) {
                      hrStream.push(point.heart_rate)
                      timeStream.push(offset)
                    }
                  }
                }

                if (hrStream.length > 0) {
                  // @ts-expect-error - streams property added dynamically
                  normalizedWorkout.streams = {
                    time: timeStream,
                    heartrate: hrStream
                  }

                  logger.log(
                    `[Withings Ingest] Added HR stream with ${hrStream.length} points for workout ${wWorkout.id}`
                  )
                }
              }
            }
          } catch (e) {
            logger.warn(
              `[Withings Ingest] Failed to fetch intraday data for workout ${wWorkout.id}`,
              { error: e }
            )
          }

          // Check if workout already exists to merge rawJson if needed
          // We can't rely on upsert alone if we want to merge deep JSON properties
          // But for now, we assume fresh data from API is always better/more complete than what we have.
          // The upsert will overwrite top-level fields and replace rawJson.
          // This is desired behavior when re-syncing to get stream data.

          logger.log(`[Withings Ingest] Upserting workout ${normalizedWorkout.externalId}`, {
            hasStreams: !!(normalizedWorkout as any).streams,
            streamPoints: (normalizedWorkout as any).streams?.heartrate?.length || 0
          })

          const upsertedWorkout = await workoutRepository.upsert(
            userId,
            'withings',
            normalizedWorkout.externalId,
            normalizedWorkout as any,
            normalizedWorkout as any
          )
          workoutUpsertCount++

          // Normalize TSS (if HR data available, we might estimate)
          try {
            const tssResult = await normalizeTSS(upsertedWorkout.record.id, userId)

            // Update CTL/ATL if TSS was set
            if (tssResult.tss !== null) {
              await calculateWorkoutStress(upsertedWorkout.record.id, userId)
            }
          } catch (error) {
            logger.error('[Withings Ingest] Failed to normalize TSS', {
              workoutId: upsertedWorkout.record.id,
              error
            })
          }
        }
      } catch (error) {
        logger.error('[Withings Ingest] Error fetching workouts', { error })
        // Don't fail the whole task if workouts fail but measures succeeded
      }

      logger.log(
        `[Withings Ingest] Complete - Wellness Saved: ${upsertedCount}, Sleep Saved: ${sleepUpsertCount}, Workouts Saved: ${workoutUpsertCount}`
      )

      // Update sync status
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          syncStatus: 'SUCCESS',
          lastSyncAt: new Date(),
          errorMessage: null
        }
      })

      // Trigger auto-analysis/recommendation if needed
      await triggerReadinessCheckIfNeeded(userId)

      return {
        success: true,
        counts: {
          wellness: upsertedCount,
          sleep: sleepUpsertCount,
          workouts: workoutUpsertCount
        },
        skipped: skippedCount,
        userId,
        startDate,
        endDate
      }
    } catch (error) {
      logger.error('[Withings Ingest] Error ingesting data', { error })

      // Update error status
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          syncStatus: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        }
      })

      throw error
    }
  }
})
