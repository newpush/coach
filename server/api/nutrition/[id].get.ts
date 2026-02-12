import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'
import { nutritionRepository } from '../../utils/repositories/nutritionRepository'
import { getUserNutritionSettings } from '../../utils/nutrition/settings'
import {
  calculateFuelingStrategy,
  calculateDailyCalorieBreakdown
} from '../../utils/nutrition/fueling'
import { plannedWorkoutRepository } from '../../utils/repositories/plannedWorkoutRepository'
import { buildZonedDateTimeFromUtcDate, getUserTimezone } from '../../utils/date'
import { metabolicService } from '../../utils/services/metabolicService'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const userId = (session.user as any).id
  const id = getRouterParam(event, 'id')
  const query = getQuery(event)
  const currentTime = query.currentTime ? new Date(query.currentTime as string) : new Date()

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Nutrition ID is required'
    })
  }

  let nutrition: any = null
  let dateObj: Date | null = null

  // Check if ID is a date string (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(id)) {
    dateObj = new Date(`${id}T00:00:00Z`)
    if (!isNaN(dateObj.getTime())) {
      nutrition = await nutritionRepository.getByDate(userId, dateObj)
    }
  }

  // Fallback to searching by UUID if not found by date or if not a date string
  if (!nutrition) {
    nutrition = await nutritionRepository.getById(id, userId)
    if (nutrition) dateObj = new Date(nutrition.date)
  }

  // CARRYOVER LOGIC: Get yesterday's ending state via metabolicService
  let startingGlycogen: number = 85
  let startingFluid: number = 0
  let energyPoints: any[] = []
  let glycogenState: any = null

  if (dateObj) {
    const state = await metabolicService.getMetabolicState(userId, dateObj)
    startingGlycogen = state.startingGlycogen
    startingFluid = state.startingFluid

    // Unified Server-side calculation
    const timelineResult = await metabolicService.getDailyTimeline(
      userId,
      dateObj,
      startingGlycogen,
      startingFluid,
      currentTime
    )
    energyPoints = timelineResult.points
    glycogenState = timelineResult.liveStatus
  }

  // AGGREGATED CALORIE AND PLAN ESTIMATION
  if (dateObj) {
    const plannedWorkouts = await plannedWorkoutRepository.list(userId, {
      startDate: dateObj,
      endDate: dateObj,
      limit: 10
    })

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { weight: true, ftp: true }
    })
    const settings = await getUserNutritionSettings(userId)
    const timezone = await getUserTimezone(userId)

    const profile = {
      weight: user?.weight || 75,
      ftp: user?.ftp || 250,
      currentCarbMax: settings.currentCarbMax,
      sodiumTarget: settings.sodiumTarget,
      sweatRate: settings.sweatRate ?? undefined,
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

    const contexts: any[] = plannedWorkouts.map((workout) => {
      let startTimeDate: Date | null = null
      if (
        workout.startTime &&
        typeof workout.startTime === 'string' &&
        workout.startTime.includes(':')
      ) {
        startTimeDate = buildZonedDateTimeFromUtcDate(
          workout.date,
          workout.startTime,
          timezone,
          10,
          0
        )
      }
      return {
        ...workout,
        startTime: startTimeDate,
        durationHours: (workout.durationSec || 0) / 3600,
        intensity: workout.workIntensity || 0.5,
        strategyOverride: workout?.fuelingStrategy || undefined
      }
    })

    // Aggregate energy demand
    const breakdown = calculateDailyCalorieBreakdown(profile, contexts)

    // Create a plain result object to avoid Prisma serialization issues
    const plainNutrition = { ...nutrition }

    if (plainNutrition && plainNutrition.fuelingPlan) {
      // Upcast existing plan if missing granular totals
      const fp = { ...(plainNutrition.fuelingPlan as any) }
      if (
        fp &&
        fp.dailyTotals &&
        (!fp.dailyTotals.baseCalories || !fp.dailyTotals.workoutCalories)
      ) {
        fp.dailyTotals.baseCalories = breakdown.baseCalories
        fp.dailyTotals.activityCalories = breakdown.activityCalories
        fp.dailyTotals.adjustmentCalories = breakdown.adjustmentCalories
        fp.dailyTotals.workoutCalories = breakdown.workouts.map((w: any) => ({
          title: w.title,
          calories: w.calories
        }))

        // Correct the total goal if it deviates significantly and not locked
        if (
          !plainNutrition.isManualLock &&
          Math.abs((plainNutrition.caloriesGoal || 0) - breakdown.totalTarget) > 10
        ) {
          plainNutrition.caloriesGoal = breakdown.totalTarget
          fp.dailyTotals.calories = breakdown.totalTarget
        }
        plainNutrition.fuelingPlan = fp
      }
    } else if (dateObj) {
      // Proactive estimation
      const primaryContext =
        contexts.length > 0
          ? contexts[0]
          : { title: 'Rest', intensity: 0, durationHours: 0, startTime: null, type: 'Rest' }
      const estimate = calculateFuelingStrategy(profile, primaryContext) as any

      estimate.dailyTotals.calories = breakdown.totalTarget
      estimate.dailyTotals.baseCalories = breakdown.baseCalories
      estimate.dailyTotals.activityCalories = breakdown.activityCalories
      estimate.dailyTotals.adjustmentCalories = breakdown.adjustmentCalories
      estimate.dailyTotals.workoutCalories = breakdown.workouts.map((w: any) => ({
        title: w.title,
        calories: w.calories
      }))

      if (!plainNutrition.date) {
        plainNutrition.date = dateObj
        plainNutrition.calories = 0
        plainNutrition.protein = 0
        plainNutrition.carbs = 0
        plainNutrition.fat = 0
        plainNutrition.caloriesGoal = estimate.dailyTotals.calories
        plainNutrition.proteinGoal = estimate.dailyTotals.protein
        plainNutrition.carbsGoal = estimate.dailyTotals.carbs
        plainNutrition.fatGoal = estimate.dailyTotals.fat
        plainNutrition.fuelingPlan = estimate
        plainNutrition.aiAnalysisStatus = 'NOT_STARTED'
        plainNutrition.isEstimate = true
      } else {
        plainNutrition.fuelingPlan = estimate
        plainNutrition.caloriesGoal = estimate.dailyTotals.calories
        plainNutrition.proteinGoal = estimate.dailyTotals.protein
        plainNutrition.carbsGoal = estimate.dailyTotals.carbs
        plainNutrition.fatGoal = estimate.dailyTotals.fat
      }
    }
    nutrition = plainNutrition
  }

  if (!nutrition) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(id)) {
      return {
        date: id,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        aiAnalysisStatus: 'NOT_STARTED'
      }
    }

    throw createError({
      statusCode: 404,
      message: 'Nutrition entry not found'
    })
  }

  const llmUsage = await prisma.llmUsage.findFirst({
    where: {
      entityId: nutrition.id,
      entityType: 'Nutrition'
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      feedback: true,
      feedbackText: true
    }
  })

  return {
    ...nutrition,
    startingGlycogen,
    startingFluid,
    energyPoints,
    ...(glycogenState || {}),
    date:
      nutrition.date instanceof Date
        ? nutrition.date.toISOString().split('T')[0]
        : (nutrition.date as string),
    llmUsageId: llmUsage?.id,
    feedback: llmUsage?.feedback,
    feedbackText: llmUsage?.feedbackText
  }
})
