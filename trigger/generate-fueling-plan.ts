import { task } from '@trigger.dev/sdk/v3'
import { prisma } from '../server/utils/db'
import {
  calculateFuelingStrategy,
  calculateDailyCalorieBreakdown
} from '../server/utils/nutrition/fueling'
import { getUserNutritionSettings } from '../server/utils/nutrition/settings'
import { getUserTimezone, buildZonedDateTimeFromUtcDate } from '../server/utils/date'
import { nutritionRepository } from '../server/utils/repositories/nutritionRepository'
import { mergeFuelingWindows } from '../app/utils/merging-nutrition'

export const generateFuelingPlanTask = task({
  id: 'generate-fueling-plan',
  run: async (payload: { plannedWorkoutId?: string; userId: string; date: string }) => {
    const { userId, date } = payload

    // 1. Check for Manual Lock
    const targetDateStart = new Date(date)
    targetDateStart.setUTCHours(0, 0, 0, 0)
    const targetDateEnd = new Date(targetDateStart)
    targetDateEnd.setUTCHours(23, 59, 59, 999)

    const existingNutrition = await nutritionRepository.getByDate(userId, targetDateStart)

    if (existingNutrition?.isManualLock) {
      console.log(`Nutrition for ${date} is locked by user. Skipping auto-update.`)
      return
    }

    const settings = await getUserNutritionSettings(userId)
    const timezone = await getUserTimezone(userId)

    // 2. Fetch ALL workouts for this day
    const allWorkouts = await prisma.plannedWorkout.findMany({
      where: {
        userId,
        date: {
          gte: targetDateStart,
          lte: targetDateEnd
        }
      },
      orderBy: { date: 'asc' }
    })

    console.log(`[GeneratePlan] Found ${allWorkouts.length} workouts for ${date}`)

    // 3. Prepare Profile
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
      fuelState3Max: settings.fuelState3Max,
      bmr: settings.bmr ?? 1600,
      activityLevel: settings.activityLevel || 'ACTIVE',
      targetAdjustmentPercent: settings.targetAdjustmentPercent ?? 0
    }

    // 4. Generate clusters for each workout and combine
    const combinedWindows: any[] = []
    const combinedNotes: string[] = []
    const contexts: any[] = []

    // If NO workouts exist, use baseline cluster
    if (allWorkouts.length === 0) {
      contexts.push({
        id: 'rest-virtual',
        title: 'Rest Day',
        durationSec: 0,
        type: 'Rest',
        date: targetDateStart,
        durationHours: 0,
        intensity: 0,
        strategyOverride: 'STANDARD'
      })
    } else {
      for (const work of allWorkouts) {
        let startTimeDate: Date | null = null
        if (work.startTime && typeof work.startTime === 'string' && work.startTime.includes(':')) {
          startTimeDate = buildZonedDateTimeFromUtcDate(work.date, work.startTime, timezone, 10, 0)
        } else if ((work.startTime as any) instanceof Date) {
          startTimeDate = work.startTime as any as Date
        }

        contexts.push({
          ...work,
          startTime: startTimeDate,
          durationHours: (work.durationSec || 0) / 3600,
          intensity: work.workIntensity || 0.5,
          strategyOverride: work.fuelingStrategy || undefined
        })
      }
    }

    // Aggregate Macros baseline (taking the max requirement among workouts for base carb sizing)
    let maxDailyCarbs = 0
    let maxDailyProtein = 0
    let maxDailyFat = 0
    let totalFluid = 2000
    let totalSodium = 1000

    for (const ctx of contexts) {
      const plan = calculateFuelingStrategy(profile, ctx)
      combinedWindows.push(...plan.windows)
      combinedNotes.push(...plan.notes)

      if (plan.dailyTotals.carbs > maxDailyCarbs) {
        maxDailyCarbs = plan.dailyTotals.carbs
        maxDailyProtein = plan.dailyTotals.protein
        maxDailyFat = plan.dailyTotals.fat
      }

      totalFluid += plan.dailyTotals.fluid - 2000
      totalSodium += plan.dailyTotals.sodium - 1000
    }

    // New Calorie Aggregate Logic
    const breakdown = calculateDailyCalorieBreakdown(profile, contexts)

    // Merge overlapping windows
    const mergedWindows = mergeFuelingWindows(combinedWindows)
    const uniqueNotes = Array.from(new Set(combinedNotes))

    const finalPlan = {
      windows: mergedWindows,
      notes: uniqueNotes,
      dailyTotals: {
        carbs: maxDailyCarbs,
        protein: maxDailyProtein,
        fat: maxDailyFat,
        calories: breakdown.totalTarget,
        fluid: totalFluid,
        sodium: totalSodium,
        baseCalories: breakdown.baseCalories,
        activityCalories: breakdown.activityCalories,
        adjustmentCalories: breakdown.adjustmentCalories,
        workoutCalories: breakdown.workouts.map((w) => ({ title: w.title, calories: w.calories }))
      }
    }

    // 4. Update Nutrition Record
    await nutritionRepository.upsert(
      userId,
      targetDateStart,
      {
        userId,
        date: targetDateStart,
        fuelingPlan: finalPlan as any,
        sourcePrecedence: 'AI',
        caloriesGoal: finalPlan.dailyTotals.calories,
        carbsGoal: finalPlan.dailyTotals.carbs,
        proteinGoal: finalPlan.dailyTotals.protein,
        fatGoal: finalPlan.dailyTotals.fat
      },
      {
        fuelingPlan: finalPlan as any,
        sourcePrecedence: 'AI',
        caloriesGoal: finalPlan.dailyTotals.calories,
        carbsGoal: finalPlan.dailyTotals.carbs,
        proteinGoal: finalPlan.dailyTotals.protein,
        fatGoal: finalPlan.dailyTotals.fat
      }
    )

    return {
      success: true,
      plan: finalPlan
    }
  }
})
