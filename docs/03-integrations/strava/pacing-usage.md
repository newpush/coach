# Strava Pacing Data - Usage Guide

## Overview

The Strava pacing data feature provides detailed pace analysis for running and cycling activities, including lap splits, pacing strategy analysis, and pace consistency metrics.

## Features Implemented

### 1. Data Ingestion

- **Streams API Integration**: Fetches time-series data from Strava including velocity, heart rate, power, and GPS coordinates
- **Background Processing**: Uses Trigger.dev job to fetch and process streams asynchronously
- **Intelligent Caching**: Stores processed data to avoid repeated API calls

### 2. Pacing Metrics

- **Lap Splits**: Automatic 1km/1mi lap split calculation
- **Average Pace**: Overall pace per kilometer/mile
- **Pace Variability**: Consistency score based on velocity standard deviation
- **Pacing Strategy**: Detects even pacing, positive splits, or negative splits
- **Evenness Score**: 0-100 score indicating pacing consistency
- **Surge Detection**: Identifies sudden pace increases during activity

### 3. Visual Analysis

- **Metrics Dashboard**: Key pacing metrics at a glance
- **Lap Splits Table**: Color-coded splits showing fast/slow laps
- **Split Comparison**: First half vs. second half analysis
- **Evenness Bar**: Visual representation of pacing consistency
- **Surge Timeline**: List of detected pace surges with timestamps

## How to Use

### For Users

1. **Connect Strava**:
   - Go to Settings → Connected Apps
   - Click "Connect Strava"
   - Authorize the application

2. **Ingest Pacing Data**:
   - Navigate to a workout detail page
   - If pacing data is available, you'll see the "Pacing Analysis" section
   - If not available, you can trigger ingestion manually (see below)

3. **View Pacing Analysis**:
   - Open any Run, Ride, or Walk activity from Strava
   - Scroll to the "Pacing Analysis" section
   - Review lap splits, pacing strategy, and consistency metrics

### For Developers

#### Manual Stream Ingestion

Use the Trigger.dev job to ingest streams for a specific workout:

```typescript
import { tasks } from '@trigger.dev/sdk/v3'

// Trigger stream ingestion
await tasks.trigger('ingest-strava-streams', {
  userId: 'user-id',
  workoutId: 'workout-id',
  activityId: 12345678 // Strava activity ID
})
```

#### API Endpoint Usage

Fetch stream data programmatically:

```typescript
// GET /api/workouts/:id/streams
const response = await fetch(`/api/workouts/${workoutId}/streams`)
const streams = await response.json()

// Response includes:
// - time, distance, velocity arrays
// - lapSplits, paceVariability, avgPacePerKm
// - pacingStrategy analysis
// - surges detection
```

#### Using the Vue Component

Add pacing analysis to any workout page:

```vue
<template>
  <div>
    <h2>Workout Details</h2>
    <!-- Other workout info -->

    <PacingAnalysis :workout-id="workoutId" />
  </div>
</template>

<script setup>
  const workoutId = '...'
</script>
```

## Testing

### Run the Test Script

```bash
npx tsx scripts/test-strava-pacing.ts
```

This will:

1. Find a Strava integration
2. Locate a recent workout
3. Fetch streams from Strava
4. Calculate pacing metrics
5. Store data in database
6. Verify retrieval

### Expected Output

```
🧪 Testing Strava Pacing Data Implementation

Step 1: Finding Strava integration...
✅ Found Strava integration for user: user@example.com

Step 2: Finding recent Strava workout...
✅ Found workout: Morning Run (12/4/2024)
   Type: Run, Duration: 45 min
   External ID: 12345678

Step 3: Fetching streams from Strava API...
✅ Streams fetched successfully!
   Time points: 2700
   Distance points: 2700
   Velocity points: 2700

Step 4: Calculating pacing metrics...
✅ Calculated 10 lap splits
   First lap: 4:30/km
   Last lap: 4:25/km
✅ Pace variability: 0.23 m/s
✅ Average pace: 4:28/km
✅ Pacing strategy: negative_split
   Started conservative and finished strong (negative split)
   Evenness score: 85/100

Step 5: Storing stream data in database...
✅ Stream data stored with ID: xyz-123

Step 6: Verifying data retrieval...
✅ Stream data retrieved successfully!

✅ All tests passed!
🎉 Pacing data successfully ingested for workout: Morning Run
```

