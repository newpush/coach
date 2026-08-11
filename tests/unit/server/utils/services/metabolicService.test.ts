import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_WAVE_RANGE_SPAN_DAYS,
  metabolicService,
  waveRangeSpanDays
} from '../../../../../server/utils/services/metabolicService'
import { prisma } from '../../../../../server/utils/db'
import { nutritionRepository } from '../../../../../server/utils/repositories/nutritionRepository'
import { workoutRepository } from '../../../../../server/utils/repositories/workoutRepository'
import { plannedWorkoutRepository } from '../../../../../server/utils/repositories/plannedWorkoutRepository'
import { auditLogRepository } from '../../../../../server/utils/repositories/auditLogRepository'
import { getUserNutritionSettings } from '../../../../../server/utils/nutrition/settings'
import { formatDateUTC, formatUserTime } from '../../../../../server/utils/date'
import { bodyMetricResolver } from '../../../../../server/utils/services/bodyMetricResolver'
import {
  calculateEnergyTimeline,
  calculateGlycogenState,
  selectRelevantWorkouts
} from '../../../../../server/utils/nutrition-domain'
// Real implementations, imported straight from their concrete modules so they bypass the
// `../nutrition-domain` barrel mock below. Used to exercise real glycogen math for the CW-76
// finalizeDay/getDailyTimeline unification tests instead of asserting against mocked stand-ins.
import { calculateEnergyTimeline as realCalculateEnergyTimeline } from '../../../../../server/utils/nutrition-domain/metabolic-simulation'
import { selectRelevantWorkouts as realSelectRelevantWorkouts } from '../../../../../server/utils/nutrition-domain/workout-selection'

vi.mock('../../../../../server/utils/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn()
    },
    athleteJourneyEvent: {
      findMany: vi.fn()
    },
    auditLog: {
      findMany: vi.fn()
    },
    nutritionPlan: {
      findFirst: vi.fn()
    }
  }
}))

vi.mock('../../../../../server/utils/repositories/auditLogRepository', () => ({
  auditLogRepository: {
    log: vi.fn()
  }
}))

vi.mock('../../../../../server/utils/services/bodyMetricResolver', () => ({
  bodyMetricResolver: {
    resolveEffectiveWeight: vi.fn()
  }
}))

vi.mock('../../../../../server/utils/repositories/nutritionRepository', () => ({
  nutritionRepository: {
    getByDate: vi.fn(),
    upsert: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  }
}))

vi.mock('../../../../../server/utils/repositories/workoutRepository', () => ({
  workoutRepository: {
    getForUser: vi.fn()
  }
}))

vi.mock('../../../../../server/utils/repositories/plannedWorkoutRepository', () => ({
  plannedWorkoutRepository: {
    list: vi.fn()
  }
}))

vi.mock('../../../../../server/utils/nutrition/settings', () => ({
  getUserNutritionSettings: vi.fn()
}))

vi.mock('../../../../../server/utils/date', () => ({
  getUserTimezone: vi.fn().mockResolvedValue('UTC'),
  getUserLocalDate: vi.fn().mockReturnValue(new Date('2026-02-13T00:00:00.000Z')),
  getStartOfDayUTC: vi.fn().mockReturnValue(new Date('2026-02-13T00:00:00.000Z')),
  getEndOfDayUTC: vi.fn().mockReturnValue(new Date('2026-02-13T23:59:59.999Z')),
  buildZonedDateTimeFromUtcDate: vi.fn(),
  formatDateUTC: vi.fn().mockReturnValue('2026-02-13'),
  formatUserTime: vi.fn().mockReturnValue('10:00')
}))

vi.mock('../../../../../server/utils/nutrition-domain', () => ({
  calculateEnergyTimeline: vi.fn(),
  calculateGlycogenState: vi.fn(),
  calculateFuelingStrategy: vi.fn(),
  calculateDailyCalorieBreakdown: vi.fn(),
  calculateMacroTargetCalories: vi.fn(),
  buildDayFuelingPlan: vi.fn(),
  selectRelevantWorkouts: vi.fn(),
  synthesizeRefills: vi.fn(),
  ABSORPTION_PROFILES: {}
}))

