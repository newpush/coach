import { ofetch } from 'ofetch'

export interface NutrientsPer100g {
  calories_kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g?: number
  sugar_g?: number
  sodium_mg?: number
  saturated_fat_g?: number
}

export interface FoodItem {
  external_key?: string
  name: string
  brand?: string
  barcode?: string
  categories?: string[]
  serving_size_g?: number
  serving_description?: string
  /**
   * False when the source carried no energy and no macros for this item, i.e.
   * its `nutrients_per_100g` zeros are placeholders rather than measurements.
   * Such an item cannot be logged meaningfully and is excluded from search.
   */
  has_nutrition_data?: boolean
  nutrients_per_100g: NutrientsPer100g
  ingredients_text?: string
  source_url?: string
  attribution?: string
}

export interface CalculatedPortionNutrients {
  gram_amount: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g?: number
  sugar_g?: number
  sodium_mg?: number
  saturated_fat_g?: number
}

export function calculatePortionNutrients(
  item: FoodItem,
  gramAmount: number
): CalculatedPortionNutrients {
  const factor = gramAmount / 100
  const n = item.nutrients_per_100g || {
    calories_kcal: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0
  }

  const round1 = (val?: number) =>
    val !== undefined ? Math.round(val * factor * 10) / 10 : undefined

  return {
    gram_amount: gramAmount,
    calories: Math.round((n.calories_kcal || 0) * factor),
    protein_g: round1(n.protein_g) ?? 0,
    carbs_g: round1(n.carbs_g) ?? 0,
    fat_g: round1(n.fat_g) ?? 0,
    fiber_g: round1(n.fiber_g),
    sugar_g: round1(n.sugar_g),
    sodium_mg: round1(n.sodium_mg),
    saturated_fat_g: round1(n.saturated_fat_g)
  }
}

function getNutrientVal(
  obj: Record<string, any> | null | undefined,
  keys: string[]
): number | undefined {
  if (!obj || typeof obj !== 'object') return undefined
  for (const k of keys) {
    const val = obj[k]
    if (val !== undefined && val !== null && val !== '') {
      const num = Number(val)
      if (Number.isFinite(num)) return num
    }
  }
  return undefined
}

export function normalizeFoodItem(item: any): FoodItem {
  if (!item || typeof item !== 'object') return item

  let servingSizeG = item.serving_size_g
  let servingDescription = item.serving_description

  if (!servingSizeG && Array.isArray(item.serving_sizes) && item.serving_sizes.length > 0) {
    const first = item.serving_sizes[0]
    if (first.weight_g) {
      servingSizeG = first.weight_g
    }
    if (first.description) {
      servingDescription = first.description
    }
  }

  const sources = [
    item.nutrients_per_100g,
    item.nutriments,
    item.nutrients,
    item.macros,
    item.nutrition,
    item.nutritional_info,
    item
  ].filter((s) => s && typeof s === 'object')

  const findVal = (keys: string[]): number | undefined => {
    for (const src of sources) {
      const val = getNutrientVal(src, keys)
      if (val !== undefined) return val
    }
    return undefined
  }

  // Keep the raw lookups before defaulting. `findVal` returns 0 for a value the
  // source explicitly states as zero and undefined when the source has no such
  // field at all, and that difference is the whole point here: "0 kcal" and
  // "we have no idea" must not collapse into the same number.
  const rawProtein = findVal(['protein_g', 'protein', 'proteins', 'proteins_100g', 'protein_100g'])
  const rawCarbs = findVal([
    'carbs_g',
    'carbs',
    'carbohydrates',
    'carbohydrates_100g',
    'carbs_100g',
    'carbohydrate'
  ])
  const rawFat = findVal(['fat_g', 'fat', 'fats', 'fat_100g', 'fats_100g'])
  const rawCalories = findVal([
    'calories_kcal',
    'calories',
    'energy_kcal',
    'energy-kcal_100g',
    'energy-kcal',
    'energy_kcal_100g',
    'energy_100g',
    'energy',
    'kcal'
  ])

  const protein = rawProtein ?? 0
  const carbs = rawCarbs ?? 0
  const fat = rawFat ?? 0

  /**
   * Whether the source told us anything at all about this item's energy.
   *
   * False only when energy AND all three macros are absent — a data gap, not a
   * zero-calorie food. Water and black coffee state 0 explicitly, so they come
   * back as known and stay searchable.
   */
  const hasNutritionData =
    rawCalories !== undefined ||
    rawProtein !== undefined ||
    rawCarbs !== undefined ||
    rawFat !== undefined

  let calories = rawCalories

  if ((calories === undefined || calories === 0) && (protein > 0 || carbs > 0 || fat > 0)) {
    calories = Math.round(carbs * 4 + protein * 4 + fat * 9)
  } else if (calories === undefined) {
    calories = 0
  }

  const fiber = findVal([
    'fiber_g',
    'fiber',
    'fibers',
    'fiber_100g',
    'fibres_100g',
    'dietary_fiber'
  ])
  const sugar = findVal(['sugar_g', 'sugar', 'sugars', 'sugars_100g', 'sugar_100g'])

  let sodium = findVal(['sodium_mg', 'sodium', 'sodium_100g'])
  if (sodium === undefined) {
    const salt = findVal(['salt', 'salt_100g'])
    if (salt !== undefined) {
      sodium = Math.round(salt * 400)
    }
  }

  const satFat = findVal([
    'saturated_fat_g',
    'saturated_fat',
    'saturated-fat_100g',
    'saturated_fat_100g',
    'saturated-fat',
    'sat_fat'
  ])

  return {
    ...item,
    name: item.name || item.product_name || item.title || 'Unknown Food',
    brand: item.brand || item.brands || undefined,
    barcode: item.barcode || item.code || undefined,
    serving_size_g: servingSizeG,
    serving_description: servingDescription,
    has_nutrition_data: hasNutritionData,
    nutrients_per_100g: {
      calories_kcal: calories,
      protein_g: protein,
      carbs_g: carbs,
      fat_g: fat,
      ...(fiber !== undefined ? { fiber_g: fiber } : {}),
      ...(sugar !== undefined ? { sugar_g: sugar } : {}),
      ...(sodium !== undefined ? { sodium_mg: sodium } : {}),
      ...(satFat !== undefined ? { saturated_fat_g: satFat } : {})
    }
  }
}

