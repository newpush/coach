# Yazio Integration Documentation

## Overview

The Yazio integration syncs nutrition data from Yazio app to the local database. It uses the unofficial `yazio` npm package to fetch daily summaries and consumed items.

## Data Flow

1. **Trigger**: User initiates sync from data.vue page
2. **API Handler**: `/api/integrations/sync` creates date range and triggers job
3. **Background Task**: `trigger/ingest-yazio.ts` processes each day
4. **Data Fetching**: `server/utils/yazio.ts` fetches from Yazio API
5. **Normalization**: Data is transformed to match our schema
6. **Storage**: Upserted to `Nutrition` table in database

## Date Range Calculation

```typescript
// Last 45 days of historical nutrition data
const startDate = new Date()
startDate.setDate(startDate.getDate() - 45)
const endDate = new Date() // Today
```

**Important**:

- Uses UTC dates to avoid timezone issues
- Each date is formatted as `YYYY-MM-DD` string
- Only syncs 45 days (vs 90 for other integrations) since nutrition tracking is typically shorter-term
- Days with no food logged (0 calories) are automatically skipped to avoid cluttering the database

## API Endpoints Used

### 1. Daily Summary

```typescript
yazio.user.getDailySummary({ date: 'YYYY-MM-DD' })
```

**Response Structure**:

```json
{
  "summary": {
    "user": {
      "sex": "male",
      "goal": "lose",
      "start_weight": 104.7,
      "current_weight": 98.34
    },
    "goals": {
      "water": 2000,
      "nutrient.fat": 57.71,
      "activity.step": 10000,
      "energy.energy": 3588.89,
      "nutrient.carb": 183.27,
      "bodyvalue.weight": 90,
      "nutrient.protein": 209.45
    },
    "meals": {
      "lunch": {
        "nutrients": {
          "nutrient.fat": 24.16,
          "energy.energy": 713.83,
          "nutrient.carb": 82.68,
          "nutrient.protein": 41.64
        },
        "energy_goal": 1435.56
      },
      "snack": { ... },
      "dinner": { ... },
      "breakfast": { ... }
    },
    "steps": 6631,
    "water_intake": 0,
    "activity_energy": 1442.02
  }
}
```

### 2. Consumed Items

```typescript
yazio.user.getConsumedItems({ date: 'YYYY-MM-DD' })
```

**Response Structure**:

```json
{
  "products": [
    {
      "id": "121d2bd2-7867-4cf6-b460-5a2278d9ac27",
      "date": "2025-10-21 08:48:09",
      "type": "product",
      "amount": 177,
      "daytime": "breakfast",
      "serving": "portion",
      "product_id": "d7e06b1f-7308-4bd5-b829-37641e3ba7f1",
      "serving_quantity": 1
    }
  ],
  "recipe_portions": [],
  "simple_products": []
}
```

## Data Mapping

### Nutrition Table Schema

| Database Field | Source                                         | Notes                        |
| -------------- | ---------------------------------------------- | ---------------------------- |
| `date`         | Date parameter                                 | Converted to UTC Date object |
| `calories`     | Sum of `meals.*.nutrients['energy.energy']`    | Total daily calories         |
| `protein`      | Sum of `meals.*.nutrients['nutrient.protein']` | Grams                        |
| `carbs`        | Sum of `meals.*.nutrients['nutrient.carb']`    | Grams                        |
| `fat`          | Sum of `meals.*.nutrients['nutrient.fat']`     | Grams                        |
| `fiber`        | Sum of `meals.*.nutrients['nutrient.fiber']`   | Grams (optional)             |
| `sugar`        | Sum of `meals.*.nutrients['nutrient.sugar']`   | Grams (optional)             |
| `waterMl`      | `summary.water_intake`                         | Milliliters                  |
| `caloriesGoal` | `summary.goals['energy.energy']`               | Target calories              |
| `proteinGoal`  | `summary.goals['nutrient.protein']`            | Target protein (g)           |
| `carbsGoal`    | `summary.goals['nutrient.carb']`               | Target carbs (g)             |
| `fatGoal`      | `summary.goals['nutrient.fat']`                | Target fat (g)               |
| `breakfast`    | Items with `daytime: "breakfast"`              | JSON array                   |
| `lunch`        | Items with `daytime: "lunch"`                  | JSON array                   |
| `dinner`       | Items with `daytime: "dinner"`                 | JSON array                   |
| `snacks`       | Items with `daytime: "snack"` or other         | JSON array                   |
| `rawJson`      | Complete API response                          | For debugging/reprocessing   |

