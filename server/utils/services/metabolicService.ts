import { prisma } from '../db'
import { nutritionRepository } from '../repositories/nutritionRepository'
import { workoutRepository } from '../repositories/workoutRepository'
import {
  getUserTimezone,
  getUserLocalDate,
  getStartOfDayUTC,
  getEndOfDayUTC,
  buildZonedDateTimeFromUtcDate,
  formatDateUTC
} from '../date'
import { calculateEnergyTimeline, calculateGlycogenState } from '../nutrition-domain/logic'
import { getUserNutritionSettings } from '../nutrition/settings'
import { plannedWorkoutRepository } from '../repositories/plannedWorkoutRepository'
import { ABSORPTION_PROFILES } from '../nutrition-domain/absorption'
import { calculateDailyCalorieBreakdown, calculateFuelingStrategy } from '../nutrition/fueling'
import { mergeFuelingWindows } from '../nutrition-domain/merging'

export const metabolicService = {
  /**
   * Calculates the current "Live" glycogen status for a user.
   */
  async getGlycogenState(
    userId: string,
    date: Date,
    startingGlycogen: number,
    currentTime: Date = new Date()
  ) {
    const timezone = await getUserTimezone(userId)
    const settings = await getUserNutritionSettings(userId)
    const [dayNutrition, dayWorkouts] = await Promise.all([
      nutritionRepository.getByDate(userId, date),
      this.getRelevantWorkouts(userId, date, timezone)
    ])

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { weight: true }
    })

    return calculateGlycogenState(
      dayNutrition || {
        date: date.toISOString(),
        carbsGoal: settings.fuelState1Min * (user?.weight || 75)
      },
      dayWorkouts,
      settings,
      timezone,
      currentTime,
      startingGlycogen
    )
  },

  /**
   * Internal helper to get merged workouts for a date.
   */
  async getRelevantWorkouts(userId: string, date: Date, timezone: string) {
    const rangeStart = getStartOfDayUTC(timezone, date)
    const rangeEnd = getEndOfDayUTC(timezone, date)

    const [completed, planned] = await Promise.all([
      workoutRepository.getForUser(userId, { startDate: rangeStart, endDate: rangeEnd }),
      plannedWorkoutRepository.list(userId, { startDate: date, endDate: date })
    ])

    const completedPlannedIds = new Set(
      completed.map((w: any) => w.plannedWorkoutId).filter(Boolean)
    )

    return [
      ...completed,
      ...planned.filter((p: any) => !p.completed && !completedPlannedIds.has(p.id))
    ]
  },

  /**
   * Calculates the full energy timeline for a specific day.
   * Centralizes logic for workout merging, meal synthesis policy, and timeline generation.
   * Returns both the points (for charts) and the liveStatus (for the tank).
   */
  async getDailyTimeline(
    userId: string,
    date: Date,
    startingGlycogen: number,
    startingFluid: number,
    currentTime: Date = new Date()
  ) {
    const timezone = await getUserTimezone(userId)
    const settings = await getUserNutritionSettings(userId)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { weight: true, ftp: true }
    })

    const dayWorkouts = await this.getRelevantWorkouts(userId, date, timezone)
    const dayNutrition = await nutritionRepository.getByDate(userId, date)

    const todayLocal = getUserLocalDate(timezone)

    // Synthesize meals if needed (ONLY for Today or Future)
    let simulationMeals: any[] = []
    const hasLogs = !!(
      dayNutrition &&
      ((Array.isArray(dayNutrition.breakfast) && dayNutrition.breakfast.length > 0) ||
        (Array.isArray(dayNutrition.lunch) && dayNutrition.lunch.length > 0) ||
        (Array.isArray(dayNutrition.dinner) && dayNutrition.dinner.length > 0) ||
        (Array.isArray(dayNutrition.snacks) && dayNutrition.snacks.length > 0))
    )

    const isPast = date < todayLocal

    // If no logs AND not past (i.e. Today or Future), synthesize based on workouts
    if (!hasLogs && !isPast) {
      simulationMeals = this.synthesizeRefills(
        date,
        dayWorkouts,
        { weight: user?.weight || 75, ftp: user?.ftp || 250, ...settings },
        timezone
      )
    }

    const points = calculateEnergyTimeline(
      dayNutrition || {
        date: date.toISOString(),
        carbsGoal: settings.fuelState1Min * (user?.weight || 75)
      },
      dayWorkouts,
      settings,
      timezone,
      undefined,
      {
        startingGlycogenPercentage: startingGlycogen,
        startingFluidDeficit: startingFluid,
        crossDayMeals: simulationMeals
      }
    )

    // DERIVE LIVE STATUS FROM POINTS (SINGLE SOURCE OF TRUTH)
    const nowTs = currentTime.getTime()
    const nowIdx = points.findIndex((p) => p.timestamp > nowTs)
    const activePoint = nowIdx > 0 ? points[nowIdx - 1] : points[points.length - 1]

    const percentage = activePoint?.level ?? 85

    // Get advice and breakdown using the same data
    // We still use calculateGlycogenState for the breakdown formatting, but force the percentage
    const summary = calculateGlycogenState(
      dayNutrition || {
        date: date.toISOString(),
        carbsGoal: settings.fuelState1Min * (user?.weight || 75)
      },
      dayWorkouts,
      settings,
      timezone,
      currentTime,
      startingGlycogen
    )

    return {
      points,
      dayNutrition,
      liveStatus: {
        ...summary,
        percentage // Force match with chart point
      }
    }
  },

  /**
   * Canonical meal-target context for recommendation systems.
   * Derives "what to eat now" from the same metabolic timeline and fueling windows.
   */
  async getMealTargetContext(userId: string, date: Date, now: Date = new Date()) {
    const timezone = await getUserTimezone(userId)
    const state = await this.getMetabolicState(userId, date)
    const { points, dayNutrition, liveStatus } = await this.getDailyTimeline(
      userId,
      date,
      state.startingGlycogen,
      state.startingFluid,
      now
    )

    const currentPoint =
      [...points].reverse().find((p) => p.timestamp <= now.getTime()) || points[0]

    const computedPlan = dayNutrition?.fuelingPlan
      ? { plan: dayNutrition.fuelingPlan as any }
      : await this.calculateFuelingPlanForDate(userId, date, { persist: false })
    const plan = computedPlan.plan as any

    const windows = Array.isArray(plan?.windows)
      ? [...plan.windows]
          .map((w: any) => ({
            ...w,
            start: new Date(w.startTime),
            end: new Date(w.endTime)
          }))
          .filter((w: any) => !isNaN(w.start.getTime()) && !isNaN(w.end.getTime()))
          .sort((a: any, b: any) => a.start.getTime() - b.start.getTime())
      : []

    const meals = ['breakfast', 'lunch', 'dinner', 'snacks'] as const
    const loggedItems = meals.flatMap((meal) => {
      const mealItems =
        dayNutrition && Array.isArray((dayNutrition as any)[meal])
          ? (dayNutrition as any)[meal]
          : []
      return mealItems.map((item: any) => {
        const timeVal = item.logged_at || item.date
        let at: Date | null = null
        if (typeof timeVal === 'string' && /^\d{1,2}:\d{2}$/.test(timeVal)) {
          at = buildZonedDateTimeFromUtcDate(date, timeVal, timezone)
        } else if (timeVal) {
          const d = new Date(timeVal)
          if (!isNaN(d.getTime())) at = d
        }
        return { ...item, at }
      })
    })

    const windowProgress = windows.map((w: any) => {
      const actualCarbs = loggedItems
        .filter((i: any) => i.at && i.at >= w.start && i.at <= w.end)
        .reduce((sum: number, i: any) => sum + (i.carbs || 0), 0)
      const targetCarbs = w.targetCarbs || 0
      return {
        type: w.type,
        startTime: w.start.toISOString(),
        endTime: w.end.toISOString(),
        workoutTitle: w.workoutTitle,
        targetCarbs,
        actualCarbs,
        unmetCarbs: Math.max(0, targetCarbs - actualCarbs)
      }
    })

    const activeOrNext = windowProgress.find((w) => new Date(w.endTime).getTime() >= now.getTime())

    let suggestedIntakeNow: any = null
    if (activeOrNext && activeOrNext.unmetCarbs > 0) {
      const minutesToStart = Math.round(
        (new Date(activeOrNext.startTime).getTime() - now.getTime()) / 60000
      )
      const inWindow =
        minutesToStart <= 0 && new Date(activeOrNext.endTime).getTime() > now.getTime()

      let absorptionType: 'RAPID' | 'FAST' | 'BALANCED' | 'DENSE' | 'HYPER_LOAD' = 'DENSE'
      if (inWindow || minutesToStart <= 30) absorptionType = 'RAPID'
      else if (minutesToStart <= 60) absorptionType = 'FAST'
      else if (minutesToStart <= 120) absorptionType = 'BALANCED'

      const carbCap = inWindow ? 30 : minutesToStart <= 60 ? 45 : minutesToStart <= 120 ? 60 : 80
      const carbs = Math.max(10, Math.round(Math.min(activeOrNext.unmetCarbs, carbCap)))

      suggestedIntakeNow = {
        carbs,
        absorptionType,
        timing: inWindow ? 'Now (in fueling window)' : `In ~${Math.max(0, minutesToStart)} min`,
        basedOnWindowType: activeOrNext.type
      }
    }

    return {
      timezone,
      dateKey: formatDateUTC(date),
      currentTank: {
        percentage: liveStatus.percentage,
        state: liveStatus.state,
        advice: liveStatus.advice,
        pointLevel: currentPoint?.level ?? liveStatus.percentage
      },
      nextFuelingWindow: activeOrNext || null,
      windowProgress,
      suggestedIntakeNow
    }
  },

  /**
   * Ensures that the metabolic state (starting glycogen/fluid) is calculated for a given date.
   * If missing, it recursively (up to 7 days) finalizes previous days.
   */
  async ensureMetabolicState(
    userId: string,
    targetDate: Date,
    recursionDepth: number = 0
  ): Promise<{
    startingGlycogen: number
    startingFluid: number
  }> {
    // FAST PATH: Check if we already have a finalized starting state for this day
    const targetRecord = await nutritionRepository.getByDate(userId, targetDate)
    if (targetRecord?.startingGlycogenPercentage != null) {
      return {
        startingGlycogen: targetRecord.startingGlycogenPercentage,
        startingFluid: targetRecord.startingFluidDeficit ?? 0
      }
    }

    const yesterday = new Date(targetDate)
    yesterday.setUTCDate(targetDate.getUTCDate() - 1)

    // Check if yesterday is in the future relative to "Real Today"
    const timezone = await getUserTimezone(userId)
    const todayLocal = getUserLocalDate(timezone)

    // If yesterday is Future OR (Past/Today and we are within recursion limit), simulate it.
    // We prefer simulation over DB lookup to ensure dynamic continuity, unless we hit depth limit.
    const shouldSimulate = yesterday >= todayLocal || recursionDepth < 5

    if (shouldSimulate) {
      // 1. Get Yesterday's Starting State (recursive)
      // If we hit depth limit, this next call will fall back to DB lookup or default
      const yesterdayState = await this.ensureMetabolicState(userId, yesterday, recursionDepth + 1)

      let currentGlycogen = yesterdayState.startingGlycogen
      let currentFluid = yesterdayState.startingFluid

      // 2. Simulate Yesterday to get its Ending State (which is Target's Starting State)
      // Using centralized getDailyTimeline logic
      const { points, dayNutrition } = await this.getDailyTimeline(
        userId,
        yesterday,
        currentGlycogen,
        currentFluid
      )

      const lastPoint = points[points.length - 1]
      if (lastPoint) {
        currentGlycogen = lastPoint.level
        currentFluid = Math.max(0, lastPoint.fluidDeficit)
      }

      // PERSISTENCE: Link the chain
      // 1. Update Yesterday's Ending State
      if (dayNutrition) {
        await nutritionRepository.update(dayNutrition.id, {
          endingGlycogenPercentage: currentGlycogen,
          endingFluidDeficit: currentFluid
        })
      } else {
        await nutritionRepository.create({
          userId,
          date: yesterday,
          endingGlycogenPercentage: currentGlycogen,
          endingFluidDeficit: currentFluid,
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0
        })
      }

      // 2. Update Today's Starting State
      if (targetRecord) {
        await nutritionRepository.update(targetRecord.id, {
          startingGlycogenPercentage: currentGlycogen,
          startingFluidDeficit: currentFluid
        })
      } else {
        await nutritionRepository.create({
          userId,
          date: targetDate,
          startingGlycogenPercentage: currentGlycogen,
          startingFluidDeficit: currentFluid,
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0
        })
      }

      return {
        startingGlycogen: currentGlycogen,
        startingFluid: currentFluid
      }
    }

    // BASE CASE: Recursion limit reached or we decided to trust DB (e.g. deep past)
    const yesterdayRecord = await nutritionRepository.getByDate(userId, yesterday)

    const endingGlycogen = yesterdayRecord?.endingGlycogenPercentage ?? 85
    const endingFluid = yesterdayRecord?.endingFluidDeficit ?? 0

    return {
      startingGlycogen: endingGlycogen,
      startingFluid: Math.max(0, endingFluid)
    }
  },

  /**
   * Read-only state resolver.
   * Computes starting glycogen/fluid for target day without mutating DB records.
   */
  async getMetabolicState(
    userId: string,
    targetDate: Date,
    recursionDepth: number = 0
  ): Promise<{
    startingGlycogen: number
    startingFluid: number
  }> {
    const yesterday = new Date(targetDate)
    yesterday.setUTCDate(targetDate.getUTCDate() - 1)

    if (recursionDepth >= 5) {
      const yesterdayRecord = await nutritionRepository.getByDate(userId, yesterday)
      return {
        startingGlycogen: yesterdayRecord?.endingGlycogenPercentage ?? 85,
        startingFluid: Math.max(0, yesterdayRecord?.endingFluidDeficit ?? 0)
      }
    }

    const yesterdayState = await this.getMetabolicState(userId, yesterday, recursionDepth + 1)
    const { points } = await this.getDailyTimeline(
      userId,
      yesterday,
      yesterdayState.startingGlycogen,
      yesterdayState.startingFluid
    )

    const lastPoint = points[points.length - 1]
    if (!lastPoint) {
      return {
        startingGlycogen: 85,
        startingFluid: 0
      }
    }

    return {
      startingGlycogen: lastPoint.level,
      startingFluid: Math.max(0, lastPoint.fluidDeficit)
    }
  },

  /**
   * Calculates and saves the ending metabolic state for a specific day.
   */
  async finalizeDay(userId: string, date: Date) {
    const timezone = await getUserTimezone(userId)
    const settings = await getUserNutritionSettings(userId)

    // 1. Get current day's record
    let record = await nutritionRepository.getByDate(userId, date)
    if (!record) {
      // Create empty record if missing to anchor the chain
      record = await nutritionRepository.create({
        userId,
        date,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0
      })
    }

    // 2. Get Starting State (from day before)
    const yesterday = new Date(date)
    yesterday.setUTCDate(date.getUTCDate() - 1)
    const yesterdayRecord = await nutritionRepository.getByDate(userId, yesterday)

    const prevEndingGlycogen = yesterdayRecord?.endingGlycogenPercentage ?? 85
    const prevEndingFluid = yesterdayRecord?.endingFluidDeficit ?? 0

    const startingGlycogen = prevEndingGlycogen

    // 3. Run Simulation
    const rangeStart = getStartOfDayUTC(timezone, date)
    const rangeEnd = getEndOfDayUTC(timezone, date)
    const workouts = await workoutRepository.getForUser(userId, {
      startDate: rangeStart,
      endDate: rangeEnd,
      includeDuplicates: false
    })

    const timeline = calculateEnergyTimeline(record, workouts, settings, timezone, undefined, {
      startingGlycogenPercentage: startingGlycogen,
      startingFluidDeficit: prevEndingFluid
    })

    const lastPoint = timeline[timeline.length - 1]
    if (lastPoint) {
      await nutritionRepository.update(record.id, {
        endingGlycogenPercentage: lastPoint.level,
        endingFluidDeficit: lastPoint.fluidDeficit
      })

      // 4. Trigger Alerts if Today is the target
      const todayLocal = getUserLocalDate(timezone)
      if (date.toISOString().split('T')[0] === todayLocal.toISOString().split('T')[0]) {
        await this.checkCriticalAlerts(userId, startingGlycogen, date)
      }
    }
  },

  /**
   * Generates a multi-day predictive wave (historical + current + future).
   */
  async generateExtendedWave(userId: string, daysAhead: number = 3) {
    const timezone = await getUserTimezone(userId)
    const today = getUserLocalDate(timezone)
    const startDate = new Date(today)
    startDate.setUTCDate(today.getUTCDate() - 1) // Start from yesterday for context

    const endDate = new Date(today)
    endDate.setUTCDate(today.getUTCDate() + daysAhead)

    return this.getWaveRange(userId, startDate, endDate)
  },

  /**
   * Canonical range-based wave generator.
   * This is the single computation path for activity sparkline and extended wave charts.
   */
  async getWaveRange(userId: string, startDate: Date, endDate: Date) {
    const timezone = await getUserTimezone(userId)
    const todayKey = formatDateUTC(getUserLocalDate(timezone))
    const allPoints: any[] = []

    const firstDayState = await this.getMetabolicState(userId, startDate)
    let currentStartingGlycogen = firstDayState.startingGlycogen
    let currentStartingFluid = firstDayState.startingFluid

    const daysDiff = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    for (let i = 0; i <= daysDiff; i++) {
      const date = new Date(startDate)
      date.setUTCDate(startDate.getUTCDate() + i)
      const dateStr = formatDateUTC(date)
      const dataType =
        dateStr < todayKey ? 'historical' : dateStr === todayKey ? 'current' : 'future'

      const { points } = await this.getDailyTimeline(
        userId,
        date,
        currentStartingGlycogen,
        currentStartingFluid
      )

      allPoints.push(
        ...points.map((p) => ({
          ...p,
          dateKey: dateStr,
          dataType
        }))
      )

      const lastPoint = points[points.length - 1]
      if (lastPoint) {
        currentStartingGlycogen = lastPoint.level
        currentStartingFluid = lastPoint.fluidDeficit
      } else {
        currentStartingGlycogen = 85
        currentStartingFluid = 0
      }
    }

    return allPoints
  },

  /**
   * Computes a daily fueling plan synchronously.
   * Optional persistence keeps backward compatibility while enabling real-time on-demand generation.
   */
  async calculateFuelingPlanForDate(
    userId: string,
    date: Date,
    options: { persist?: boolean } = {}
  ) {
    const persist = options.persist ?? true
    const targetDateStart = new Date(date)
    targetDateStart.setUTCHours(0, 0, 0, 0)
    const targetDateEnd = new Date(targetDateStart)
    targetDateEnd.setUTCHours(23, 59, 59, 999)

    const existingNutrition = await nutritionRepository.getByDate(userId, targetDateStart)
    if (persist && existingNutrition?.isManualLock) {
      return {
        success: true,
        skipped: true,
        reason: 'MANUAL_LOCK',
        plan: existingNutrition.fuelingPlan
      }
    }

    const settings = await getUserNutritionSettings(userId)
    const timezone = await getUserTimezone(userId)
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

    const contexts: any[] = []
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

    const combinedWindows: any[] = []
    const combinedNotes: string[] = []
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

    // Determine the dominant fuel state for the day
    const dominantState = contexts.reduce((max, ctx) => {
      const plan = calculateFuelingStrategy(profile, ctx)
      return Math.max(max, plan.dailyTotals.fuelState)
    }, 1)

    const breakdown = calculateDailyCalorieBreakdown(profile, contexts)
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
        fuelState: dominantState,
        workoutCalories: breakdown.workouts.map((w) => ({ title: w.title, calories: w.calories }))
      }
    }

    if (persist) {
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
    }

    return {
      success: true,
      skipped: false,
      plan: finalPlan
    }
  },

  /**
   * Fetches and synthesizes future fueling targets for the next few days.
   * Includes both planned workout windows and daily baseline meals.
   * Implements physiological caps and carb-loading distribution.
   */
  async getUpcomingFuelingWindows(userId: string, daysAhead: number = 7) {
    const timezone = await getUserTimezone(userId)
    const today = getUserLocalDate(timezone)
    const settings = await getUserNutritionSettings(userId)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { weight: true }
    })
    const weight = user?.weight || 75
    const MEAL_CAP = weight * 2.0 // 2.0g/kg per sitting

    const days: any[] = []

    // Pass 1: Generate daily plans and baseline slots
    for (let i = 0; i < daysAhead; i++) {
      const date = new Date(today)
      date.setUTCDate(today.getUTCDate() + i)
      const dateStr = formatDateUTC(date)

      const dayPlan = await this.calculateFuelingPlanForDate(userId, date, { persist: false })
      const plan = dayPlan.plan as any

      const windows = [...(plan?.windows || [])]

      // Add DAILY_BASE slots from pattern
      const pattern =
        settings.mealPattern && settings.mealPattern.length > 0
          ? settings.mealPattern
          : [
              { name: 'Breakfast', time: '08:00' },
              { name: 'Lunch', time: '13:00' },
              { name: 'Dinner', time: '19:00' }
            ]

      pattern.forEach((p: any) => {
        const startTime = buildZonedDateTimeFromUtcDate(date, p.time, timezone)
        const endTime = new Date(startTime.getTime() + 60 * 60 * 1000)

        windows.push({
          type: 'DAILY_BASE',
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          targetCarbs: 0, // Distributed in Pass 2
          targetProtein: Math.round((weight * 1.6) / pattern.length),
          targetFat: Math.round((weight * 1.0) / pattern.length),
          description: `Daily baseline ${p.name.toLowerCase()}.`,
          status: 'PENDING'
        })
      })

      days.push({
        date,
        dateKey: dateStr,
        carbsGoal: plan.dailyTotals.carbs,
        windows: mergeFuelingWindows(windows)
      })
    }

    // Pass 2: Distribute carbs with physiological caps, flowing debt BACKWARDS (Carb Loading)
    let carryOverDebt = 0
    for (let i = days.length - 1; i >= 0; i--) {
      const day = days[i]
      const totalToAllocate = day.carbsGoal + carryOverDebt

      // 1. Fixed Windows (Intra-Workout is exempt from stationary cap but has its own 90g/hr cap)
      const intraWindows = day.windows.filter((w: any) => w.type === 'INTRA_WORKOUT')
      const stationaryWindows = day.windows.filter(
        (w: any) => w.type !== 'INTRA_WORKOUT' && w.type !== 'WORKOUT_EVENT'
      )

      let allocated = 0
      intraWindows.forEach((w: any) => (allocated += w.targetCarbs))

      // 2. Stationary Windows (Capped at 2.0g/kg)
      let remainingForStationary = totalToAllocate - allocated

      // Sort stationary windows to prioritize those already containing PRE/POST info
      const sortedStationary = [...stationaryWindows].sort((a: any, b: any) => {
        const aPri = a.type.includes('WORKOUT') ? 0 : 1
        const bPri = b.type.includes('WORKOUT') ? 0 : 1
        return aPri - bPri
      })

      // Evenly distribute into stationary slots but clamp each to MEAL_CAP
      const baseShare = Math.max(0, remainingForStationary) / (sortedStationary.length || 1)

      sortedStationary.forEach((w: any) => {
        // If it was already a PRE/POST, it might have an engine target.
        // We add the baseline share to it, then cap the result.
        const currentAmount = w.targetCarbs || 0
        const newAmount = Math.min(MEAL_CAP, currentAmount + baseShare)
        w.targetCarbs = Math.round(newAmount)
        allocated += w.targetCarbs
        remainingForStationary -= w.targetCarbs
      })

      // Flow any unallocated "Mega-Debt" to the day before
      carryOverDebt = Math.max(0, totalToAllocate - allocated)
    }

    // Pass 3: Finalize Labels and Advice
    const allWindowsSorted = days
      .flatMap((d) => d.windows)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

    return allWindowsSorted.map((w) => {
      const mealName = this.getMealSlotName(new Date(w.startTime), timezone)
      let label = mealName

      if (w.type === 'PRE_WORKOUT') label = `Pre-Workout ${mealName}`
      else if (w.type === 'POST_WORKOUT') label = `Post-Workout ${mealName}`
      else if (w.type === 'INTRA_WORKOUT') label = 'Intra-Workout Fueling'
      else if (w.type === 'TRANSITION') label = `${mealName} (Lead-up)`

      // Contextual Advice
      let advice = w.description
      if (w.type === 'INTRA_WORKOUT')
        advice = 'Direct performance fueling; focus on rapid absorption.'
      else if (w.type === 'DAILY_BASE' || w.type === 'TRANSITION') {
        advice =
          w.targetCarbs > weight * 1.5
            ? `Strategic carb-load: High-carb ${mealName.toLowerCase()} to build glycogen reserves.`
            : `Balanced ${mealName.toLowerCase()} to maintain base energy.`
      }

      return {
        ...w,
        label,
        advice,
        isSynthetic: true
      }
    })
  },

  /**
   * Identifies the human meal slot name based on time of day.
   */
  getMealSlotName(date: Date, timezone: string): string {
    const hour = parseInt(formatUserTime(date, timezone, 'H'))
    if (hour >= 5 && hour < 11) return 'Breakfast'
    if (hour >= 11 && hour < 16) return 'Lunch'
    if (hour >= 17 && hour < 22) return 'Dinner'
    return 'Snack'
  },

  /**
   * Creates synthetic meals based on Fuel State targets for unlogged future windows.
   */
  synthesizeRefills(date: Date, workouts: any[], profile: any, timezone: string): any[] {
    const syntheticMeals: any[] = []

    // For future days, we look at the PRIMARY workout to determine Fuel State
    const primaryWorkout = workouts.find((w) => w.type !== 'Rest') || {
      type: 'Rest',
      durationSec: 0,
      workIntensity: 0.5
    }

    // Use calculateFuelingStrategy to get targets
    const plan = calculateFuelingStrategy(profile, {
      ...primaryWorkout,
      date,
      startTime: primaryWorkout.startTime
        ? buildZonedDateTimeFromUtcDate(date, primaryWorkout.startTime, timezone)
        : null
    } as any)

    for (const window of plan.windows) {
      if (window.targetCarbs > 0) {
        syntheticMeals.push({
          time: new Date(window.startTime),
          totalCarbs: window.targetCarbs,
          totalKcal: window.targetCarbs * 4,
          profile:
            window.type === 'INTRA_WORKOUT'
              ? ABSORPTION_PROFILES.RAPID
              : ABSORPTION_PROFILES.BALANCED,
          isSynthetic: true
        })
      }
    }

    // Add Daily Base refills if no windows (or in between)
    if (syntheticMeals.length === 0) {
      // Add standard 3-meal pattern from settings or default
      const pattern = profile.mealPattern || [
        { name: 'Breakfast', time: '08:00' },
        { name: 'Lunch', time: '13:00' },
        { name: 'Dinner', time: '19:00' }
      ]

      const carbPerMeal = (profile.weight * 4) / pattern.length // Assume 4g/kg base

      for (const p of pattern) {
        syntheticMeals.push({
          time: buildZonedDateTimeFromUtcDate(date, p.time, timezone),
          totalCarbs: carbPerMeal,
          totalKcal: carbPerMeal * 4,
          profile: ABSORPTION_PROFILES.BALANCED,
          isSynthetic: true
        })
      }
    }

    return syntheticMeals
  },

  async checkCriticalAlerts(userId: string, startingGlycogen: number, date: Date) {
    if (startingGlycogen < 20) {
      const workouts = await plannedWorkoutRepository.list(userId, {
        startDate: date,
        endDate: date,
        limit: 5
      })
      const morningHardWorkout = workouts.find((w) => (w.workIntensity || 0) > 0.85)

      if (morningHardWorkout) {
        // Log critical alert
        await prisma.auditLog.create({
          data: {
            userId,
            action: 'CRITICAL_FUELING_ALERT',
            resourceType: 'Nutrition',
            resourceId: date.toISOString(),
            metadata: {
              startingGlycogen,
              workoutTitle: morningHardWorkout.title
            }
          }
        })
      }
    }
  }
}
