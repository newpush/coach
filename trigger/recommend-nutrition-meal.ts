import { task, logger } from '@trigger.dev/sdk/v3'
import { mealRecommendationService } from '../server/utils/services/mealRecommendationService'
import { userReportsQueue } from './queues'
import { checkQuota } from '../server/utils/quotas/engine'
import { prisma } from '../server/utils/db'

export const recommendNutritionMealTask = task({
  id: 'recommend-nutrition-meal',
  queue: userReportsQueue,
  run: async (payload: {
    userId: string
    date: string
    windowType?: string
    forceLlm?: boolean
    targetCarbs?: number
    targetProtein?: number
    targetKcal?: number
  }) => {
    const { userId, date, windowType, forceLlm, targetCarbs, targetProtein, targetKcal } = payload

    logger.log('Starting meal recommendation', { userId, date, windowType })

    // 1. Check Quota
    try {
      await checkQuota(userId, 'meal_recommendation')
    } catch (quotaError: any) {
      if (quotaError.statusCode === 429) {
        logger.warn('Meal recommendation quota exceeded', { userId })
        
        // Create a FAILED recommendation record with the quota error
        await prisma.nutritionRecommendation.create({
          data: {
            userId,
            date: new Date(date),
            scope: 'MEAL',
            windowType,
            status: 'FAILED',
            contextJson: { error: 'QUOTA_EXCEEDED' }
          }
        })

        return { success: false, reason: 'QUOTA_EXCEEDED' }
      }
      throw quotaError
    }

    const targetDate = new Date(date)

    const result = await mealRecommendationService.getRecommendations(userId, targetDate, {
      scope: 'MEAL',
      windowType,
      forceLlm,
      targetCarbs,
      targetProtein,
      targetKcal
    })

    return result
  }
})
