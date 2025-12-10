# TSS/HRSS Calculation from Stream Data

## Overview

Calculate Training Stress Score (TSS) and Heart Rate Stress Score (HRSS) from WorkoutStream data to provide consistent training load metrics across all workout sources, independent of where the data originated.

## Problem Statement

Currently, TSS values are only present for:
- Intervals.icu workouts (pre-calculated)
- Some Strava workouts with power meters
- Manually entered workouts

Most workouts have `tss = null` because they don't come with pre-calculated TSS values. However, we have the underlying data in WorkoutStream tables to calculate these ourselves.

## Goals

1. **Calculate TSS** from power data in WorkoutStream when available
2. **Calculate HRSS** from heart rate data as fallback
3. **Calculate TRIMP** as last resort for basic HR data
4. **Backfill** existing workouts that have streams but no TSS
5. **Automate** calculation for new workouts with stream data

## Data Available

### WorkoutStream Table
```typescript
{
  watts: Json?       // Array of power values in watts
  heartrate: Json?   // Array of heart rate values in bpm
  time: Json?        // Array of elapsed time in seconds
  // ... other fields
}
```

### User Profile
```typescript
{
  ftp: Int?          // Functional Threshold Power
  maxHr: Int?        // Maximum Heart Rate
  restingHr: Int?    // Resting Heart Rate
  // Need to add: LTHR (Lactate Threshold Heart Rate)
}
```

## Implementation Plan

### 1. Add LTHR to User Profile

```prisma
model User {
  // ... existing fields
  lthr Int? // Lactate Threshold Heart Rate
}
```

### 2. Create TSS Calculation Service

**File**: `server/utils/calculate-tss-from-streams.ts`

```typescript
/**
 * Calculate Normalized Power (NP) from power array
 * 30-second rolling average, then 4th power, then 4th root
 */
function calculateNormalizedPower(wattsArray: number[]): number {
  // 30-second rolling average
  const rolling = []
  for (let i = 0; i < wattsArray.length - 29; i++) {
    const sum = wattsArray.slice(i, i + 30).reduce((a, b) => a + b, 0)
    rolling.push(sum / 30)
  }
  
  // 4th power average, then 4th root
  const fourthPower = rolling.reduce((sum, p) => sum + Math.pow(p, 4), 0) / rolling.length
  return Math.pow(fourthPower, 0.25)
}

/**
 * Calculate TSS from power stream
 */
export async function calculateTSSFromPowerStream(
  workoutId: string,
  userId: string
): Promise<number | null> {
  // Get user FTP
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ftp: true }
  })
  
  if (!user?.ftp) return null
  
  // Get workout and stream
  const workout = await prisma.workout.findUnique({
    where: { id: workoutId },
    include: { streams: true }
  })
  
  if (!workout?.streams?.watts) return null
  
  const wattsArray = workout.streams.watts as number[]
  const durationSeconds = workout.durationSec
  
  // Calculate NP
  const np = calculateNormalizedPower(wattsArray)
  
  // Calculate IF (Intensity Factor)
  const if = np / user.ftp
  
  // Calculate TSS
  const tss = (durationSeconds * np * if) / (user.ftp * 3600) * 100
  
  return tss
}

/**
 * Calculate HRSS from heart rate stream
 */
export async function calculateHRSSFromHRStream(
  workoutId: string,
  userId: string
): Promise<number | null> {
  // Get user HR settings
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { maxHr: true, restingHr: true, lthr: true }
  })
  
  if (!user?.maxHr || !user?.restingHr || !user?.lthr) return null
  
  // Get workout and stream
  const workout = await prisma.workout.findUnique({
    where: { id: workoutId },
    include: { streams: true }
  })
  
  if (!workout?.streams?.heartrate) return null
  
  const hrArray = workout.streams.heartrate as number[]
  const durationSeconds = workout.durationSec
  
  // Calculate average HR
  const avgHr = hrArray.reduce((a, b) => a + b, 0) / hrArray.length
  
  // Calculate HRR (Heart Rate Reserve)
  const hrr = (avgHr - user.restingHr) / (user.maxHr - user.restingHr)
  
  // Calculate HRSS
  const hrss = (durationSeconds * avgHr * hrr) / (user.lthr * 3600) * 100
  
  return hrss
}

/**
 * Calculate and update TSS/HRSS for a workout with stream data
 */
export async function calculateAndUpdateStressFromStreams(
  workoutId: string,
  userId: string
): Promise<{ tss?: number; hrss?: number } | null> {
  const result: { tss?: number; hrss?: number } = {}
  
  // Try power-based TSS first
  const tss = await calculateTSSFromPowerStream(workoutId, userId)
  if (tss !== null) {
    result.tss = tss
    await prisma.workout.update({
      where: { id: workoutId },
      data: { tss }
    })
    return result
  }
  
  // Fallback to HR-based HRSS
  const hrss = await calculateHRSSFromHRStream(workoutId, userId)
  if (hrss !== null) {
    result.hrss = hrss
    // Note: HRSS is not a standard Workout field, would need to add it
    // For now, store in tss field as it serves same purpose
    await prisma.workout.update({
      where: { id: workoutId },
      data: { tss: hrss }
    })
    return result
  }
  
  return null
}
```

