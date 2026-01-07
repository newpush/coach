import { logger, task, tasks } from '@trigger.dev/sdk/v3'
import { userIngestionQueue } from './queues'
import { prisma } from '../server/utils/db'
import { IntervalsService } from '../server/utils/services/intervalsService'
import { getUserTimezone, getEndOfDayUTC } from '../server/utils/date'

export const ingestIntervalsTask = task({
  id: 'ingest-intervals',
  queue: userIngestionQueue,
  run: async (payload: { userId: string; startDate: string; endDate: string }) => {
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

      // Fetch activities
      logger.log('Syncing activities...')
      const workoutsUpserted = await IntervalsService.syncActivities(userId, start, historicalEnd)
      logger.log(`Upserted ${workoutsUpserted} workouts`)

      // Fetch wellness data
      logger.log('Syncing wellness data...')
      const wellnessUpserted = await IntervalsService.syncWellness(userId, start, historicalEnd)
      logger.log(`Upserted ${wellnessUpserted} wellness entries`)

      // Fetch planned workouts (import all categories)
      logger.log('Syncing planned workouts...')
      const { plannedWorkouts: plannedWorkoutsUpserted, events: eventsUpserted } =
        await IntervalsService.syncPlannedWorkouts(userId, start, end)
      logger.log(
        `Upserted ${plannedWorkoutsUpserted} planned workouts and ${eventsUpserted} racing events`
      )

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
        workouts: workoutsUpserted,
        wellness: wellnessUpserted,
        plannedWorkouts: plannedWorkoutsUpserted,
        events: eventsUpserted,
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
