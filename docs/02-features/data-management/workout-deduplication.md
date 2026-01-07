# Workout Deduplication System

## Overview

The workout deduplication system automatically identifies and manages duplicate workouts from multiple sources (Intervals.icu and Strava), keeping the most complete version while marking duplicates.

## Problem Statement

Users may have the same workout synced from multiple sources:

- **Intervals.icu**: Often has full cycling metrics (power, TSS, training load)
- **Strava**: Better for gym/strength training activities
- **Both**: May have the same ride/run with different data quality

Without deduplication, the system would:

- Show duplicate entries in workout lists
- Inflate workout counts and statistics
- Run duplicate AI analyses
- Generate confused reports with redundant data

## Solution Architecture

### Database Schema

Added three fields to the `Workout` model:

```prisma
isDuplicate      Boolean  @default(false)  // Marks if this is a duplicate
duplicateOf      String?                   // ID of the canonical workout
completenessScore Int?                     // Score used to rank versions
```

### Detection Logic

**Duplicate Detection Criteria:**

1. **Time proximity**: Within 1 hour of each other
2. **Duration similarity**: Within 5 minutes OR 10% difference
3. **Type/title similarity**:
   - Matching workout types
   - Similar titles
   - Same activity category (ride/run/etc)

**Completeness Scoring:**
The system calculates a score for each workout based on data richness:

- **Base score by source**:
  - Intervals.icu: +10 (cycling-focused)
  - Strava: +5 (general activities)

- **Cycling-specific bonuses**:
  - Power data: +30 (+10 extra for Intervals)
  - Normalized Power: +10
  - TSS: +10

- **General metrics**:
  - Heart rate: +15
  - Streams (time-series): +20
  - Training load: +10
  - Distance: +5
  - Elevation: +5

- **Activity-specific preferences**:
  - Gym/strength activities: +20 for Strava

### Deduplication Process

1. **Group**: Find workouts that match duplicate criteria
2. **Score**: Calculate completeness score for each workout
3. **Rank**: Sort by completeness score (highest = best)
4. **Mark**: Update duplicates with `isDuplicate=true` and `duplicateOf=<best_id>`
5. **Preserve**: Keep the best version unmarked

### Integration with Task Pipeline

The deduplication task runs after data ingestion:

```
Level 1: Data Ingestion
  ↓ ingest-intervals
  ↓ ingest-strava

Level 1.5: Data Cleanup
  ↓ deduplicate-workouts  ← NEW

Level 2: AI Analysis
  ↓ analyze-workouts (uses non-duplicates only)
```

## Usage

### API Endpoints

**Trigger Deduplication:**

```typescript
POST / api / workouts / deduplicate
// Returns: { success: true, taskId: string }
```

**Get Workouts (Auto-filters duplicates):**

```typescript
GET /api/workouts
// Returns non-duplicate workouts by default

GET /api/workouts?includeDuplicates=true
// Include duplicates if needed
```

### Trigger Task

```typescript
import { tasks } from '@trigger.dev/sdk/v3'

await tasks.trigger('deduplicate-workouts', {
  userId: user.id
})
```

## Query Filtering

All workout queries now automatically exclude duplicates:

```typescript
// ✅ Good - Filters duplicates
const workouts = await prisma.workout.findMany({
  where: {
    userId,
    isDuplicate: false // ← Always include this
  }
})

// ❌ Bad - Includes duplicates
const workouts = await prisma.workout.findMany({
  where: { userId }
})
```

### Updated Endpoints

All these endpoints now filter duplicates automatically:

- `/api/workouts` - Workout listing
- `/api/workouts/analyze-all` - Batch analysis
- `/api/activity/recent` - Recent activity timeline
- `/api/scores/workout-trends` - Trend analysis
- `/api/orchestrate/metadata` - Task metadata

## Task Dependency Graph

The deduplication task is integrated into the pipeline:

```typescript
const TASK_DEPENDENCIES = {
  'deduplicate-workouts': {
    id: 'deduplicate-workouts',
    name: 'Deduplicate Workouts',
    description: 'Identify and mark duplicate workouts',
    category: 'cleanup',
    dependsOn: ['ingest-intervals', 'ingest-strava'],
    estimatedDuration: 30,
    required: true,
    endpoint: '/api/workouts/deduplicate',
    triggerId: 'deduplicate-workouts'
  }
}
```

## UI Display

The TaskDependencyGraph component shows deduplication status:

- **Pending**: Shows duplicate count badge
- **Completed**: Shows checkmark
- **Running**: Shows progress spinner

## Example Scenarios

### Scenario 1: Zwift Ride

- **Intervals.icu**: Full power data, TSS, training load ✅ **KEPT**
- **Strava**: Basic metrics only ❌ Marked as duplicate

### Scenario 2: Gym Session

- **Intervals.icu**: Basic duration only ❌ Marked as duplicate
- **Strava**: Sets, reps, equipment notes ✅ **KEPT**

### Scenario 3: Outdoor Run

- **Intervals.icu**: HR, pace, elevation
- **Strava**: HR, pace, elevation, route map ✅ **KEPT** (tie-breaker: more complete)

## Migration

Existing workouts are unaffected:

- Default `isDuplicate = false`
- Run deduplication task to mark historical duplicates
- Non-destructive: duplicates preserved but hidden

## Future Enhancements

Potential improvements:

- Manual duplicate resolution UI
- Merge duplicate data (combine best fields)
- Source preference settings per user
- Duplicate detection for nutrition entries
- Smart re-deduplication on new syncs
