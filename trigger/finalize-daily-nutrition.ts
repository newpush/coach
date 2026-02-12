import { logger, task } from '@trigger.dev/sdk/v3'
import { getUserTimezone, getUserLocalDate } from '../server/utils/date'
import { metabolicService } from '../server/utils/services/metabolicService'

export const finalizeDailyNutritionTask = task({
  id: 'finalize-daily-nutrition',
  run: async (payload: { userId: string; date?: string }) => {
    const { userId, date } = payload
    const timezone = await getUserTimezone(userId)
    const targetDate = date ? new Date(date) : getUserLocalDate(timezone)

    logger.log('Manually finalizing nutrition', { userId, targetDate: targetDate.toISOString() })

    await metabolicService.finalizeDay(userId, targetDate)

    return {
      success: true
    }
  }
})

// Schedule this to run for all active users daily
// Note: In a real app, you'd iterate through users or trigger from a central job
// For now, we define the task.
