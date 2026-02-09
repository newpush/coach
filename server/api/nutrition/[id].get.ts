import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'
import { nutritionRepository } from '../../utils/repositories/nutritionRepository'
import { getUserNutritionSettings } from '../../utils/nutrition/settings'
import { calculateFuelingStrategy } from '../../utils/nutrition/fueling'
import { plannedWorkoutRepository } from '../../utils/repositories/plannedWorkoutRepository'

defineRouteMeta({
  openAPI: {
    tags: ['Nutrition'],
    summary: 'Get nutrition entry',
    description: 'Returns a specific nutrition log by ID.',
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' }
      }
    ],
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                date: { type: 'string', format: 'date' },
                calories: { type: 'integer', nullable: true },
                protein: { type: 'number', nullable: true },
                carbs: { type: 'number', nullable: true },
                fat: { type: 'number', nullable: true }
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' },
      404: { description: 'Nutrition entry not found' }
    }
  }
})

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

  // PROACTIVE ESTIMATION FOR SKELETONS OR MISSING PLANS
  if (!nutrition || !nutrition.fuelingPlan) {
    if (dateObj) {
      // Find a planned workout for this day
      const plannedWorkouts = await plannedWorkoutRepository.list(userId, {
        startDate: dateObj,
        endDate: dateObj,
        limit: 1
      })

      if (plannedWorkouts.length > 0) {
        const workout = plannedWorkouts[0]
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { weight: true, ftp: true }
        })
        const settings = await getUserNutritionSettings(userId)

        // Convert HH:mm string to a Date object relative to the workout date
        let startTimeDate: Date | null = null
        if (
          workout.startTime &&
          typeof workout.startTime === 'string' &&
          workout.startTime.includes(':')
        ) {
          const [h, m] = workout.startTime.split(':').map(Number)
          startTimeDate = new Date(workout.date)
          startTimeDate.setUTCHours(h || 10, m || 0, 0, 0)
        }

        const estimate = calculateFuelingStrategy(
          {
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
          },
          {
            ...workout,
            startTime: startTimeDate,
            strategyOverride: workout.fuelingStrategy || undefined
          } as any
        )

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
          // Keep existing actuals but use estimated plan and goals
          nutrition.fuelingPlan = estimate
          nutrition.caloriesGoal = estimate.dailyTotals.calories
          nutrition.proteinGoal = estimate.dailyTotals.protein
          nutrition.carbsGoal = estimate.dailyTotals.carbs
          nutrition.fatGoal = estimate.dailyTotals.fat
        }
      }
    }
  }

  if (!nutrition) {
    // Final skeleton fallback
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

  // Find associated LLM usage
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

  // Format date to avoid timezone issues
  return {
    ...nutrition,
    date:
      nutrition.date instanceof Date
        ? nutrition.date.toISOString().split('T')[0]
        : (nutrition.date as string),
    llmUsageId: llmUsage?.id,
    feedback: llmUsage?.feedback,
    feedbackText: llmUsage?.feedbackText
  }
})
