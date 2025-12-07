# Yazio Sync AI Analysis Cleanup

## Issue Description

When the Yazio integration updates an existing nutrition record that already has AI analysis, the old AI analysis becomes incorrect because it was based on the previous version of the data. This leaves stale, inaccurate analysis attached to updated nutrition records.

## Root Cause

The [`ingest-yazio.ts`](../trigger/ingest-yazio.ts) task uses [`prisma.nutrition.upsert()`](../trigger/ingest-yazio.ts:243) to create or update nutrition records. When updating an existing record:

1. New nutrition data (meals, macros, etc.) replaces the old data
2. However, AI analysis fields (`aiAnalysis`, `aiAnalysisJson`, scores, explanations) were preserved
3. This results in analysis describing old meals/macros being associated with new data

## Example Scenario

**Day 1 - Initial Sync:**
```
- Breakfast: Oatmeal, Banana (500 cal)
- AI Analysis: "Excellent fiber-rich breakfast with good carbs..."
```

**Day 2 - User Changes Their Log:**
```
- Breakfast: Bacon, Eggs (700 cal)  
- AI Analysis: "Excellent fiber-rich breakfast with good carbs..." ❌ INCORRECT!
```

The AI analysis still describes oatmeal and banana, but the actual data is now bacon and eggs.

## Solution

Modified [`trigger/ingest-yazio.ts:242-267`](../trigger/ingest-yazio.ts:242-267) to clear all AI analysis fields when updating existing nutrition records:

```typescript
const result = await prisma.nutrition.upsert({
  where: {
    userId_date: {
      userId,
      date: nutrition.date
    }
  },
  update: {
    ...nutrition,
    // Clear AI analysis fields since nutrition data has changed
    aiAnalysis: null,
    aiAnalysisJson: null,
    aiAnalysisStatus: 'NOT_STARTED',
    aiAnalyzedAt: null,
    // Clear scores
    overallScore: null,
    macroBalanceScore: null,
    qualityScore: null,
    adherenceScore: null,
    hydrationScore: null,
    // Clear score explanations
    nutritionalBalanceExplanation: null,
    calorieAdherenceExplanation: null,
    macroDistributionExplanation: null,
    hydrationStatusExplanation: null,
    timingOptimizationExplanation: null
  },
  create: nutrition
})
```

## What This Does

1. **On Create**: New nutrition records are created without AI analysis (expected behavior)
2. **On Update**: 
   - New nutrition data replaces old data ✓
   - All AI analysis fields are cleared and reset to `NOT_STARTED` ✓
   - All scores are cleared ✓
   - All score explanations are cleared ✓
   - User can then re-trigger AI analysis if desired

## Fields Cleared on Update

### Analysis Fields
- `aiAnalysis` → `null`
- `aiAnalysisJson` → `null`
- `aiAnalysisStatus` → `'NOT_STARTED'`
- `aiAnalyzedAt` → `null`

### Score Fields
- `overallScore` → `null`
- `macroBalanceScore` → `null`
- `qualityScore` → `null`
- `adherenceScore` → `null`
- `hydrationScore` → `null`

### Explanation Fields
- `nutritionalBalanceExplanation` → `null`
- `calorieAdherenceExplanation` → `null`
- `macroDistributionExplanation` → `null`
- `hydrationStatusExplanation` → `null`
- `timingOptimizationExplanation` → `null`

## Benefits

1. **Data Accuracy**: AI analysis always matches the current nutrition data
2. **User Control**: Users can re-analyze updated records when ready
3. **No Confusion**: Prevents showing incorrect analysis for updated data
4. **Clear State**: Analysis status explicitly shows `NOT_STARTED` for updated records

## Related Files

- [`trigger/ingest-yazio.ts`](../trigger/ingest-yazio.ts:242-267) - Core fix location
- [`prisma/schema.prisma`](../prisma/schema.prisma:403-463) - Nutrition model with AI fields
- [`docs/yazio-integration.md`](./yazio-integration.md) - General Yazio integration docs
- [`docs/yazio-ai-food-fix.md`](./yazio-ai-food-fix.md) - Related AI food entry fix

## Testing

To verify this fix works correctly:

1. **Initial Sync**: Sync Yazio data and analyze a nutrition record
   ```bash
   # The record will have AI analysis
   ```

2. **Update in Yazio**: Change the meals in the Yazio app for the same date

3. **Re-Sync**: Trigger another Yazio sync
   ```bash
   # Check that:
   # - New nutrition data is present
   # - AI analysis fields are null
   # - aiAnalysisStatus is 'NOT_STARTED'
   ```

4. **Re-Analyze**: Trigger AI analysis again
   ```bash
   # New analysis should match the updated meals
   ```

## Timezone Fix (Bonus)

During testing, we also discovered and fixed a timezone issue where nutrition dates were displaying incorrectly in the UI.

### Problem
When a date string like `"2025-12-07"` was stored in the database (as UTC midnight) and then converted to a JavaScript Date object, it would be interpreted as UTC. When displayed in a different timezone (e.g., America/New_York, UTC-5), the date would shift to the previous day.

Example:
- Database: `2025-12-07` (stored as `2025-12-07T00:00:00.000Z`)
- User in UTC-5: Sees "Dec 6, 2025" ❌

### Solution
Fixed the [`formatDate()`](../app/pages/nutrition/index.vue:611) function in both nutrition pages to parse date strings as local dates rather than UTC:

```typescript
function formatDate(date: string | Date) {
  // Handle date string properly to avoid timezone shifts
  // If it's a string in YYYY-MM-DD format, parse it as local date
  if (typeof date === 'string' && date.includes('-')) {
    const parts = date.split('-').map(Number)
    if (parts.length === 3 && parts.every(p => !isNaN(p))) {
      const [year, month, day] = parts
      return new Date(year, month - 1, day).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    }
  }
  // Fallback for Date objects
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}
```

### Files Fixed
- [`app/pages/nutrition/index.vue:611-626`](../app/pages/nutrition/index.vue:611-626) - UI date display
- [`app/pages/nutrition/[id].vue:567-585`](../app/pages/nutrition/[id].vue:567-585) - UI date display
- [`trigger/analyze-nutrition.ts:326-349`](../trigger/analyze-nutrition.ts:326-349) - AI prompt date formatting
- [`trigger/analyze-workout.ts:534-577`](../trigger/analyze-workout.ts:534-577) - AI prompt date formatting

**Chat Tools Fix**: Added [`formatDateLocal()`](../server/utils/chat-tools.ts:14-21) helper function in [`server/utils/chat-tools.ts`](../server/utils/chat-tools.ts) to format dates in local timezone for AI consumption. This ensures the AI sees the same dates as the user (e.g., Dec 7 instead of Dec 6 when in UTC-5).

Updated date formatting in:
- Nutrition entries (line 717)
- Wellness metrics (line 788)
- Training summary dates (lines 852-853)
- Daily training load (line 896)

## Future Enhancements

1. **Auto Re-analyze**: Optionally trigger AI analysis automatically for updated records
2. **Change Detection**: Only clear analysis if nutrition data actually changed
3. **Diff Tracking**: Store what changed to help users understand updates
4. **Notification**: Notify users when their analyzed records are updated and need re-analysis