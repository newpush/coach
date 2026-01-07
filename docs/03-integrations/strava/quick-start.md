# Strava Pacing Data - Quick Start Guide

## ✅ Implementation Complete! ✨ Now With Automatic Ingestion

Strava pacing data ingestion has been fully implemented **with automatic ingestion**. Pacing data is now automatically fetched during regular Strava sync for Run, Ride, Walk, and Hike activities!

## 🚀 Quick Start

### 1. Test the Implementation

```bash
# Run the test script to verify everything works
npx tsx scripts/test-strava-pacing.ts
```

This will:

- Find a Strava integration
- Fetch a recent workout
- Ingest pacing data
- Calculate metrics
- Display results

### 2. Ingest Pacing Data for a Workout

#### Option A: Via Trigger.dev Job

```typescript
import { tasks } from '@trigger.dev/sdk/v3'

await tasks.trigger('ingest-strava-streams', {
  userId: 'user-uuid',
  workoutId: 'workout-uuid',
  activityId: 12345678 // Strava activity ID (integer)
})
```

#### Option B: Direct API Call (for testing)

```typescript
import { fetchStravaActivityStreams } from '~/server/utils/strava'
import { calculateLapSplits } from '~/server/utils/pacing'

const integration = await prisma.integration.findFirst({
  where: { provider: 'strava' }
})

const streams = await fetchStravaActivityStreams(integration, activityId)
const lapSplits = calculateLapSplits(streams.time.data, streams.distance.data)
```

### 3. Backfill Existing Workouts

To add pacing data to **older workouts** that were synced before this feature:

```bash
# Dry run first to see what will be processed
npx tsx scripts/backfill-strava-pacing.ts --dry-run

# Process all workouts (respects rate limits automatically)
npx tsx scripts/backfill-strava-pacing.ts

# Process only the 50 most recent workouts
npx tsx scripts/backfill-strava-pacing.ts --limit 50

# Custom batch size (default is 10)
npx tsx scripts/backfill-strava-pacing.ts --batch-size 20
```

The script will:

- Find all Run/Ride/Walk/Hike workouts without pacing data
- Process them in batches to respect rate limits
- Show progress and handle errors gracefully
- Continue processing in background via Trigger.dev

**Rate Limiting:**

- Processes 10 workouts per batch by default
- 10-second pause between batches
- Safe for large workout histories

### 3. Display Pacing Data in UI

Add the component to any workout page:

```vue
<template>
  <div>
    <h1>{{ workout.title }}</h1>

    <!-- Add pacing analysis -->
    <PacingAnalysis :workout-id="workout.id" />
  </div>
</template>

<script setup>
  import PacingAnalysis from '~/components/PacingAnalysis.vue'
</script>
```

### 4. Access Data via API

```typescript
// GET /api/workouts/:id/streams
const response = await fetch(`/api/workouts/${workoutId}/streams`)
const streams = await response.json()

console.log(streams.avgPacePerKm) // 4.5 (min/km)
console.log(streams.lapSplits) // Array of lap objects
console.log(streams.pacingStrategy) // {strategy: "negative_split", ...}
```

## 📊 What You Get

### Metrics Calculated

- ✅ Lap splits (1km intervals)
- ✅ Average pace (min/km)
- ✅ Pace variability (consistency)
- ✅ Pacing strategy (even/positive/negative split)
- ✅ Evenness score (0-100)
- ✅ Surge detection

### UI Components

- ✅ Metrics dashboard
- ✅ Color-coded lap splits table
- ✅ First/second half comparison
- ✅ Evenness bar chart
- ✅ Surge timeline

## 📁 Files Created/Modified

### New Files

```
server/utils/pacing.ts                    # Pacing calculation utilities
server/api/workouts/[id]/streams.get.ts   # API endpoint
trigger/ingest-strava-streams.ts          # Background job
app/components/PacingAnalysis.vue         # UI component
scripts/test-strava-pacing.ts             # Test script
docs/strava-pacing-data-implementation.md # Implementation guide
docs/strava-pacing-usage.md               # Usage documentation
```

### Modified Files

```
server/utils/strava.ts                    # Added fetchStravaActivityStreams()
prisma/schema.prisma                      # Added WorkoutStream model
prisma/migrations/                        # Database migration
```

## ⚠️ Important Notes

### Rate Limits

Strava allows:

- 100 requests per 15 minutes
- 1,000 requests per day

**Strategy**: Only fetch streams for important activities (races, key workouts)

### Data Availability

- Pacing data only available for GPS-tracked activities (Run, Ride, Walk)
- Treadmill/indoor activities without GPS won't have pacing data
- Manual activities won't have streams

### Best Practices

1. **Cache aggressively** - Never refetch the same activity
2. **User control** - Add manual "Fetch Pacing Data" button
3. **Selective ingestion** - Only fetch for important workouts
4. **Monitor limits** - Track API usage

## 🧪 Testing Checklist

- [ ] Run test script: `npx tsx scripts/test-strava-pacing.ts`
- [ ] Verify database migration: `npx prisma migrate status`
- [ ] Check Prisma client: `npx prisma generate`
- [ ] Test API endpoint: GET `/api/workouts/:id/streams`
- [ ] View component in browser with a real workout
- [ ] Verify Trigger.dev job appears in dashboard

## 🔧 Troubleshooting

### "Streams data not available"

Run the ingestion job for that workout first.

### "Rate limit exceeded"

Wait 15 minutes before making more Strava API requests.

### TypeScript errors

Regenerate Prisma client: `npx prisma generate`

### "Cannot find module"

Restart your dev server after adding new files.

## 📚 Documentation

Full documentation available in:

- [`docs/strava-pacing-data-implementation.md`](./strava-pacing-data-implementation.md) - Technical implementation details
- [`docs/strava-pacing-usage.md`](./strava-pacing-usage.md) - Complete usage guide
- [`docs/strava-integration.md`](./strava-integration.md) - General Strava integration

## 🎉 Next Steps

1. **Test the implementation** with real Strava data
2. **Add UI trigger** - Create a "Fetch Pacing Data" button on workout pages
3. **Monitor usage** - Track Strava API rate limits
4. **Enhance analysis** - Add pace zones, terrain adjustment, etc.
5. **User feedback** - Gather input on which metrics are most valuable

## 💡 Example Use Cases

### For Athletes

- "Did I pace my race evenly?"
- "How consistent was my interval training?"
- "Where did I slow down during the marathon?"

### For Coaches

- "Is this athlete pacing correctly?"
- "Track progression in pacing consistency"
- "Identify pacing weaknesses"

### For AI Analysis

- "Your pacing was 15% more consistent than last month"
- "Recommend starting 10s/km slower based on your tendency to positive split"
- "Your best performances came with even pacing"

---

**Status**: ✅ Implementation Complete  
**Ready for Testing**: Yes  
**Production Ready**: After testing and rate limit monitoring
