import { describe, expect, it } from 'vitest'
import { normalizeFoodItem } from '../../../../../server/utils/services/nutritionDatabaseService'

// CW-591: normalizeFoodItem coerced every missing nutrient with `?? 0`, so an
// item the database knows nothing about was indistinguishable from a genuinely
// zero-calorie food. Athletes selected those items and silently under-reported
// intake, which feeds fuelling recommendations.

describe('normalizeFoodItem energy provenance (CW-591)', () => {
  it('flags an item with no energy and no macros as having no nutrition data', () => {
    const item = normalizeFoodItem({ name: 'Mystery Snack' })

    expect(item.has_nutrition_data).toBe(false)
    expect(item.nutrients_per_100g.calories_kcal).toBe(0)
  })

  it('keeps a genuinely zero-calorie food marked as known', () => {
    // Water states its zeros explicitly - it must stay searchable.
    const item = normalizeFoodItem({
      name: 'Water',
      nutrients_per_100g: { calories_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    })

    expect(item.has_nutrition_data).toBe(true)
    expect(item.nutrients_per_100g.calories_kcal).toBe(0)
  })

  it('treats an explicit zero energy value as known even without macros', () => {
    const item = normalizeFoodItem({ name: 'Black Coffee', calories: 0 })

    expect(item.has_nutrition_data).toBe(true)
  })

  it('treats macros-only items as known and still derives calories', () => {
    const item = normalizeFoodItem({
      name: 'Chicken Breast',
      nutrients_per_100g: { protein_g: 31, carbs_g: 0, fat_g: 3.6 }
    })

    expect(item.has_nutrition_data).toBe(true)
    // Atwater fallback: 31*4 + 0*4 + 3.6*9
    expect(item.nutrients_per_100g.calories_kcal).toBe(156)
  })

  it('treats a stated energy value as known', () => {
    const item = normalizeFoodItem({ name: 'Olive Oil', nutrients_per_100g: { energy_kcal: 884 } })

    expect(item.has_nutrition_data).toBe(true)
    expect(item.nutrients_per_100g.calories_kcal).toBe(884)
  })

  it('does not regress existing macro normalization', () => {
    const item = normalizeFoodItem({
      name: 'Oats',
      nutriments: { 'energy-kcal_100g': 389, proteins_100g: 16.9, carbohydrates_100g: 66.3 }
    })

    expect(item.has_nutrition_data).toBe(true)
    expect(item.nutrients_per_100g.calories_kcal).toBe(389)
    expect(item.nutrients_per_100g.protein_g).toBe(16.9)
    expect(item.nutrients_per_100g.carbs_g).toBe(66.3)
  })
})
