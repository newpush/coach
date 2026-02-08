import './init'
import { logger, task } from '@trigger.dev/sdk/v3'
import { userIngestionQueue } from './queues'
import { polarService } from '../server/utils/services/polarService'
import type { IngestionResult } from './types'

export const ingestPolarTask = task({
  id: 'ingest-polar',
  queue: userIngestionQueue,
  maxDuration: 900, // 15 minutes
  run: async (
    payload: { userId: string; startDate?: string; endDate?: string },
    { ctx }
  ): Promise<IngestionResult> => {
    const { userId } = payload
    logger.log('[Polar Ingest] Starting ingestion', { userId })

    try {
      const results = await polarService.syncUser(userId)
      logger.log('[Polar Ingest] Ingestion complete', { results })

      return {
        success: true,
        counts: {
          workouts: results.exercises,
          sleep: results.sleeps,
          wellness: results.recharges
        },
        userId
      }
    } catch (error) {
      logger.error('[Polar Ingest] Failed', { error })
      throw error
    }
  }
})
