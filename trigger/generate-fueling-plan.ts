import { task } from '@trigger.dev/sdk/v3'
import { metabolicService } from '../server/utils/services/metabolicService'

export const generateFuelingPlanTask = task({
  id: 'generate-fueling-plan',
  run: async (payload: { plannedWorkoutId?: string; userId: string; date: string }) => {
    const { userId, date } = payload
    const targetDate = new Date(date)

    const result = await metabolicService.calculateFuelingPlanForDate(userId, targetDate, {
      persist: true
    })

    return {
      success: true,
      skipped: result.skipped,
      plan: result.plan
    }
  }
})
