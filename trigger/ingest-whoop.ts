import './init'
import { logger, task } from '@trigger.dev/sdk/v3'
import { userIngestionQueue } from './queues'
import {
  fetchWhoopRecovery,
  fetchWhoopSleep,
  fetchWhoopWorkouts,
  normalizeWhoopRecovery,
  normalizeWhoopWorkout,
  extractWhoopHrZones
} from '../server/utils/whoop'
import { prisma } from '../server/utils/db'
import { workoutRepository } from '../server/utils/repositories/workoutRepository'
import { wellnessRepository } from '../server/utils/repositories/wellnessRepository'
import { normalizeTSS } from '../server/utils/normalize-tss'
import { calculateWorkoutStress } from '../server/utils/calculate-workout-stress'
import type { IngestionResult } from './types'

export const ingestWhoopTask = task({
  id: 'ingest-whoop',
  queue: userIngestionQueue,
  maxDuration: 900, // 15 minutes
  run: async (payload: {
    userId: string
    startDate: string
    endDate: string
  }): Promise<IngestionResult> => {
    const { userId, startDate, endDate } = payload

    logger.log('[Whoop Ingest] Starting ingestion', {
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
          provider: 'whoop'
        }
      }
    })

    if (!integration) {
      throw new Error('Whoop integration not found for user')
    }

    // Update sync status
    await prisma.integration.update({
      where: { id: integration.id },
      data: { syncStatus: 'SYNCING' }
    })

    try {
      // Fetch recovery data
      // 1. Fetch Recovery Data (Wellness)
      const recoveryData = await fetchWhoopRecovery(
        integration,
        new Date(startDate),
        new Date(endDate)
      )

      logger.log(`[Whoop Ingest] Fetched ${recoveryData.length} recovery records`)

      // Re-fetch integration to get any updated tokens from the recovery fetch
      // We need to use the LATEST token for subsequent requests
      let updatedIntegration = await prisma.integration.findUnique({
        where: { id: integration.id }
      })

      if (!updatedIntegration) {
        throw new Error('Integration not found after recovery fetch')
      }

      // Upsert wellness data
      let upsertedCount = 0
      let skippedCount = 0

      for (const recovery of recoveryData) {
        // Fetch corresponding sleep data if available
        let sleepData = null
        if (recovery.sleep_id) {
          sleepData = await fetchWhoopSleep(updatedIntegration, recovery.sleep_id)
        }

        const wellness = normalizeWhoopRecovery(recovery, userId, sleepData)

        // Skip if recovery wasn't scored yet
        if (!wellness) {
          skippedCount++
          continue
        }

        await wellnessRepository.upsert(
          userId,
          wellness.date,
          wellness as any,
          wellness as any,
          'whoop'
        )
        upsertedCount++
      }

      logger.log(
        `[Whoop Ingest] Wellness Complete - Saved: ${upsertedCount}, Skipped: ${skippedCount}`
      )

      // 2. Fetch Workout Data
      // Workout ingestion from Whoop can be toggled via settings
      const WHOOP_WORKOUTS_ENABLED = updatedIntegration.ingestWorkouts

      let workoutUpsertCount = 0

      if (WHOOP_WORKOUTS_ENABLED) {
        // Refresh integration again just in case (though unlikely to expire in seconds)
        updatedIntegration = await prisma.integration.findUnique({ where: { id: integration.id } })
        if (!updatedIntegration) throw new Error('Integration lost')

        const workouts = await fetchWhoopWorkouts(
          updatedIntegration,
          new Date(startDate),
          new Date(endDate)
        )

        logger.log(`[Whoop Ingest] Fetched ${workouts.length} workout records`)

        for (const whoopWorkout of workouts) {
          const normalizedWorkout = normalizeWhoopWorkout(whoopWorkout, userId)

          if (!normalizedWorkout) {
            continue // Skip unscored workouts
          }

          // Check if a Strava workout exists around the same time (duplicates)
          // Similar to Strava logic: Match by date (5 min buffer) and type?
          // Actually, for now, we just want to ingest them. The deduplication logic
          // usually runs separately or we can rely on manual merging later.
          // But to avoid obvious clutter, let's check for exact duplicates from Whoop source.

          const upsertedWorkout = await workoutRepository.upsert(
            userId,
            'whoop',
            normalizedWorkout.externalId,
            normalizedWorkout as any,
            normalizedWorkout as any
          )
          workoutUpsertCount++

          // Capture HR Zones if available
          const hrZoneTimes = extractWhoopHrZones(whoopWorkout)
          if (hrZoneTimes) {
            await prisma.workoutStream.upsert({
              where: { workoutId: upsertedWorkout.record.id },
              create: {
                workoutId: upsertedWorkout.record.id,
                hrZoneTimes
              },
              update: {
                hrZoneTimes
              }
            })
            logger.log('[Whoop Ingest] Captured HR zones', {
              workoutId: upsertedWorkout.record.id,
              hrZoneTimes
            })
          }

          // Normalize TSS for the workout
          try {
            const tssResult = await normalizeTSS(upsertedWorkout.record.id, userId)
            logger.log('[Whoop Ingest] TSS normalization complete', {
              workoutId: upsertedWorkout.record.id,
              tss: tssResult.tss,
              source: tssResult.source
            })

            // Update CTL/ATL if TSS was set
            if (tssResult.tss !== null) {
              await calculateWorkoutStress(upsertedWorkout.record.id, userId)
            }
          } catch (error) {
            logger.error('[Whoop Ingest] Failed to normalize TSS', {
              workoutId: upsertedWorkout.record.id,
              error
            })
            // Don't fail ingestion if TSS normalization fails
          }
        }

        logger.log(`[Whoop Ingest] Workouts Complete - Upserted: ${workoutUpsertCount}`)
      } else {
        logger.log(`[Whoop Ingest] Workouts Disabled - Skipping workout ingestion`)
      }

      // Update sync status
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          syncStatus: 'SUCCESS',
          lastSyncAt: new Date(),
          errorMessage: null
        }
      })

      return {
        success: true,
        counts: {
          wellness: upsertedCount,
          workouts: workoutUpsertCount
        },
        skipped: skippedCount,
        userId,
        startDate,
        endDate
      }
    } catch (error) {
      logger.error('[Whoop Ingest] Error ingesting data', { error })

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