describe('metabolicService smoke coverage', () => {
  const userId = 'user-123'
  const date = new Date('2026-02-13T12:00:00.000Z')

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(bodyMetricResolver.resolveEffectiveWeight).mockResolvedValue({
      value: 70,
      source: { type: 'profile', label: 'Profile' }
    } as any)
    vi.mocked(prisma.athleteJourneyEvent.findMany).mockResolvedValue([] as any)
  })

  it('getRelevantWorkouts should include planned workouts repository in merge flow', async () => {
    const completed = [{ id: 'w1' }]
    const planned = [{ id: 'p1' }]
    const merged = [{ id: 'merged' }]

    vi.mocked(workoutRepository.getForUser).mockResolvedValue(completed as any)
    vi.mocked(plannedWorkoutRepository.list).mockResolvedValue(planned as any)
    vi.mocked(selectRelevantWorkouts).mockReturnValue(merged as any)

    const result = await metabolicService.getRelevantWorkouts(userId, date, 'UTC')

    expect(workoutRepository.getForUser).toHaveBeenCalled()
    expect(plannedWorkoutRepository.list).toHaveBeenCalledWith(userId, {
      startDate: date,
      endDate: date
    })
    expect(selectRelevantWorkouts).toHaveBeenCalledWith(completed, planned)
    expect(result).toEqual(merged)
  })

  it('getGlycogenState should execute without reference errors and use nutrition settings', async () => {
    vi.mocked(getUserNutritionSettings).mockResolvedValue({
      fuelState1Min: 3
    } as any)
    vi.mocked(nutritionRepository.getByDate).mockResolvedValue(null as any)
    vi.mocked(workoutRepository.getForUser).mockResolvedValue([] as any)
    vi.mocked(plannedWorkoutRepository.list).mockResolvedValue([] as any)
    vi.mocked(selectRelevantWorkouts).mockReturnValue([] as any)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ weight: 70 } as any)
    vi.mocked(calculateGlycogenState).mockReturnValue({ percentage: 78 } as any)

    const result = await metabolicService.getGlycogenState(userId, date, 90, new Date(date))

    expect(getUserNutritionSettings).toHaveBeenCalledWith(userId)
    expect(calculateGlycogenState).toHaveBeenCalled()
    expect(result).toEqual({ percentage: 78 })
  })

  it('getMetabolicStateForDate should not throw when recursion fallback uses metabolic floor', async () => {
    vi.mocked(getUserNutritionSettings).mockResolvedValue({
      metabolicFloor: 0.55
    } as any)
    vi.mocked(nutritionRepository.getByDate).mockResolvedValue({
      endingGlycogenPercentage: null,
      endingFluidDeficit: 120
    } as any)

    const result = await metabolicService.getMetabolicStateForDate(userId, date, 5)

    expect(getUserNutritionSettings).toHaveBeenCalledWith(userId)
    expect(result.startingGlycogen).toBeCloseTo(55)
    expect(result.startingFluid).toBe(120)
  })

  it('repairMetabolicChain should not throw in base-case fallback path', async () => {
    vi.mocked(getUserNutritionSettings).mockResolvedValue({
      metabolicFloor: 0.5
    } as any)
    vi.mocked(nutritionRepository.getByDate)
      .mockResolvedValueOnce(null as any)
      .mockResolvedValueOnce({
        endingGlycogenPercentage: null,
        endingFluidDeficit: 40
      } as any)

    const result = await metabolicService.repairMetabolicChain(
      userId,
      new Date('2026-01-01T00:00:00Z'),
      5
    )

    expect(getUserNutritionSettings).toHaveBeenCalledWith(userId)
    expect(result).toEqual({
      startingGlycogen: 50,
      startingFluid: 40
    })
  })

  describe('repairMetabolicChain recursion depth & persistence (CW-72)', () => {
    beforeEach(() => {
      vi.mocked(getUserNutritionSettings).mockResolvedValue({ metabolicFloor: 0.6 } as any)
      vi.spyOn(metabolicService, 'getDailyTimeline').mockResolvedValue({
        points: [{ level: 55, fluidDeficit: 5 }]
      } as any)
      vi.mocked(nutritionRepository.upsert).mockResolvedValue({
        record: { id: 'nutrition-x' },
        isNew: true
      } as any)
    })

    it('bounds recursion depth for a target date far in the future', async () => {
      // No persisted rows anywhere in the chain, so the fast path never short-circuits and every
      // level must decide whether to keep recursing.
      vi.mocked(nutritionRepository.getByDate).mockResolvedValue(null as any)

      // ~60 days after the "today" baked into the file-level getUserLocalDate mock
      // (2026-02-13). Before the fix, `yesterday >= todayLocal` stayed true at every level for a
      // future date, so this recursed once per day all the way back to today (~60 levels, ~120
      // persistence calls) instead of stopping at the depth-5 cap.
      const farFuture = new Date('2026-04-13T00:00:00.000Z')

      const result = await metabolicService.repairMetabolicChain(userId, farFuture)

      expect(result.startingGlycogen).toBe(55)
      // 5 simulate levels (depth 0-4) x 2 upserts per level (yesterday's ending state + target's
      // starting state) = 10. Depth 5 hits the base case and persists nothing.
      expect(nutritionRepository.upsert).toHaveBeenCalledTimes(10)
      expect(metabolicService.getDailyTimeline).toHaveBeenCalledTimes(5)
    })

    it('still walks backward through past missing days up to the depth cap', async () => {
      vi.mocked(nutritionRepository.getByDate).mockResolvedValue(null as any)

      // Comfortably in the past relative to the mocked "today" (2026-02-13), so the legitimate
      // backward-repair behavior (not just the future-date bug) must keep working.
      const pastDate = new Date('2026-01-01T00:00:00.000Z')

      const result = await metabolicService.repairMetabolicChain(userId, pastDate)

      expect(result.startingGlycogen).toBe(55)
      expect(nutritionRepository.upsert).toHaveBeenCalledTimes(10)
      expect(metabolicService.getDailyTimeline).toHaveBeenCalledTimes(5)
    })

    it('persists missing days via upsert, never a plain create, so overlapping repair calls cannot collide on the (userId, date) unique constraint', async () => {
      vi.mocked(nutritionRepository.getByDate).mockResolvedValue(null as any)
      // create() is deliberately left rejecting: if this ever regresses back to create(), the test
      // fails loudly (simulating the unique-constraint violation from a real concurrent insert)
      // instead of silently passing.
      vi.mocked(nutritionRepository.create).mockRejectedValue(
        new Error('Unique constraint failed on the fields: (`userId`,`date`)')
      )

      const dayA = new Date('2026-02-20T00:00:00.000Z')
      const dayB = new Date('2026-02-21T00:00:00.000Z') // overlaps dayA's chain via a shared "yesterday"

      const [resultA, resultB] = await Promise.all([
        metabolicService.repairMetabolicChain(userId, dayA),
        metabolicService.repairMetabolicChain(userId, dayB)
      ])

      expect(resultA.startingGlycogen).toBe(55)
      expect(resultB.startingGlycogen).toBe(55)
      expect(nutritionRepository.create).not.toHaveBeenCalled()
      expect(nutritionRepository.upsert).toHaveBeenCalled()
      // Every upsert call is keyed on (userId, date), matching the @@unique([userId, date]) constraint.
      for (const call of vi.mocked(nutritionRepository.upsert).mock.calls) {
        expect(call[0]).toBe(userId)
        expect(call[1]).toBeInstanceOf(Date)
      }
    })
  })

  describe('window identity', () => {
    it('uses the window key stamped by the day builder', () => {
      expect(
        metabolicService.getWindowKey(
          { type: 'POST_WORKOUT', windowKey: 'POST_WORKOUT#2', startTime: '2026-02-13T18:00:00Z' },
          'UTC'
        )
      ).toBe('POST_WORKOUT#2')
    })

    it('treats a key-less window as the first of its type', () => {
      expect(
        metabolicService.getWindowKey(
          { type: 'PRE_WORKOUT', startTime: '2026-02-13T08:00:00Z' },
          'UTC'
        )
      ).toBe('PRE_WORKOUT#1')
    })

    it('does not bind a legacy meal to every window sharing its type', () => {
      const legacyMeal = { windowType: 'PRE_WORKOUT' }

      expect(
        metabolicService.matchPlanMealToWindow(
          legacyMeal,
          { type: 'PRE_WORKOUT', windowKey: 'PRE_WORKOUT#1', startTime: '2026-02-13T08:00:00Z' },
          'UTC'
        )
      ).toBe(true)
      expect(
        metabolicService.matchPlanMealToWindow(
          legacyMeal,
          { type: 'PRE_WORKOUT', windowKey: 'PRE_WORKOUT#2', startTime: '2026-02-13T16:00:00Z' },
          'UTC'
        )
      ).toBe(false)
    })

    it('labels workout windows with their meal slot', () => {
      expect(
        metabolicService.buildWindowLabel(
          { type: 'PRE_WORKOUT', slotName: 'Breakfast', startTime: '2026-02-13T08:00:00Z' },
          'UTC'
        )
      ).toBe('Pre-Workout Breakfast')
      expect(
        metabolicService.buildWindowLabel(
          { type: 'INTRA_WORKOUT', startTime: '2026-02-13T10:00:00Z' },
          'UTC'
        )
      ).toBe('Intra-Workout Fueling')
    })

    it('labels a baseline window from its slot name, not the time of day', () => {
      // 15:00 local. getMealSlotName treats 11:00-16:00 as lunch, so a slot the athlete named
      // "Snack" would otherwise be labelled "Lunch" and collide with the real 12:00 lunch window -
      // which is exactly what a production plan had stored.
      vi.mocked(formatUserTime).mockReturnValue('15:00')

      expect(
        metabolicService.getMealSlotName(new Date('2026-07-27T13:00:00Z'), 'Europe/Budapest')
      ).toBe('Lunch')

      expect(
        metabolicService.buildWindowLabel(
          { type: 'DAILY_BASE', slotName: 'Snack', startTime: '2026-07-27T13:00:00Z' },
          'Europe/Budapest'
        )
      ).toBe('Snack')
    })

    it('uses the time of day only when the window has no slot name', () => {
      vi.mocked(formatUserTime).mockReturnValue('15:00')

      expect(
        metabolicService.buildWindowLabel(
          { type: 'DAILY_BASE', startTime: '2026-07-27T13:00:00Z' },
          'Europe/Budapest'
        )
      ).toBe('Lunch')
    })

    it('recomputes a stored label that disagrees with the slot name', () => {
      // Production plans carry `slotName: "Snack"` next to `label: "Lunch"` on the same window.
      // Trusting the stored label kept the wrong heading alive through every regeneration.
      vi.mocked(formatUserTime).mockReturnValue('15:00')

      expect(
        metabolicService.resolveWindowDisplayLabel(
          {
            type: 'DAILY_BASE',
            slotName: 'Snack',
            label: 'Lunch',
            startTime: '2026-07-27T13:00:00Z'
          },
          'Europe/Budapest'
        )
      ).toBe('Snack')
    })

    it('keeps a stored label when the window has no slot name to check it against', () => {
      vi.mocked(formatUserTime).mockReturnValue('15:00')

      expect(
        metabolicService.resolveWindowDisplayLabel(
          {
            type: 'PRE_WORKOUT',
            label: 'Pre-Workout Breakfast',
            startTime: '2026-07-27T13:00:00Z'
          },
          'Europe/Budapest'
        )
      ).toBe('Pre-Workout Breakfast')
    })
  })

  describe('checkCriticalAlerts', () => {
    const hardMorningWorkout = {
      id: 'w-hard-1',
      title: 'Threshold Intervals',
      startTime: '2026-02-13T07:00:00.000Z',
      intensityFactor: 0.9,
      durationSec: 60 * 60
    }

    beforeEach(() => {
      vi.mocked(nutritionRepository.getByDate).mockResolvedValue({ id: 'nutrition-1' } as any)
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([] as any)
      // Morning by default (7:00 local < 10:00 cutoff)
      vi.mocked(formatUserTime).mockReturnValue('7:0')
    })

    it('logs a CRITICAL_FUELING_ALERT when starting glycogen is critically low before a hard morning workout', async () => {
      vi.mocked(workoutRepository.getForUser).mockResolvedValue([hardMorningWorkout] as any)

      await metabolicService.checkCriticalAlerts(userId, 15, date)

      expect(auditLogRepository.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'CRITICAL_FUELING_ALERT',
          resourceType: 'Nutrition',
          resourceId: 'nutrition-1',
          metadata: expect.objectContaining({
            startingGlycogen: 15,
            workoutId: 'w-hard-1',
            workoutTitle: 'Threshold Intervals'
          })
        })
      )
    })

    it('does not log an alert when starting glycogen is not critically low', async () => {
      vi.mocked(workoutRepository.getForUser).mockResolvedValue([hardMorningWorkout] as any)

      await metabolicService.checkCriticalAlerts(userId, 45, date)

      expect(workoutRepository.getForUser).not.toHaveBeenCalled()
      expect(auditLogRepository.log).not.toHaveBeenCalled()
    })

    it('does not log an alert when there is no hard morning workout', async () => {
      vi.mocked(workoutRepository.getForUser).mockResolvedValue([
        { ...hardMorningWorkout, intensityFactor: 0.5 }
      ] as any)

      await metabolicService.checkCriticalAlerts(userId, 10, date)

      expect(auditLogRepository.log).not.toHaveBeenCalled()
    })

    it('does not log an alert for a hard workout later in the day', async () => {
      // Afternoon local time (>= 10:00 cutoff)
      vi.mocked(formatUserTime).mockReturnValue('15:0')
      vi.mocked(workoutRepository.getForUser).mockResolvedValue([hardMorningWorkout] as any)

      await metabolicService.checkCriticalAlerts(userId, 10, date)

      expect(auditLogRepository.log).not.toHaveBeenCalled()
    })

    it('does not throw and returns cleanly when no workouts exist for the day', async () => {
      vi.mocked(workoutRepository.getForUser).mockResolvedValue([] as any)

      await expect(metabolicService.checkCriticalAlerts(userId, 5, date)).resolves.toBeUndefined()
      expect(auditLogRepository.log).not.toHaveBeenCalled()
    })

    it('de-dupes and does not re-log an alert already recorded for the same date', async () => {
      vi.mocked(workoutRepository.getForUser).mockResolvedValue([hardMorningWorkout] as any)
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
        { metadata: { date: date.toISOString().split('T')[0] } }
      ] as any)

      await metabolicService.checkCriticalAlerts(userId, 12, date)

      expect(auditLogRepository.log).not.toHaveBeenCalled()
    })
  })

  describe('getUpcomingFuelingWindows carb-loading backfill (CW-71)', () => {
    // weight is mocked to 70kg for this whole file (see resolveEffectiveWeight above),
    // so MEAL_CAP = weight * 2.0 = 140g per sitting.
    const MEAL_CAP = 140

    function makeWindow(targetCarbs: number, hour: string) {
      return {
        type: 'DAILY_BASE',
        slotName: 'Meal',
        startTime: `2026-02-1${hour}T0${hour}:00:00.000Z`,
        endTime: `2026-02-1${hour}T0${hour}:30:00.000Z`,
        targetCarbs,
        targetProtein: 20,
        targetFat: 10,
        status: 'PENDING'
      }
    }

    beforeEach(() => {
      vi.mocked(prisma.nutritionPlan.findFirst).mockResolvedValue(null as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        weight: 70,
        weightSourceMode: 'MANUAL'
      } as any)
      // Hydration debt is orthogonal to carb-loading; keep it at zero so Pass 3 is a no-op.
      vi.spyOn(metabolicService, 'getWaveRange').mockResolvedValue({
        points: [{ fluidDeficit: 0 }]
      } as any)
      // The file-level mock returns a single fixed date string; give each day its own key here
      // so the two simulated days ('2026-02-13' and '2026-02-14') don't collide.
      vi.mocked(formatDateUTC).mockImplementation(
        (d: Date) => d.toISOString().split('T')[0] as string
      )
    })

    it('documents the pre-fix double-count regression that zeroed out carryOverDebt', () => {
      // This is the Pass 2 arithmetic that shipped before commit bd9c33213 ("Build day-level
      // fueling plans that reconcile to daily macro targets."), reproduced here verbatim because
      // that code path no longer exists to call directly. It summed each window's existing
      // PRE/POST target once via `allocated`, then re-added the very same `currentAmount` a second
      // time inside the distribution loop (`newAmount = currentAmount + baseShare`, then
      // `allocated += newAmount`) - hiding a big event day's real overflow.
      const windows = [{ targetCarbs: 140 }, { targetCarbs: 140 }, { targetCarbs: 140 }]
      const carbsGoal = 900 // exceeds windows.length * MEAL_CAP (3 * 140 = 420)
      const totalToAllocate = carbsGoal

      let allocated = windows.reduce((sum, w) => sum + w.targetCarbs, 0) // 420
      const remainingForStationary = totalToAllocate - allocated // 480
      const baseShare = Math.max(0, remainingForStationary) / windows.length // 160

      windows.forEach((w) => {
        const currentAmount = w.targetCarbs // already folded into `allocated` above
        const newAmount = Math.min(MEAL_CAP, currentAmount + baseShare) // capped back to 140
        w.targetCarbs = newAmount
        allocated += w.targetCarbs // BUG: re-adds currentAmount, double-counting it
      })

      const buggyCarryOverDebt = Math.max(0, totalToAllocate - allocated)

      // The correct value (what the fixed code computes): sum the FINAL per-window targets exactly
      // once, then take the day's own shortfall against that.
      const correctAllocated = windows.reduce((sum, w) => sum + w.targetCarbs, 0) // 420 (unchanged,
      // every window was already at MEAL_CAP so the backfill loop couldn't add anything)
      const correctCarryOverDebt = Math.max(0, totalToAllocate - correctAllocated)

      expect(allocated).toBe(840) // 420 (first pass) + 420 (re-counted second pass) - each
      // window's target was folded into `allocated` twice.
      expect(buggyCarryOverDebt).toBe(60) // should be 480; double-counting the existing 420g of
      // window targets hid all but 60g of the day's true overflow.
      expect(correctCarryOverDebt).toBe(480)
      expect(buggyCarryOverDebt).toBeLessThan(correctCarryOverDebt)
    })

    it('produces carryOverDebt for a major-event day and back-distributes it to the prior day', async () => {
      const todaysWindows = [makeWindow(60, '3'), makeWindow(60, '3'), makeWindow(60, '3')]
      const eventDaysWindows = [makeWindow(140, '4'), makeWindow(140, '4'), makeWindow(140, '4')]

      vi.spyOn(metabolicService, 'calculateFuelingPlanForDate').mockImplementation(
        async (_userId: string, date: Date) => {
          const isEventDay = date.getUTCDate() === 14
          return {
            success: true,
            skipped: false,
            plan: {
              windows: isEventDay ? eventDaysWindows : todaysWindows,
              dailyTotals: {
                carbs: isEventDay ? 900 : 300, // event day exceeds windows.length * MEAL_CAP (420)
                protein: 100,
                fat: 50
              }
            }
          } as any
        }
      )

      const result = await metabolicService.getUpcomingFuelingWindows(userId, 2)

      const todayWindows = result.filter((w: any) => w.dateKey === '2026-02-13')
      const eventWindows = result.filter((w: any) => w.dateKey === '2026-02-14')

      // The event day cannot hold more than MEAL_CAP per window, so its own windows are unchanged...
      eventWindows.forEach((w: any) => expect(w.targetCarbs).toBe(140))

      // ...but the 480g it could not fit (900 - 420) flows backward and fills up today's headroom
      // (each window had 80g of room to MEAL_CAP: 140 - 60), confirming carryOverDebt was computed
      // correctly (not zeroed by double-counting) AND actually consumed, not discarded.
      todayWindows.forEach((w: any) => {
        expect(w.targetCarbs).toBe(140)
        expect(w.advice).toBe('Carb loading: extra carbohydrate moved here for a big day ahead.')
      })

      const todayTotal = todayWindows.reduce((sum: number, w: any) => sum + w.targetCarbs, 0)
      expect(todayTotal).toBe(420) // 60*3 original + 80*3 backfilled, each window counted once
    })

    it('does not back-distribute when the day has no overflow', async () => {
      // Return fresh window objects per call - Pass 2 mutates windows in place, and reusing the
      // same object references across days would let one day's mutation leak into the other's.
      vi.spyOn(metabolicService, 'calculateFuelingPlanForDate').mockImplementation(async () => ({
        success: true,
        skipped: false,
        plan: {
          windows: [makeWindow(50, '3'), makeWindow(50, '3'), makeWindow(50, '3')],
          dailyTotals: { carbs: 150, protein: 100, fat: 50 }
        }
      }))

      const result = await metabolicService.getUpcomingFuelingWindows(userId, 2)

      result.forEach((w: any) => {
        expect(w.targetCarbs).toBe(50)
        expect(w.advice).not.toBe(
          'Carb loading: extra carbohydrate moved here for a big day ahead.'
        )
      })
    })
  })

  describe('finalizeDay / getDailyTimeline unification (CW-76)', () => {
    // "Today" is fixed at 2026-02-13 by the file-level `getUserLocalDate` mock, so this date is
    // unambiguously in the past (`isPast` true in both finalizeDay and getDailyTimeline).
    const PAST_DATE = new Date('2026-02-10T00:00:00.000Z')
    const PAST_DATE_YESTERDAY_KEY = '2026-02-09'
    const PAST_DATE_KEY = '2026-02-10'
    // Well after the whole simulated day, so a workout's full duration is always captured
    // regardless of exactly how each call resolves "now".
    const AFTER_PAST_DATE = new Date('2026-02-11T00:00:00.000Z')

    const pastDayRecord = {
      id: 'nutrition-past-day',
      date: PAST_DATE,
      carbsGoal: 400,
      carbs: 350,
      // Logged exactly on the default meal-pattern times (Breakfast 08:00, Lunch 13:00, Dinner
      // 19:00) so the simulation's own synthetic DAILY_BASE candidates are all suppressed by
      // `hasRealLog` - the timeline is driven purely by these logged items, nothing assumed.
      breakfast: [{ name: 'Oats', carbs: 80, protein: 10, fat: 5, calories: 400, date: '08:00' }],
      lunch: [
        { name: 'Rice Bowl', carbs: 120, protein: 20, fat: 10, calories: 700, date: '13:00' }
      ],
      dinner: [{ name: 'Pasta', carbs: 150, protein: 20, fat: 15, calories: 900, date: '19:00' }],
      snacks: []
    }

    // A real, completed workout - always part of the simulation.
    const completedWorkout = {
      id: 'w-completed-1',
      date: new Date('2026-02-10T00:00:00.000Z'),
      title: 'Completed Ride',
      type: 'Ride',
      durationSec: 3600,
      intensity: 0.75
    }

    // Planned for the same day, but never actually completed - a "ghost" workout. CW-76's bug was
    // that `getDailyTimeline` simulated this as though it happened while `finalizeDay` did not.
    const ghostWorkout = {
      id: 'p-ghost-1',
      date: new Date('2026-02-10T00:00:00.000Z'),
      title: 'Planned Threshold Intervals',
      type: 'Ride',
      durationSec: 5400,
      workIntensity: 0.85,
      completed: false
    }

    const settings = {
      bmr: 1600,
      metabolicFloor: 0.6,
      fuelState1Min: 3
    }

    function mockNutritionByDate() {
      vi.mocked(nutritionRepository.getByDate).mockImplementation(
        async (_userId: string, d: Date) => {
          const key = d.toISOString().split('T')[0]
          if (key === PAST_DATE_KEY) return pastDayRecord as any
          if (key === PAST_DATE_YESTERDAY_KEY) {
            return { endingGlycogenPercentage: 65, endingFluidDeficit: 0 } as any
          }
          return null as any
        }
      )
    }

    beforeEach(() => {
      // The CW-72 block above spies on `metabolicService.getDailyTimeline` with a fixed stub
      // return value, and `vi.clearAllMocks()` (run by the file-level beforeEach) clears call
      // history but does not undo a `vi.spyOn(...).mockResolvedValue(...)`. Restore it here so
      // these tests exercise the real method regardless of suite run order.
      const dailyTimelineMock = metabolicService.getDailyTimeline as unknown as {
        mockRestore?: () => void
      }
      dailyTimelineMock.mockRestore?.()

      vi.mocked(getUserNutritionSettings).mockResolvedValue(settings as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        weight: 70,
        weightSourceMode: 'MANUAL',
        ftp: 250
      } as any)
      // Use the real glycogen math for these tests rather than the module-level mocks, so parity
      // is proven against actual computed values, not a stand-in.
      vi.mocked(calculateEnergyTimeline).mockImplementation(realCalculateEnergyTimeline)
      vi.mocked(selectRelevantWorkouts).mockImplementation(realSelectRelevantWorkouts)
    })

    it('finalizeDay ending glycogen matches getDailyTimeline last point for identical inputs (no ghost workouts, fully logged)', async () => {
      mockNutritionByDate()
      vi.mocked(workoutRepository.getForUser).mockResolvedValue([completedWorkout] as any)
      vi.mocked(plannedWorkoutRepository.list).mockResolvedValue([] as any)

      await metabolicService.finalizeDay(userId, PAST_DATE)

      const updateCall = vi.mocked(nutritionRepository.update).mock.calls[0]
      expect(updateCall?.[0]).toBe(pastDayRecord.id)
      const finalizedEndingGlycogen = updateCall?.[1]?.endingGlycogenPercentage

      const timeline = await metabolicService.getDailyTimeline(
        userId,
        PAST_DATE,
        65,
        0,
        AFTER_PAST_DATE
      )
      const timelineLastPoint = timeline.points[timeline.points.length - 1]

      expect(finalizedEndingGlycogen).toBeDefined()
      expect(timelineLastPoint.level).toBe(finalizedEndingGlycogen)
    })

    it('excludes a planned-but-never-completed ("ghost") workout from a past day for both finalizeDay and getDailyTimeline, keeping them in agreement', async () => {
      mockNutritionByDate()
      vi.mocked(workoutRepository.getForUser).mockResolvedValue([completedWorkout] as any)
      vi.mocked(plannedWorkoutRepository.list).mockResolvedValue([ghostWorkout] as any)

      await metabolicService.finalizeDay(userId, PAST_DATE)
      const updateCall = vi.mocked(nutritionRepository.update).mock.calls[0]
      const finalizedEndingGlycogen = updateCall?.[1]?.endingGlycogenPercentage

      const timeline = await metabolicService.getDailyTimeline(
        userId,
        PAST_DATE,
        65,
        0,
        AFTER_PAST_DATE
      )
      const timelineLastPoint = timeline.points[timeline.points.length - 1]

      // The two agree...
      expect(timelineLastPoint.level).toBe(finalizedEndingGlycogen)
      // ...specifically because getDailyTimeline never even looked at planned workouts for a past
      // day, not because the numbers coincidentally lined up.
      expect(plannedWorkoutRepository.list).not.toHaveBeenCalled()

      // Prove the exclusion actually has teeth: simulating the same day with the ghost workout
      // merged in (the pre-fix behavior) produces a strictly lower ending glycogen, since the extra
      // 90 minute session drains additional glycogen that never really happened.
      const withGhostIncluded = realCalculateEnergyTimeline(
        pastDayRecord,
        [completedWorkout, ghostWorkout],
        { ...settings, weight: 70 },
        'UTC',
        undefined,
        { startingGlycogenPercentage: 65, startingFluidDeficit: 0, now: AFTER_PAST_DATE }
      )
      const withGhostIncludedLast = withGhostIncluded[withGhostIncluded.length - 1]

      expect(withGhostIncludedLast.level).toBeLessThan(finalizedEndingGlycogen)
    })

    it('keeps including planned-but-not-yet-completed workouts for getDailyTimeline on today/future days (unchanged behavior)', async () => {
      const TODAY = new Date('2026-02-13T00:00:00.000Z') // matches the mocked getUserLocalDate

      vi.mocked(nutritionRepository.getByDate).mockResolvedValue({
        id: 'nutrition-today',
        date: TODAY,
        carbsGoal: 400,
        breakfast: [{ name: 'Oats', carbs: 80, protein: 10, fat: 5, calories: 400, date: '08:00' }],
        lunch: [],
        dinner: [],
        snacks: []
      } as any)
      vi.mocked(workoutRepository.getForUser).mockResolvedValue([completedWorkout] as any)
      vi.mocked(plannedWorkoutRepository.list).mockResolvedValue([ghostWorkout] as any)

      await metabolicService.getDailyTimeline(
        userId,
        TODAY,
        65,
        0,
        new Date('2026-02-13T12:00:00.000Z')
      )

      // Today is not past, so getDailyTimeline still merges in planned-but-uncompleted workouts -
      // only the finalized-past-day behavior changed.
      expect(plannedWorkoutRepository.list).toHaveBeenCalled()
    })
  })
})

