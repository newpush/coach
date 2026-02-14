import { prisma } from '../db'
import { startOfDay, endOfDay, eachDayOfInterval, format } from 'date-fns'
import { metabolicService } from './metabolicService'
import { getUserTimezone } from '../date'

export const nutritionPlanService = {
  toDailyBaseWindowKey(slotName?: string) {
    const normalized = (slotName || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
    return normalized ? `DAILY_BASE:${normalized}` : 'DAILY_BASE'
  },

  sanitizeMealTitle(value: unknown) {
    const raw = typeof value === 'string' ? value.trim() : ''
    if (!raw) return ''
    return raw.replace(/^(?:\s*(?:option\s*\d+|daily\s*base)\s*[:\-–]\s*)+/i, '').trim()
  },

  /**
   * Fetches a nutrition plan and its associated meals for a user within a date range.
   */
  async getPlanForRange(userId: string, startDate: Date, endDate: Date) {
    console.log('[nutritionPlanService.getPlanForRange] request', {
      userId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    })
    const overlappingPlans = await prisma.nutritionPlan.findMany({
      where: {
        userId,
        startDate: { lte: endDate },
        endDate: { gte: startDate }
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        meals: {
          where: {
            date: {
              gte: startDate,
              lte: endDate
            }
          },
          orderBy: { scheduledAt: 'asc' }
        }
      }
    })
    console.log(
      '[nutritionPlanService.getPlanForRange] overlapping plans',
      overlappingPlans.map((p) => ({
        id: p.id,
        status: p.status,
        startDate: p.startDate?.toISOString?.().slice(0, 10) || null,
        endDate: p.endDate?.toISOString?.().slice(0, 10) || null,
        updatedAt: p.updatedAt?.toISOString?.() || null,
        mealsInRange: p.meals.length
      }))
    )

    if (!overlappingPlans.length) return null

    const primary = overlappingPlans[0]
    if (!primary) return null

    const mergedMealsMap = new Map<string, any>()

    for (const plan of overlappingPlans) {
      for (const meal of plan.meals) {
        const dateKey =
          meal.date instanceof Date
            ? meal.date.toISOString().slice(0, 10)
            : String(meal.date).slice(0, 10)
        const key = `${dateKey}|${meal.windowType}`
        const existing = mergedMealsMap.get(key)
        if (
          !existing ||
          new Date(meal.updatedAt).getTime() > new Date(existing.updatedAt).getTime()
        ) {
          mergedMealsMap.set(key, meal)
        }
      }
    }

    const mergedMeals = Array.from(mergedMealsMap.values()).sort(
      (a: any, b: any) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    )
    console.log('[nutritionPlanService.getPlanForRange] merged result', {
      primaryPlanId: primary.id,
      mergedMealsCount: mergedMeals.length,
      mergedMeals: mergedMeals.map((m: any) => ({
        id: m.id,
        date:
          m.date instanceof Date ? m.date.toISOString().slice(0, 10) : String(m.date).slice(0, 10),
        windowType: m.windowType,
        title: m?.mealJson?.title
      }))
    })

    return {
      ...primary,
      meals: mergedMeals
    }
  },

  /**
   * Locks a specific meal into the user's nutrition plan for a given date and window.
   */
  async lockMeal(
    userId: string,
    date: Date | string,
    windowType: string,
    meal: any,
    slotName?: string,
    options?: {
      windowAssignments?: Array<{
        windowType: string
        slotName?: string
        label?: string
        targetCarbs?: number
        targetProtein?: number
        targetKcal?: number
      }>
    }
  ) {
    const timezone = await getUserTimezone(userId)
    const dateKey = typeof date === 'string' ? date.slice(0, 10) : format(date, 'yyyy-MM-dd')
    const dayStartUtc = new Date(`${dateKey}T00:00:00.000Z`)
    const dayEndUtc = new Date(`${dateKey}T23:59:59.999Z`)
    if (Number.isNaN(dayStartUtc.getTime()) || Number.isNaN(dayEndUtc.getTime())) {
      throw new Error(`Invalid date for lockMeal: ${String(date)}`)
    }
    const inputAssignments = Array.isArray(options?.windowAssignments)
      ? options?.windowAssignments || []
      : []
    const rawAssignments =
      inputAssignments.length > 0
        ? inputAssignments
        : [
            {
              windowType,
              slotName
            }
          ]
    const normalizedAssignments = rawAssignments
      .map((assignment) => {
        const normalizedWindowType =
          assignment.windowType === 'DAILY_BASE'
            ? this.toDailyBaseWindowKey(assignment.slotName)
            : assignment.windowType
        return {
          ...assignment,
          normalizedWindowType
        }
      })
      .filter((assignment, index, all) => {
        return (
          all.findIndex(
            (candidate) => candidate.normalizedWindowType === assignment.normalizedWindowType
          ) === index
        )
      })

    // 1. Find or Create the weekly/period plan
    // We try to find a plan that covers this date
    let plan = await prisma.nutritionPlan.findFirst({
      where: {
        userId,
        startDate: { lte: dayStartUtc },
        endDate: { gte: dayStartUtc }
      }
    })

    if (!plan) {
      // Create a 7-day plan starting from the requested date's week start (Monday)
      // For simplicity here, just create a 7-day plan from the requested date
      plan = await prisma.nutritionPlan.create({
        data: {
          userId,
          startDate: dayStartUtc,
          endDate: endOfDay(new Date(dayStartUtc.getTime() + 6 * 24 * 60 * 60 * 1000)),
          status: 'ACTIVE'
        }
      })
    }

    const toFiniteNumber = (value: unknown) => {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : 0
    }
    const normalizedTotals = {
      carbs: toFiniteNumber(meal?.totals?.carbs ?? meal?.carbs),
      protein: toFiniteNumber(meal?.totals?.protein ?? meal?.protein),
      kcal: toFiniteNumber(
        meal?.totals?.kcal ?? meal?.totals?.calories ?? meal?.kcal ?? meal?.calories
      ),
      fat: toFiniteNumber(meal?.totals?.fat ?? meal?.fat)
    }
    const sanitizedMeal = {
      ...(meal || {}),
      title:
        this.sanitizeMealTitle(meal?.title) ||
        this.sanitizeMealTitle(meal?.name) ||
        meal?.title ||
        meal?.name ||
        'Meal',
      totals: normalizedTotals
    }
    const totals = sanitizedMeal.totals
    const assignmentTargetTotalCarbs = normalizedAssignments.reduce(
      (sum, assignment) => sum + Number(assignment.targetCarbs || 0),
      0
    )
    const assignmentTargetTotalProtein = normalizedAssignments.reduce(
      (sum, assignment) => sum + Number(assignment.targetProtein || 0),
      0
    )
    const assignmentTargetTotalKcal = normalizedAssignments.reduce(
      (sum, assignment) => sum + Number(assignment.targetKcal || 0),
      0
    )

    const splitTotalsForAssignments = normalizedAssignments.map((assignment, index) => {
      const denominator =
        assignmentTargetTotalCarbs > 0
          ? assignmentTargetTotalCarbs
          : assignmentTargetTotalProtein > 0
            ? assignmentTargetTotalProtein
            : assignmentTargetTotalKcal > 0
              ? assignmentTargetTotalKcal
              : normalizedAssignments.length
      const numerator =
        assignmentTargetTotalCarbs > 0
          ? Number(assignment.targetCarbs || 0)
          : assignmentTargetTotalProtein > 0
            ? Number(assignment.targetProtein || 0)
            : assignmentTargetTotalKcal > 0
              ? Number(assignment.targetKcal || 0)
              : 1
      const ratio = denominator > 0 ? numerator / denominator : 1 / normalizedAssignments.length

      const carbsRaw = Number(totals.carbs || 0) * ratio
      const proteinRaw = Number(totals.protein || 0) * ratio
      const kcalRaw = Number(totals.kcal || 0) * ratio
      const fatRaw = Number(totals.fat || 0) * ratio

      return {
        ...assignment,
        ratio,
        totals: {
          carbs: index === normalizedAssignments.length - 1 ? null : Math.round(carbsRaw),
          protein: index === normalizedAssignments.length - 1 ? null : Math.round(proteinRaw),
          kcal: index === normalizedAssignments.length - 1 ? null : Math.round(kcalRaw),
          fat: index === normalizedAssignments.length - 1 ? null : Math.round(fatRaw)
        }
      }
    })

    const assignedSoFar = splitTotalsForAssignments
      .slice(0, Math.max(0, splitTotalsForAssignments.length - 1))
      .reduce(
        (sum, assignment) => ({
          carbs: sum.carbs + Number(assignment.totals.carbs || 0),
          protein: sum.protein + Number(assignment.totals.protein || 0),
          kcal: sum.kcal + Number(assignment.totals.kcal || 0),
          fat: sum.fat + Number(assignment.totals.fat || 0)
        }),
        { carbs: 0, protein: 0, kcal: 0, fat: 0 }
      )
    if (splitTotalsForAssignments.length > 0) {
      const last = splitTotalsForAssignments[splitTotalsForAssignments.length - 1]
      if (last) {
        last.totals = {
          carbs: Math.max(0, Math.round(Number(totals.carbs || 0) - assignedSoFar.carbs)),
          protein: Math.max(0, Math.round(Number(totals.protein || 0) - assignedSoFar.protein)),
          kcal: Math.max(0, Math.round(Number(totals.kcal || 0) - assignedSoFar.kcal)),
          fat: Math.max(0, Math.round(Number(totals.fat || 0) - assignedSoFar.fat))
        }
      }
    }

    const persistedPlanMeals: any[] = []
    for (const assignment of splitTotalsForAssignments) {
      const mealForAssignment = {
        ...sanitizedMeal,
        totals: {
          ...totals,
          ...assignment.totals
        },
        allocation: {
          ratio: assignment.ratio,
          splitAcrossWindows: splitTotalsForAssignments.length > 1,
          normalizedWindowType: assignment.normalizedWindowType
        }
      }

      const planMeal = await prisma.nutritionPlanMeal.upsert({
        where: {
          planId_date_windowType: {
            planId: plan.id,
            date: dayStartUtc,
            windowType: assignment.normalizedWindowType
          }
        },
        create: {
          planId: plan.id,
          date: dayStartUtc,
          windowType: assignment.normalizedWindowType,
          scheduledAt: typeof date === 'string' ? dayStartUtc : date,
          status: 'PLANNED',
          targetJson: {
            carbs: Number(assignment.targetCarbs ?? assignment.totals.carbs ?? 0),
            protein: Number(assignment.targetProtein ?? assignment.totals.protein ?? 0),
            kcal: Number(assignment.targetKcal ?? assignment.totals.kcal ?? 0)
          },
          mealJson: mealForAssignment
        },
        update: {
          mealJson: mealForAssignment,
          status: 'PLANNED',
          updatedAt: new Date()
        }
      })
      persistedPlanMeals.push(planMeal)
    }

    // 3. Update the Nutrition record's fuelingPlan JSON
    // This allows the metabolic engine to see the "Locked" intent in the same transaction context
    const nutrition = await prisma.nutrition.findUnique({
      where: { userId_date: { userId, date: dayStartUtc } }
    })

    if (nutrition) {
      const fuelingPlan = (nutrition.fuelingPlan as any) || { windows: [] }
      for (let i = 0; i < splitTotalsForAssignments.length; i++) {
        const assignment = splitTotalsForAssignments[i]
        if (!assignment) continue

        const lockedMeal = persistedPlanMeals[i]
        const windowIndex = fuelingPlan.windows.findIndex((window: any) => {
          if (assignment.windowType === 'DAILY_BASE') {
            const slot = (assignment.slotName || '').trim().toLowerCase()
            const label = (window.label || '').trim().toLowerCase()
            const description = (window.description || '').trim().toLowerCase()
            return (
              window.type === 'DAILY_BASE' &&
              (!slot || label.includes(slot) || description.includes(slot))
            )
          }
          return window.type === assignment.windowType
        })

        if (windowIndex === -1) continue
        fuelingPlan.windows[windowIndex] = {
          ...fuelingPlan.windows[windowIndex],
          isLocked: true,
          lockedMealId: lockedMeal.id,
          lockedMeal: (lockedMeal as any)?.mealJson || null
        }
      }

      await prisma.nutrition.update({
        where: { id: nutrition.id },
        data: { fuelingPlan }
      })
    }

    if (persistedPlanMeals.length === 1) {
      return persistedPlanMeals[0]
    }

    return {
      id: persistedPlanMeals[0]?.id || null,
      planId: plan.id,
      date: dayStartUtc,
      windowType: 'MULTI',
      status: 'PLANNED',
      meals: persistedPlanMeals
    }
  },

  /**
   * Generates a draft nutrition plan for a range of dates.
   * This is a "dry run" that calculates targets but doesn't lock meals yet.
   */
  async generateDraftPlan(userId: string, startDate: Date, endDate: Date) {
    const timezone = await getUserTimezone(userId)
    const days = eachDayOfInterval({ start: startDate, end: endDate })

    const daySummaries = []

    for (const day of days) {
      const nutritionData = await metabolicService.getNutritionDay(
        userId,
        format(day, 'yyyy-MM-dd')
      )
      daySummaries.push({
        date: format(day, 'yyyy-MM-dd'),
        fuelingPlan: nutritionData.fuelingPlan,
        targets: nutritionData.targets
      })
    }

    // Upsert the NutritionPlan with the summary
    return prisma.nutritionPlan.upsert({
      where: {
        // Find by userId and startDate (simplistic unique for now)
        id:
          (
            await prisma.nutritionPlan.findFirst({
              where: { userId, startDate }
            })
          )?.id || 'new-id'
      },
      create: {
        userId,
        startDate,
        endDate,
        status: 'DRAFT',
        summaryJson: { days: daySummaries } as any
      },
      update: {
        summaryJson: { days: daySummaries } as any,
        updatedAt: new Date()
      }
    })
  }
}
