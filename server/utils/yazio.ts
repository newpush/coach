import { Yazio } from 'yazio'
import type { Integration } from '@prisma/client'

export interface YazioDailySummary {
  steps?: number
  activity_energy?: number
  consume_activity_energy?: boolean
  water_intake?: number
  goals?: {
    'energy.energy'?: number
    'nutrient.carb'?: number
    'nutrient.fat'?: number
    'nutrient.protein'?: number
    'activity.step'?: number
    'bodyvalue.weight'?: number
    water?: number
  }
  units?: any
  meals?: any
  user_stats?: any
}

export interface YazioConsumedItem {
  type: string
  date: string
  serving: string | null
  amount: number
  id: string
  product_id: string
  serving_quantity: number | null
  daytime: 'breakfast' | 'lunch' | 'dinner' | 'snack'
}

export interface YazioSimpleProduct {
  id: string
  date: string
  name: string
  type: string
  daytime: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  nutrients?: any
  is_ai_generated?: boolean
}

export interface YazioConsumedItemsResponse {
  products: YazioConsumedItem[]
  recipe_portions: unknown[]
  simple_products: YazioSimpleProduct[]
}

export async function createYazioClient(integration: Integration): Promise<Yazio> {
  return new Yazio({
    credentials: {
      username: integration.accessToken, // Stored in accessToken field
      password: integration.refreshToken! // Stored in refreshToken field
    }
  })
}

export async function fetchYazioDailySummary(
  integration: Integration,
  date: string
): Promise<YazioDailySummary> {
  const yazio = await createYazioClient(integration)
  return (await yazio.user.getDailySummary({ date })) as unknown as YazioDailySummary
}

export async function fetchYazioConsumedItems(
  integration: Integration,
  date: string
): Promise<YazioConsumedItemsResponse> {
  const yazio = await createYazioClient(integration)
  return (await yazio.user.getConsumedItems({ date })) as unknown as YazioConsumedItemsResponse
}

export async function fetchYazioProductDetails(
  integration: Integration,
  productId: string
): Promise<any> {
  const yazio = await createYazioClient(integration)
  return await yazio.products.get(productId)
}

export function normalizeYazioData(
  summary: YazioDailySummary,
  items: YazioConsumedItemsResponse,
  userId: string,
  date: string
) {
  // Parse date string to create Date object at midnight UTC
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  const dateObj = new Date(Date.UTC(year, month - 1, day))

  // Group items by meal time
  const mealGroups: Record<string, any[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snacks: []
  }

  // Process regular products (manual entries with product_nutrients)
  for (const item of items.products) {
    const mealTime = item.daytime.toLowerCase()

    // For regular products, nutrients are in product_nutrients and need to be multiplied by amount
    // product_nutrients contain values per gram/serving, amount is the quantity consumed
    const productNutrients = (item as any).product_nutrients || {}
    const amount = item.amount || 0

    // Calculate actual consumed nutrients by multiplying by amount
    const calories = (productNutrients['energy.energy'] || 0) * amount
    const protein = (productNutrients['nutrient.protein'] || 0) * amount
    const carbs = (productNutrients['nutrient.carb'] || 0) * amount
    const fat = (productNutrients['nutrient.fat'] || 0) * amount
    const fiber =
      (productNutrients['nutrient.fiber'] || productNutrients['nutrient.dietaryfiber'] || 0) *
      amount
    const sugar = (productNutrients['nutrient.sugar'] || 0) * amount

    // Add calculated nutrients to the item
    const enrichedItem = {
      ...item,
      logged_at: item.date, // Preserve Yazio's original timestamp
      calories: calories,
      protein: protein,
      carbs: carbs,
      fat: fat,
      fiber: fiber,
      sugar: sugar
    }

    if (mealGroups[mealTime]) {
      mealGroups[mealTime]!.push(enrichedItem)
    } else {
      mealGroups.snacks!.push(enrichedItem)
    }
  }

  // Process simple products (AI-generated items with names already included)
  for (const item of items.simple_products || []) {
    const mealTime = item.daytime.toLowerCase()

    // Extract nutrients from the nested structure
    const nutrients = item.nutrients || {}
    const calories = nutrients['energy.energy'] || 0
    const protein = nutrients['nutrient.protein'] || 0
    const carbs = nutrients['nutrient.carb'] || 0
    const fat = nutrients['nutrient.fat'] || 0
    const fiber = nutrients['nutrient.fiber'] || nutrients['nutrient.dietaryfiber'] || 0
    const sugar = nutrients['nutrient.sugar'] || 0

    // Transform simple_product to match the expected structure with top-level nutrient fields
    const transformedItem = {
      id: item.id,
      date: item.date,
      logged_at: item.date, // Preserve Yazio's original timestamp
      type: item.type,
      daytime: item.daytime,
      product_name: item.name, // Already has the name!
      product_brand: null,
      is_ai_generated: item.is_ai_generated,
      nutrients: item.nutrients, // Keep original for reference
      // Add top-level fields for easy access in analysis
      calories: calories,
      protein: protein,
      carbs: carbs,
      fat: fat,
      fiber: fiber,
      sugar: sugar
    }

    if (mealGroups[mealTime]) {
      mealGroups[mealTime]!.push(transformedItem)
    } else {
      mealGroups.snacks!.push(transformedItem)
    }
  }

  // Calculate totals from meals data
  const meals = summary.meals || {}
  const totals = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    sugar: 0
  }

  // Sum up nutrients from all meals if available
  Object.entries(meals).forEach(([mealName, meal]: [string, any]) => {
    if (meal?.nutrients) {
      const mealNutrients = {
        calories: meal.nutrients['energy.energy'] || 0,
        protein: meal.nutrients['nutrient.protein'] || 0,
        carbs: meal.nutrients['nutrient.carb'] || 0,
        fat: meal.nutrients['nutrient.fat'] || 0,
        fiber: meal.nutrients['nutrient.fiber'] || 0,
        sugar: meal.nutrients['nutrient.sugar'] || 0
      }

      totals.calories += mealNutrients.calories
      totals.protein += mealNutrients.protein
      totals.carbs += mealNutrients.carbs
      totals.fat += mealNutrients.fat
      totals.fiber += mealNutrients.fiber
      totals.sugar += mealNutrients.sugar
    }
  })

  const result = {
    userId,
    date: dateObj,
    calories: totals.calories || null,
    protein: totals.protein || null,
    carbs: totals.carbs || null,
    fat: totals.fat || null,
    fiber: totals.fiber || null,
    sugar: totals.sugar || null,
    waterMl: summary.water_intake || null,
    caloriesGoal: summary.goals?.['energy.energy'] || null,
    proteinGoal: summary.goals?.['nutrient.protein'] || null,
    carbsGoal: summary.goals?.['nutrient.carb'] || null,
    fatGoal: summary.goals?.['nutrient.fat'] || null,
    breakfast: mealGroups.breakfast!.length > 0 ? mealGroups.breakfast : null,
    lunch: mealGroups.lunch!.length > 0 ? mealGroups.lunch : null,
    dinner: mealGroups.dinner!.length > 0 ? mealGroups.dinner : null,
    snacks: mealGroups.snacks!.length > 0 ? mealGroups.snacks : null,
    rawJson: { summary, items }
  }

  return result
}
