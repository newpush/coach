# Strava Pacing Data Implementation Guide

## Overview

This guide outlines how to ingest and store pacing/streams data from Strava activities to enable detailed pace analysis, lap splits, and pace variability metrics.

## What Data is Available

Strava provides time-series data through their [Streams API](https://developers.strava.com/docs/reference/#api-Streams-getActivityStreams):

### Available Stream Types

- **time** - Elapsed time in seconds for each data point
- **distance** - Cumulative distance in meters
- **latlng** - GPS coordinates (latitude, longitude)
- **altitude** - Elevation in meters
- **velocity_smooth** - Smoothed velocity in m/s (pace data)
- **heartrate** - Heart rate in bpm
- **cadence** - Cadence (rpm for cycling, spm for running)
- **watts** - Power in watts
- **temp** - Temperature in celsius
- **moving** - Boolean indicating if athlete was moving
- **grade_smooth** - Smoothed grade percentage

### Key Pacing Metrics

From these streams, you can calculate:

- Mile/km splits
- Pace per lap
- Pace variability (standard deviation)
- Pace zones distribution
- Even pacing score
- Positive/negative splits analysis
- Surge detection (sudden pace changes)

## Implementation Steps

### Step 1: Add Streams Fetching Function

Add new interface and function to `server/utils/strava.ts`:

```typescript
interface StravaStream {
  type: string
  data: number[] | [number, number][]
  series_type: string
  original_size: number
  resolution: string
}

export async function fetchStravaActivityStreams(
  integration: Integration,
  activityId: number,
  streamTypes: string[] = [
    'time',
    'distance',
    'velocity_smooth',
    'heartrate',
    'cadence',
    'watts',
    'altitude'
  ]
): Promise<Record<string, StravaStream>> {
  const validIntegration = await ensureValidToken(integration)

  const url = `https://www.strava.com/api/v3/activities/${activityId}/streams`
  const params = new URLSearchParams({
    keys: streamTypes.join(','),
    key_by_type: 'true'
  })

  const response = await fetch(`${url}?${params}`, {
    headers: {
      Authorization: `Bearer ${validIntegration.accessToken}`
    }
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Strava Streams API error: ${response.status} ${errorText}`)
  }

  return await response.json()
}
```

### Step 2: Update Database Schema

**Option A: Store in existing rawJson field (simplest)**

No schema changes needed. In the normalization function, include streams in rawJson:

```typescript
rawJson: {
  activity: activity,
  streams: streams
}
```

**Option B: Create dedicated WorkoutStreams table (recommended for complex queries)**

Add new model to `prisma/schema.prisma`:

```prisma
model WorkoutStream {
  id           String   @id @default(uuid())
  workoutId    String   @unique

  time         Json?
  distance     Json?
  velocity     Json?
  heartrate    Json?
  cadence      Json?
  watts        Json?
  altitude     Json?
  latlng       Json?
  grade        Json?
  moving       Json?

  avgPacePerKm Float?
  paceVariability Float?
  lapSplits    Json?
  paceZones    Json?

  workout      Workout  @relation(fields: [workoutId], references: [id], onDelete: Cascade)

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([workoutId])
}
```

Then add relation to Workout model:

```prisma
streams      WorkoutStream?
```

### Step 3: Create Pacing Calculation Utilities

Create new file `server/utils/pacing.ts`:

```typescript
export function calculateLapSplits(
  timeData: number[],
  distanceData: number[],
  lapDistance: number = 1000
) {
  const splits = []
  let currentLap = 1
  let lastLapDistance = 0
  let lastLapTime = 0

  for (let i = 0; i < distanceData.length; i++) {
    const distance = distanceData[i]
    const time = timeData[i]

    if (distance >= currentLap * lapDistance) {
      const lapTime = time - lastLapTime
      const lapDist = distance - lastLapDistance
      const paceSeconds = (lapTime / lapDist) * 1000
      const paceMinutes = Math.floor(paceSeconds / 60)
      const paceRemainingSeconds = Math.round(paceSeconds % 60)

      splits.push({
        lap: currentLap,
        distance: lapDist,
        time: lapTime,
        pace: `${paceMinutes}:${paceRemainingSeconds.toString().padStart(2, '0')}/km`
      })

      lastLapDistance = distance
      lastLapTime = time
      currentLap++
    }
  }

  return splits
}

export function calculatePaceVariability(velocityData: number[]) {
  if (velocityData.length === 0) return 0

  const mean = velocityData.reduce((sum, v) => sum + v, 0) / velocityData.length
  const variance =
    velocityData.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / velocityData.length
  return Math.sqrt(variance)
}

export function calculatePaceZones(
  velocityData: number[],
  timeData: number[],
  zones: { min: number; max: number; name: string }[]
) {
  const timeInZones = zones.map((zone) => ({
    zone: zone.name,
    minPace: zone.min,
    maxPace: zone.max,
    timeInZone: 0
  }))

  for (let i = 1; i < velocityData.length; i++) {
    const velocity = velocityData[i]
    const timeInterval = timeData[i] - timeData[i - 1]

    for (let j = 0; j < zones.length; j++) {
      if (velocity >= zones[j].min && velocity <= zones[j].max) {
        timeInZones[j].timeInZone += timeInterval
        break
      }
    }
  }

  return timeInZones
}

export function calculateAveragePace(totalTimeSeconds: number, totalDistanceMeters: number) {
  if (totalDistanceMeters === 0) return 0
  return totalTimeSeconds / 60 / (totalDistanceMeters / 1000)
}
```

### Step 4: Modify Data Ingestion

Update ingestion trigger to optionally fetch streams. Create `trigger/ingest-strava-streams.ts`:

```typescript
import { task } from '@trigger.dev/sdk/v3'
import { prisma } from '~/server/utils/db'
import { fetchStravaActivityStreams } from '~/server/utils/strava'
import {
  calculateLapSplits,
  calculatePaceVariability,
  calculateAveragePace
} from '~/server/utils/pacing'

export const ingestStravaStreams = task({
  id: 'ingest-strava-streams',
  run: async (payload: { userId: string; workoutId: string; activityId: number }) => {
    const integration = await prisma.integration.findFirst({
      where: {
        userId: payload.userId,
        provider: 'strava'
      }
    })

    if (!integration) {
      throw new Error('Strava integration not found')
    }

    const streams = await fetchStravaActivityStreams(integration, payload.activityId, [
      'time',
      'distance',
      'velocity_smooth',
      'heartrate',
      'cadence',
      'watts',
      'altitude'
    ])

    const timeData = (streams.time?.data as number[]) || []
    const distanceData = (streams.distance?.data as number[]) || []
    const velocityData = (streams.velocity_smooth?.data as number[]) || []

    const lapSplits = calculateLapSplits(timeData, distanceData)
    const paceVariability = calculatePaceVariability(velocityData)
    const avgPacePerKm = calculateAveragePace(
      timeData[timeData.length - 1],
      distanceData[distanceData.length - 1]
    )

    await prisma.workoutStream.upsert({
      where: { workoutId: payload.workoutId },
      create: {
        workoutId: payload.workoutId,
        time: timeData,
        distance: distanceData,
        velocity: velocityData,
        heartrate: streams.heartrate?.data,
        cadence: streams.cadence?.data,
        watts: streams.watts?.data,
        altitude: streams.altitude?.data,
        lapSplits,
        paceVariability,
        avgPacePerKm
      },
      update: {
        time: timeData,
        distance: distanceData,
        velocity: velocityData,
        heartrate: streams.heartrate?.data,
        cadence: streams.cadence?.data,
        watts: streams.watts?.data,
        altitude: streams.altitude?.data,
        lapSplits,
        paceVariability,
        avgPacePerKm
      }
    })

    return { success: true, workoutId: payload.workoutId }
  }
})
```

### Step 5: API Rate Limits Consideration

**Important:** Strava has strict rate limits:

- 100 requests per 15 minutes
- 1,000 requests per day

**Strategies:**

1. Only fetch streams for important activities (races, key workouts)
2. Cache streams data - never refetch if already stored
3. Implement progressive enhancement - fetch basic data first, streams later
4. Add user preference: "Enable detailed pacing analysis"
5. Batch process during off-peak hours

### Step 6: Add API Endpoint for Streams

Create `server/api/workouts/[id]/streams.get.ts`:

```typescript
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const workoutId = getRouterParam(event, 'id')

  const workout = await prisma.workout.findUnique({
    where: { id: workoutId, userId: session.user.id },
    include: { streams: true }
  })

  if (!workout) {
    throw createError({
      statusCode: 404,
      message: 'Workout not found'
    })
  }

  if (!workout.streams) {
    throw createError({
      statusCode: 404,
      message: 'Streams data not available for this workout'
    })
  }

  return workout.streams
})
```

### Step 7: Frontend Components

Create Vue component for displaying pacing data at `app/components/PacingAnalysis.vue`:

```vue
<template>
  <div class="pacing-analysis">
    <h3>Pacing Analysis</h3>

    <div v-if="loading">Loading pacing data...</div>
    <div v-else-if="error">{{ error }}</div>
    <div v-else-if="streams">
      <div class="metrics-grid">
        <div class="metric">
          <span class="label">Average Pace</span>
          <span class="value">{{ formatPace(streams.avgPacePerKm) }}</span>
        </div>
        <div class="metric">
          <span class="label">Pace Variability</span>
          <span class="value">{{ streams.paceVariability?.toFixed(2) }} m/s</span>
        </div>
      </div>

      <div v-if="streams.lapSplits" class="lap-splits">
        <h4>Lap Splits</h4>
        <table>
          <thead>
            <tr>
              <th>Lap</th>
              <th>Distance</th>
              <th>Time</th>
              <th>Pace</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="split in streams.lapSplits" :key="split.lap">
              <td>{{ split.lap }}</td>
              <td>{{ (split.distance / 1000).toFixed(2) }} km</td>
              <td>{{ formatTime(split.time) }}</td>
              <td>{{ split.pace }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  const props = defineProps<{
    workoutId: string
  }>()

  const {
    data: streams,
    pending: loading,
    error
  } = await useFetch(`/api/workouts/${props.workoutId}/streams`)

  function formatPace(paceMinPerKm: number | null) {
    if (!paceMinPerKm) return 'N/A'
    const minutes = Math.floor(paceMinPerKm)
    const seconds = Math.round((paceMinPerKm - minutes) * 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}/km`
  }

  function formatTime(seconds: number) {
    const mins = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }
</script>
```

## Example API Response

```json
{
  "time": {
    "data": [0, 10, 20, 30, 40],
    "series_type": "time",
    "original_size": 1234,
    "resolution": "high"
  },
  "distance": {
    "data": [0, 50, 100, 150, 200],
    "series_type": "distance"
  },
  "velocity_smooth": {
    "data": [0, 3.5, 3.8, 3.6, 3.7],
    "series_type": "distance"
  }
}
```

## Pacing Metrics Examples

### Lap Splits

```json
{
  "lapSplits": [
    { "lap": 1, "distance": 1000, "time": 240, "pace": "4:00/km" },
    { "lap": 2, "distance": 1000, "time": 245, "pace": "4:05/km" },
    { "lap": 3, "distance": 1000, "time": 238, "pace": "3:58/km" }
  ]
}
```

### Pace Zones

```json
{
  "paceZones": [
    { "zone": "Recovery", "minPace": "6:00", "maxPace": "5:30", "timeInZone": 600 },
    { "zone": "Easy", "minPace": "5:30", "maxPace": "5:00", "timeInZone": 1200 },
    { "zone": "Tempo", "minPace": "5:00", "maxPace": "4:30", "timeInZone": 800 }
  ]
}
```

## Testing

Create test script `scripts/test-strava-streams.ts`:

```typescript
import { prisma } from '../server/utils/db'
import { fetchStravaActivityStreams } from '../server/utils/strava'

async function testStreams() {
  const integration = await prisma.integration.findFirst({
    where: { provider: 'strava' }
  })

  if (!integration) {
    console.error('No Strava integration found')
    return
  }

  const activityId = 1234567890

  console.log('Fetching streams for activity:', activityId)

  const streams = await fetchStravaActivityStreams(integration, activityId, [
    'time',
    'distance',
    'velocity_smooth'
  ])

  console.log('Streams received:')
  console.log('- Time data points:', streams.time?.data.length)
  console.log('- Distance data points:', streams.distance?.data.length)
  console.log('- Velocity data points:', streams.velocity_smooth?.data.length)
}

testStreams()
```

## Performance Considerations

1. **Data Size**: Stream data can be large (1000+ data points per activity)
2. **Storage**: PostgreSQL JSON columns work well for this use case
3. **Queries**: Index workoutId for fast lookups
4. **Caching**: Cache processed metrics, recalculate only when needed
5. **Async Processing**: Fetch streams in background jobs, not during sync

## Migration Strategy

1. Deploy schema changes (add WorkoutStream table)
2. Add API endpoints without breaking existing functionality
3. Implement background job to fetch streams for recent activities
4. Add UI components progressively
5. Monitor API rate limits and adjust batch sizes

## Future Enhancements

1. **Real-time Pacing Feedback**: AI coach comments on pacing strategy
2. **Comparative Analysis**: Compare pacing across similar workouts
3. **Predictive Pacing**: Suggest optimal pacing for upcoming races
4. **Route-based Pacing**: Analyze pacing relative to terrain/elevation
5. **Heatmaps**: Visualize pacing variations on map routes
6. **Training Zones**: Automatic detection of training intensity zones
7. **Fatigue Analysis**: Detect when pacing degrades (sign of fatigue)

## Related Documentation

- [Strava Streams API Reference](https://developers.strava.com/docs/reference/#api-Streams)
- [Strava Rate Limits](https://developers.strava.com/docs/rate-limits/)
- Database Schema: `prisma/schema.prisma`
- Strava Utils: `server/utils/strava.ts`
- Strava Integration Guide: `docs/strava-integration.md`
