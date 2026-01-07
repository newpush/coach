import { logger, schedules } from '@trigger.dev/sdk/v3'
import { prisma } from '../server/utils/db'

/**
 * Process Sync Queue - Retry failed Intervals.icu syncs
 *
 * This scheduled task runs every 5 minutes to process pending sync operations.
 * It retries failed syncs to Intervals.icu for planned workouts and availability.
 *
 * Max attempts: 3 per operation
 * After 3 failures, the item is marked as FAILED and removed from retry queue.
 */
export const processSyncQueueTask = schedules.task({
  id: 'process-sync-queue',
  // Run every 5 minutes
  cron: '*/5 * * * *',
  maxDuration: 300, // 5 minutes max
  run: async (payload) => {
    logger.log('Starting sync queue processing')

    try {
      // Fetch all pending sync operations
      // SyncQueue is a system utility table, not a core domain model like Workout/Nutrition.
      // Direct prisma access here is acceptable as it's not subject to business logic like duplicates.
      const pendingItems = await prisma.syncQueue.findMany({
        where: {
          status: 'PENDING',
          attempts: {
            lt: 3 // Less than 3 attempts
          }
        },
        orderBy: {
          createdAt: 'asc' // Oldest first
        },
        take: 50 // Process max 50 items per run
      })

      logger.log(`Found ${pendingItems.length} pending sync operations`)

      if (pendingItems.length === 0) {
        return {
          success: true,
          processed: 0,
          succeeded: 0,
          failed: 0,
          message: 'No pending items to process'
        }
      }

      let succeeded = 0
      let failed = 0

      // Process each item
      for (const item of pendingItems) {
        logger.log(`Processing sync item`, {
          id: item.id,
          entityType: item.entityType,
          operation: item.operation,
          attempts: item.attempts
        })

        try {
          // Dynamically import to avoid circular dependencies
          const { processSyncQueueItem } = await import('../server/utils/intervals-sync')

          // Process the sync operation
          const success = await processSyncQueueItem(item)

          if (success) {
            // Mark as completed
            await prisma.syncQueue.update({
              where: { id: item.id },
              data: {
                status: 'COMPLETED',
                error: null,
                completedAt: new Date()
              }
            })

            succeeded++
            logger.log(`Sync succeeded for item ${item.id}`)
          } else {
            // Increment attempts
            const newAttempts = item.attempts + 1
            const maxAttemptsReached = newAttempts >= 3

            await prisma.syncQueue.update({
              where: { id: item.id },
              data: {
                attempts: newAttempts,
                status: maxAttemptsReached ? 'FAILED' : 'PENDING',
                lastAttempt: new Date()
              }
            })

            failed++

            if (maxAttemptsReached) {
              logger.warn(`Sync failed after max attempts for item ${item.id}`, {
                entityType: item.entityType,
                entityId: item.entityId,
                operation: item.operation
              })
            } else {
              logger.log(`Sync failed, will retry (attempt ${newAttempts}/3) for item ${item.id}`)
            }
          }
        } catch (error) {
          // Log error and increment attempts
          const newAttempts = item.attempts + 1
          const maxAttemptsReached = newAttempts >= 3

          logger.error(`Error processing sync item ${item.id}`, {
            error,
            entityType: item.entityType,
            operation: item.operation
          })

          await prisma.syncQueue.update({
            where: { id: item.id },
            data: {
              attempts: newAttempts,
              status: maxAttemptsReached ? 'FAILED' : 'PENDING',
              error: error instanceof Error ? error.message : String(error),
              lastAttempt: new Date()
            }
          })

          failed++
        }
      }

      logger.log('Sync queue processing complete', {
        total: pendingItems.length,
        succeeded,
        failed
      })

      return {
        success: true,
        processed: pendingItems.length,
        succeeded,
        failed
      }
    } catch (error) {
      logger.error('Error processing sync queue', { error })
      throw error
    }
  }
})
