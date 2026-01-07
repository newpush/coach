# Strava Activities via Intervals.icu API Limitation

## Issue

When syncing from Intervals.icu, activities that originated from Strava are not fully accessible via the Intervals.icu API due to Strava's API restrictions.

### Symptoms

- Activities show as "Unnamed Activity"
- No workout type (shows as `null`)
- No duration, distance, or other metrics
- Only basic metadata available: ID, source indicator, and timestamp

### Technical Details

When fetching activities from Intervals.icu API, Strava-sourced activities return minimal data:

```json
{
  "id": "16639341172",
  "icu_athlete_id": "i434414",
  "start_date_local": "2025-12-03T15:43:42",
  "source": "STRAVA",
  "_note": "STRAVA activities are not available via the API"
}
```

## Root Cause

- Strava imposes restrictions on third-party API access to activities
- Intervals.icu receives the data from Strava but cannot expose it through their own API
- This affects Run, Weight Training, and other Strava-recorded activities

## Solution Implemented

### 1. Filter Incomplete Activities (Backend)

Modified [`trigger/ingest-intervals.ts`](../trigger/ingest-intervals.ts) to:

- Detect Strava activities with incomplete data
- Filter them out before saving to database
- Log skipped activities for monitoring
- Return count of filtered activities in response

```typescript
// Filter out incomplete Strava activities
const activities = allActivities.filter((activity) => {
  const isIncompleteStrava =
    activity.source === 'STRAVA' && activity._note?.includes('not available via the API')
  if (isIncompleteStrava) {
    logger.log(`Skipping incomplete Strava activity: ${activity.id}`)
    return false
  }
  return true
})
```

### 2. User Notifications (Frontend)

Added clear messaging in [`app/pages/settings.vue`](../app/pages/settings.vue):

- Warning note under Intervals.icu integration
- Toast notification when syncing explains the limitation
- Suggests connecting Strava directly for complete data

### 3. Cleanup Script

Created [`scripts/cleanup-incomplete-strava.js`](../scripts/cleanup-incomplete-strava.js) to:

- Identify existing incomplete Strava activities in database
- Remove them to clean up data
- Executed successfully, removing 69 incomplete records

## Recommendations for Users

### Option 1: Connect Strava Directly (Recommended)

- Implement direct Strava integration
- Provides full access to all workout details
- No API limitations

### Option 2: Use Intervals.icu for Non-Strava Activities

- Zwift, TrainerRoad, and manually entered workouts work fine
- Only Strava-synced activities are affected

### Option 3: Manual Data Entry

- Enter important workouts manually in Intervals.icu
- These will be accessible via the API

## Files Modified

1. `trigger/ingest-intervals.ts` - Added filtering logic
2. `app/pages/settings.vue` - Added user-facing warnings
3. `scripts/cleanup-incomplete-strava.js` - Cleanup script (new)
4. `scripts/test-recent-intervals.js` - Diagnostic script (new)
5. `scripts/check-specific-activity.js` - Activity detail inspector (new)

## Testing

Run diagnostics:

```bash
# Check recent activities
node scripts/test-recent-intervals.js

# Inspect specific activity
node scripts/check-specific-activity.js

# Clean up incomplete records
node scripts/cleanup-incomplete-strava.js
```

## Future Enhancements

1. **Direct Strava Integration**: Implement OAuth connection to Strava API
2. **Activity Type Detection**: Use AI to infer workout types from partial data
3. **User Preference**: Allow users to choose whether to sync incomplete activities
4. **Cache Strategy**: Store Strava data before it reaches Intervals.icu

## Related Documentation

- [Intervals.icu API Documentation](https://intervals.icu/api/)
- [Strava API Terms](https://developers.strava.com/docs/getting-started/)
