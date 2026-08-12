import { createError } from 'h3'
import { dailyBaseWindowKey } from '../../../shared/window-keys'
import { prisma } from '../db'
import { nutritionRepository } from '../repositories/nutritionRepository'
import { workoutRepository } from '../repositories/workoutRepository'
import { plannedWorkoutRepository } from '../repositories/plannedWorkoutRepository'
import { remediationService } from './remediationService'
import {
  getUserTimezone,
  getUserLocalDate,
  getStartOfDayUTC,
  getEndOfDayUTC,
  buildZonedDateTimeFromUtcDate,
  formatDateUTC,
  formatUserTime
} from '../date'
import {
  calculateEnergyTimeline,
  calculateGlycogenState,
  buildDayFuelingPlan,
  carryForwardGlycogen,
  estimateDailyCarbTargetGrams,
  selectRelevantWorkouts,
  synthesizeRefills,
  ABSORPTION_PROFILES,
  getAbsorbedInInterval,
  getProfileForItem,
  getDateKey
} from '../nutrition-domain'
import { HYDRATION_DEBT_NUDGE_THRESHOLD_ML, MEAL_LINKED_WATER_ML } from '../nutrition/hydration'
import { getUserNutritionSettings } from '../nutrition/settings'
import { bodyMetricResolver } from './bodyMetricResolver'
import { auditLogRepository } from '../repositories/auditLogRepository'

interface FuelingWindow {
  type: string
  startTime: string
  endTime: string
  workoutTitle?: string
  targetCarbs?: number
  targetProtein?: number
  targetFat?: number
  description?: string
  status?: string
  slotName?: string
}

async function resolveWeightKg(
  userId: string,
  user?: { weight?: number | null; weightSourceMode?: string | null } | null
) {
  const effectiveWeight = await bodyMetricResolver.resolveEffectiveWeight(userId, {
    weight: user?.weight,
    weightSourceMode: user?.weightSourceMode
  })

  return effectiveWeight.value || 75
}

interface NutritionPlanSummary {
  windows?: FuelingWindow[]
  dailyTotals?: {
    carbs: number
    protein: number
    fat: number
    calories: number
  }
}

/**
 * Hard ceiling on the span `getWaveRange` will simulate, in days (inclusive of both ends).
 *
 * The wave simulation produces ~97 timeline points per day and issues per-day work, so the cost of
 * a call is linear in the span. Without a bound, a single request asking for years of wave burns
 * thousands of times the intended CPU/DB budget (CW-73).
 *
 * This is the *defensive* limit — the last line of defence for any caller, including ones that
 * forget to validate. HTTP handlers apply their own, stricter limits (see
 * `MAX_WAVE_RANGE_DAYS` in `server/api/nutrition/metabolic-wave.get.ts` and the `daysAhead`
 * clamp in `extended-wave.get.ts`); this one only exists so that no caller can ever get past it.
 */
export const MAX_WAVE_RANGE_SPAN_DAYS = 92

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Inclusive span of a date range in whole days (same day => 1).
 */