### 3. Integrate with Stream Ingestion

**File**: `trigger/ingest-strava-streams.ts`

After stream data is saved:
```typescript
// Calculate TSS from the newly ingested stream data
await calculateAndUpdateStressFromStreams(workoutId, userId)

// Recalculate CTL/ATL for this workout and subsequent workouts
await recalculateStressAfterDate(userId, workout.date)
```

**File**: `trigger/ingest-intervals-streams.ts`

Same integration as Strava.

### 4. Create Backfill Script

**File**: `scripts/backfill-tss-from-streams.ts`

```typescript
/**
 * Backfill TSS/HRSS for workouts that have stream data but no TSS
 */
import { prisma } from '../server/utils/db'
import { calculateAndUpdateStressFromStreams } from '../server/utils/calculate-tss-from-streams'
import { recalculateStressAfterDate } from '../server/utils/calculate-workout-stress'

async function main() {
  // Find workouts with streams but no TSS
  const workouts = await prisma.workout.findMany({
    where: {
      tss: null,
      streams: {
        isNot: null
      }
    },
    orderBy: { date: 'asc' },
    select: {
      id: true,
      userId: true,
      date: true,
      title: true
    }
  })
  
  console.log(`Found ${workouts.length} workouts with streams but no TSS`)
  
  let calculated = 0
  let failed = 0
  
  for (const workout of workouts) {
    try {
      const result = await calculateAndUpdateStressFromStreams(
        workout.id,
        workout.userId
      )
      
      if (result) {
        calculated++
        console.log(`✓ ${workout.title}: TSS=${result.tss ?? result.hrss}`)
      } else {
        failed++
        console.log(`✗ ${workout.title}: No TSS could be calculated`)
      }
    } catch (error) {
      failed++
      console.error(`✗ ${workout.title}: ${error.message}`)
    }
  }
  
  console.log(`\nComplete: ${calculated} calculated, ${failed} failed`)
  
  // Recalculate CTL/ATL for all users
  const users = new Set(workouts.map(w => w.userId))
  for (const userId of users) {
    const firstWorkout = workouts.find(w => w.userId === userId)
    if (firstWorkout) {
      await recalculateStressAfterDate(userId, firstWorkout.date)
    }
  }
}

main()
```

### 5. Update UI to Show Data Source

In activity cards, show where TSS came from:
```vue
<UTooltip :text="`Training load${getTSSSource(activity)}`">
  <span class="inline-flex items-center gap-0.5">
    <span class="w-3 h-0.5 rounded-full bg-green-500"></span>
    <span>{{ Math.round(activity.tss ?? activity.trimp ?? 0) }}</span>
  </span>
</UTooltip>
```

```typescript
function getTSSSource(activity: any): string {
  if (activity.tss && activity.source === 'intervals') {
    return ' (from Intervals.icu)'
  }
  if (activity.tss && activity.source === 'strava') {
    return ' (calculated from power data)'
  }
  if (activity.trimp) {
    return ' (calculated from heart rate)'
  }
  return ''
}
```

## Benefits

1. **Consistency** - All workouts have training load metric
2. **Accuracy** - Calculate from actual data, not estimates
3. **Source Independence** - Works regardless of data source
4. **Better CTL/ATL** - More accurate fitness tracking
5. **User Insight** - Show where metrics come from

## Testing Plan

1. Test TSS calculation from power streams (cycling workouts)
2. Test HRSS calculation from HR streams (running workouts)
3. Test backfill script on existing data
4. Verify CTL/ATL recalculation
5. Check UI displays correctly

## Future Enhancements

1. **TRIMP Calculation** - More sophisticated HR-based score
2. **Sport-Specific TSS** - Different formulas for run/bike/swim
3. **Adaptive LTHR** - Estimate LTHR from workout data
4. **TSS Validation** - Compare calculated vs Intervals.icu TSS

## Dependencies

- User profile must have FTP, maxHR, restingHR, LTHR
- WorkoutStream must exist for workout
- Stream data must have sufficient quality

## Acceptance Criteria

- [ ] TSS calculated from power streams when available
- [ ] HRSS calculated from HR streams as fallback
- [ ] Backfill script processes existing workouts
- [ ] New workouts automatically get TSS/HRSS
- [ ] Weekly "Load" summary shows all training load
- [ ] CTL/ATL recalculated after TSS updates
- [ ] UI shows consistent training load across sources