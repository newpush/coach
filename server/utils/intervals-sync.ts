import type { Integration } from '@prisma/client'
import { prisma } from './db'
import {
  updateIntervalsPlannedWorkout,
  createIntervalsPlannedWorkout,
  deleteIntervalsPlannedWorkout,
  isIntervalsEventId
} from './intervals'

/**
 * Sync a planned workout to Intervals.icu with retry logic
 * Returns success status and any error messages
 */
export async function syncPlannedWorkoutToIntervals(
  operation: 'CREATE' | 'UPDATE' | 'DELETE',
  workoutData: any,
  userId: string
): Promise<{ success: boolean; synced: boolean; message?: string; error?: string; result?: any }> {
  try {
    // Get Intervals.icu integration
    const integration = await prisma.integration.findFirst({
      where: {
        userId,
        provider: 'intervals'
      }
    })

    if (!integration) {
      return {
        success: true,
        synced: false,
        message: 'No Intervals.icu integration found. Saved locally only.'
      }
    }

    // Attempt sync based on operation
    let result: any

    switch (operation) {
      case 'CREATE':
        result = await createIntervalsPlannedWorkout(integration, workoutData)
        break
      case 'UPDATE':
        // If externalId is local (non-numeric), we can't update it on Intervals.
        // TODO: Should we CREATE it instead? For now, skip to avoid 404/429.
        if (!isIntervalsEventId(workoutData.externalId)) {
          return {
            success: true,
            synced: false,
            message: 'Skipped Intervals sync for local-only workout (non-numeric ID).'
          }
        }
        result = await updateIntervalsPlannedWorkout(
          integration,
          workoutData.externalId,
          workoutData
        )
        break
      case 'DELETE':
        // If externalId is local (non-numeric), it doesn't exist on Intervals.
        if (!isIntervalsEventId(workoutData.externalId)) {
          return {
            success: true,
            synced: false,
            message: 'Local workout deleted locally. Skipped Intervals sync.'
          }
        }
        result = await deleteIntervalsPlannedWorkout(integration, workoutData.externalId)
        break
      default:
        throw new Error(`Unknown operation: ${operation}`)
    }

    return {
      success: true,
      synced: true,
      result,
      message: 'Synced to Intervals.icu successfully'
    }
  } catch (error: any) {
    console.error(`Failed to sync ${operation} to Intervals.icu:`, error.message)

    // Queue for retry
    await queueSyncOperation({
      userId,
      entityType: 'planned_workout',
      entityId: workoutData.id,
      operation,
      payload: workoutData,
      error: error.message
    })

    return {
      success: true,
      synced: false,
      message: 'Saved locally. Will sync to Intervals.icu automatically.',
      error: error.message
    }
  }
}

/**
 * Queue a sync operation for later retry
 */
export async function queueSyncOperation(data: {
  userId: string
  entityType: string
  entityId: string
  operation: string
  payload: any
  error?: string
}): Promise<void> {
  try {
    await prisma.syncQueue.create({
      data: {
        userId: data.userId,
        entityType: data.entityType,
        entityId: data.entityId,
        operation: data.operation,
        payload: data.payload,
        status: 'PENDING',
        error: data.error,
        attempts: 0
      }
    })
    console.log(`Queued ${data.operation} operation for ${data.entityType} ${data.entityId}`)
  } catch (error) {
    console.error('Failed to queue sync operation:', error)
  }
}

/**
 * Process a single sync queue item
 */
export async function processSyncQueueItem(queueItem: any): Promise<boolean> {
  try {
    // Get integration
    const integration = await prisma.integration.findFirst({
      where: {
        userId: queueItem.userId,
        provider: 'intervals'
      }
    })

    if (!integration) {
      // Mark as failed permanently if no integration
      await prisma.syncQueue.update({
        where: { id: queueItem.id },
        data: {
          status: 'FAILED',
          error: 'No Intervals.icu integration found',
          attempts: queueItem.attempts + 1,
          lastAttempt: new Date()
        }
      })
      return false
    }

    // Attempt sync
    const payload = queueItem.payload

    switch (queueItem.operation) {
      case 'CREATE':
        await createIntervalsPlannedWorkout(integration, payload)
        break
      case 'UPDATE':
        if (!isIntervalsEventId(payload.externalId)) {
          await prisma.syncQueue.update({
            where: { id: queueItem.id },
            data: {
              status: 'FAILED',
              error: 'Invalid Intervals externalId for UPDATE operation',
              attempts: queueItem.attempts + 1,
              lastAttempt: new Date()
            }
          })
          return false
        }
        await updateIntervalsPlannedWorkout(integration, payload.externalId, payload)
        break
      case 'DELETE':
        if (!isIntervalsEventId(payload.externalId)) {
          await prisma.syncQueue.update({
            where: { id: queueItem.id },
            data: {
              status: 'FAILED',
              error: 'Invalid Intervals externalId for DELETE operation',
              attempts: queueItem.attempts + 1,
              lastAttempt: new Date()
            }
          })
          return false
        }
        await deleteIntervalsPlannedWorkout(integration, payload.externalId)
        break
    }

    // Mark as completed
    await prisma.syncQueue.update({
      where: { id: queueItem.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        attempts: queueItem.attempts + 1,
        lastAttempt: new Date()
      }
    })

    // Update entity sync status
    if (queueItem.entityType === 'planned_workout') {
      await prisma.plannedWorkout.update({
        where: { id: queueItem.entityId },
        data: {
          syncStatus: 'SYNCED',
          lastSyncedAt: new Date(),
          syncError: null
        }
      })
    }

    console.log(`Successfully synced ${queueItem.entityType} ${queueItem.entityId}`)
    return true
  } catch (error: any) {
    console.error(`Failed to process sync queue item ${queueItem.id}:`, error.message)

    // Update failure count
    const newAttempts = queueItem.attempts + 1
    const maxAttempts = 3

    await prisma.syncQueue.update({
      where: { id: queueItem.id },
      data: {
        status: newAttempts >= maxAttempts ? 'FAILED' : 'PENDING',
        error: error.message,
        attempts: newAttempts,
        lastAttempt: new Date()
      }
    })

    // Update entity with error if permanently failed
    if (newAttempts >= maxAttempts && queueItem.entityType === 'planned_workout') {
      await prisma.plannedWorkout.update({
        where: { id: queueItem.entityId },
        data: {
          syncStatus: 'FAILED',
          syncError: `Failed after ${maxAttempts} attempts: ${error.message}`
        }
      })
    }

    return false
  }
}
