# Strava Training Load Bug - Fixed

## Issue Summary

**Bug:** Strava workouts were incorrectly storing calorie data (energy expenditure) in the `trainingLoad` field.

**Example:** A workout showing Training Load = 482 was actually 482 calories burned, not a training load metric.

## Root Cause

In [`server/utils/strava.ts:367`](../server/utils/strava.ts), we were mapping Strava's `calories` field to our `trainingLoad` field:

```typescript
// INCORRECT CODE (now fixed)
trainingLoad: activity.calories || activity.kilojoules || null,
```

This was wrong because:
- **`calories`**: Energy expenditure in kilocalories (nutritional calories)
- **`trainingLoad`**: Intervals.icu's proprietary training stress metric (`icu_training_load`)

These are completely different metrics!

## The Fix

### 1. Code Fix (server/utils/strava.ts)

Changed the normalization to correctly set `trainingLoad` to `null` for Strava workouts:

```typescript
// CORRECT CODE
trainingLoad: null, // Strava doesn't provide icu_training_load (Intervals.icu metric)
```

### 2. Data Fix (scripts/fix-strava-training-load.ts)

Created and ran a script to fix all existing Strava workouts in the database:
- Fixed 80 workouts
- Set `trainingLoad` to NULL (correct)
- Preserved TRIMP (suffer_score) as the training stress metric

## Understanding the Metrics

### Strava Provides:
- **`calories`**: Energy expenditure (kcal) - NOT a training load metric
- **`suffer_score`**: Strava's training stress metric (similar to TRIMP) ✅ Stored in `trimp` field
- **`kilojoules`**: Mechanical work done (for power-based activities) ✅ Stored in `kilojoules` field

### Intervals.icu Provides:
- **`icu_training_load`**: Intervals.icu's calculated training stress metric ✅ Stored in `trainingLoad` field
- **`tss`**: Training Stress Score ✅ Stored in `tss` field
- **`intensity`**: Intensity Factor (0-1+ scale) ✅ Stored in `intensity` field

## Current State

### For Strava Workouts:
- ✅ `trainingLoad`: NULL (correct - Strava doesn't provide this)
- ✅ `tss`: NULL (correct - Strava doesn't provide TSS)
- ✅ `trimp`: Strava's `suffer_score` (correct training stress metric)
- ✅ `kilojoules`: Mechanical work for power activities (if available)
- ✅ `intensity`: NULL (correct - requires FTP and NP which Strava doesn't always provide)

### For Intervals.icu Workouts:
- ✅ `trainingLoad`: Intervals.icu's `icu_training_load`
- ✅ `tss`: Training Stress Score
- ✅ `trimp`: TRIMP if available
- ✅ `intensity`: Intensity Factor if available

## Impact

**Before Fix:**
- Training Load column showed inflated values (calories instead of training load)
- Misleading training stress data
- Confusion when comparing Strava vs Intervals.icu workouts

**After Fix:**
- Training Load is NULL for Strava workouts (correct)
- TRIMP remains as the primary training stress metric from Strava
- Clear distinction between different data sources
- Accurate comparison between platforms

## Testing

Verified with workout ID `413f4bd3-3e1f-4bea-84cc-ad1d5305d8eb`:
- **Before**: Training Load = 482 (incorrect - was calories)
- **After**: Training Load = NULL, TRIMP = 15 (correct)
- Strava raw data shows: `calories: 482, suffer_score: 15`

## Future Enhancements

Consider adding a new field for calorie tracking if needed for nutrition analysis:
- Add `caloriesBurned` field to store Strava's calories
- Keep `trainingLoad` for Intervals.icu's metric only
- Use different fields for different purposes

## Related Files

- **Bug Fix**: [`server/utils/strava.ts`](../server/utils/strava.ts)
- **Data Fix Script**: [`scripts/fix-strava-training-load.ts`](../scripts/fix-strava-training-load.ts)
- **Debug Script**: [`scripts/debug-workout-load.ts`](../scripts/debug-workout-load.ts)
- **UI Update**: [`app/pages/activities.vue`](../app/pages/activities.vue) - Added Training Load column
- **API Update**: [`server/api/calendar/index.get.ts`](../server/api/calendar/index.get.ts) - Returns training load

## Date Fixed

December 11, 2024