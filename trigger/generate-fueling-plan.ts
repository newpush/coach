import { task } from '@trigger.dev/sdk/v3'
import { prisma } from '../server/utils/db'
import { calculateFuelingStrategy } from '../server/utils/nutrition/fueling'
import { getUserNutritionSettings } from '../server/utils/nutrition/settings'
import { getStartOfDayUTC, getUserTimezone } from '../server/utils/date'
import { nutritionRepository } from '../server/utils/repositories/nutritionRepository'

export const generateFuelingPlanTask = task({
  id: 'generate-fueling-plan',
  run: async (payload: { plannedWorkoutId: string; userId: string; date: string }) => {
    const { plannedWorkoutId, userId, date } = payload

    // 1. Fetch Planned Workout & Settings
    const workout = await prisma.plannedWorkout.findUnique({
      where: { id: plannedWorkoutId }
    })

    if (!workout) {
      console.log(`Planned Workout ${plannedWorkoutId} not found. Skipping.`)
      return
    }

    // 2. Check for Manual Lock
    // The 'date' string passed is ISO UTC Midnight for the calendar day
    const targetDateStart = new Date(date)
    // Ensure it's truly midnight UTC (in case it wasn't)
    targetDateStart.setUTCHours(0, 0, 0, 0)

    const existingNutrition = await nutritionRepository.getByDate(userId, targetDateStart)

    if (existingNutrition?.isManualLock) {
      console.log(`Nutrition for ${date} is locked by user. Skipping auto-update.`)
      return
    }

    const settings = await getUserNutritionSettings(userId)

    // 3. Calculate Strategy
    // Map settings to profile interface expected by calculator
    const user = await prisma.user.findUnique({ where: { id: userId } })
    const profile = {
      weight: user?.weight || 75,
      ftp: user?.ftp || 250,
      currentCarbMax: settings.currentCarbMax,
      sodiumTarget: settings.sodiumTarget,
      sweatRate: settings.sweatRate || 0.8,
      preWorkoutWindow: settings.preWorkoutWindow,
      postWorkoutWindow: settings.postWorkoutWindow,
      fuelingSensitivity: settings.fuelingSensitivity,
      fuelState1Trigger: settings.fuelState1Trigger,
      fuelState1Min: settings.fuelState1Min,
      fuelState1Max: settings.fuelState1Max,
      fuelState2Trigger: settings.fuelState2Trigger,
      fuelState2Min: settings.fuelState2Min,
      fuelState2Max: settings.fuelState2Max,
      fuelState3Min: settings.fuelState3Min,
      fuelState3Max: settings.fuelState3Max
    }

    const fuelingPlan = calculateFuelingStrategy(profile, {
      ...workout,
      strategyOverride: workout.fuelingStrategy || undefined
    })

    // 4. Update Nutrition Record
    await nutritionRepository.upsert(
      userId,
      targetDateStart,
      {
        userId,
        date: targetDateStart,
        fuelingPlan: fuelingPlan as any, // Cast to Json
        sourcePrecedence: 'AI',
        caloriesGoal: fuelingPlan.dailyTotals.calories,
        carbsGoal: fuelingPlan.dailyTotals.carbs,
        proteinGoal: fuelingPlan.dailyTotals.protein,
        fatGoal: fuelingPlan.dailyTotals.fat
      },
      {
        fuelingPlan: fuelingPlan as any,
        sourcePrecedence: 'AI',
        // Only update goals if not locked (checked above, but double check logic if partial)
        caloriesGoal: fuelingPlan.dailyTotals.calories,
        carbsGoal: fuelingPlan.dailyTotals.carbs,
        proteinGoal: fuelingPlan.dailyTotals.protein,
        fatGoal: fuelingPlan.dailyTotals.fat
      }
    )

    return {
      success: true,
      plan: fuelingPlan
    }
  }
})