## Rate Limits

**Important**: Strava has strict API rate limits:

- 100 requests per 15 minutes
- 1,000 requests per day

### Best Practices

1. **Selective Ingestion**: Only fetch streams for important activities (races, key workouts)
2. **Cache Aggressively**: Never refetch streams for the same activity
3. **User Control**: Add a manual "Fetch Pacing Data" button instead of automatic ingestion
4. **Batch Processing**: Process multiple workouts during off-peak hours
5. **Monitor Limits**: Track API usage and implement backoff strategies

## Database Schema

### WorkoutStream Model

```prisma
model WorkoutStream {
  id              String   @id @default(uuid())
  workoutId       String   @unique

  // Raw stream arrays
  time            Json?    // [0, 10, 20, ...]
  distance        Json?    // [0, 50, 100, ...]
  velocity        Json?    // [0, 3.5, 3.8, ...]
  heartrate       Json?    // [120, 125, 130, ...]
  cadence         Json?    // [85, 88, 90, ...]
  watts           Json?    // [200, 210, 205, ...]
  altitude        Json?    // [100, 105, 110, ...]

  // Computed metrics
  avgPacePerKm    Float?   // 4.5 (min/km)
  paceVariability Float?   // 0.23 (m/s)
  lapSplits       Json?    // [{lap: 1, pace: "4:30/km"}, ...]
  pacingStrategy  Json?    // {strategy: "negative_split", ...}
  surges          Json?    // [{time: 300, increase: 1.2}, ...]
}
```

## Troubleshooting

### "Streams data not available"

**Cause**: Streams haven't been ingested yet  
**Solution**: Run the ingestion job or test script

### "Rate Limit Exceeded"

**Cause**: Too many Strava API requests  
**Solution**: Wait 15 minutes and try again

### "No time or distance data"

**Cause**: Activity doesn't have GPS data (e.g., treadmill run)  
**Solution**: Pacing analysis only works for GPS-tracked activities

### TypeScript Errors

**Cause**: Prisma client not regenerated after schema changes  
**Solution**: Run `npx prisma generate`

## File Structure

```
server/
  utils/
    strava.ts              # fetchStravaActivityStreams()
    pacing.ts              # Pacing calculation utilities
  api/
    workouts/
      [id]/
        streams.get.ts     # API endpoint for stream data

trigger/
  ingest-strava-streams.ts # Background job for ingestion

app/
  components/
    PacingAnalysis.vue     # Vue component for display

scripts/
  test-strava-pacing.ts    # Test script

prisma/
  schema.prisma            # WorkoutStream model
  migrations/
    20251204201900_add_workout_streams/
      migration.sql        # Database migration
```

## Future Enhancements

### Short Term

1. Add manual "Fetch Pacing Data" button to workout page
2. Show pacing data availability indicator
3. Add loading states during ingestion
4. Implement retry logic for failed fetches

### Medium Term

1. **Pace Zones**: Calculate time in different pace zones
2. **Route Visualization**: Map with pace overlay
3. **Comparative Analysis**: Compare pacing across similar workouts
4. **AI Insights**: "Your pacing was 5% more consistent than your last 10K"

### Long Term

1. **Predictive Pacing**: Suggest optimal pacing for upcoming races
2. **Terrain-Adjusted Pace**: Normalize pace for hills/elevation
3. **Real-time Feedback**: "You're starting too fast" alerts
4. **Training Plans**: Incorporate pacing goals into workout prescriptions

## Related Documentation

- [Strava Integration Guide](./strava-integration.md)
- [Strava API Reference](https://developers.strava.com/docs/reference/#api-Streams)
- [Implementation Guide](./strava-pacing-data-implementation.md)
