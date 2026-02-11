import { tool } from 'ai'
import { z } from 'zod'
import { nutritionRepository } from '../repositories/nutritionRepository'
import { plannedWorkoutRepository } from '../repositories/plannedWorkoutRepository'
import {
  getStartOfDayUTC,
  getEndOfDayUTC,
  formatUserDate,
  formatDateUTC,
  getUserLocalDate,
  getStartOfLocalDateUTC,
  getEndOfLocalDateUTC
} from '../../utils/date'

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
      const start = getStartOfLocalDateUTC(timezone, start_date)

      let end: Date
      if (end_date) {
        end = getEndOfLocalDateUTC(timezone, end_date)
      } else {
        end = getEndOfLocalDateUTC(timezone, start_date)
      }

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
          quantity: z.string().optional().describe('Quantity description (e.g. "1 cup", "100g")'),
          logged_at: z
            .string()
            .optional()
            .describe('ISO timestamp or time string (e.g. "08:30") when the item was consumed')
        })
      )
    }),
    execute: async ({ date, meal_type, items }) => {
      const dateUtc = getStartOfLocalDateUTC(timezone, date)

      // Add IDs to items if they don't have them
      const itemsWithIds = items.map((item) => ({
        id: crypto.randomUUID(),
        ...item
      }))

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
        sugar: totals.sugar
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
      const dateUtc = getStartOfLocalDateUTC(timezone, date)

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
        dateUtc = getStartOfLocalDateUTC(timezone, date)
      } else {
        dateUtc = getStartOfDayUTC(timezone, new Date())
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
  })
})
