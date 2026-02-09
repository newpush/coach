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
    targetDateStart.setUTCHours(0, 0, 0, 0)
    const targetDateEnd = new Date(targetDateStart)
    targetDateEnd.setUTCHours(23, 59, 59, 999)

    const existingNutrition = await nutritionRepository.getByDate(userId, targetDateStart)

    if (existingNutrition?.isManualLock) {
      console.log(`Nutrition for ${date} is locked by user. Skipping auto-update.`)
      return
    }

    const settings = await getUserNutritionSettings(userId)

    // 3. Fetch ALL workouts for this day to build a complete plan
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

    // 4. Calculate Strategy
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

    // Generate clusters for each workout and combine
    const combinedWindows: any[] = []
    const combinedNotes: string[] = []
    const dailyTotals = {
      calories: 0,
      carbs: 0,
      protein: 0,
      fat: 0,
      fluid: 2000, // Base hydration
      sodium: 1000 // Base sodium
    }

    for (const work of allWorkouts) {
      // Convert HH:mm string to a Date object relative to the workout date
      let startTimeDate: Date | null = null
      if (work.startTime && typeof work.startTime === 'string' && work.startTime.includes(':')) {
        const [h, m] = work.startTime.split(':').map(Number)
        startTimeDate = new Date(work.date)
        startTimeDate.setUTCHours(h || 0, m || 0, 0, 0)
      } else if (work.startTime instanceof Date) {
        startTimeDate = work.startTime
      }

      const plan = calculateFuelingStrategy(profile, {
        ...work,
        startTime: startTimeDate,
        strategyOverride: work.fuelingStrategy || undefined
      } as any)

      combinedWindows.push(...plan.windows)
      combinedNotes.push(...plan.notes)
    }

    // Deduplicate notes
    const uniqueNotes = Array.from(new Set(combinedNotes))

    // Recalculate Totals based on all windows
    const totalCarbs = combinedWindows.reduce((sum, w) => sum + w.targetCarbs, 0)
    const totalProtein = combinedWindows.reduce((sum, w) => sum + w.targetProtein, 0)
    const totalFat = combinedWindows.reduce((sum, w) => sum + w.targetFat, 0)
    const totalFluid = combinedWindows.reduce((sum, w) => sum + (w.targetFluid || 0), 0) + 2000
    const totalSodium = combinedWindows.reduce((sum, w) => sum + (w.targetSodium || 0), 0) + 1000

    const finalPlan = {
      windows: combinedWindows,
      notes: uniqueNotes,
      dailyTotals: {
        carbs: totalCarbs,
        protein: totalProtein,
        fat: totalFat,
        calories: totalCarbs * 4 + totalProtein * 4 + totalFat * 9,
        fluid: totalFluid,
        sodium: totalSodium
      }
    }

    // 5. Update Nutrition Record
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
