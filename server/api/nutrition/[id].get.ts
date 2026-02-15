import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'
import { nutritionRepository } from '../../utils/repositories/nutritionRepository'
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
  let chainCalibration: any = null

  if (dateObj) {
    const state = await metabolicService.getMetabolicStateForDate(userId, dateObj)
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

    const lookbackStart = new Date(dateObj)
    lookbackStart.setUTCDate(dateObj.getUTCDate() - 6)
    const recentChain = await prisma.nutrition.findMany({
      where: {
        userId,
        date: {
          gte: lookbackStart,
          lte: dateObj
        }
      },
      select: {
        date: true,
        calories: true,
        carbs: true,
        breakfast: true,
        lunch: true,
        dinner: true,
        snacks: true,
        startingGlycogenPercentage: true,
        endingGlycogenPercentage: true
      }
    })

    const anchoredDays = recentChain.filter((d) => {
      const hasChainState =
        d.startingGlycogenPercentage != null || d.endingGlycogenPercentage != null
      const hasMealLogs =
        (Array.isArray(d.breakfast) && d.breakfast.length > 0) ||
        (Array.isArray(d.lunch) && d.lunch.length > 0) ||
        (Array.isArray(d.dinner) && d.dinner.length > 0) ||
        (Array.isArray(d.snacks) && d.snacks.length > 0)
      const hasMacroSignal = (d.carbs || 0) > 0 || (d.calories || 0) > 0
      return hasChainState || hasMealLogs || hasMacroSignal
    }).length

    chainCalibration = {
      anchoredDays,
      totalDays: 7,
      confidence: anchoredDays >= 5 ? 'HIGH' : anchoredDays >= 3 ? 'MEDIUM' : 'CALIBRATING',
      isCalibrating: anchoredDays < 7
    }

    // Use unified service for fueling plan if missing or needs refresh
    if (!nutrition || !nutrition.fuelingPlan) {
      const planResult = await metabolicService.calculateFuelingPlanForDate(userId, dateObj, {
        persist: false
      })
      const estimate = planResult.plan as any

      if (!nutrition) {
        nutrition = {
          date: dateObj,
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          caloriesGoal: estimate.dailyTotals.calories,
          proteinGoal: estimate.dailyTotals.protein,
          carbsGoal: estimate.dailyTotals.carbs,
          fatGoal: estimate.dailyTotals.fat,
          fuelingPlan: estimate,
          aiAnalysisStatus: 'NOT_STARTED',
          isEstimate: true
        }
      } else {
        nutrition.fuelingPlan = estimate
        nutrition.caloriesGoal = estimate.dailyTotals.calories
        nutrition.proteinGoal = estimate.dailyTotals.protein
        nutrition.carbsGoal = estimate.dailyTotals.carbs
        nutrition.fatGoal = estimate.dailyTotals.fat
      }
    }
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
    chainCalibration,
    date:
      nutrition.date instanceof Date
        ? nutrition.date.toISOString().split('T')[0]
        : (nutrition.date as string),
    llmUsageId: llmUsage?.id,
    feedback: llmUsage?.feedback,
    feedbackText: llmUsage?.feedbackText
  }
})