export function waveRangeSpanDays(startDate: Date, endDate: Date) {
  return Math.floor((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) + 1
}

export const metabolicService = {
  getDailyBaseWindowKey(slotName?: string) {
    // Canonical slugifier shared with the generator and the app; a drifted local copy here once
    // produced 'DAILY_BASE:lunch-' for 'Lunch!' and unlinked the stored meal.
    return dailyBaseWindowKey(slotName)
  },

  /**
   * Stable persistence key for a window. Several windows of the same type can exist on one day
   * (two sessions => two PRE windows), so the type alone is not an identity.
   */
  getWindowKey(window: any, timezone: string): string {
    if (window?.windowKey) return String(window.windowKey)

    if (window?.type === 'DAILY_BASE') {
      const slotName = (
        window.slotName ||
        window.label ||
        this.getMealSlotName(new Date(window.startTime), timezone)
      )
        ?.toString()
        ?.trim()
      return this.getDailyBaseWindowKey(slotName)
    }

    // Windows persisted before stable keys existed carry no ordinal; treat them as the first.
    return `${window?.type}#1`
  },

  matchPlanMealToWindow(planMeal: any, window: any, timezone: string) {
    if (!planMeal || !window) return false

    const windowKey = this.getWindowKey(window, timezone)
    if (planMeal.windowType === windowKey) return true

    // Backwards compatibility: rows written before stable keys used the bare window type, which
    // could only ever address the first window of that type on the day.
    if (planMeal.windowType === window.type && windowKey === `${window.type}#1`) return true

    if (window.type === 'DAILY_BASE' && planMeal.windowType === 'DAILY_BASE') return true

    return false
  },

  /**
   * The label to show for a window that may already carry one from a previous generation.
   *
   * A stored label used to win outright, so once a window had been labelled from the time of day it
   * kept that label forever - production plans exist with `slotName: "Snack"` and `label: "Lunch"`
   * on the same window, which renders as two "Lunch" headings on one day. The slot name is the
   * athlete's own word for the meal and is what the window key is built from, so whenever there is
   * one the label is recomputed from it.
   */
  resolveWindowDisplayLabel(window: any, timezone: string): string {
    if (window?.slotName) return this.buildWindowLabel(window, timezone)
    return window?.label || this.buildWindowLabel(window, timezone)
  },

  /**
   * Human-facing window label, e.g. "Pre-Workout Breakfast" or "Intra-Workout Fueling".
   */
  buildWindowLabel(window: any, timezone: string): string {
    const configuredSlotName =
      typeof window?.slotName === 'string' && window.slotName.trim() ? window.slotName.trim() : null
    const mealName =
      configuredSlotName || this.getMealSlotName(new Date(window.startTime), timezone)

    if (window?.type === 'PRE_WORKOUT') return `Pre-Workout ${mealName}`
    if (window?.type === 'POST_WORKOUT') return `Post-Workout ${mealName}`
    if (window?.type === 'INTRA_WORKOUT') return 'Intra-Workout Fueling'
    if (window?.type === 'TRANSITION') return `${mealName} (Lead-up)`
    return mealName
  },

  isActivePlanMeal(planMeal: any) {
    const status = String(planMeal?.status || 'PLANNED').toUpperCase()
    return status !== 'SKIPPED' && status !== 'REPLACED'
  },

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
      select: { weight: true, weightSourceMode: true }
    })

    const weightKg = await resolveWeightKg(userId, user)

    return calculateGlycogenState(
      dayNutrition || {
        date: date.toISOString(),
        carbsGoal: settings.fuelState1Min * weightKg
      },
      dayWorkouts,
      { ...settings, weight: weightKg }, // Inject converted weight
      timezone,
      currentTime,
      startingGlycogen
    )
  },

  /**
   * Internal helper to get merged workouts for a date (completed + planned-but-not-yet-completed).
   */
  async getRelevantWorkouts(userId: string, date: Date, timezone: string) {
    const rangeStart = getStartOfDayUTC(timezone, date)
    const rangeEnd = getEndOfDayUTC(timezone, date)

    const [completed, planned] = await Promise.all([
      workoutRepository.getForUser(userId, { startDate: rangeStart, endDate: rangeEnd }),
      plannedWorkoutRepository.list(userId, { startDate: date, endDate: date })
    ])

    return selectRelevantWorkouts(completed, planned)
  },

  /**
   * Internal helper to get only completed (real, logged) workouts for a date - no planned/ghost
   * sessions. Used for days being treated as final, where a workout that was planned but never
   * actually completed must not be simulated as though it happened.
   */
  async getCompletedWorkoutsOnly(userId: string, date: Date, timezone: string) {
    const rangeStart = getStartOfDayUTC(timezone, date)
    const rangeEnd = getEndOfDayUTC(timezone, date)

    return workoutRepository.getForUser(userId, {
      startDate: rangeStart,
      endDate: rangeEnd,
      includeDuplicates: false
    })
  },

  /**
   * Canonical single-day metabolic simulation core, shared by `finalizeDay` and `getDailyTimeline`
   * (CW-76).
   *
   * These two used to duplicate this math with different inputs - `finalizeDay` used completed
   * workouts and real logged nutrition only, while `getDailyTimeline` unconditionally merged in
   * planned-but-not-yet-completed workouts and, when nothing was logged, synthetic meal
   * projections. Their `endingGlycogenPercentage` values could drift apart by more than the 1%
   * tolerance the day-to-day handoff (`getMetabolicStateForDate` / `repairMetabolicChain`) depends
   * on, bypassing the fast path and forcing a full re-simulation on every read.
   *
   * Policy for what a day's simulation should include:
   *  - `includePlannedWorkouts: false` / `synthesizeMealsIfUnlogged: false` - "finalized" mode.
   *    A day that has already ended is closed out on what actually happened: completed workouts and
   *    real logged nutrition. A planned-but-never-completed workout is a ghost session that didn't
   *    happen and must not drain the tank; a synthetic meal projects a *future* meal-planning
   *    assumption that no longer applies once the day is over - the real (possibly empty) log is
   *    what should be trusted instead.
   *  - `includePlannedWorkouts: true` / `synthesizeMealsIfUnlogged: true` - "projected" mode. Today
   *    or a future day has no "what actually happened" yet for hours that have not occurred, so
   *    planned workouts and synthesized meal refills legitimately stand in for real data that
   *    doesn't exist yet.
   *
   * `finalizeDay` always simulates in finalized mode - it exists specifically to close a day out.
   * `getDailyTimeline` picks the mode per call based on whether the requested date is already in
   * the past, so simulating a past day here agrees with what `finalizeDay` persisted for it, while
   * today/future behavior (planned workouts + synthetic meals) is unchanged.
   */
  async simulateDayCore(
    userId: string,
    date: Date,
    startingGlycogen: number,
    startingFluid: number,
    policy: { includePlannedWorkouts: boolean; synthesizeMealsIfUnlogged: boolean },
    currentTime: Date = new Date()
  ): Promise<{
    points: any[]
    dayNutrition: any
    dayWorkouts: any[]
    timezone: string
    settings: any
    weightKg: number
    user: { weight?: number | null; weightSourceMode?: string | null; ftp?: number | null } | null
  }> {
    const timezone = await getUserTimezone(userId)
    const settings = await getUserNutritionSettings(userId)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { weight: true, weightSourceMode: true, ftp: true }
    })

    const weightKg = await resolveWeightKg(userId, user)

    const dayWorkouts = policy.includePlannedWorkouts
      ? await this.getRelevantWorkouts(userId, date, timezone)
      : await this.getCompletedWorkoutsOnly(userId, date, timezone)

    const dayNutrition = await nutritionRepository.getByDate(userId, date)

    const hasLogs = !!(
      dayNutrition &&
      ((Array.isArray(dayNutrition.breakfast) && dayNutrition.breakfast.length > 0) ||
        (Array.isArray(dayNutrition.lunch) && dayNutrition.lunch.length > 0) ||
        (Array.isArray(dayNutrition.dinner) && dayNutrition.dinner.length > 0) ||
        (Array.isArray(dayNutrition.snacks) && dayNutrition.snacks.length > 0))
    )

    const simulationMeals =
      policy.synthesizeMealsIfUnlogged && !hasLogs
        ? synthesizeRefills(
            date,
            dayWorkouts,
            { weight: weightKg, ftp: user?.ftp || 250, ...settings },
            timezone
          )
        : []

    const points = calculateEnergyTimeline(
      dayNutrition || {
        date: date.toISOString(),
        carbsGoal: settings.fuelState1Min * weightKg
      },
      dayWorkouts,
      { ...settings, weight: weightKg }, // Inject converted weight
      timezone,
      undefined,
      {
        startingGlycogenPercentage: startingGlycogen,
        startingFluidDeficit: startingFluid,
        crossDayMeals: simulationMeals,
        now: currentTime
      }
    )

    return { points, dayNutrition, dayWorkouts, timezone, settings, weightKg, user }
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
    const todayLocal = getUserLocalDate(timezone)
    // CW-76: a day that has already ended agrees with `finalizeDay` - completed workouts and real
    // logged nutrition only. Today/future behavior (planned workouts + synthetic meal projection
    // when unlogged) is unchanged.
    const isPast = date < todayLocal

    const { points, dayNutrition, dayWorkouts, settings, weightKg, user } =
      await this.simulateDayCore(
        userId,
        date,
        startingGlycogen,
        startingFluid,
        { includePlannedWorkouts: !isPast, synthesizeMealsIfUnlogged: !isPast },
        currentTime
      )

    const rangeStart = getStartOfDayUTC(timezone, date)
    const rangeEnd = getEndOfDayUTC(timezone, date)

    const journeyEvents = await prisma.athleteJourneyEvent.findMany({
      where: {
        userId,
        timestamp: {
          gte: rangeStart,
          lte: rangeEnd
        }
      },
      orderBy: { timestamp: 'asc' }
    })

    // DERIVE LIVE STATUS FROM POINTS (SINGLE SOURCE OF TRUTH)
    const nowTs = currentTime.getTime()
    const nowIdx = points.findIndex((p) => p.timestamp > nowTs)
    const activePoint = nowIdx > 0 ? points[nowIdx - 1] : points[points.length - 1]

    const percentage =
      activePoint?.level ?? (settings?.metabolicFloor ? settings.metabolicFloor * 100 : 60)

    // Get advice and breakdown using the same data
    // We still use calculateGlycogenState for the breakdown formatting, but force the percentage
    const summary = calculateGlycogenState(
      dayNutrition || {
        date: date.toISOString(),
        // Same reasoning as the projection in getWaveRange: a day without a saved plan still has a
        // real target, and defaulting to the lowest fuel state's minimum understates it.
        carbsGoal: estimateDailyCarbTargetGrams(
          { weight: weightKg, ftp: user?.ftp || 250, ...settings } as any,
          dayWorkouts as any,
          { date }
        )
      },
      dayWorkouts,
      { ...settings, weight: weightKg }, // Inject converted weight
      timezone,
      currentTime,
      startingGlycogen
    )

    return {
      points,
      dayNutrition,
      journeyEvents,
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
    const state = await this.getMetabolicStateForDate(userId, date)
    const { points, dayNutrition, liveStatus } = await this.getDailyTimeline(
      userId,
      date,
      state.startingGlycogen,
      state.startingFluid,
      now
    )

    const currentPoint =
      [...points].reverse().find((p) => p.timestamp <= now.getTime()) || points[0]

    const plan = await prisma.nutritionPlan.findFirst({
      where: {
        userId,
        startDate: { lte: date },
        endDate: { gte: date }
      },
      include: { meals: true }
    })

    const summary = plan?.summaryJson as unknown as NutritionPlanSummary
    const windows = Array.isArray(summary?.windows)
      ? [...(summary.windows as FuelingWindow[])]
          .map((w) => ({
            ...w,
            start: new Date(w.startTime),
            end: new Date(w.endTime)
          }))
          .filter((w) => !isNaN(w.start.getTime()) && !isNaN(w.end.getTime()))
          .sort((a, b) => a.start.getTime() - b.start.getTime())
      : []

    // If we don't have a plan with windows yet, we might need to compute them on the fly
    // but usually getting the target context implies we have windows.
    // Fallback to on-demand plan calculation if empty
    if (windows.length === 0) {
      const computed = await this.calculateFuelingPlanForDate(userId, date, { persist: false })
      const computedPlan = computed.plan as unknown as NutritionPlanSummary
      if (computedPlan?.windows) {
        windows.push(
          ...computedPlan.windows.map((w) => ({
            ...w,
            start: new Date(w.startTime),
            end: new Date(w.endTime)
          }))
        )
      }
    }

    const meals = ['breakfast', 'lunch', 'dinner', 'snacks'] as const
    const CARRYOVER_LOOKBACK_MIN = 120
    const WINDOW_CARRYOVER_CAP_RATIO: Record<string, number> = {
      PRE_WORKOUT: 0.6,
      INTRA_WORKOUT: 0.3,
      POST_WORKOUT: 0.4,
      TRANSITION: 0.5
    }
    const CARRYOVER_TYPES = new Set(['PRE_WORKOUT', 'INTRA_WORKOUT', 'POST_WORKOUT', 'TRANSITION'])

    const resolveAbsorptionProfile = (item: any) => {
      const absorptionType = String(item?.absorptionType || '').toUpperCase()
      if (absorptionType && absorptionType in ABSORPTION_PROFILES) {
        return ABSORPTION_PROFILES[absorptionType as keyof typeof ABSORPTION_PROFILES]
      }
      return getProfileForItem(item?.name || item?.product_name || item?.title)
    }

    const estimateAbsorbedFraction = (carbs: number, minsSinceIntake: number, profile: any) => {
      if (carbs <= 0 || minsSinceIntake <= 0) return 0
      let absorbed = 0
      const step = 5
      for (let t = 0; t < minsSinceIntake; t += step) {
        absorbed += getAbsorbedInInterval(t, Math.min(t + step, minsSinceIntake), carbs, profile)
      }
      return Math.max(0, Math.min(1, absorbed / carbs))
    }

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

    const dayActualCarbs = Math.max(0, Number((dayNutrition as any)?.carbs || 0))
    const inferredTargetFromWindows = windows.reduce(
      (sum, w: any) => sum + Math.max(0, Number(w.targetCarbs || 0)),
      0
    )
    const dayTargetCarbs = Math.max(
      0,
      Number(
        (dayNutrition as any)?.carbsGoal ||
          summary?.dailyTotals?.carbs ||
          inferredTargetFromWindows ||
          0
      )
    )
    const dayRemainingCarbs = Math.max(0, dayTargetCarbs - dayActualCarbs)

    const windowProgress = windows.map((w: any) => {
      const actualCarbs = loggedItems
        .filter((i: any) => i.at && i.at >= w.start && i.at <= w.end)
        .reduce((sum: number, i: any) => sum + (i.carbs || 0), 0)

      const lockedMeal = plan?.meals.find(
        (pm) =>
          this.isActivePlanMeal(pm) &&
          this.matchPlanMealToWindow(pm, w, timezone) &&
          pm.date.toISOString().split('T')[0] === date.toISOString().split('T')[0]
      )

      const targetCarbs = w.targetCarbs || 0
      const plannedCarbs = lockedMeal ? (lockedMeal.mealJson as any).totals.carbs : 0

      const rawUnmetCarbs = Math.max(0, targetCarbs - actualCarbs - plannedCarbs)
      let carryoverCredit = 0

      if (rawUnmetCarbs > 0 && CARRYOVER_TYPES.has(w.type)) {
        const windowStartMs = w.start.getTime()
        const lookbackStartMs = windowStartMs - CARRYOVER_LOOKBACK_MIN * 60 * 1000
        const capRatio = WINDOW_CARRYOVER_CAP_RATIO[w.type] ?? 0.4
        const maxCreditForWindow = Math.max(0, targetCarbs * capRatio)

        const weightedRecentCarbs = loggedItems
          .filter((i: any) => i.at)
          .map((i: any) => {
            const carbs = Math.max(0, Number(i.carbs || 0))
            const atMs = (i.at as Date).getTime()
            if (carbs <= 0 || atMs >= windowStartMs || atMs < lookbackStartMs) {
              return 0
            }

            const minsBeforeWindow = (windowStartMs - atMs) / 60000
            const recencyWeight = Math.max(
              0,
              Math.min(1, (CARRYOVER_LOOKBACK_MIN - minsBeforeWindow) / CARRYOVER_LOOKBACK_MIN)
            )
            const profile = resolveAbsorptionProfile(i)
            const absorbedFraction = estimateAbsorbedFraction(carbs, minsBeforeWindow, profile)
            const readinessWeight = 0.4 + absorbedFraction * 0.6

            return carbs * recencyWeight * readinessWeight
          })
          .reduce((sum: number, value: number) => sum + value, 0)

        carryoverCredit = Math.max(
          0,
          Math.min(rawUnmetCarbs, maxCreditForWindow, weightedRecentCarbs)
        )
      }

      const effectiveUnmetCarbs = Math.max(0, rawUnmetCarbs - carryoverCredit)
      const requiredCarbs = Math.max(0, Math.min(effectiveUnmetCarbs, dayRemainingCarbs))
      const timingOnly = dayRemainingCarbs <= 0 && effectiveUnmetCarbs > 0

      return {
        type: w.type,
        windowKey: this.getWindowKey(w, timezone),
        label: this.resolveWindowDisplayLabel(w, timezone),
        slotName: (w as any).slotName,
        startTime: w.start.toISOString(),
        endTime: w.end.toISOString(),
        workoutTitle: w.workoutTitle,
        targetCarbs,
        actualCarbs,
        plannedCarbs,
        planMealId: lockedMeal?.id || null,
        planMealStatus: lockedMeal?.status || null,
        lockedMeal: lockedMeal?.mealJson || null,
        unmetCarbs: rawUnmetCarbs,
        carryoverCredit: Math.round(carryoverCredit),
        requiredCarbs: Math.round(requiredCarbs),
        timingOnly
      }
    })

    const activeOrNext = windowProgress.find((w) => new Date(w.endTime).getTime() >= now.getTime())

    let suggestedIntakeNow: any = null
    if (activeOrNext && activeOrNext.requiredCarbs > 0) {
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
      const carbs = Math.max(0, Math.round(Math.min(activeOrNext.requiredCarbs, carbCap)))

      suggestedIntakeNow = {
        carbs,
        absorptionType,
        timing: inWindow ? 'Now (in fueling window)' : `In ~${Math.max(0, minutesToStart)} min`,
        basedOnWindowType: activeOrNext.type,
        // Identity of the window this suggestion is for, so locking a meal from the live feed
        // targets it rather than the first window that happens to share its type.
        basedOnWindowKey: activeOrNext.windowKey
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
      dailyCarbStatus: {
        actual: Math.round(dayActualCarbs),
        target: Math.round(dayTargetCarbs),
        remaining: Math.round(dayRemainingCarbs),
        reached: dayRemainingCarbs <= 0
      },
      suggestedIntakeNow
    }
  },

  /**
   * Read-only state resolver.
   * Computes starting glycogen/fluid for target day without mutating DB records.
   */
  async getMetabolicStateForDate(
    userId: string,
    targetDate: Date,
    recursionDepth: number = 0
  ): Promise<{
    startingGlycogen: number
    startingFluid: number
  }> {
    const targetRecord = await nutritionRepository.getByDate(userId, targetDate)
    const yesterday = new Date(targetDate)
    yesterday.setUTCDate(targetDate.getUTCDate() - 1)
    const yesterdayRecord = await nutritionRepository.getByDate(userId, yesterday)

    if (
      targetRecord?.startingGlycogenPercentage != null &&
      targetRecord?.startingFluidDeficit != null
    ) {
      const hasConsistentDbHandoff =
        yesterdayRecord?.endingGlycogenPercentage == null ||
        Math.abs(
          targetRecord.startingGlycogenPercentage - yesterdayRecord.endingGlycogenPercentage
        ) <= 1

      // Strong check: compare against simulated yesterday end to avoid trusting stale cached starts.
      if (recursionDepth >= 2 && hasConsistentDbHandoff) {
        return {
          startingGlycogen: targetRecord.startingGlycogenPercentage,
          startingFluid: Math.max(0, targetRecord.startingFluidDeficit)
        }
      }

      const yesterdayState = await this.getMetabolicStateForDate(
        userId,
        yesterday,
        recursionDepth + 1
      )
      const { points } = await this.getDailyTimeline(
        userId,
        yesterday,
        yesterdayState.startingGlycogen,
        yesterdayState.startingFluid
      )
      const lastPoint = points[points.length - 1]

      if (!lastPoint) {
        return {
          startingGlycogen: targetRecord.startingGlycogenPercentage,
          startingFluid: Math.max(0, targetRecord.startingFluidDeficit)
        }
      }

      const hasConsistentSimulatedHandoff =
        Math.abs(targetRecord.startingGlycogenPercentage - lastPoint.level) <= 1

      if (hasConsistentDbHandoff && hasConsistentSimulatedHandoff) {
        return {
          startingGlycogen: targetRecord.startingGlycogenPercentage,
          startingFluid: Math.max(0, targetRecord.startingFluidDeficit)
        }
      }

      return {
        startingGlycogen: lastPoint.level,
        startingFluid: Math.max(0, lastPoint.fluidDeficit)
      }
    }

    if (recursionDepth >= 5) {
      const dbValue = yesterdayRecord?.endingGlycogenPercentage
      const settings = await getUserNutritionSettings(userId)
      const metabolicFloor = settings?.metabolicFloor || 0.6
      return {
        startingGlycogen:
          dbValue !== null && dbValue !== undefined && dbValue > 0 ? dbValue : metabolicFloor * 100,
        startingFluid: Math.max(0, yesterdayRecord?.endingFluidDeficit ?? 0)
      }
    }

    const yesterdayState = await this.getMetabolicStateForDate(
      userId,
      yesterday,
      recursionDepth + 1
    )
    const { points } = await this.getDailyTimeline(
      userId,
      yesterday,
      yesterdayState.startingGlycogen,
      yesterdayState.startingFluid
    )

    const lastPoint = points[points.length - 1]
    if (!lastPoint) {
      const settings = await getUserNutritionSettings(userId)
      const metabolicFloor = settings?.metabolicFloor || 0.6
      return {
        startingGlycogen: metabolicFloor * 100,
        startingFluid: 0
      }
    }

    return {
      startingGlycogen: lastPoint.level,
      startingFluid: Math.max(0, lastPoint.fluidDeficit)
    }
  },

  /**
   * Ensures that the metabolic state (starting glycogen/fluid) is calculated for a given date.
   * If missing, it recursively (up to 7 days) finalizes previous days and persists results.
   */
  async repairMetabolicChain(
    userId: string,
    targetDate: Date,
    recursionDepth: number = 0
  ): Promise<{
    startingGlycogen: number
    startingFluid: number
  }> {
    // FAST PATH: Check if we already have a finalized starting state for this day
    const targetRecord = await nutritionRepository.getByDate(userId, targetDate)
    const yesterday = new Date(targetDate)
    yesterday.setUTCDate(targetDate.getUTCDate() - 1)
    const yesterdayRecord = await nutritionRepository.getByDate(userId, yesterday)

    if (targetRecord?.startingGlycogenPercentage != null) {
      const hasConsistentHandoff =
        yesterdayRecord?.endingGlycogenPercentage == null ||
        Math.abs(
          targetRecord.startingGlycogenPercentage - yesterdayRecord.endingGlycogenPercentage
        ) <= 1

      if (hasConsistentHandoff) {
        return {
          startingGlycogen: targetRecord.startingGlycogenPercentage,
          startingFluid: targetRecord.startingFluidDeficit ?? 0
        }
      }
    }

    // We prefer simulation over DB lookup to ensure dynamic continuity, but recursionDepth is an
    // unconditional cap. Without this, a targetDate far in the future keeps "yesterday" in the
    // future too (yesterday >= todayLocal stays true every level), so a future-dated call would
    // recurse once per day all the way from targetDate back to today instead of stopping at 5.
    const shouldSimulate = recursionDepth < 5

    if (shouldSimulate) {
      // 1. Get Yesterday's Starting State (recursive)
      // If we hit depth limit, this next call will fall back to DB lookup or default
      const yesterdayState = await this.repairMetabolicChain(userId, yesterday, recursionDepth + 1)

      let currentGlycogen = yesterdayState.startingGlycogen
      let currentFluid = yesterdayState.startingFluid

      // 2. Simulate Yesterday to get its Ending State (which is Target's Starting State)
      // Using centralized getDailyTimeline logic
      const { points } = await this.getDailyTimeline(
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
      // Upsert (keyed on the userId+date unique constraint) rather than a plain create, so
      // overlapping repair calls racing to persist the same missing day don't fail on the
      // @@unique([userId, date]) constraint.
      // 1. Update Yesterday's Ending State
      await nutritionRepository.upsert(
        userId,
        yesterday,
        {
          userId,
          date: yesterday,
          endingGlycogenPercentage: currentGlycogen,
          endingFluidDeficit: currentFluid,
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0
        },
        {
          endingGlycogenPercentage: currentGlycogen,
          endingFluidDeficit: currentFluid
        }
      )

      // 2. Update Today's Starting State
      await nutritionRepository.upsert(
        userId,
        targetDate,
        {
          userId,
          date: targetDate,
          startingGlycogenPercentage: currentGlycogen,
          startingFluidDeficit: currentFluid,
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0
        },
        {
          startingGlycogenPercentage: currentGlycogen,
          startingFluidDeficit: currentFluid
        }
      )

      return {
        startingGlycogen: currentGlycogen,
        startingFluid: currentFluid
      }
    }

    // BASE CASE: Recursion limit reached or we decided to trust DB (e.g. deep past)
    const settings = await getUserNutritionSettings(userId)
    const metabolicFloor = settings?.metabolicFloor || 0.6
    const endingGlycogen = yesterdayRecord?.endingGlycogenPercentage ?? metabolicFloor * 100
    const endingFluid = yesterdayRecord?.endingFluidDeficit ?? 0

    return {
      startingGlycogen: endingGlycogen,
      startingFluid: Math.max(0, endingFluid)
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

    const metabolicFloor = settings?.metabolicFloor || 0.6
    const prevEndingGlycogen = yesterdayRecord?.endingGlycogenPercentage ?? metabolicFloor * 100
    const prevEndingFluid = yesterdayRecord?.endingFluidDeficit ?? 0

    const startingGlycogen = prevEndingGlycogen

    // 3. Run Simulation - "finalized" mode (CW-76): completed workouts and real logged nutrition
    // only. This is the same core `getDailyTimeline` uses once a day is in the past, so the ending
    // state persisted here for tomorrow's handoff agrees with what a timeline read for this same
    // day would show - no planned-but-uncompleted ghost workouts, no synthetic meal projection.
    const { points: timeline } = await this.simulateDayCore(
      userId,
      date,
      startingGlycogen,
      prevEndingFluid,
      { includePlannedWorkouts: false, synthesizeMealsIfUnlogged: false }
    )

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
    // Defensive (CW-73): a non-finite daysAhead would silently produce an Invalid Date end bound.
    // The span itself is bounded by getWaveRange below.
    if (!Number.isFinite(daysAhead) || daysAhead < 0) {
      throw createError({
        statusCode: 400,
        message: 'daysAhead must be a non-negative number'
      })
    }

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
    // Defensive bounds (CW-73). Every caller is expected to validate its own input, but this is the
    // one place all wave computation funnels through, so an unbounded range must never get past it.
    if (
      !(startDate instanceof Date) ||
      !(endDate instanceof Date) ||
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime())
    ) {
      throw createError({
        statusCode: 400,
        message: 'getWaveRange requires valid start and end dates'
      })
    }

    if (endDate.getTime() < startDate.getTime()) {
      throw createError({
        statusCode: 400,
        message: 'getWaveRange requires endDate to be on or after startDate'
      })
    }

    const spanDays = waveRangeSpanDays(startDate, endDate)
    if (spanDays > MAX_WAVE_RANGE_SPAN_DAYS) {
      throw createError({
        statusCode: 400,
        message: `Requested wave range of ${spanDays} days exceeds the maximum of ${MAX_WAVE_RANGE_SPAN_DAYS} days`
      })
    }

    const startTime = Date.now()
    const timezone = await getUserTimezone(userId)
    const settings = await getUserNutritionSettings(userId)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { weight: true, weightSourceMode: true, ftp: true }
    })

    const weightKg = await resolveWeightKg(userId, user)

    const todayKey = formatDateUTC(getUserLocalDate(timezone))
    const allPoints: any[] = []
    const allWorkoutsInRange: any[] = []

    // 1. Get initial state
    const firstDayState = await this.getMetabolicStateForDate(userId, startDate)
    let currentStartingGlycogen = firstDayState.startingGlycogen
    let currentStartingFluid = firstDayState.startingFluid

    // 2. Fetch all data upfront
    const rangeStart = getStartOfDayUTC(timezone, startDate)
    const rangeEnd = getEndOfDayUTC(timezone, endDate)

    const [allNutrition, allWorkouts, allPlanned, journeyEvents] = await Promise.all([
      nutritionRepository.getForUser(userId, { startDate, endDate }),
      workoutRepository.getForUser(userId, {
        startDate: rangeStart,
        endDate: rangeEnd,
        includeDuplicates: false
      }),
      plannedWorkoutRepository.list(userId, { startDate, endDate }),
      prisma.athleteJourneyEvent.findMany({
        where: {
          userId,
          timestamp: {
            gte: rangeStart,
            lte: rangeEnd
          }
        },
        orderBy: { timestamp: 'asc' }
      })
    ])

    const nutritionMap = new Map()
    allNutrition.forEach((n) => nutritionMap.set(n.date.toISOString().split('T')[0] as string, n))

    const workoutsByDate = new Map<string, any[]>()
    const completedPlannedIds = new Set(
      allWorkouts.map((w: any) => w.plannedWorkoutId).filter(Boolean)
    )

    const addWorkout = (w: any, key: string) => {
      if (!workoutsByDate.has(key)) workoutsByDate.set(key, [])
      workoutsByDate.get(key)!.push(w)
    }

    // CW-84: Workout.date is a real timestamp, so it must be bucketed by the user's local
    // calendar day (not the UTC date) - otherwise a late-night or early-morning session shifts
    // onto the wrong day's glycogen simulation.
    allWorkouts.forEach((w) => addWorkout(w, getDateKey(w.date, timezone)))
    // CW-76: a day that has already ended is reconstructed from what actually happened, not from a
    // session that was planned but never completed - the same policy `finalizeDay` and
    // `getDailyTimeline` use for a past day. Only today-or-later keeps planned-but-uncompleted
    // ("ghost") workouts, since those days still need a projection for hours that have not
    // happened yet.
    // PlannedWorkout.date is a @db.Date column (a calendar date, not a timestamp), so it is
    // already keyed by day and does not need timezone conversion.
    allPlanned
      .filter(
        (p: any) =>
          !p.completed && !completedPlannedIds.has(p.id) && formatDateUTC(p.date) >= todayKey
      )
      .forEach((p) => addWorkout(p, formatDateUTC(p.date)))

    const daysDiff = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    for (let i = 0; i <= daysDiff; i++) {
      const date = new Date(startDate)
      date.setUTCDate(startDate.getUTCDate() + i)
      const dateStr = formatDateUTC(date)
      const dataType =
        dateStr < todayKey ? 'historical' : dateStr === todayKey ? 'current' : 'future'

      const dayNutrition = nutritionMap.get(dateStr)
      const dayWorkouts = workoutsByDate.get(dateStr) || []

      dayWorkouts.forEach((w) => {
        let startTime = w.startTime || w.date
        if (typeof startTime === 'string' && startTime.includes(':') && !startTime.includes('T')) {
          startTime = buildZonedDateTimeFromUtcDate(w.date, startTime, timezone, 10, 0)
        }

        allWorkoutsInRange.push({
          id: w.id,
          title: w.title,
          type: w.type,
          date: w.date,
          startTime: startTime,
          durationSec: w.durationSec || w.plannedDuration || 0,
          intensity: w.intensity || w.workIntensity || 0.6,
          source: w.completed !== undefined ? 'planned' : 'completed'
        })
      })

      const hasLogs = !!(
        dayNutrition &&
        ((Array.isArray(dayNutrition.breakfast) && dayNutrition.breakfast.length > 0) ||
          (Array.isArray(dayNutrition.lunch) && dayNutrition.lunch.length > 0) ||
          (Array.isArray(dayNutrition.dinner) && dayNutrition.dinner.length > 0) ||
          (Array.isArray(dayNutrition.snacks) && dayNutrition.snacks.length > 0))
      )
      // synthesizeRefills is forward-looking: it lays out the plan at full target for days still to
      // come. Past days are inferred inside the simulation instead, where the assumed intake is
      // scaled to the day's expenditure - feeding unscaled plan targets in here would refill the
      // tank on every unlogged day and pin it full.
      const shouldSynthesizeMeals = !hasLogs && dataType !== 'historical'
      const simulationMeals = shouldSynthesizeMeals
        ? synthesizeRefills(
            date,
            dayWorkouts,
            { weight: weightKg, ftp: user?.ftp || 250, ...settings },
            timezone
          )
        : []

      // Days the plan has not been generated for still need a believable carbohydrate target.
      // Defaulting to the lowest fuel state's minimum projected every future session as though the
      // athlete would under-eat it, so the horizon showed a glycogen crash that the plan avoids.
      const projectedCarbsGoal = estimateDailyCarbTargetGrams(
        {
          weight: weightKg,
          ftp: user?.ftp || 250,
          ...settings
        } as any,
        dayWorkouts as any,
        { date }
      )

      const points = calculateEnergyTimeline(
        dayNutrition || {
          date: date.toISOString(),
          carbsGoal: projectedCarbsGoal
        },
        dayWorkouts,
        { ...settings, weight: weightKg }, // Inject converted weight
        timezone,
        undefined,
        {
          startingGlycogenPercentage: currentStartingGlycogen,
          startingFluidDeficit: currentStartingFluid,
          crossDayMeals: simulationMeals
        }
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
        // A day nobody logged food on tells us nothing about what was eaten, so its drained ending
        // must not be carried forward as if it were measured - three unlogged days in a row would
        // otherwise leave an athlete permanently empty however well they actually ate. Days with
        // real intake data are trusted in full, including ending at zero.
        currentStartingGlycogen = carryForwardGlycogen(
          lastPoint.level,
          hasLogs || shouldSynthesizeMeals,
          settings?.metabolicFloor
        )
        currentStartingFluid = lastPoint.fluidDeficit
      } else {
        const metabolicFloor = settings?.metabolicFloor || 0.6
        currentStartingGlycogen = metabolicFloor * 100
        currentStartingFluid = 0
      }
    }

    return {
      points: allPoints,
      journeyEvents,
      workouts: allWorkoutsInRange
    }
  },

  /**
   * Builds the `FuelingProfile` passed to `buildDayFuelingPlan`.
   *
   * Shared by `calculateFuelingPlanForDate` and `calculateFuelingPlansForRange` (CW-83) so the two
   * cannot drift apart - it depends only on the user's settings/weight/ftp, none of which vary
   * across a date range, which is exactly why the range version fetches them once instead of once
   * per day.
   */
  buildFuelingProfile(settings: any, weightKg: number, ftp: number) {
    return {
      weight: weightKg,
      ftp: ftp || 250,
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
      baseCaloriesMode: (settings.baseCaloriesMode === 'MANUAL_NON_EXERCISE'
        ? 'MANUAL_NON_EXERCISE'
        : 'AUTO') as 'AUTO' | 'MANUAL_NON_EXERCISE',
      nonExerciseBaseCalories: settings.nonExerciseBaseCalories ?? undefined,
      targetAdjustmentPercent: settings.targetAdjustmentPercent ?? 0,
      baseProteinPerKg: settings.baseProteinPerKg,
      baseFatPerKg: settings.baseFatPerKg
    }
  },

  /**
   * Turns a day's completed + planned workouts into the workout contexts `buildDayFuelingPlan`
   * expects. Shared by `calculateFuelingPlanForDate` and `calculateFuelingPlansForRange` (CW-83).
   */
  resolveDayWorkoutContexts(
    completedWorkouts: any[],
    plannedWorkouts: any[],
    timezone: string
  ): any[] {
    const contexts: any[] = []
    const completedPlannedIds = new Set(
      completedWorkouts.map((w) => w.plannedWorkoutId).filter(Boolean)
    )
    const remainingPlanned = plannedWorkouts.filter((w) => !completedPlannedIds.has(w.id))

    for (const completed of completedWorkouts) {
      contexts.push({
        id: completed.id,
        title: completed.title || 'Completed Workout',
        durationSec: completed.durationSec || 0,
        type: completed.type || 'Workout',
        source: completed.source || 'completed',
        date: completed.date,
        startTime: completed.date,
        durationHours: (completed.durationSec || 0) / 3600,
        intensity: completed.intensity || 0.6,
        calories: completed.calories,
        kilojoules: completed.kilojoules,
        strategyOverride: completed.plannedWorkout?.fuelingStrategy || undefined
      })
    }

    for (const work of remainingPlanned) {
      let startTimeDate: Date | null = null
      if (work.startTime && typeof work.startTime === 'string' && work.startTime.includes(':')) {
        startTimeDate = buildZonedDateTimeFromUtcDate(work.date, work.startTime, timezone, 10, 0)
      } else if ((work.startTime as any) instanceof Date) {
        startTimeDate = work.startTime as any as Date
      }

      contexts.push({
        ...work,
        source: 'planned',
        startTime: startTimeDate,
        durationHours: (work.durationSec || 0) / 3600,
        intensity: work.workIntensity || 0.5,
        strategyOverride: work.fuelingStrategy || undefined
      })
    }

    return contexts
  },

  /**
   * Resolves the day's meal-pattern slots into absolute times. Shared by
   * `calculateFuelingPlanForDate` and `calculateFuelingPlansForRange` (CW-83).
   */
  resolveDayMealSlots(
    settings: any,
    targetDateStart: Date,
    timezone: string
  ): { name: string; at: Date }[] {
    // Meal-pattern slots become the day's DAILY_BASE windows, so that baseline eating is planned
    // on rest days too rather than leaving the day with no windows at all.
    const mealPattern =
      Array.isArray(settings.mealPattern) && settings.mealPattern.length > 0
        ? (settings.mealPattern as any[])
        : [
            { name: 'Breakfast', time: '08:00' },
            { name: 'Lunch', time: '13:00' },
            { name: 'Dinner', time: '19:00' }
          ]

    return mealPattern
      .map((slot: any) => {
        const name = typeof slot?.name === 'string' && slot.name.trim() ? slot.name.trim() : 'Meal'
        const at = buildZonedDateTimeFromUtcDate(targetDateStart, slot?.time, timezone, 12, 0)
        return at instanceof Date && !Number.isNaN(at.getTime()) ? { name, at } : null
      })
      .filter((slot): slot is { name: string; at: Date } => slot !== null)
  },

  /**
   * Builds the final serialized fueling plan for one day from already-resolved inputs (profile,
   * workout contexts, meal slots, symptom override). Pure given its inputs - no fetching - so it is
   * the single place `calculateFuelingPlanForDate` and `calculateFuelingPlansForRange` (CW-83) both
   * call, guaranteeing they can never compute a day's plan differently.
   */
  buildFuelingPlanFromContexts(
    profile: any,
    contexts: any[],
    targetDateStart: Date,
    mealSlots: { name: string; at: Date }[],
    override: {
      carbAdjustment?: number
      strategy?: string
      notes?: string[]
      isRescueProtocol?: boolean
    } | null,
    timezone: string
  ) {
    const dayPlan = buildDayFuelingPlan(profile, contexts as any, {
      date: targetDateStart,
      mealSlots,
      carbAdjustment: override?.carbAdjustment ?? 1,
      strategyOverride: override?.strategy
    })

    const labelledWindows = dayPlan.windows.map((w) => ({
      ...w,
      label: this.buildWindowLabel(w, timezone)
    }))

    const uniqueNotes = Array.from(new Set([...dayPlan.notes, ...(override?.notes || [])]))
    const macroCalories = dayPlan.dailyTotals.calories
    const energyTarget = dayPlan.dailyTotals.baseCalories + dayPlan.dailyTotals.activityCalories
    const calories =
      dayPlan.dailyTotals.activityCalories > 0
        ? Math.max(energyTarget + dayPlan.dailyTotals.adjustmentCalories, macroCalories)
        : energyTarget + dayPlan.dailyTotals.adjustmentCalories

    return {
      windows: labelledWindows,
      notes: uniqueNotes,
      dailyTotals: {
        ...dayPlan.dailyTotals,
        calories,
        isRescueProtocol: override?.isRescueProtocol || false
      }
    }
  },

  /**
   * Computes a daily fueling plan synchronously.
   * Optional persistence keeps backward compatibility while enabling real-time on-demand generation.
   *
   * Windows are built for the day as a whole (see buildDayFuelingPlan), so overlapping sessions
   * share a single pre/post window instead of each emitting their own.
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
    const [plannedWorkouts, completedWorkouts] = await Promise.all([
      prisma.plannedWorkout.findMany({
        where: {
          userId,
          date: {
            gte: targetDateStart,
            lte: targetDateEnd
          },
          completed: {
            not: true
          },
          completedWorkouts: {
            none: {}
          }
        },
        orderBy: { date: 'asc' }
      }),
      prisma.workout.findMany({
        where: {
          userId,
          isDuplicate: false,
          date: {
            gte: targetDateStart,
            lte: targetDateEnd
          }
        },
        orderBy: { date: 'asc' },
        include: {
          plannedWorkout: {
            select: {
              fuelingStrategy: true,
              startTime: true
            }
          }
        }
      })
    ])

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { weight: true, weightSourceMode: true, ftp: true }
    })

    const weightKg = await resolveWeightKg(userId, user)

    const profile = this.buildFuelingProfile(settings, weightKg, user?.ftp || 250)

    // Check for symptom-based overrides
    const override = await remediationService.getActiveFuelingOverride(userId, date)
    const contexts = this.resolveDayWorkoutContexts(completedWorkouts, plannedWorkouts, timezone)
    const mealSlots = this.resolveDayMealSlots(settings, targetDateStart, timezone)

    const finalPlan = this.buildFuelingPlanFromContexts(
      profile,
      contexts,
      targetDateStart,
      mealSlots,
      override,
      timezone
    )

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
   * Batched, range-based counterpart to `calculateFuelingPlanForDate` (CW-83).
   *
   * `calculateFuelingPlanForDate` independently re-fetches the user's timezone, nutrition settings,
   * weight and that single day's workouts on every call. Looping it once per day - as
   * `strategy.get.ts`'s 7-day fueling matrix and `getUpcomingFuelingWindows`' lookahead both do -
   * turns those into N redundant queries for values that do not vary across the range.
   *
   * This follows the same single-pass convention `getWaveRange` and `getMetabolicStatesForRange`
   * already use: the shared per-user context (timezone/settings/weight) and the full range's
   * workouts/nutrition are fetched ONCE, then one day-by-day loop builds each day's plan from the
   * already-fetched data via the same `buildFuelingPlanFromContexts` helper
   * `calculateFuelingPlanForDate` uses - so the two can never disagree on a given day (proven in
   * nutritionPlanService.test.ts).
   *
   * `startDate`/`endDate` are treated as UTC-midnight calendar dates (the same convention
   * `getWaveRange`/`getMetabolicStatesForRange` use), inclusive on both ends.
   *
   * Note: like `calculateFuelingPlanForDate`, workouts are queried by their raw UTC day rather than
   * the user's local calendar day (the CW-84 `getDateKey` timezone bucketing that `getWaveRange` and
   * `getMetabolicStatesForRange` use does not apply here) - this intentionally matches
   * `calculateFuelingPlanForDate`'s existing per-day query bounds exactly, rather than changing
   * fueling-plan generation's day-boundary behavior as a side effect of batching it.
   *
   * Returns a `Map` keyed by `yyyy-MM-dd`, one entry per day in the range, in the same
   * `{ success, skipped, reason, plan }` shape `calculateFuelingPlanForDate` returns for a single
   * day.
   *
   * `strategy.get.ts` is the only current caller (its Owned Paths), but nothing here is specific to
   * it - `getUpcomingFuelingWindows`'s per-day loop and the `active-feed` endpoint could adopt this
   * the same way without further changes to this function.
   */
  async calculateFuelingPlansForRange(
    userId: string,
    startDate: Date,
    endDate: Date,
    options: { persist?: boolean } = {}
  ): Promise<Map<string, { success: boolean; skipped: boolean; reason?: string; plan: any }>> {
    const persist = options.persist ?? true

    const dayCursorStart = new Date(startDate)
    dayCursorStart.setUTCHours(0, 0, 0, 0)
    const dayCursorEnd = new Date(endDate)
    dayCursorEnd.setUTCHours(0, 0, 0, 0)

    const rangeStart = new Date(dayCursorStart)
    const rangeEnd = new Date(dayCursorEnd)
    rangeEnd.setUTCHours(23, 59, 59, 999)

    // --- 1. Shared per-user context, fetched ONCE for the whole range ---
    const settings = await getUserNutritionSettings(userId)
    const timezone = await getUserTimezone(userId)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { weight: true, weightSourceMode: true, ftp: true }
    })
    const weightKg = await resolveWeightKg(userId, user)
    const profile = this.buildFuelingProfile(settings, weightKg, user?.ftp || 250)

    // --- 2. Workouts + existing nutrition for the FULL range, fetched ONCE ---
    const [plannedWorkouts, completedWorkouts, existingNutritionRows] = await Promise.all([
      prisma.plannedWorkout.findMany({
        where: {
          userId,
          date: { gte: rangeStart, lte: rangeEnd },
          completed: { not: true },
          completedWorkouts: { none: {} }
        },
        orderBy: { date: 'asc' }
      }),
      prisma.workout.findMany({
        where: {
          userId,
          isDuplicate: false,
          date: { gte: rangeStart, lte: rangeEnd }
        },
        orderBy: { date: 'asc' },
        include: {
          plannedWorkout: {
            select: { fuelingStrategy: true, startTime: true }
          }
        }
      }),
      nutritionRepository.getForUser(userId, { startDate: rangeStart, endDate: rangeEnd })
    ])

    const plannedByDate = new Map<string, any[]>()
    plannedWorkouts.forEach((w: any) => {
      const key = formatDateUTC(w.date)
      if (!plannedByDate.has(key)) plannedByDate.set(key, [])
      plannedByDate.get(key)!.push(w)
    })

    const completedByDate = new Map<string, any[]>()
    completedWorkouts.forEach((w: any) => {
      const key = formatDateUTC(w.date)
      if (!completedByDate.has(key)) completedByDate.set(key, [])
      completedByDate.get(key)!.push(w)
    })

    const nutritionByDate = new Map<string, any>()
    existingNutritionRows.forEach((n: any) => nutritionByDate.set(formatDateUTC(n.date), n))

    // --- 3. Single-pass per-day loop over the already-fetched data ---
    const results = new Map<
      string,
      { success: boolean; skipped: boolean; reason?: string; plan: any }
    >()

    const daysDiff = Math.round(
      (dayCursorEnd.getTime() - dayCursorStart.getTime()) / (1000 * 60 * 60 * 24)
    )

    for (let i = 0; i <= daysDiff; i++) {
      const date = new Date(dayCursorStart)
      date.setUTCDate(dayCursorStart.getUTCDate() + i)
      const dateKey = formatDateUTC(date)

      const existingNutrition = nutritionByDate.get(dateKey)
      if (persist && existingNutrition?.isManualLock) {
        results.set(dateKey, {
          success: true,
          skipped: true,
          reason: 'MANUAL_LOCK',
          plan: existingNutrition.fuelingPlan
        })
        continue
      }

      const dayCompleted = completedByDate.get(dateKey) || []
      const dayPlanned = plannedByDate.get(dateKey) || []

      // Check for symptom-based overrides - genuinely per-day (a 24h rolling lookback), so this
      // stays a per-day call rather than something batchable from the shared context above.
      const override = await remediationService.getActiveFuelingOverride(userId, date)
      const contexts = this.resolveDayWorkoutContexts(dayCompleted, dayPlanned, timezone)
      const mealSlots = this.resolveDayMealSlots(settings, date, timezone)

      const finalPlan = this.buildFuelingPlanFromContexts(
        profile,
        contexts,
        date,
        mealSlots,
        override,
        timezone
      )

      if (persist) {
        await nutritionRepository.upsert(
          userId,
          date,
          {
            userId,
            date,
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

      results.set(dateKey, { success: true, skipped: false, plan: finalPlan })
    }

    return results
  },

  /**
   * Fetches and synthesizes future fueling targets for the next few days.
   *
   * Windows, baseline slots and per-sitting caps all come from the shared day builder; this method
   * only adds what is genuinely multi-day: carb-loading debt that flows backwards into the days
   * before a big session, and hydration debt carried in from yesterday.
   */
  async getUpcomingFuelingWindows(userId: string, daysAhead: number = 7) {
    const timezone = await getUserTimezone(userId)
    const today = getUserLocalDate(timezone)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { weight: true, weightSourceMode: true }
    })
    const weightKg = await resolveWeightKg(userId, user)

    const weight = weightKg
    const MEAL_CAP = weight * 2.0 // 2.0g/kg per sitting
    const { points: hydrationBaselineProbe } = await this.getWaveRange(
      userId,
      new Date(today.getTime() - 24 * 60 * 60 * 1000),
      today
    )
    const hydrationDebt = Math.max(
      0,
      Math.round(hydrationBaselineProbe[hydrationBaselineProbe.length - 1]?.fluidDeficit || 0)
    )

    const days: any[] = []

    // Pass 1: Generate daily plans
    for (let i = 0; i < daysAhead; i++) {
      const date = new Date(today)
      date.setUTCDate(today.getUTCDate() + i)
      const dateStr = formatDateUTC(date)

      const [dayPlan, planRecord] = await Promise.all([
        this.calculateFuelingPlanForDate(userId, date, { persist: false }),
        prisma.nutritionPlan.findFirst({
          where: {
            userId,
            startDate: { lte: date },
            endDate: { gte: date }
          },
          include: { meals: true }
        })
      ])

      const plan = dayPlan.plan as any
      const windows = [...(plan?.windows || [])]

      // Inject locked meals into windows
      const windowsWithLocks = windows.map((w: any) => {
        const lockedMeal = planRecord?.meals.find(
          (pm) =>
            this.isActivePlanMeal(pm) &&
            this.matchPlanMealToWindow(pm, w, timezone) &&
            pm.date.toISOString().split('T')[0] === date.toISOString().split('T')[0]
        )
        return {
          ...w,
          planMealId: lockedMeal?.id || null,
          planMealStatus: lockedMeal?.status || null,
          lockedMeal: lockedMeal?.mealJson || null,
          isLocked: !!lockedMeal
        }
      })

      days.push({
        date,
        dateKey: dateStr,
        carbsGoal: plan.dailyTotals.carbs,
        proteinGoal: plan.dailyTotals.protein,
        fatGoal: plan.dailyTotals.fat,
        windows: windowsWithLocks
      })
    }

    // Pass 2: Carb loading. Each day's windows are already filled and capped by the day builder,
    // so the only cross-day work left is moving carbohydrate that will not fit inside a big day
    // into the days before it.
    let carryOverDebt = 0
    for (let i = days.length - 1; i >= 0; i--) {
      const day = days[i]
      const eatingWindows = day.windows.filter(
        (w: any) => w.type !== 'INTRA_WORKOUT' && w.type !== 'WORKOUT_EVENT'
      )

      const allocated = day.windows.reduce(
        (sum: number, w: any) => sum + Number(w.targetCarbs || 0),
        0
      )
      const shortfall = Math.max(0, day.carbsGoal - allocated)

      // Headroom left in this day's eating windows, which we use to absorb the next day's overflow.
      let headroom = eatingWindows.reduce(
        (sum: number, w: any) => sum + Math.max(0, MEAL_CAP - Number(w.targetCarbs || 0)),
        0
      )

      let toPlace = carryOverDebt
      if (toPlace > 0 && headroom > 0 && eatingWindows.length > 0) {
        for (const w of eatingWindows) {
          if (toPlace <= 0) break
          const capacity = Math.max(0, MEAL_CAP - Number(w.targetCarbs || 0))
          const add = Math.min(capacity, toPlace)
          if (add <= 0) continue
          w.targetCarbs = Math.round(Number(w.targetCarbs || 0) + add)
          w.advice = 'Carb loading: extra carbohydrate moved here for a big day ahead.'
          toPlace -= add
          headroom -= add
        }
      }

      // What this day could not hold flows further back.
      carryOverDebt = toPlace + shortfall
    }

    // Pass 3: Flatten, then apply hydration debt
    const allWindowsSorted = days
      .flatMap((d) => d.windows.map((w: any) => ({ ...w, dateKey: d.dateKey })))
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

    if (hydrationDebt > 0) {
      let remainingDebt = hydrationDebt
      let nudgesApplied = 0
      for (const window of allWindowsSorted) {
        if (remainingDebt <= 0) break
        if (window.type === 'INTRA_WORKOUT') continue

        const addFluid = Math.min(MEAL_LINKED_WATER_ML + 100, remainingDebt)
        window.targetFluid = Math.max(0, (window.targetFluid || 0) + addFluid)
        remainingDebt -= addFluid

        if (hydrationDebt >= HYDRATION_DEBT_NUDGE_THRESHOLD_ML && nudgesApplied < 2) {
          window.advice =
            'High fluid debt detected. Add 500ml of water to your next two meals to normalize.'
          nudgesApplied += 1
        }
      }
    }

    return allWindowsSorted.map((w) => {
      const label = w.label || this.buildWindowLabel(w, timezone)
      const mealName =
        typeof w.slotName === 'string' && w.slotName.trim()
          ? w.slotName.trim()
          : this.getMealSlotName(new Date(w.startTime), timezone)

      // Contextual Advice
      let advice = w.advice || w.description
      if (w.type === 'INTRA_WORKOUT')
        advice = 'Direct performance fueling; focus on rapid absorption.'
      else if (!w.advice && (w.type === 'DAILY_BASE' || w.type === 'TRANSITION')) {
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
   * Efficiently computes metabolic states for a date range in a single pass.
   * Avoids N+1 queries by fetching all data upfront.
   */
  async getMetabolicStatesForRange(userId: string, startDate: Date, endDate: Date) {
    const startTime = Date.now()
    const timezone = await getUserTimezone(userId)
    const settings = await getUserNutritionSettings(userId)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { weight: true, weightSourceMode: true, ftp: true }
    })

    const weightKg = await resolveWeightKg(userId, user)

    // 1. Get starting state for the range (recursive but only once)
    const initialDayState = await this.getMetabolicStateForDate(userId, startDate)

    // 2. Fetch ALL nutrition and workouts for the entire range upfront
    const rangeStart = getStartOfDayUTC(timezone, startDate)
    const rangeEnd = getEndOfDayUTC(timezone, endDate)

    const [allNutrition, allWorkouts, allPlanned] = await Promise.all([
      nutritionRepository.getForUser(userId, { startDate, endDate }),
      workoutRepository.getForUser(userId, {
        startDate: rangeStart,
        endDate: rangeEnd,
        includeDuplicates: false
      }),
      plannedWorkoutRepository.list(userId, { startDate, endDate })
    ])

    // Map data for fast lookup
    const nutritionMap = new Map()
    allNutrition.forEach((n) => nutritionMap.set(n.date.toISOString().split('T')[0] as string, n))

    const workoutsByDate = new Map<string, any[]>()
    const completedPlannedIds = new Set(
      allWorkouts.map((w: any) => w.plannedWorkoutId).filter(Boolean)
    )

    // Helper to group by local date
    const addWorkout = (w: any, key: string) => {
      if (!workoutsByDate.has(key)) workoutsByDate.set(key, [])
      workoutsByDate.get(key)!.push(w)
    }

    // CW-84: Workout.date is a real timestamp, so it must be bucketed by the user's local
    // calendar day (not the UTC date) to line up with the day-by-day simulation below.
    allWorkouts.forEach((w) => addWorkout(w, getDateKey(w.date, timezone)))
    // PlannedWorkout.date is a @db.Date column (a calendar date, not a timestamp), so it is
    // already keyed by day and does not need timezone conversion.
    allPlanned
      .filter((p: any) => !p.completed && !completedPlannedIds.has(p.id))
      .forEach((p) => addWorkout(p, formatDateUTC(p.date)))

    // 3. Single-pass simulation through the range
    const statesByDate = new Map<string, { startingGlycogen: number; startingFluid: number }>()
    let currentGlycogen = initialDayState.startingGlycogen
    let currentFluid = initialDayState.startingFluid

    const daysDiff = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    for (let i = 0; i <= daysDiff; i++) {
      const date = new Date(startDate)
      date.setUTCDate(startDate.getUTCDate() + i)
      const dateKey = date.toISOString().split('T')[0] as string

      statesByDate.set(dateKey, {
        startingGlycogen: currentGlycogen,
        startingFluid: currentFluid
      })

      // Simulate the day to get the STARTING state for the next day
      const dayNutrition = nutritionMap.get(dateKey)
      const dayWorkouts = workoutsByDate.get(dateKey) || []

      const points = calculateEnergyTimeline(
        dayNutrition || {
          date: date.toISOString(),
          carbsGoal: settings.fuelState1Min * weightKg
        },
        dayWorkouts,
        { ...settings, weight: weightKg }, // Inject converted weight
        timezone,
        undefined,
        {
          startingGlycogenPercentage: currentGlycogen,
          startingFluidDeficit: currentFluid
        }
      )

      const lastPoint = points[points.length - 1]
      if (lastPoint) {
        currentGlycogen = lastPoint.level
        currentFluid = Math.max(0, lastPoint.fluidDeficit)
      }
    }

    return statesByDate
  },

  async checkCriticalAlerts(userId: string, startingGlycogen: number, date: Date) {
    const dateKey = date.toISOString().split('T')[0]

    // Only alert when glycogen is critically low before a hard morning session.
    if (!Number.isFinite(startingGlycogen) || startingGlycogen >= 20) return

    const timezone = await getUserTimezone(userId)
    const rangeStart = getStartOfDayUTC(timezone, date)
    const rangeEnd = getEndOfDayUTC(timezone, date)
    const workouts = await workoutRepository.getForUser(userId, {
      startDate: rangeStart,
      endDate: rangeEnd,
      includeDuplicates: false
    })

    const morningHardWorkout = (workouts || []).find((workout: any) => {
      const start = workout?.startTime ? new Date(workout.startTime) : null
      if (!start || Number.isNaN(start.getTime())) return false

      const localTimeStr = formatUserTime(start, timezone, 'H:m')
      const [h] = localTimeStr.split(':').map(Number)
      const isMorning = (h ?? 24) < 10

      const intensity =
        workout?.intensityFactor ?? workout?.workIntensity ?? workout?.intensity ?? workout?.if ?? 0
      const durationSec = Number(workout?.durationSec ?? workout?.duration ?? 0)
      const isHard = Number(intensity) >= 0.85 && durationSec >= 45 * 60

      return isMorning && isHard
    })

    if (!morningHardWorkout) return

    const nutrition = await nutritionRepository.getByDate(userId, date)

    // De-dupe: avoid writing the same alert repeatedly if finalize runs often.
    const recent = await prisma.auditLog.findMany({
      where: {
        userId,
        action: 'CRITICAL_FUELING_ALERT',
        createdAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24) }
      },
      take: 25,
      orderBy: { createdAt: 'desc' }
    })

    const alreadyLogged = recent.some((log) => (log as any)?.metadata?.date === dateKey)
    if (alreadyLogged) return

    await auditLogRepository.log({
      userId,
      action: 'CRITICAL_FUELING_ALERT',
      resourceType: 'Nutrition',
      resourceId: nutrition?.id ?? null,
      metadata: {
        date: dateKey,
        startingGlycogen,
        workoutId: morningHardWorkout?.id ?? null,
        workoutTitle: morningHardWorkout?.title ?? null
      }
    })
  },

  /**
   * Simulates the impact of a potential meal on the energy timeline.
   */
  async simulateMealImpact(
    userId: string,
    date: Date,
    meal: {
      totalCarbs: number
      totalKcal: number
      profile: any
      time: Date
    }
  ) {
    const state = await this.getMetabolicStateForDate(userId, date)
    const { points } = await this.getDailyTimeline(
      userId,
      date,
      state.startingGlycogen,
      state.startingFluid,
      new Date()
    )

    // Re-simulate with the ghost meal
    const timezone = await getUserTimezone(userId)
    const settings = await getUserNutritionSettings(userId)
    const dayWorkouts = await this.getRelevantWorkouts(userId, date, timezone)
    const dayNutrition = await nutritionRepository.getByDate(userId, date)

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { weight: true, weightSourceMode: true }
    })

    const weightKg = await resolveWeightKg(userId, user)

    const ghostPoints = calculateEnergyTimeline(
      dayNutrition || {
        date: date.toISOString(),
        carbsGoal: settings.fuelState1Min * weightKg
      },
      dayWorkouts,
      { ...settings, weight: weightKg }, // Inject converted weight
      timezone,
      meal,
      {
        startingGlycogenPercentage: state.startingGlycogen,
        startingFluidDeficit: state.startingFluid,
        now: new Date()
      }
    )

    return ghostPoints
  },

  /**
   * Fetches full nutrition data for a single day including fueling plan and targets.
   */
  async getNutritionDay(userId: string, dateStr: string) {
    const date = new Date(dateStr)
    const timezone = await getUserTimezone(userId)
    const settings = await getUserNutritionSettings(userId)

    const [nutrition, planResult] = await Promise.all([
      nutritionRepository.getByDate(userId, date),
      this.calculateFuelingPlanForDate(userId, date, { persist: false })
    ])

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { weight: true, weightSourceMode: true }
    })

    const weightKg = await resolveWeightKg(userId, user)

    const plan = planResult.plan as unknown as NutritionPlanSummary

    return {
      nutrition,
      fuelingPlan: plan,
      targets: {
        carbs: plan?.dailyTotals?.carbs || 0,
        protein: plan?.dailyTotals?.protein || 0,
        fat: plan?.dailyTotals?.fat || 0,
        calories: plan?.dailyTotals?.calories || 0
      }
    }
  }
}
