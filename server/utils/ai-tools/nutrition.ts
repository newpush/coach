import { tool } from 'ai'
import { z } from 'zod'
import { prisma } from '../db'
import { nutritionRepository } from '../repositories/nutritionRepository'
import { plannedWorkoutRepository } from '../repositories/plannedWorkoutRepository'
import {
  getStartOfDayUTC,
  getEndOfDayUTC,
  formatUserDate,
  formatUserTime,
  formatDateUTC,
  getUserLocalDate,
  getStartOfLocalDateUTC,
  getEndOfLocalDateUTC
} from '../../utils/date'
import { calculateGlycogenState, calculateEnergyTimeline } from '../nutrition-domain/logic'
import { getProfileForItem } from '../nutrition-domain/absorption'
import { getUserNutritionSettings } from '../../utils/nutrition/settings'
import { metabolicService } from '../services/metabolicService'
import { INTRA_WORKOUT_TARGET_ML_PER_HOUR, MEAL_LINKED_WATER_ML } from '../nutrition/hydration'

// Helper to calculate totals from all meals
const recalculateDailyTotals = (nutrition: any) => {
  const meals = ['breakfast', 'lunch', 'dinner', 'snacks']
  let calories = 0
  let protein = 0
  let carbs = 0
  let fat = 0
  let fiber = 0
  let sugar = 0

  for (const meal of meals) {
    const items = (nutrition[meal] as any[]) || []
    for (const item of items) {
      calories += item.calories || 0
      protein += item.protein || 0
      carbs += item.carbs || 0
      fat += item.fat || 0
      fiber += item.fiber || 0
      sugar += item.sugar || 0
    }
  }

  return { calories, protein, carbs, fat, fiber, sugar }
}