### Meal Grouping Logic

Items from `getConsumedItems()` are grouped by the `daytime` field:

- `"breakfast"` → `breakfast` array
- `"lunch"` → `lunch` array
- `"dinner"` → `dinner` array
- `"snack"` or anything else → `snacks` array

Each item includes:

- `id`: Unique item ID
- `date`: Timestamp when logged
- `amount`: Quantity in grams/ml
- `serving`: Serving size descriptor
- `product_id`: Reference to product database
- `serving_quantity`: Number of servings

## Authentication

Yazio uses username/password authentication (no OAuth). Credentials are stored in the `Integration` table:

- `accessToken` field → Username
- `refreshToken` field → Password

## Error Handling

1. **Per-Day Errors**: If a single day fails, the job continues with other days
2. **API Errors**: Logged with full details for debugging
3. **Validation**: Ensures data meets schema requirements before upserting

## Debugging

### Common Issues

1. **Missing Recent Data**
   - Check date range calculation in sync endpoint
   - Verify timezone handling (should use UTC)
   - Check logs for API errors on specific dates

2. **Incorrect Totals**
   - Review `meals` object structure in rawJson
   - Verify nutrient key names match exactly
   - Check for null/undefined values in calculations

3. **Empty Meal Arrays**
   - Confirm items exist in Yazio for that date
   - Verify `daytime` field mapping
   - Check if items were filtered out

### Logging Strategy

The integration includes comprehensive logging at each step:

```typescript
// Date range generation
logger.log(`Generated ${dates.length} dates to fetch`)

// Per-date processing
logger.log(`[${date}] Fetching Yazio data...`)
logger.log(`[${date}] API Response:`, { ... })
logger.log(`[${date}] Normalized data:`, { ... })
logger.log(`[${date}] ⊘ Skipped - no nutrition data logged`)  // For empty days
logger.log(`[${date}] ✓ Synced successfully`)

// Final summary
logger.log(`Sync completed:`, { total, upserted, errors, skipped })
```

## Database Schema

```prisma
model Nutrition {
  id                String   @id @default(uuid())
  userId            String
  date              DateTime @db.Date

  // Daily Summary
  calories          Int?
  protein           Float?
  carbs             Float?
  fat               Float?
  fiber             Float?
  sugar             Float?

  // Meal Breakdown (JSON)
  breakfast         Json?
  lunch             Json?
  dinner            Json?
  snacks            Json?

  // Goals
  caloriesGoal      Int?
  proteinGoal       Float?
  carbsGoal         Float?
  fatGoal           Float?

  // Water
  waterMl           Int?

  // Raw data
  rawJson           Json?

  user              User     @relation(fields: [userId], references: [id])

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([userId, date])
  @@index([userId, date])
}
```

## Sample Data Analysis

From actual Yazio data:

### Date: 2025-10-21

- **Calories**: 1206 (Goal: 3588)
- **Protein**: 73.96g (Goal: 209.45g)
- **Carbs**: 151.24g (Goal: 183.27g)
- **Fat**: 32.35g (Goal: 57.71g)
- **Meals**: Breakfast (3 items), Lunch (4 items), Dinner (0 items)

### Key Observations

1. **Calorie Goals**: Often include activity energy adjustment
2. **Meal Timing**: Tracked with exact timestamps
3. **Serving Sizes**: Multiple formats (portion, glass, fruit.whole, piece)
4. **Water Tracking**: Separate from meals
5. **Steps**: Tracked but not stored in Nutrition table

## Future Enhancements

1. Add product details lookup for richer meal information
2. Track activity energy and steps in separate table
3. Add data validation for macro ratios
4. Implement incremental sync (only new/updated data)
5. Add support for recipe portions and simple products