// CW-73: getWaveRange is the single computation path for every wave caller and costs ~97 timeline
// points plus per-day work for each day of the span, so it carries its own bounds rather than
// trusting callers to have validated. These assert the guard fires before any DB work happens.
describe('getWaveRange defensive range bounds (CW-73)', () => {
  const userId = 'user-123'

  beforeEach(() => {
    // An earlier suite in this file spies on getWaveRange without restoring it, and clearAllMocks
    // only resets calls - restore so these exercise the real implementation's guards.
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('computes an inclusive day span', () => {
    expect(
      waveRangeSpanDays(new Date('2026-02-13T00:00:00Z'), new Date('2026-02-13T00:00:00Z'))
    ).toBe(1)
    expect(
      waveRangeSpanDays(new Date('2026-02-13T00:00:00Z'), new Date('2026-02-14T00:00:00Z'))
    ).toBe(2)
  })

  it('rejects a span wider than the hard limit before touching the database', async () => {
    const start = new Date('2026-01-01T00:00:00Z')
    const end = new Date(start.getTime() + (MAX_WAVE_RANGE_SPAN_DAYS + 1) * 24 * 60 * 60 * 1000)

    await expect(metabolicService.getWaveRange(userId, start, end)).rejects.toMatchObject({
      statusCode: 400
    })
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('rejects an end date before the start date', async () => {
    await expect(
      metabolicService.getWaveRange(
        userId,
        new Date('2026-02-13T00:00:00Z'),
        new Date('2026-02-11T00:00:00Z')
      )
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('rejects invalid dates', async () => {
    await expect(
      metabolicService.getWaveRange(userId, new Date('nonsense'), new Date('2026-02-13T00:00:00Z'))
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('rejects a non-finite daysAhead in generateExtendedWave instead of building an Invalid Date', async () => {
    await expect(metabolicService.generateExtendedWave(userId, Number.NaN)).rejects.toMatchObject({
      statusCode: 400
    })
    await expect(metabolicService.generateExtendedWave(userId, -1)).rejects.toMatchObject({
      statusCode: 400
    })
  })
})
