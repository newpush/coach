# Yazio AI-Generated Food Integration Fix

## Issue Description

The Yazio integration had an issue where AI-captured food entries (using their AI camera feature) were not being properly processed, while manual entries worked fine.

## Root Cause

The problem was in how nutrients were being extracted from different types of Yazio entries:

### 1. **AI-Generated Entries** (`simple_products`)

These entries have nutrients in a nested structure:

```json
{
  "id": "...",
  "name": "Cheese omelette with potato chips",
  "type": "simple_product",
  "is_ai_generated": true,
  "nutrients": {
    "nutrient.fat": 38,
    "energy.energy": 562,
    "nutrient.carb": 40,
    "nutrient.protein": 20
  }
}
```

### 2. **Manual Entries** (`products`)

These entries have nutrients per gram/serving in `product_nutrients`:

```json
{
  "id": "...",
  "product_name": "Magic Spoon PB Protein Granola",
  "amount": 30,
  "product_nutrients": {
    "nutrient.fat": 0.266667,
    "energy.energy": 4.333333,
    "nutrient.carb": 0.333333,
    "nutrient.protein": 0.233333
  }
}
```

## The Problem

The [`normalizeYazioData()`](server/utils/yazio.ts:83) function in [`server/utils/yazio.ts`](server/utils/yazio.ts) was:

1. **For AI-generated entries**: Only storing the nested `nutrients` object without extracting the values to top-level fields that the analysis code expected
2. **For manual entries**: Not calculating the actual consumed nutrients by multiplying `product_nutrients` (per gram values) by the `amount` consumed

This meant the nutrition analysis couldn't access the nutrient data properly, resulting in incomplete or missing macro calculations.

## The Fix

Updated [`server/utils/yazio.ts`](server/utils/yazio.ts) to properly extract and transform nutrients:

### For AI-Generated Entries (lines 114-173)

```typescript
// Extract nutrients from the nested structure
const nutrients = item.nutrients || {}
const calories = nutrients['energy.energy'] || 0
const protein = nutrients['nutrient.protein'] || 0
const carbs = nutrients['nutrient.carb'] || 0
const fat = nutrients['nutrient.fat'] || 0
const fiber = nutrients['nutrient.fiber'] || nutrients['nutrient.dietaryfiber'] || 0
const sugar = nutrients['nutrient.sugar'] || 0

// Transform to match expected structure with top-level nutrient fields
const transformedItem = {
  ...item,
  product_name: item.name,
  calories: calories,
  protein: protein,
  carbs: carbs,
  fat: fat,
  fiber: fiber,
  sugar: sugar
}
```

### For Manual Entries (lines 104-142)

```typescript
// For regular products, nutrients are in product_nutrients and need to be multiplied by amount
const productNutrients = (item as any).product_nutrients || {}
const amount = item.amount || 0

// Calculate actual consumed nutrients
const calories = (productNutrients['energy.energy'] || 0) * amount
const protein = (productNutrients['nutrient.protein'] || 0) * amount
const carbs = (productNutrients['nutrient.carb'] || 0) * amount
const fat = (productNutrients['nutrient.fat'] || 0) * amount

// Add calculated nutrients to the item
const enrichedItem = {
  ...item,
  calories: calories,
  protein: protein,
  carbs: carbs,
  fat: fat,
  fiber: fiber,
  sugar: sugar
}
```

## Result

Now both AI-captured and manual food entries:

1. Have their nutrients properly extracted from their respective data structures
2. Store nutrient values in top-level fields (`calories`, `protein`, `carbs`, `fat`, etc.)
3. Are accessible by the nutrition analysis code in [`trigger/analyze-nutrition.ts`](trigger/analyze-nutrition.ts)
4. Display correctly in the meal breakdown and daily totals

## Testing

To verify the fix works:

1. Sync Yazio data that includes AI-captured food entries
2. Check that both AI-generated and manual entries show up in the nutrition log
3. Verify that the daily totals (calories, protein, carbs, fat) are calculated correctly
4. Confirm that the AI analysis can access and analyze all meal data properly

## Related Files

- [`server/utils/yazio.ts`](server/utils/yazio.ts:83-173) - Core fix location
- [`trigger/analyze-nutrition.ts`](trigger/analyze-nutrition.ts:290-388) - Nutrition analysis that consumes this data
- [`server/api/integrations/yazio/connect.post.ts`](server/api/integrations/yazio/connect.post.ts) - Yazio connection endpoint
