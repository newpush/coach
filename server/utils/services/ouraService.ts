import { prisma } from '../db'
import {
  fetchOuraDailySleep,
  fetchOuraSleepPeriods,
  fetchOuraDailyActivity,
  fetchOuraDailyReadiness,
  fetchOuraWorkouts,
  normalizeOuraWellness,
  normalizeOuraWorkout
} from '../oura'
import { workoutRepository } from '../repositories/workoutRepository'
import { wellnessRepository } from '../repositories/wellnessRepository'
import { normalizeTSS } from '../normalize-tss'
import { calculateWorkoutStress } from '../calculate-workout-stress'
import { triggerReadinessCheckIfNeeded } from './wellness-analysis'

export const OuraService = {
  /**
   * Sync Oura data for a date range (usually for a specific day when webhook fires)
   * Since Oura daily endpoints are date-based, we sync the whole day.
   */
  async syncDay(userId: string, date: Date) {
    const integration = await prisma.integration.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: 'oura'
        }
      }
    })

    if (!integration) {
      throw new Error(`Oura integration not found for user ${userId}`)
    }

    // We fetch a single day. Oura start/end are inclusive.
    // Ensure date is valid.
    const start = new Date(date)
    const end = new Date(date) // Same day

    // 1. Fetch Wellness (Sleep, Activity, Readiness)
    const [sleepData, sleepPeriodsData, activityData, readinessData] = await Promise.all([
      fetchOuraDailySleep(integration, start, end),
      fetchOuraSleepPeriods(integration, start, end),
      fetchOuraDailyActivity(integration, start, end),
      fetchOuraDailyReadiness(integration, start, end)
    ])

    // Assume the first record matches the day (since we requested 1 day range)
    const sleep = sleepData[0]
    const sleepPeriods = sleepPeriodsData // All periods for that day
    const activity = activityData[0]
    const readiness = readinessData[0]

    if (sleep || activity || readiness || sleepPeriods.length > 0) {
      // Normalize
      // Use the requested date as the canonical date (UTC midnight)
      const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
      const wellness = normalizeOuraWellness(
        sleep,
        activity,
        readiness,
        sleepPeriods,
        userId,
        utcDate
      )

      if (wellness) {
        await wellnessRepository.upsert(userId, wellness.date, wellness as any, wellness as any)
        console.log(`[OuraService] Upserted wellness for ${date.toISOString()}`)
      }
    }

    // 2. Fetch Workouts for that day
    if (integration.ingestWorkouts) {
      const workouts = await fetchOuraWorkouts(integration, start, end)
      for (const workout of workouts) {
        const normalized = normalizeOuraWorkout(workout, userId)
        if (normalized) {
          const upserted = await workoutRepository.upsert(
            userId,
            'oura',
            normalized.externalId,
            normalized as any,
            normalized as any
          )

          // TSS
          try {
            const tssResult = await normalizeTSS(upserted.id, userId)
            if (tssResult.tss !== null) {
              await calculateWorkoutStress(upserted.id, userId)
            }
          } catch (e) {
            console.error(`[OuraService] TSS failed for workout ${upserted.id}`, e)
          }
        }
      }
    }
  },

  async processWebhookEvent(userId: string, type: string, payload: any) {
    // Oura Webhook Payload Structure:
    // { event_type, data_type, object_id, user_id, event_time }
    // Usually it doesn't give the 'date' of the summary directly in the top level,
    // but maybe we can infer it or we fetch "recent" data.
    // However, for efficiency, knowing the date is better.
    // If 'object_id' is a date string (e.g. '2023-01-01'), that's easy.
    // Oura 'daily_sleep' IDs are usually UUIDs in V2, OR sometimes date strings in V1.
    // The spec V2 says IDs are UUIDs.

    // Strategy: Since we can't easily map UUID -> Date without querying,
    // and we want to ensure we have the latest data for the relevant period.
    // When we receive an update, it's usually for "today" or "yesterday".
    // So we will sync the last 3 days to be safe.

    console.log(`[OuraService] Processing ${type} for user ${userId}`)

    const today = new Date()
    const yesterday = new Date(Date.now() - 86400000)
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000)

    // Sync last 3 days
    await OuraService.syncDay(userId, twoDaysAgo)
    await OuraService.syncDay(userId, yesterday)
    await OuraService.syncDay(userId, today)

    // Trigger auto-analysis/recommendation if needed
    await triggerReadinessCheckIfNeeded(userId)

    return { handled: true, message: 'Synced last 3 days' }
  }
}
