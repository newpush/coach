import { MEAL_LINKED_WATER_ML } from './hydration'

type MealKey = 'breakfast' | 'lunch' | 'dinner' | 'snacks'

const MEAL_KEYS: MealKey[] = ['breakfast', 'lunch', 'dinner', 'snacks']
const OUNCE_TO_ML = 29.5735

function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function parseFluidMlFromQuantity(quantity: string): number {
  const normalized = quantity.toLowerCase()
  const match = normalized.match(
    /\b(\d+(?:\.\d+)?)\s*(ml|l|oz|fl\s?oz|liter|liters|litre|litres|milliliter|milliliters|millilitre|millilitres|ounce|ounces)\b/
  )
  if (!match) return 0

  const value = toNumber(match[1])
  const unit = match[2]
  if (!value || !unit) return 0

  if (
    unit === 'ml' ||
    unit === 'milliliter' ||
    unit === 'milliliters' ||
    unit === 'millilitre' ||
    unit === 'millilitres'
  )
    return value
  if (
    unit === 'l' ||
    unit === 'liter' ||
    unit === 'liters' ||
    unit === 'litre' ||
    unit === 'litres'
  )
    return value * 1000
  return value * OUNCE_TO_ML
}

function parseFluidMlFromAmountAndUnit(item: Record<string, any>): number {
  const amount = toNumber(item.amount)
  const unit = String(item.unit || '')
    .toLowerCase()
    .trim()

  if (!amount || !unit) return 0
  if (
    unit === 'ml' ||
    unit === 'milliliter' ||
    unit === 'milliliters' ||
    unit === 'millilitre' ||
    unit === 'millilitres'
  )
    return amount
  if (
    unit === 'l' ||
    unit === 'liter' ||
    unit === 'liters' ||
    unit === 'litre' ||
    unit === 'litres'
  )
    return amount * 1000
  if (unit === 'oz' || unit === 'fl oz' || unit === 'floz' || unit === 'ounce' || unit === 'ounces')
    return amount * OUNCE_TO_ML

  return 0
}

function inferFluidMl(item: Record<string, any>): number {
  const explicit = toNumber(item.fluidMl) || toNumber(item.water_ml) || toNumber(item.waterMl) || 0
  if (explicit > 0) return explicit

  const fromAmountUnit = parseFluidMlFromAmountAndUnit(item)
  if (fromAmountUnit > 0) return fromAmountUnit

  const quantity = String(item.quantity || '')
  const fromQuantity = quantity ? parseFluidMlFromQuantity(quantity) : 0
  return fromQuantity
}

function inferHydrationFactor(item: Record<string, any>): number {
  if (item.entryType === 'HYDRATION') return 1

  const name = String(item.name || '')
    .toLowerCase()
    .trim()

  if (!name) return 1

  // Non-alcoholic beverages still hydrate well, but not as much as plain water.
  if (
    name.includes('non-alcoholic') ||
    name.includes('alcohol free') ||
    name.includes('0.0%') ||
    name.includes('0.0')
  ) {
    return 0.85
  }

  if (
    name.includes('beer') ||
    name.includes('wine') ||
    name.includes('vodka') ||
    name.includes('whisky') ||
    name.includes('whiskey') ||
    name.includes('gin') ||
    name.includes('rum')
  ) {
    return 0.5
  }

  if (
    name.includes('coffee') ||
    name.includes('espresso') ||
    name.includes('tea') ||
    name.includes('cappuccino') ||
    name.includes('latte')
  ) {
    return 0.9
  }

  if (
    name.includes('water') ||
    name.includes('electrolyte') ||
    name.includes('sports drink') ||
    name.includes('isotonic')
  ) {
    return 1
  }

  return 1
}

/**
 * Coerce a logged item into an object carrying derived hydration fields.
 *
 * The guard matters because of the spread below. Spreading a string explodes it
 * into an object keyed by character index — `{...'pasta'}` becomes
 * `{0:'p',1:'a',2:'s',3:'t',4:'a'}` — which then persists as an item with no
 * name and no macros. An athlete reported exactly that shape: nutrition entries
 * displayed with no description and zero calories, whose stored items were
 * "strings split into objects with numeric keys". Every nutrition write path
 * calls this function, so a single caller passing a bare string was enough to
 * corrupt a day's log.
 */
export function normalizeFluidFields(rawItem: Record<string, any>): Record<string, any> {
  // Coerce rather than throw. Several callers run this over items already stored
  // in the database (e.g. the remove-hydration tool iterating a day's meals), and
  // corrupt rows from before this guard exist in production - throwing there
  // would turn a read into a hard failure for precisely the affected athletes.
  // A string yields an item with no name and no macros, which the caller can see
  // and skip, instead of one keyed 0,1,2,3.
  const item: Record<string, any> =
    rawItem && typeof rawItem === 'object' && !Array.isArray(rawItem) ? rawItem : {}

  const fluidMl = Math.max(0, Math.round(inferFluidMl(item)))
  const hydrationFactor = inferHydrationFactor(item)
  const hydrationContributionMl = Math.max(0, Math.round(fluidMl * hydrationFactor))

  return {
    ...item,
    fluidMl,
    hydrationFactor,
    hydrationContributionMl,
    // Keep legacy key used in existing payloads.
    water_ml: item.water_ml ?? fluidMl
  }
}

export function getItemHydrationContributionMl(item: Record<string, any>): number {
  const normalized = normalizeFluidFields(item)
  return toNumber(normalized.hydrationContributionMl)
}

export function isHydrationLikeItem(item: Record<string, any>): boolean {
  return item.entryType === 'HYDRATION' || getItemHydrationContributionMl(item) > 0
}

export function recalculateNutritionTotals(nutrition: Record<string, any>): {
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  sugar: number
  waterMl: number
} {
  let calories = 0
  let protein = 0
  let carbs = 0
  let fat = 0
  let fiber = 0
  let sugar = 0
  let waterMl = 0
  let mealsWithItems = 0

  for (const meal of MEAL_KEYS) {
    const items = (nutrition[meal] as any[]) || []
    if (items.length > 0) {
      mealsWithItems++
    }
    for (const rawItem of items) {
      const item = normalizeFluidFields(rawItem || {})
      calories += toNumber(item.calories)
      protein += toNumber(item.protein)
      carbs += toNumber(item.carbs)
      fat += toNumber(item.fat)
      fiber += toNumber(item.fiber)
      sugar += toNumber(item.sugar)
      waterMl += toNumber(item.hydrationContributionMl)
    }
  }

  // Add scalar bonuses for each meal that has entries but NO explicit hydration items.
  // This avoids double counting when a user explicitly logs water/coffee with their meal.
  let mealsWithoutExplicitHydration = 0
  for (const meal of MEAL_KEYS) {
    const items = (nutrition[meal] as any[]) || []
    if (items.length > 0) {
      const hasExplicitHydration = items.some((item) => isHydrationLikeItem(item))
      if (!hasExplicitHydration) {
        mealsWithoutExplicitHydration++
      }
    }
  }

  waterMl += mealsWithoutExplicitHydration * MEAL_LINKED_WATER_ML

  return { calories, protein, carbs, fat, fiber, sugar, waterMl }
}
