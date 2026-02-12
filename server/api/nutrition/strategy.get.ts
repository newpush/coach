import { getEffectiveUserId } from '../../utils/coaching'
import { metabolicService } from '../../utils/services/metabolicService'
import { getUserTimezone, getUserLocalDate, formatDateUTC } from '../../utils/date'
import { prisma } from '../../utils/db'
import { getUserNutritionSettings } from '../../utils/nutrition/settings'
import { calculateFuelingStrategy } from '../../utils/nutrition/fueling'
import {
  getHydrationRingStatus,
  HYDRATION_DEBT_FLUSH_THRESHOLD_ML,
  HYDRATION_DEBT_NUDGE_THRESHOLD_ML
} from '../../utils/nutrition/hydration'

defineRouteMeta({
  openAPI: {
    tags: ['Nutrition'],
    summary: 'Get metabolic strategy summary',
    description: 'Returns weekly fueling states, hydration debt, and strategic fueling insights.',
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                hydrationDebt: { type: 'number' },
                fuelingMatrix: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      date: { type: 'string' },
                      state: { type: 'integer' },
                      label: { type: 'string' },
                      carbsTarget: { type: 'number' },
                      isRest: { type: 'boolean' }
                    }
                  }
                },
                summary: { type: 'string' }
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const userId = await getEffectiveUserId(event)
  const timezone = await getUserTimezone(userId)
  const today = getUserLocalDate(timezone)

  try {
    // 1. Calculate Fueling Matrix (7 days: Today + 6 ahead)
    const settings = await getUserNutritionSettings(userId)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { weight: true, ftp: true }
    })
    const weight = user?.weight || 75

    const fuelingMatrix = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(today)
      date.setUTCDate(today.getUTCDate() + i)

      const dayPlan = await metabolicService.calculateFuelingPlanForDate(userId, date, {
        persist: false
      })
      const plan = dayPlan.plan as any

      const totals = plan.dailyTotals
      const state = totals.fuelState || 1

      fuelingMatrix.push({
        date: formatDateUTC(date),
        state,
        label: state === 3 ? 'Performance' : state === 2 ? 'Steady' : 'Eco',
        carbsTarget: Math.round(totals.carbs),
        isRest: !plan.windows.some((w: any) => w.type !== 'DAILY_BASE')
      })
    }

    // 2. Calculate Hydration Debt (Last 72h + Today)
    const startDate = new Date(today)
    startDate.setUTCDate(today.getUTCDate() - 3)
    const points = await metabolicService.getWaveRange(userId, startDate, today)
    const lastPoint = points[points.length - 1]
    const hydrationDebt = lastPoint ? Math.max(0, lastPoint.fluidDeficit) : 0

    // 3. Simple Strategic Summary (Static for now, could be AI later)
    const highIntensityDays = fuelingMatrix.filter((d) => d.state >= 2).length
    const performanceDays = fuelingMatrix.filter((d) => d.state === 3).length

    let summary = `Your upcoming week features ${highIntensityDays} fueled days.`
    if (performanceDays > 0) {
      summary += ` You have ${performanceDays} high-performance session(s) requiring aggressive carb loading.`
    } else {
      summary += ` Focus on metabolic efficiency and steady endurance.`
    }

    if (hydrationDebt > HYDRATION_DEBT_NUDGE_THRESHOLD_ML) {
      summary +=
        ' High fluid debt detected. Add 500ml of water to your next two meals to normalize.'
    } else if (hydrationDebt > 1000) {
      summary += ` WARNING: You are carrying a significant fluid debt of ${Math.round(hydrationDebt)}ml. Prioritize rehydration today.`
    }

    return {
      success: true,
      hydrationDebt: Math.round(hydrationDebt),
      hydrationStatus: getHydrationRingStatus(Math.round(hydrationDebt)),
      showHydrationFlushPrompt: hydrationDebt >= HYDRATION_DEBT_FLUSH_THRESHOLD_ML,
      hydrationFlushPrompt:
        hydrationDebt >= HYDRATION_DEBT_FLUSH_THRESHOLD_ML
          ? 'Your hydration debt is high. Have you been drinking water without logging? Tap to reset to zero.'
          : null,
      fuelingMatrix,
      summary
    }
  } catch (error: any) {
    console.error('Error fetching strategy summary:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to fetch metabolic strategy'
    })
  }
})
