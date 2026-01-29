import { prisma } from '../db'
import {
  fetchWhoopWorkout,
  fetchWhoopRecoveryBySleepId,
  fetchWhoopSleep,
  normalizeWhoopWorkout,
  normalizeWhoopRecovery
} from '../whoop'
import { workoutRepository } from '../repositories/workoutRepository'
import { wellnessRepository } from '../repositories/wellnessRepository'
import { getUserTimezone, getStartOfDayUTC } from '../date'
import { triggerReadinessCheckIfNeeded } from './wellness-analysis'

export const WhoopService = {
  /**
   * Sync a specific workout by ID
   */
  async syncWorkout(userId: string, workoutId: string) {
    const integration = await prisma.integration.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: 'whoop'
        }
      }
    })

    if (!integration) {
      throw new Error(`Whoop integration not found for user ${userId}`)
    }

    const workout = await fetchWhoopWorkout(integration, workoutId)
    if (!workout) {
      console.warn(`[WhoopService] Workout ${workoutId} not found`)
      return
    }

    const normalizedWorkout = normalizeWhoopWorkout(workout, userId)
    if (!normalizedWorkout) {
      // Might be unscored or invalid
      console.log(`[WhoopService] Workout ${workoutId} skipped (unscored/invalid)`)
      return
    }

    await workoutRepository.upsert(
      userId,
      'whoop',
      normalizedWorkout.externalId,
      normalizedWorkout as any,
      normalizedWorkout as any
    )
    console.log(`[WhoopService] Upserted workout ${workoutId}`)
  },

  /**
   * Delete a specific workout
   */
  async deleteWorkout(userId: string, workoutId: string) {
    await prisma.workout.deleteMany({
      where: {
        userId,
        source: 'whoop',
        externalId: workoutId
      }
    })
    console.log(`[WhoopService] Deleted workout ${workoutId}`)
  },

  /**
   * Sync recovery (and sleep) data based on Sleep ID
   * (Whoop V2 webhooks use Sleep ID for recovery events)
   */
  async syncRecovery(userId: string, sleepId: string) {
    const integration = await prisma.integration.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: 'whoop'
        }
      }
    })

    if (!integration) {
      throw new Error(`Whoop integration not found for user ${userId}`)
    }

    // 1. Fetch Recovery (using Sleep ID to find it)
    const recovery = await fetchWhoopRecoveryBySleepId(integration, sleepId)
    if (!recovery) {
      console.warn(`[WhoopService] No recovery found for sleep ${sleepId}`)
      // It might be a nap or unprocessed sleep.
      // If it is just a sleep update without recovery, we might strictly speak
      // be interested in sleep metrics, but our Wellness model is keyed by Date
      // and usually implies recovery. If we just have sleep, we could partly update
      // but normalizeWhoopRecovery expects a recovery object.
      return
    }

    // 2. Fetch Sleep (to get full sleep details)
    const sleep = await fetchWhoopSleep(integration, sleepId)

    // 3. Normalize
    const normalizedWellness = normalizeWhoopRecovery(recovery, userId, sleep)
    if (!normalizedWellness) {
      console.log(`[WhoopService] Wellness skipped for sleep ${sleepId} (unscored?)`)
      return
    }

    // 4. Upsert
    // normalizeWhoopRecovery returns 'date' which is the recovery date (UTC midnight)
    await wellnessRepository.upsert(
      userId,
      normalizedWellness.date,
      normalizedWellness as any,
      normalizedWellness as any
    )
    console.log(
      `[WhoopService] Upserted wellness for date ${normalizedWellness.date.toISOString()}`
    )
  },

  /**
   * Process a single webhook event.
   */
  async processWebhookEvent(userId: string, type: string, payload: any) {
    const { id: resourceId } = payload // V2 uses 'id' (UUID)

    if (!resourceId) {
      return { handled: false, message: 'Missing resource ID in payload' }
    }

    switch (type) {
      case 'workout.updated':
        await WhoopService.syncWorkout(userId, resourceId)
        break

      case 'workout.deleted':
        await WhoopService.deleteWorkout(userId, resourceId)
        break

      case 'recovery.updated':
      case 'sleep.updated':
        // Both update the wellness record.
        // For recovery.updated, ID is Sleep UUID (V2).
        // For sleep.updated, ID is Sleep UUID.
        await WhoopService.syncRecovery(userId, resourceId)
        // Trigger auto-analysis/recommendation if needed
        await triggerReadinessCheckIfNeeded(userId)
        break

      case 'recovery.deleted':
      case 'sleep.deleted':
        // TODO: Handle deletion of wellness data?
        // It's tricky because Wellness row might contain other manual data.
        // For now, we log it.
        console.log(
          `[WhoopService] Deletion event ${type} for ${resourceId} - not fully implemented`
        )
        break

      default:
        console.log(`[WhoopService] Unhandled webhook event type: ${type}`)
        return { handled: false, message: `Unhandled event type: ${type}` }
    }

    return { handled: true, message: `Processed ${type}` }
  }
}
