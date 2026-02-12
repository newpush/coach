import { getServerSession } from '../../../utils/session'
import { nutritionRepository } from '../../../utils/repositories/nutritionRepository'
import { z } from 'zod'
import { metabolicService } from '../../../utils/services/metabolicService'
import { MEAL_LINKED_WATER_ML } from '../../../utils/nutrition/hydration'

const ItemSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  calories: z.coerce.number(),
  protein: z.coerce.number(),
  carbs: z.coerce.number(),
  fat: z.coerce.number(),
  fiber: z.coerce.number().optional(),
  sugar: z.coerce.number().optional(),
  amount: z.coerce.number().optional(),
  unit: z.string().optional(),
  logged_at: z.string().optional(),
  absorptionType: z.enum(['RAPID', 'FAST', 'BALANCED', 'DENSE', 'HYPER_LOAD']).optional()
})

const PatchSchema = z.object({
  action: z.enum(['add', 'update', 'delete']),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snacks']),
  item: ItemSchema.optional(),
  itemId: z.string().optional()
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const userId = (session.user as any).id
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const { action, mealType, item, itemId } = PatchSchema.parse(body)

  let nutrition: any = null
  if (/^\d{4}-\d{2}-\d{2}$/.test(id!)) {
    const dateObj = new Date(`${id}T00:00:00Z`)
    nutrition = await nutritionRepository.getByDate(userId, dateObj)
  } else {
    nutrition = await nutritionRepository.getById(id!, userId)
  }

  if (!nutrition) {
    if (action === 'add' && /^\d{4}-\d{2}-\d{2}$/.test(id!)) {
      const dateObj = new Date(`${id}T00:00:00Z`)
      nutrition = await nutritionRepository.create({
        userId,
        date: dateObj,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
        sugar: 0,
        waterMl: 0,
        breakfast: [],
        lunch: [],
        dinner: [],
        snacks: []
      })
    } else {
      throw createError({ statusCode: 404, message: 'Nutrition entry not found' })
    }
  }

  const mealsList = ['breakfast', 'lunch', 'dinner', 'snacks']
  const currentItems = (nutrition[mealType] as any[]) || []
  let updatedItems = [...currentItems]

  if (action === 'add') {
    if (!item) throw createError({ statusCode: 400, message: 'Item is required for add' })
    updatedItems.push({
      ...item,
      id: item.id || crypto.randomUUID(),
      source: 'manual'
    })
  } else if (action === 'update') {
    if (!item) throw createError({ statusCode: 400, message: 'Item is required for update' })

    let index = -1
    if (item.id) {
      index = updatedItems.findIndex((i) => i.id === item.id)
    }

    // Fallback matching for items without IDs
    if (index === -1) {
      index = updatedItems.findIndex(
        (i) => i.name === item.name && Math.abs((i.calories || 0) - (item.calories || 0)) < 1
      )
    }

    // If still not found, search in other meals if ID is provided
    if (index === -1 && item.id) {
      for (const m of mealsList) {
        if (m === mealType) continue
        const otherItems = (nutrition[m] as any[]) || []
        const otherIndex = otherItems.findIndex((i) => i.id === item.id)
        if (otherIndex !== -1) {
          // Found it in another meal!
          // We need to remove it from there and add it to the target mealType
          const [foundItem] = otherItems.splice(otherIndex, 1)
          await nutritionRepository.update(nutrition.id, { [m]: otherItems })

          // Re-fetch nutrition to get updated state for other meals
          const updatedNutrition = await nutritionRepository.getByIdInternal(nutrition.id)
          index = updatedItems.length // Add to end of current mealType
          updatedItems.push(foundItem!)
          break
        }
      }
    }

    if (index === -1) throw createError({ statusCode: 404, message: 'Item not found in any meal' })

    // Update the item and ensure it has an ID now
    updatedItems[index] = {
      ...updatedItems[index],
      ...item,
      id: updatedItems[index].id || item.id || crypto.randomUUID()
    }
  } else if (action === 'delete') {
    if (!itemId && !item)
      throw createError({
        statusCode: 400,
        message: 'itemId or item details are required for delete'
      })

    if (itemId) {
      updatedItems = updatedItems.filter((i) => i.id !== itemId)
    } else if (item) {
      // Fallback matching for delete
      const index = updatedItems.findIndex(
        (i) => i.name === item.name && Math.abs((i.calories || 0) - (item.calories || 0)) < 1
      )
      if (index !== -1) {
        updatedItems.splice(index, 1)
      }
    }
  }

  // Update record
  const updatedNutrition = await nutritionRepository.update(nutrition.id, {
    [mealType]: updatedItems,
    ...(action === 'add'
      ? { waterMl: Math.max(0, (nutrition.waterMl || 0) + MEAL_LINKED_WATER_ML) }
      : {})
  })

  // Recalculate totals
  const meals = ['breakfast', 'lunch', 'dinner', 'snacks']
  let calories = 0
  let protein = 0
  let carbs = 0
  let fat = 0
  let fiber = 0
  let sugar = 0

  for (const meal of meals) {
    const items = (updatedNutrition[meal as keyof typeof updatedNutrition] as any[]) || []
    for (const i of items) {
      calories += i.calories || 0
      protein += i.protein || 0
      carbs += i.carbs || 0
      fat += i.fat || 0
      fiber += i.fiber || 0
      sugar += i.sugar || 0
    }
  }

  await nutritionRepository.update(updatedNutrition.id, {
    calories,
    protein,
    carbs,
    fat,
    fiber,
    sugar
  })

  // REACTIVE: Trigger fueling plan update for the entry date
  try {
    await metabolicService.calculateFuelingPlanForDate(userId, updatedNutrition.date, {
      persist: true
    })
  } catch (err) {
    console.error('[NutritionItemsPatch] Failed to trigger regeneration:', err)
  }

  return { success: true, mealType, items: updatedItems }
})
