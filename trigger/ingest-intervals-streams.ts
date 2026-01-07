import { task, logger } from '@trigger.dev/sdk/v3'
import { userIngestionQueue } from './queues'
import { IntervalsService } from '../server/utils/services/intervalsService'

interface IngestStreamsPayload {
  userId: string
  workoutId: string
  activityId: string
}

export const ingestIntervalsStreams = task({
  id: 'ingest-intervals-streams',
  queue: userIngestionQueue,
  run: async (payload: IngestStreamsPayload) => {
    logger.log('Starting Intervals.icu stream ingestion', {
      workoutId: payload.workoutId,
      activityId: payload.activityId
    })

    try {
      const result = await IntervalsService.syncActivityStream(
        payload.userId,
        payload.workoutId,
        payload.activityId
      )

      if (!result) {
        return {
          success: true,
          workoutId: payload.workoutId,
          message: 'No stream data available'
        }
      }

      logger.log('Stream data stored successfully', { streamId: result.id })

      return {
        success: true,
        workoutId: payload.workoutId,
        streamId: result.id,
        metrics: {
          dataPoints: result.time.length,
          laps: (result.lapSplits as any[])?.length || 0,
          avgPacePerKm: result.avgPacePerKm,
          paceVariability: result.paceVariability,
          pacingStrategy: (result.pacingStrategy as any)?.strategy,
          surges: (result.surges as any[])?.length || 0
        }
      }
    } catch (error) {
      logger.error('Error ingesting streams', { error })
      throw error
    }
  }
})
