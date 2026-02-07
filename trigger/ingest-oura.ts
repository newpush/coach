import './init'
import { logger, task } from '@trigger.dev/sdk/v3'
import { userIngestionQueue } from './queues'
import {
  fetchOuraDailySleep,
  fetchOuraSleepPeriods,
  fetchOuraDailyActivity,
  fetchOuraDailyReadiness,
  fetchOuraWorkouts,
  normalizeOuraWellness,
  normalizeOuraWorkout
} from '../server/utils/oura'
import { prisma } from '../server/utils/db'
import { workoutRepository } from '../server/utils/repositories/workoutRepository'
import { wellnessRepository } from '../server/utils/repositories/wellnessRepository'
import { normalizeTSS } from '../server/utils/normalize-tss'
import { calculateWorkoutStress } from '../server/utils/calculate-workout-stress'
import type { IngestionResult } from './types'

export const ingestOuraTask = task({
  id: 'ingest-oura',
  queue: userIngestionQueue,
  maxDuration: 900, // 15 minutes
  run: async (payload: {
    userId: string
    startDate: string
    endDate: string
  }): Promise<IngestionResult> => {
    const { userId, startDate, endDate } = payload

    logger.log('[Oura Ingest] Starting ingestion', {
      userId,
      startDate,
      endDate
    })

    // Fetch integration
    const integration = await prisma.integration.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: 'oura'
        }
      }
    })

    if (!integration) {
      throw new Error('Oura integration not found for user')
    }

    // Update sync status
    await prisma.integration.update({
      where: { id: integration.id },
      data: { syncStatus: 'SYNCING' }
    })

    try {
      const start = new Date(startDate)
      const end = new Date(endDate)

      // 1. Fetch Wellness Data (Sleep, Activity, Readiness)
      // We need to fetch all 3 to construct a complete Wellness record
      const [sleepData, sleepPeriodsData, activityData, readinessData] = await Promise.all([
        fetchOuraDailySleep(integration, start, end),
        fetchOuraSleepPeriods(integration, start, end),
        fetchOuraDailyActivity(integration, start, end),
        fetchOuraDailyReadiness(integration, start, end)
      ])

      logger.log(
        `[Oura Ingest] Fetched records: DailySleep=${sleepData.length}, SleepPeriods=${sleepPeriodsData.length}, Activity=${activityData.length}, Readiness=${readinessData.length}`
      )

      // Group by date to normalize
      // Oura dates are YYYY-MM-DD. We'll map them.
      const dates = new Set<string>()
      const sleepMap = new Map<string, any>()
      const sleepPeriodsMap = new Map<string, any[]>()
      const activityMap = new Map<string, any>()
      const readinessMap = new Map<string, any>()

      sleepData.forEach((d: any) => {
        dates.add(d.day)
        sleepMap.set(d.day, d)
      })
      sleepPeriodsData.forEach((d: any) => {
        dates.add(d.day)
        const list = sleepPeriodsMap.get(d.day) || []
        list.push(d)
        sleepPeriodsMap.set(d.day, list)
      })
      activityData.forEach((d: any) => {
        dates.add(d.day)
        activityMap.set(d.day, d)
      })
      readinessData.forEach((d: any) => {
        dates.add(d.day)
        readinessMap.set(d.day, d)
      })

      let wellnessUpsertCount = 0
      let wellnessSkippedCount = 0

      for (const dateStr of dates) {
        const sleep = sleepMap.get(dateStr)
        const sleepPeriods = sleepPeriodsMap.get(dateStr) || []
        const activity = activityMap.get(dateStr)
        const readiness = readinessMap.get(dateStr)

        const date = new Date(dateStr) // This creates a date at UTC midnight if ISO string is YYYY-MM-DD (usually)
        // Ensure strictly UTC midnight
        const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))

        const wellness = normalizeOuraWellness(
          sleep,
          activity,
          readiness,
          sleepPeriods,
          userId,
          utcDate
        )

        if (!wellness) {
          wellnessSkippedCount++
          continue
        }

        await wellnessRepository.upsert(
          userId,
          wellness.date,
          wellness as any,
          wellness as any,
          'oura'
        )
        wellnessUpsertCount++
      }

      logger.log(
        `[Oura Ingest] Wellness Complete - Saved: ${wellnessUpsertCount}, Skipped: ${wellnessSkippedCount}`
      )

      // 2. Fetch Workouts
      const OURA_WORKOUTS_ENABLED = integration.ingestWorkouts // Default true if boolean

      let workoutUpsertCount = 0

      if (OURA_WORKOUTS_ENABLED) {
        const workouts = await fetchOuraWorkouts(integration, start, end)
        logger.log(`[Oura Ingest] Fetched ${workouts.length} workout records`)

        for (const workout of workouts) {
          const normalized = normalizeOuraWorkout(workout, userId)

          if (!normalized) continue

          const upserted = await workoutRepository.upsert(
            userId,
            'oura',
            normalized.externalId,
            normalized as any,
            normalized as any
          )
          workoutUpsertCount++

          // TSS Normalization
          try {
            const tssResult = await normalizeTSS(upserted.record.id, userId)
            if (tssResult.tss !== null) {
              await calculateWorkoutStress(upserted.record.id, userId)
            }
          } catch (error) {
            logger.error('[Oura Ingest] Failed to normalize TSS', {
              workoutId: upserted.record.id,
              error
            })
          }
        }
        logger.log(`[Oura Ingest] Workouts Complete - Upserted: ${workoutUpsertCount}`)
      } else {
        logger.log('[Oura Ingest] Workouts Disabled - Skipping')
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
          wellness: wellnessUpsertCount,
          workouts: workoutUpsertCount
        },
        skipped: wellnessSkippedCount,
        userId,
        startDate,
        endDate
      }
    } catch (error) {
      logger.error('[Oura Ingest] Error ingesting data', { error })
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
