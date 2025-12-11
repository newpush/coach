# Recommended Fields for Dedicated Workout Columns

Based on analysis of existing workout data, the following fields should be added as dedicated columns for better queryability and features.

## Analysis Results

From analyzing 10 recent workouts each from Strava and Intervals.icu:

### Strava Data (100% present):
- calories
- elapsed_time
- moving_time (already stored as durationSec)
- commute
- private
- device_name (40% present)

### Intervals.icu Data (100% present):
- calories
- icu_training_load (already stored as trainingLoad)
- icu_intensity
- icu_ftp
- pace
- polarization_index (already stored)
- decoupling (already stored)

## Recommended New Fields

### 1. calories (Int) - HIGH PRIORITY
**Purpose:** Track energy expenditure for nutrition correlation
- Present in: 100% of workouts (both sources)
- Use case: Compare calories burned vs calories consumed
- Example: 482 kcal

### 2. elapsedTimeSec (Int) - HIGH PRIORITY  
**Purpose:** Total elapsed time including stops
- Present in: 100% of Strava workouts
- Difference from durationSec (moving_time): Includes stopped time
- Use case: Analyze total workout duration vs active time
- Example: 3608 seconds

### 3. deviceName (String) - MEDIUM PRIORITY
**Purpose:** Track device used for data quality insights
- Present in: 40% of Strava workouts
- Use case: Identify data quality issues by device, track Apple Watch vs Garmin vs power meter
- Example: "Apple Watch Ultra", "Garmin Edge 1030"

### 4. commute (Boolean) - MEDIUM PRIORITY
**Purpose:** Flag commute workouts for filtering
- Present in: 100% of Strava workouts
- Use case: Filter out commutes from training analysis
- Example: false

### 5. gearId (String) - LOW PRIORITY
**Purpose:** Track equipment usage
- Present in: Variable (when set by user)
- Use case: Track bike/shoe mileage, correlate performance with equipment
- Example: "b12345678"

### 6. isPrivate (Boolean) - LOW PRIORITY
**Purpose:** Privacy flag
- Present in: 100% of Strava workouts
- Use case: Respect user privacy settings when sharing data
- Example: false

## Implementation Plan

### Phase 1: Add Essential Fields
```prisma
model Workout {
  // ... existing fields ...
  
  // Energy & Time
  calories         Int?     // Energy expenditure in kcal
  elapsedTimeSec   Int?     // Total elapsed time (includes stops)
  
  // Device & Quality
  deviceName       String?  // Device used for tracking
  
  // Metadata
  commute          Boolean? @default(false)
  isPrivate        Boolean? @default(false)
  gearId           String?  // Equipment identifier
}
```

### Phase 2: Update Ingestion
1. Update `normalizeStravaActivity()` to extract these fields
2. Update Intervals.icu normalization to extract calories
3. Backfill existing workouts

### Phase 3: UI Updates
1. Add calories column to activities table
2. Add device filter
3. Add "exclude commutes" toggle
4. Show elapsed vs moving time comparison

## Benefits

1. **Nutrition Integration**: Direct correlation between calories burned and consumed
2. **Data Quality**: Track which devices produce best/most complete data
3. **Better Filtering**: Exclude commutes, private workouts
4. **Equipment Tracking**: Monitor bike/shoe mileage
5. **Time Analysis**: Understand workout efficiency (moving vs elapsed time)

## Current State

Currently these fields are:
- ✅ Stored in `rawJson` (preserved but not queryable)
- ❌ Not available in dedicated columns
- ❌ Not easily filterable or aggregatable
- ❌ Not shown in UI

## Next Steps

1. Create Prisma migration to add fields
2. Update normalization functions
3. Create backfill script for existing data
4. Update API to return new fields
5. Add UI components to display/filter by these fields