export const nutritionTools = (userId: string, timezone: string) => ({
  get_nutrition_log: tool({
    description:
      'Get nutrition data for specific dates. Use this when the user asks about their eating, meals, macros, or calories. Returns detailed meal logs.',
    inputSchema: z.object({
      start_date: z.string().describe('Start date in ISO format (YYYY-MM-DD)'),
      end_date: z
        .string()
        .optional()
        .describe('End date in ISO format (YYYY-MM-DD). If not provided, defaults to start_date')
    }),
    execute: async ({ start_date, end_date }) => {
      const start = new Date(`${start_date}T00:00:00Z`)
      const end = end_date ? new Date(`${end_date}T00:00:00Z`) : start

      const nutritionEntries = await nutritionRepository.getForUser(userId, {
        startDate: start,
        endDate: end,
        select: {
          id: true,
          date: true,
          calories: true,
          protein: true,
          carbs: true,
          fat: true,
          fiber: true,
          sugar: true,
          breakfast: true,
          lunch: true,
          dinner: true,
          snacks: true,
          aiAnalysis: true
        }
      })

      if (nutritionEntries.length === 0) {
        return { message: 'No nutrition data found for the specified date range' }
      }

      return {
        count: nutritionEntries.length,
        date_range: {
          start: start_date,
          end: end_date || start_date
        },
        entries: nutritionEntries.map((entry) => ({
          id: entry.id,
          date: formatDateUTC(entry.date),
          macros: {
            calories: entry.calories,
            protein: entry.protein ? Math.round(entry.protein) : null,
            carbs: entry.carbs ? Math.round(entry.carbs) : null,
            fat: entry.fat ? Math.round(entry.fat) : null,
            fiber: entry.fiber ? Math.round(entry.fiber) : null,
            sugar: entry.sugar ? Math.round(entry.sugar) : null
          },
          meals: {
            breakfast: entry.breakfast,
            lunch: entry.lunch,
            dinner: entry.dinner,
            snacks: entry.snacks
          },
          ai_analysis: entry.aiAnalysis || null
        })),
        totals: {
          calories: nutritionEntries.reduce((sum, e) => sum + (e.calories || 0), 0),
          protein: nutritionEntries.reduce((sum, e) => sum + (e.protein || 0), 0),
          carbs: nutritionEntries.reduce((sum, e) => sum + (e.carbs || 0), 0),
          fat: nutritionEntries.reduce((sum, e) => sum + (e.fat || 0), 0)
        }
      }
    }
  }),

  log_nutrition_meal: tool({
    description:
      'Log food items to a specific meal (breakfast, lunch, dinner, snacks). Call this when the user says "I ate X" or "Add X to my lunch". The AI should estimate macros for the items if not provided.',
    inputSchema: z.object({
      date: z.string().describe('Date in ISO format (YYYY-MM-DD)'),
      meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snacks']).describe('The meal category'),
      items: z.array(
        z.object({
          name: z.string().describe('Name of the food item'),
          calories: z.number().describe('Calories'),
          protein: z.number().describe('Protein in grams'),
          carbs: z.number().describe('Carbs in grams'),
          fat: z.number().describe('Fat in grams'),
          fiber: z.number().optional().describe('Fiber in grams'),
          sugar: z.number().optional().describe('Sugar in grams'),
          absorption_type: z
            .enum(['RAPID', 'FAST', 'BALANCED', 'DENSE', 'HYPER_LOAD'])
            .optional()
            .describe('How fast the food is absorbed'),
          quantity: z.string().optional().describe('Quantity description (e.g. "1 cup", "100g")'),
          water_ml: z
            .number()
            .optional()
            .describe('Optional fluid volume in ml when item is a drink'),
          logged_at: z
            .string()
            .optional()
            .describe('ISO timestamp or time string (e.g. "08:30") when the item was consumed')
        })
      )
    }),
    execute: async ({ date, meal_type, items }) => {
      const dateUtc = new Date(`${date}T00:00:00Z`)

      let explicitFluidMl = 0

      // Add IDs to items and normalize logged_at
      const itemsWithIds = items.map((item) => {
        let normalizedLoggedAt = item.logged_at

        // If no time is provided, use current time in user's timezone
        if (!normalizedLoggedAt) {
          normalizedLoggedAt = formatUserTime(new Date(), timezone)
        }

        if (normalizedLoggedAt.includes('T')) {
          // If it's a full ISO string, ensure the date part matches the intended date
          const timePart = normalizedLoggedAt.split('T')[1]
          normalizedLoggedAt = `${date}T${timePart}`
        } else if (/^\d{2}:\d{2}/.test(normalizedLoggedAt)) {
          // If it's HH:mm, convert to full ISO string using user's timezone
          const timeMatch = normalizedLoggedAt.match(/^(\d{2}):(\d{2})/)
          if (timeMatch) {
            const h = parseInt(timeMatch[1]!)
            const m = parseInt(timeMatch[2]!)
            const baseDate = getStartOfLocalDateUTC(timezone, date)
            const finalDate = new Date(baseDate.getTime() + (h * 3600 + m * 60) * 1000)
            normalizedLoggedAt = finalDate.toISOString()
          }
        }

        explicitFluidMl += Math.max(0, Math.round(item.water_ml || 0))

        return {
          id: crypto.randomUUID(),
          ...item,
          absorptionType: item.absorption_type || getProfileForItem(item.name).id,
          logged_at: normalizedLoggedAt
        }
      })

      // Get existing record or create new
      let nutrition = await nutritionRepository.getByDate(userId, dateUtc)

      if (!nutrition) {
        nutrition = await nutritionRepository.create({
          userId,
          date: dateUtc,
          [meal_type]: itemsWithIds
        })
      } else {
        // Append items to existing meal
        const currentItems = (nutrition[meal_type] as any[]) || []
        const updatedItems = [...currentItems, ...itemsWithIds]

        nutrition = await nutritionRepository.update(nutrition.id, {
          [meal_type]: updatedItems
        })
      }

      // Recalculate daily totals
      const totals = recalculateDailyTotals(nutrition)

      // Update totals in DB
      const updatedNutrition = await nutritionRepository.update(nutrition.id, {
        calories: totals.calories,
        protein: totals.protein,
        carbs: totals.carbs,
        fat: totals.fat,
        fiber: totals.fiber,
        sugar: totals.sugar,
        waterMl: Math.max(
          0,
          (nutrition.waterMl || 0) + MEAL_LINKED_WATER_ML + Math.max(0, explicitFluidMl)
        )
      })

      try {
        await prisma.auditLog.create({
          data: {
            userId,
            action: 'LOG_NUTRITION_MEAL',
            resourceType: 'Nutrition',
            resourceId: updatedNutrition.id,
            metadata: {
              date,
              meal_type,
              itemCount: items.length,
              calories: totals.calories
            }
          }
        })
      } catch (e) {
        console.error('[NutritionTool] Failed to create audit log:', e)
      }

      return {
        message: `Successfully logged ${items.length} item(s) to ${meal_type} for ${date}`,
        totals: {
          calories: updatedNutrition.calories,
          protein: Math.round(updatedNutrition.protein || 0),
          carbs: Math.round(updatedNutrition.carbs || 0),
          fat: Math.round(updatedNutrition.fat || 0)
        },
        current_meal_items: updatedNutrition[meal_type]
      }
    }
  }),

  log_hydration_intake: tool({
    description:
      'Log hydration volume in ml/L/oz and map it against intra-workout hydration target (0.7L/hr) when relevant.',
    inputSchema: z.object({
      date: z.string().describe('Date in ISO format (YYYY-MM-DD)'),
      volume_ml: z.number().describe('Hydration volume in ml'),
      logged_at: z
        .string()
        .optional()
        .describe('ISO timestamp or time string (HH:mm) when the fluid was consumed')
    }),
    execute: async ({ date, volume_ml, logged_at }) => {
      const dateUtc = new Date(`${date}T00:00:00Z`)
      let normalizedLoggedAt = logged_at

      if (!normalizedLoggedAt) {
        normalizedLoggedAt = formatUserTime(new Date(), timezone)
      }

      if (normalizedLoggedAt.includes('T')) {
        const timePart = normalizedLoggedAt.split('T')[1]
        normalizedLoggedAt = `${date}T${timePart}`
      } else if (/^\d{2}:\d{2}/.test(normalizedLoggedAt)) {
        const timeMatch = normalizedLoggedAt.match(/^(\d{2}):(\d{2})/)
        if (timeMatch) {
          const h = parseInt(timeMatch[1]!)
          const m = parseInt(timeMatch[2]!)
          const baseDate = getStartOfLocalDateUTC(timezone, date)
          const finalDate = new Date(baseDate.getTime() + (h * 3600 + m * 60) * 1000)
          normalizedLoggedAt = finalDate.toISOString()
        }
      }

      const loggedAtDate = new Date(normalizedLoggedAt)

      let nutrition = await nutritionRepository.getByDate(userId, dateUtc)
      if (!nutrition) {
        nutrition = await nutritionRepository.create({
          userId,
          date: dateUtc,
          waterMl: Math.max(0, Math.round(volume_ml))
        })
      } else {
        nutrition = await nutritionRepository.update(nutrition.id, {
          waterMl: Math.max(0, (nutrition.waterMl || 0) + Math.round(volume_ml))
        })
      }

      const dayPlan = await metabolicService.calculateFuelingPlanForDate(userId, dateUtc, {
        persist: false
      })
      const windows = ((dayPlan.plan as any)?.windows || []) as any[]
      const intraWindow = windows.find((window) => {
        if (window.type !== 'INTRA_WORKOUT') return false
        const start = new Date(window.startTime)
        const end = new Date(window.endTime)
        return loggedAtDate >= start && loggedAtDate <= end
      })

      let intraStatus: any = null
      if (intraWindow) {
        const start = new Date(intraWindow.startTime)
        const end = new Date(intraWindow.endTime)
        const elapsedHours = Math.max(
          0,
          Math.min(
            (loggedAtDate.getTime() - start.getTime()) / 3600000,
            (end.getTime() - start.getTime()) / 3600000
          )
        )
        const targetByNowMl = Math.round(elapsedHours * INTRA_WORKOUT_TARGET_ML_PER_HOUR)
        intraStatus = {
          targetByNowMl,
          loggedMl: Math.round(volume_ml),
          completionPercent:
            targetByNowMl > 0 ? Math.round((Math.round(volume_ml) / targetByNowMl) * 100) : 100
        }
      }

      return {
        message: `Logged ${Math.round(volume_ml)}ml hydration for ${date}.`,
        total_water_ml: nutrition.waterMl || 0,
        intra_workout: intraStatus
      }
    }
  }),

  delete_nutrition_item: tool({
    description:
      'Delete a specific food item from a meal or clear an entire meal. Use when user says "Remove the apple" or "Clear breakfast".',
    inputSchema: z.object({
      date: z.string().describe('Date in ISO format (YYYY-MM-DD)'),
      meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snacks']).describe('The meal category'),
      item_name: z
        .string()
        .optional()
        .describe(
          'Name of the item to remove. If omitted, the ENTIRE meal will be cleared. Matching is case-insensitive.'
        )
    }),
    execute: async ({ date, meal_type, item_name }) => {
      const dateUtc = new Date(`${date}T00:00:00Z`)

      let nutrition = await nutritionRepository.getByDate(userId, dateUtc)

      if (!nutrition) {
        return { message: 'No nutrition log found for this date.' }
      }

      const currentItems = (nutrition[meal_type] as any[]) || []
      let updatedItems: any[] = []
      let message = ''

      if (item_name) {
        // Remove specific item (filter out matches)
        const initialLength = currentItems.length
        updatedItems = currentItems.filter(
          (item: any) => item.name.toLowerCase() !== item_name.toLowerCase()
        )
        const removedCount = initialLength - updatedItems.length
        if (removedCount === 0) {
          return {
            message: `Could not find item "${item_name}" in ${meal_type}. Found: ${currentItems.map((i) => i.name).join(', ')}`
          }
        }
        message = `Removed "${item_name}" from ${meal_type}.`
      } else {
        // Clear entire meal
        updatedItems = []
        message = `Cleared all items from ${meal_type}.`
      }

      // Update meal items
      nutrition = await nutritionRepository.update(nutrition.id, {
        [meal_type]: updatedItems
      })

      // Recalculate totals
      const totals = recalculateDailyTotals(nutrition)

      // Update totals in DB
      const updatedNutrition = await nutritionRepository.update(nutrition.id, {
        calories: totals.calories,
        protein: totals.protein,
        carbs: totals.carbs,
        fat: totals.fat,
        fiber: totals.fiber,
        sugar: totals.sugar
      })

      try {
        await prisma.auditLog.create({
          data: {
            userId,
            action: 'DELETE_NUTRITION_ITEM',
            resourceType: 'Nutrition',
            resourceId: updatedNutrition.id,
            metadata: {
              date,
              meal_type,
              item_name,
              calories: totals.calories
            }
          }
        })
      } catch (e) {
        console.error('[NutritionTool] Failed to create audit log:', e)
      }

      return {
        message,
        totals: {
          calories: updatedNutrition.calories,
          protein: Math.round(updatedNutrition.protein || 0),
          carbs: Math.round(updatedNutrition.carbs || 0),
          fat: Math.round(updatedNutrition.fat || 0)
        },
        remaining_items: updatedItems
      }
    }
  }),

  get_fueling_recommendations: tool({
    description: 'Get the calculated fueling plan for a specific date.',
    inputSchema: z.object({
      date: z.string().optional().describe('Date in ISO format (YYYY-MM-DD). Defaults to today.')
    }),
    execute: async ({ date }) => {
      let dateUtc: Date
      if (date) {
        dateUtc = new Date(`${date}T00:00:00Z`)
      } else {
        dateUtc = getUserLocalDate(timezone) // This already returns UTC midnight
      }

      const nutrition = await nutritionRepository.getByDate(userId, dateUtc)

      if (!nutrition || !nutrition.fuelingPlan) {
        // Fallback: Check for planned workout to see if we *should* have one
        const workout = await plannedWorkoutRepository
          .list(userId, {
            startDate: dateUtc,
            endDate: dateUtc,
            limit: 1
          })
          .then((list) => list[0])

        if (workout) {
          return {
            status: 'PENDING_GENERATION',
            message:
              "A planned workout exists but the fueling plan hasn't been generated yet. It should be available shortly."
          }
        }

        return {
          status: 'NO_PLAN',
          message:
            'No structured fueling plan found. Ensures the user has a planned workout for this date.'
        }
      }

      return {
        status: 'FOUND',
        plan: nutrition.fuelingPlan,
        daily_targets: {
          calories: nutrition.caloriesGoal,
          carbs: nutrition.carbsGoal,
          protein: nutrition.proteinGoal,
          fat: nutrition.fatGoal
        }
      }
    }
  }),

  get_metabolic_strategy: tool({
    description:
      'Analyze the users metabolic strategy for the next 7 days, including fueling states (Performance, Steady, Eco), hydration debt, and key fueling challenges. Use this when the user asks about their upcoming week, how to prepare for a big race, or why they feel fatigued.',
    inputSchema: z.object({
      days_ahead: z.number().default(7).describe('Number of days to analyze (default 7, max 14)')
    }),
    execute: async ({ days_ahead }) => {
      const days = Math.min(14, Math.max(1, days_ahead))
      const today = getUserLocalDate(timezone)
      const settings = await getUserNutritionSettings(userId)
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { weight: true, ftp: true }
      })
      const weight = user?.weight || 75

      const strategy = []
      for (let i = 0; i < days; i++) {
        const date = new Date(today)
        date.setUTCDate(today.getUTCDate() + i)

        const dayPlan = await metabolicService.calculateFuelingPlanForDate(userId, date, {
          persist: false
        })
        const plan = dayPlan.plan as any
        const totals = plan.dailyTotals

        let state = 1
        if (totals.carbs / weight >= settings.fuelState3Min) state = 3
        else if (totals.carbs / weight >= settings.fuelState2Min) state = 2

        strategy.push({
          date: formatDateUTC(date),
          state: state === 3 ? 'Performance' : state === 2 ? 'Steady' : 'Eco',
          carbsTarget: Math.round(totals.carbs),
          isRest: !plan.windows.some((w: any) => w.type !== 'DAILY_BASE'),
          notes: plan.notes
        })
      }

      // Calculate persistent hydration debt
      const startDate = new Date(today)
      startDate.setUTCDate(today.getUTCDate() - 3)
      const points = await metabolicService.getWaveRange(userId, startDate, today)
      const lastPoint = points[points.length - 1]
      const hydrationDebt = lastPoint ? Math.max(0, lastPoint.fluidDeficit) : 0

      return {
        strategy,
        hydration_debt_ml: Math.round(hydrationDebt),
        user_weight_kg: weight,
        current_date: formatDateUTC(today),
        settings: {
          carb_max: settings.currentCarbMax,
          sweat_rate: settings.sweatRate
        }
      }
    }
  }),

  get_daily_fueling_status: tool({
    description:
      'Get detailed fueling status (fuel tank level, energy timeline metrics) for a specific date. Use this to answer questions like "How is my fueling today?", "Will I function well for my workout?", or "Do I have enough energy?".',
    inputSchema: z.object({
      date: z.string().optional().describe('Date in ISO format (YYYY-MM-DD). Defaults to today.')
    }),
    execute: async ({ date }) => {
      let dateUtc: Date
      if (date) {
        dateUtc = new Date(`${date}T00:00:00Z`)
      } else {
        dateUtc = getUserLocalDate(timezone)
      }

      const [nutrition, workouts, settings] = await Promise.all([
        nutritionRepository.getByDate(userId, dateUtc),
        plannedWorkoutRepository.list(userId, {
          startDate: dateUtc,
          endDate: dateUtc
        }),
        getUserNutritionSettings(userId)
      ])

      const safeNutrition = nutrition || { date: dateUtc.toISOString() }

      // Logic expects a Date object for 'currentTime' to calculate tank level "right now" vs end of day
      const queryDateStr = formatDateUTC(dateUtc, 'yyyy-MM-dd')
      const todayStr = formatDateUTC(getUserLocalDate(timezone), 'yyyy-MM-dd')
      const isToday = queryDateStr === todayStr

      // If today, use actual current time. If past/future, use 23:59:59 of that day.
      const now = new Date()
      let simTime = now
      if (!isToday) {
        simTime = getEndOfDayUTC(timezone, dateUtc)
      }

      // 3. Run Logic (reusing frontend shared logic)
      const glycogenState = calculateGlycogenState(
        safeNutrition,
        workouts,
        settings,
        timezone,
        simTime
      )

      const energyTimeline = calculateEnergyTimeline(safeNutrition, workouts, settings, timezone)

      // 4. Summarize
      const formatTime = (t: string) => t // events already formatted in HH:mm

      const minLevel = Math.min(...energyTimeline.map((p) => p.level))
      const minPoint = energyTimeline.find((p) => p.level === minLevel)

      // Identify periods below 30% (Zone 3 / Red)
      const criticalPeriods = energyTimeline.filter((p) => p.level < 30)
      const criticalTimeRange =
        criticalPeriods.length > 0
          ? `${criticalPeriods[0]!.time} - ${criticalPeriods[criticalPeriods.length - 1]!.time}`
          : 'None'

      // Identify workout fueling states
      const workoutStates = workouts.map((w) => {
        // approximate start time logic matching timeline
        // This is complex to match exactly without reusing timeline map logic
        // For simple chat summary, we can just list them
        return {
          title: w.title,
          intensity: w.workIntensity?.toFixed(2) || 'N/A'
        }
      })

      return {
        date: queryDateStr,
        is_today: isToday,
        fuel_tank: {
          level: glycogenState.percentage,
          status:
            glycogenState.state === 1
              ? 'Optimal'
              : glycogenState.state === 2
                ? 'Moderate'
                : 'Critical',
          advice: glycogenState.advice,
          breakdown: {
            baseline: glycogenState.breakdown.midnightBaseline,
            replenished: glycogenState.breakdown.replenishment.value,
            depleted_by_exercise: glycogenState.breakdown.depletion.reduce(
              (acc, curr) => acc + curr.value,
              0
            )
          }
        },
        energy_timeline: {
          minimum_level: minLevel,
          minimum_time: minPoint?.time,
          critical_drop_periods: criticalTimeRange,
          summary: `Energy drops to a minimum of ${minLevel}% at ${minPoint?.time}.`
        },
        nutrition_summary: {
          calories: {
            logged: Math.round(nutrition?.calories || 0),
            target: Math.round(nutrition?.caloriesGoal || 0)
          },
          carbs: {
            logged: Math.round(nutrition?.carbs || 0),
            target: Math.round(nutrition?.carbsGoal || 0)
          }
        },
        workouts_on_day: workoutStates.length
      }
    }
  })
})