function getFeederConfig() {
  let feederUrl = process.env.NUTRITION_FEEDER_URL || 'https://feeds.coachwatts.com'
  let feederApiKey = process.env.NUTRITION_FEEDER_API_KEY || ''

  try {
    const config = useRuntimeConfig()
    if (config?.nutritionFeederUrl) {
      feederUrl = config.nutritionFeederUrl
    }
    if (config?.nutritionFeederApiKey !== undefined) {
      feederApiKey = config.nutritionFeederApiKey
    }
  } catch {
    // Fall back to process.env in standalone/test environments
  }

  const baseUrl = feederUrl.replace(/\/+$/, '')
  const headers: Record<string, string> = {
    Accept: 'application/json'
  }

  if (feederApiKey) {
    headers['X-API-Key'] = feederApiKey
  }

  return { baseUrl, headers }
}

export const nutritionDatabaseService = {
  /**
   * Search food items by keyword query from the feeder service
   */
  async searchFoodDatabase(query: string, limit = 10): Promise<FoodItem[]> {
    if (!query || !query.trim()) {
      return []
    }

    try {
      const { baseUrl, headers } = getFeederConfig()
      const url = `${baseUrl}/api/v1/nutrition/search?q=${encodeURIComponent(query.trim())}&limit=${limit}`

      const response = await ofetch<
        FoodItem[] | { items?: FoodItem[]; results?: FoodItem[] } | null
      >(url, {
        method: 'GET',
        headers,
        timeout: 10000
      })

      let rawItems: any[] = []
      if (Array.isArray(response)) {
        rawItems = response
      } else if (response && 'items' in response && Array.isArray(response.items)) {
        rawItems = response.items
      } else if (response && 'results' in response && Array.isArray(response.results)) {
        rawItems = response.results
      }

      return rawItems.map((item) => normalizeFoodItem(item))
    } catch (error) {
      console.warn('[NutritionDatabaseService] searchFoodDatabase failed:', error)
      return []
    }
  },

  /**
   * Lookup food item by barcode (UPC/EAN)
   */
  async lookupFoodBarcode(barcode: string): Promise<FoodItem | null> {
    if (!barcode || !barcode.trim()) {
      return null
    }

    try {
      const { baseUrl, headers } = getFeederConfig()
      const url = `${baseUrl}/api/v1/nutrition/barcode/${encodeURIComponent(barcode.trim())}`

      const response = await ofetch<any>(url, {
        method: 'GET',
        headers,
        timeout: 10000
      })

      return response && response.name ? normalizeFoodItem(response) : null
    } catch (error: any) {
      if (error?.status !== 404 && error?.statusCode !== 404) {
        console.warn('[NutritionDatabaseService] lookupFoodBarcode failed:', error)
      }
      return null
    }
  },

  /**
   * Fetch specific food item by external_key
   */
  async getFoodItemByKey(key: string): Promise<FoodItem | null> {
    if (!key || !key.trim()) {
      return null
    }

    try {
      const { baseUrl, headers } = getFeederConfig()
      const cleanKey = key.replace(/^\/+/, '')
      const url = `${baseUrl}/api/v1/nutrition/item/${cleanKey}`

      const response = await ofetch<any>(url, {
        method: 'GET',
        headers,
        timeout: 10000
      })

      return response && response.name ? normalizeFoodItem(response) : null
    } catch (error: any) {
      if (error?.status !== 404 && error?.statusCode !== 404) {
        console.warn('[NutritionDatabaseService] getFoodItemByKey failed:', error)
      }
      return null
    }
  }
}
