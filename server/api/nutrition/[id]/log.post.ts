import { getServerSession } from '../../../utils/session'
import { nutritionRepository } from '../../../utils/repositories/nutritionRepository'
import { generateStructuredAnalysis } from '../../../utils/gemini'
import { z } from 'zod'
import { getProfileForItem } from '../../../utils/nutrition-domain/absorption'
import { getUserTimezone, formatUserTime, getStartOfLocalDateUTC } from '../../../utils/date'
import { metabolicService } from '../../../utils/services/metabolicService'

const LogSchema = z.object({
  query: z.string(),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snacks']).optional()
})

const FoodItemSchema = z.object({
  items: z.array(
    z.object({
      name: z.string().describe('Clear name of the food item (e.g. "Oatmeal", "Blueberries")'),
      calories: z.number().describe('Estimated calories'),
      protein: z.number().describe('Grams of protein'),
      carbs: z.number().describe('Grams of carbohydrates'),
      fat: z.number().describe('Grams of fat'),
      fiber: z.number().optional().describe('Grams of fiber'),
      sugar: z.number().optional().describe('Grams of sugar'),
      absorptionType: z
        .enum(['RAPID', 'FAST', 'BALANCED', 'DENSE', 'HYPER_LOAD'])
        .optional()
        .describe('How fast the food is absorbed'),
      amount: z.number().optional().describe('Numeric quantity'),
      unit: z.string().optional().describe('Unit of measurement (e.g. "g", "ml", "cup")'),
      quantity: z
        .string()
        .optional()
        .describe('Human readable quantity (e.g. "1 bowl", "a handful")'),
      mealType: z
        .enum(['breakfast', 'lunch', 'dinner', 'snacks'])
        .optional()
        .describe('The meal category'),
      logged_at: z
        .string()
        .optional()
        .describe('Time of consumption in HH:mm format (24h) if mentioned')
    })
  )
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const userId = (session.user as any).id
  const timezone = await getUserTimezone(userId)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const { query, mealType } = LogSchema.parse(body)

  let nutrition: any = null
  let dateStr = ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(id!)) {
    dateStr = id!
    const dateObj = new Date(`${id}T00:00:00Z`)
    nutrition = await nutritionRepository.getByDate(userId, dateObj)
  } else {
    nutrition = await nutritionRepository.getById(id!, userId)
    if (nutrition) {
      dateStr = nutrition.date.toISOString().split('T')[0]
    }
  }

  if (!nutrition) {
    // If not found, we still need a date to create one later
    if (!dateStr) throw createError({ statusCode: 404, message: 'Nutrition entry not found' })
  }

  // Use AI to parse the query
  const prompt = `
    You are a nutrition expert. Analyze the following food log entry and extract individual food items with their estimated nutritional values.
    
    User Query: "${query}"
    Target Date: ${dateStr}
    Default Meal Type: ${mealType || 'unknown'}

    CRITICAL INSTRUCTIONS:
    1. For each food item, provide a clear 'name'.
    2. Estimate calories, protein, carbs, and fat based on standard nutritional data if not provided.
    3. Use the 'quantity' field for descriptions like "1 bowl" or "a handful".
    4. If the user mentions a specific time (e.g. "at 9:30", "around 10am"), extract it into 'logged_at' in HH:mm format (24h).
    5. If the user doesn't specify a meal type (breakfast, lunch, dinner, snacks), try to infer it from the query context (e.g. "morning" implies breakfast) or the time mentioned.
    6. Assign an 'absorptionType': 
       - 'RAPID' for pure sugar/liquids (gels, juice, honey, sports drink).
       - 'FAST' for simple carbs (white bread, ripe fruit, banana, candy).
       - 'BALANCED' for complex carbs (oats, pasta, rice, potato, bars).
       - 'DENSE' for items high in protein/fat/fiber (meat, nuts, avocado, whole grains).
       - 'HYPER_LOAD' for very large, high-calorie meals (pizza, Thanksgiving dinner, big pasta party).
    7. Return a JSON object with an 'items' array matching the schema.
  `

  const result = await generateStructuredAnalysis<any>(prompt, FoodItemSchema, 'flash', {
    userId,
    operation: 'LOG_NUTRITION_AI'
  })

  if (!result.items || result.items.length === 0) {
    return { success: false, message: 'Could not parse any food items from your query.' }
  }

  // Group items by target date
  const itemsByDate: Record<string, any[]> = {}

  result.items.forEach((item: any) => {
    let targetDateStr = dateStr
    let normalizedLoggedAt = item.logged_at

    // If no time is provided, use current time in user's timezone
    if (!normalizedLoggedAt) {
      normalizedLoggedAt = formatUserTime(new Date(), timezone)
    }

    if (normalizedLoggedAt.includes('T')) {
      targetDateStr = normalizedLoggedAt.split('T')[0]
    } else if (/^\d{2}:\d{2}/.test(normalizedLoggedAt)) {
      const timeMatch = normalizedLoggedAt.match(/^(\d{2}):(\d{2})/)
      if (timeMatch) {
        const h = parseInt(timeMatch[1]!)
        const m = parseInt(timeMatch[2]!)
        const baseDate = getStartOfLocalDateUTC(timezone, targetDateStr)
        const finalDate = new Date(baseDate.getTime() + (h * 3600 + m * 60) * 1000)
        normalizedLoggedAt = finalDate.toISOString()
      }
    }

    if (!itemsByDate[targetDateStr]) {
      itemsByDate[targetDateStr] = []
    }

    // Ensure absorptionType is set
    const processedItem = {
      ...item,
      logged_at: normalizedLoggedAt,
      absorptionType: item.absorptionType || getProfileForItem(item.name).id
    }

    itemsByDate[targetDateStr]!.push(processedItem)
  })

  const addedItems: any[] = []

  // Process each date group
  for (const [targetDateStr, items] of Object.entries(itemsByDate)) {
    const targetDate = new Date(`${targetDateStr}T00:00:00Z`)

    // Get or create record for this date
    let targetNutrition = await nutritionRepository.getByDate(userId, targetDate)

    if (!targetNutrition) {
      const meals: any = { breakfast: [], lunch: [], dinner: [], snacks: [] }
      items.forEach((item: any) => {
        const targetMeal = item.mealType || mealType || 'snacks'
        meals[targetMeal].push({
          ...item,
          id: crypto.randomUUID(),
          source: 'ai'
        })
      })

      targetNutrition = await nutritionRepository.create({
        userId,
        date: targetDate,
        ...meals
      })
    } else {
      // Update existing
      const updates: any = {}
      items.forEach((item: any) => {
        const targetMeal = item.mealType || mealType || 'snacks'
        if (!updates[targetMeal]) {
          updates[targetMeal] = [
            ...((targetNutrition![targetMeal as keyof typeof targetNutrition] as any[]) || [])
          ]
        }
        updates[targetMeal].push({
          ...item,
          id: crypto.randomUUID(),
          source: 'ai'
        })
      })

      targetNutrition = await nutritionRepository.update(targetNutrition.id, updates)
    }

    // Recalculate totals for this record
    const mealsList = ['breakfast', 'lunch', 'dinner', 'snacks']
    let calories = 0
    let protein = 0
    let carbs = 0
    let fat = 0
    let fiber = 0
    let sugar = 0

    for (const meal of mealsList) {
      const mealItems = (targetNutrition[meal as keyof typeof targetNutrition] as any[]) || []
      for (const i of mealItems) {
        calories += i.calories || 0
        protein += i.protein || 0
        carbs += i.carbs || 0
        fat += i.fat || 0
        fiber += i.fiber || 0
        sugar += i.sugar || 0
      }
    }

    await nutritionRepository.update(targetNutrition.id, {
      calories,
      protein,
      carbs,
      fat,
      fiber,
      sugar
    })

    // REACTIVE: Trigger fueling plan update for the log date
    try {
      await metabolicService.calculateFuelingPlanForDate(userId, targetDate, { persist: true })
    } catch (err) {
      console.error('[NutritionLog] Failed to trigger regeneration:', err)
    }

    addedItems.push(...items)
  }

  return { success: true, itemsAdded: addedItems }
})
