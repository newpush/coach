import './init'
import { logger, task, tasks } from '@trigger.dev/sdk/v3'
import { userIngestionQueue } from './queues'
import { prisma } from '../server/utils/db'
import { IntervalsService } from '../server/utils/services/intervalsService'
import { getUserTimezone, getEndOfDayUTC } from '../server/utils/date'
import type { IngestionResult } from './types'

export const ingestIntervalsTask = task({
  id: 'ingest-intervals',
  maxDuration: 3600, // 1 hour
  queue: userIngestionQueue,
  run: async (payload: {
    userId: string
    startDate: string
    endDate: string
  }): Promise<IngestionResult> => {
    const { userId, startDate, endDate } = payload

    logger.log('Starting Intervals.icu ingestion', { userId, startDate, endDate })

    // Fetch integration
    const integration = await prisma.integration.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: 'intervals'
        }
      }
    })

    if (!integration) {
      throw new Error('Intervals integration not found for user')
    }

    // Update sync status
    await prisma.integration.update({
      where: { id: integration.id },
      data: { syncStatus: 'SYNCING' }
    })

    try {
      const timezone = await getUserTimezone(userId)
      const start = new Date(startDate)
      const end = new Date(endDate)

      // Calculate 'now' to cap historical data fetching
      const now = new Date()
      // Cap at end of today in user's timezone to allow for timezone differences but prevent far future
      const historicalEndLocal = getEndOfDayUTC(timezone, now)

      const historicalEnd = end > historicalEndLocal ? historicalEndLocal : end

      // Fetch planned workouts (import all categories)
      logger.log('Syncing planned workouts...')
      const {
        plannedWorkouts: plannedWorkoutsUpserted,
        events: eventsUpserted,
        notes: notesUpserted
      } = await IntervalsService.syncPlannedWorkouts(userId, start, end)
      logger.log(
        `Upserted ${plannedWorkoutsUpserted} planned workouts, ${eventsUpserted} racing events, and ${notesUpserted} calendar notes`
      )

      // Fetch activities
      logger.log('Syncing activities...')
      const workoutsUpserted = await IntervalsService.syncActivities(userId, start, historicalEnd)
      logger.log(`Upserted ${workoutsUpserted} workouts`)

      // Fetch wellness data
      logger.log('Syncing wellness data...')
      const wellnessUpserted = await IntervalsService.syncWellness(userId, start, historicalEnd)
      logger.log(`Upserted ${wellnessUpserted} wellness entries`)

      // Update sync status
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          syncStatus: 'SUCCESS',
          lastSyncAt: new Date(),
          errorMessage: null,
          initialSyncCompleted: true // Mark initial sync as done
        }
      })

      return {
        success: true,
        counts: {
          workouts: workoutsUpserted,
          wellness: wellnessUpserted,
          plannedWorkouts: plannedWorkoutsUpserted,
          events: eventsUpserted
        },
        userId,
        startDate,
        endDate
      }
    } catch (error) {
      logger.error('Error ingesting Intervals data', { error })

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
