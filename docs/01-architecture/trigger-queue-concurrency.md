# Trigger.dev Queue Concurrency - Per-User Implementation

## Overview

All trigger.dev tasks in this project are configured with **per-user queue concurrency**, ensuring that each user can have at most **2 concurrent jobs** running at a time. This prevents overwhelming the system with too many simultaneous AI analysis tasks while maintaining good throughput.

## How It Works

### Queue Architecture

We've defined three shared queues in [`trigger/queues.ts`](../trigger/queues.ts):

1. **`userAnalysisQueue`** - For workout and nutrition analysis tasks
2. **`userReportsQueue`** - For report generation tasks
3. **`userBackgroundQueue`** - For background tasks like deduplication and planning

Each queue has a `concurrencyLimit: 2`, which limits concurrent executions **per unique `concurrencyKey`**.

### The concurrencyKey Magic

The key to per-user concurrency is the `concurrencyKey` parameter. When you trigger a task:

```typescript
await analyzeWorkoutTask.trigger({ workoutId: 'workout-123' }, { concurrencyKey: userId })
```

**What happens:**

- Trigger.dev creates a separate queue instance for each unique `concurrencyKey` value
- Each queue instance has its own concurrency limit of 2
- User A can have 2 jobs running while User B also has 2 jobs running
- This provides perfect isolation between users

## Usage Examples

### Triggering Workout Analysis

```typescript
import { analyzeWorkoutTask } from '~/trigger/analyze-workout'

export default defineEventHandler(async (event) => {
  const { workoutId } = await readBody(event)
  const userId = event.context.auth.userId

  const handle = await analyzeWorkoutTask.trigger({ workoutId }, { concurrencyKey: userId })

  return { id: handle.id }
})
```

### Triggering Nutrition Analysis

```typescript
import { analyzeNutritionTask } from '~/trigger/analyze-nutrition'

const handle = await analyzeNutritionTask.trigger(
  { nutritionId: 'nutrition-456' },
  { concurrencyKey: userId }
)
```

### Triggering Report Generation

```typescript
import { generateWeeklyReportTask } from '~/trigger/generate-weekly-report'

const handle = await generateWeeklyReportTask.trigger(
  { userId, reportId },
  { concurrencyKey: userId }
)
```

### Batch Triggering Multiple Tasks

When triggering multiple tasks for the same user, they'll automatically queue:

```typescript
const handles = await Promise.all([
  analyzeWorkoutTask.trigger({ workoutId: 'w1' }, { concurrencyKey: userId }),
  analyzeWorkoutTask.trigger({ workoutId: 'w2' }, { concurrencyKey: userId }),
  analyzeWorkoutTask.trigger({ workoutId: 'w3' }, { concurrencyKey: userId }),
  analyzeNutritionTask.trigger({ nutritionId: 'n1' }, { concurrencyKey: userId })
])
```

Result: First 2 jobs start immediately, others wait in queue

## Task Queue Assignments

### userAnalysisQueue (concurrencyLimit: 2)

- [`analyzeWorkoutTask`](../trigger/analyze-workout.ts)
- [`analyzeNutritionTask`](../trigger/analyze-nutrition.ts)

### userReportsQueue (concurrencyLimit: 2)

- [`generateWeeklyReportTask`](../trigger/generate-weekly-report.ts)
- [`generateAthleteProfileTask`](../trigger/generate-athlete-profile.ts)
- [`dailyCoachTask`](../trigger/daily-coach.ts)
- [`analyzeLast3WorkoutsTask`](../trigger/analyze-last-3-workouts.ts)
- [`analyzeLast3NutritionTask`](../trigger/analyze-last-3-nutrition.ts)
- [`analyzeLast7NutritionTask`](../trigger/analyze-last-7-nutrition.ts)

### userBackgroundQueue (concurrencyLimit: 2)

- [`deduplicateWorkoutsTask`](../trigger/deduplicate-workouts.ts)
- [`generateWeeklyPlanTask`](../trigger/generate-weekly-plan.ts)

## Important Rules

### ✅ DO

1. **Always provide `concurrencyKey`** when triggering tasks:

   ```typescript
   await task.trigger(payload, { concurrencyKey: userId })
   ```

2. **Use consistent user IDs** - Always use the same userId format (don't mix email and ID):

   ```typescript
   concurrencyKey: user.id
   ```

3. **Let queues handle the concurrency** - Don't manually throttle or delay task triggers

### ❌ DON'T

1. **Don't trigger without `concurrencyKey`**:

   ```typescript
   await task.trigger({ workoutId })
   ```

2. **Don't use different keys for the same user**:

   ```typescript
   await task.trigger(payload, { concurrencyKey: user.email })
   await task.trigger(payload, { concurrencyKey: user.id })
   ```

3. **Don't manually implement queueing logic** - The concurrency system handles this

## Monitoring

### Check Queue Status

You can check the status of queued runs in the Trigger.dev dashboard:

- View pending/running/completed runs per queue
- Monitor per-user queue depth
- Identify if users are hitting concurrency limits

### Common Patterns

**User hits limit:**

- User has 2 jobs running
- 3rd job waits in queue
- As soon as one completes, the 3rd job starts

**Multiple users:**

- User A: 2 jobs running
- User B: 2 jobs running
- User C: 0 jobs running
- Total: 4 concurrent jobs across all users ✅

## Migration Notes

### Before (Old Approach)

```typescript
export const analyzeWorkoutTask = task({
  id: 'analyze-workout',
  queue: {
    concurrencyLimit: 2
  },
  run: async (payload) => {
    return { success: true }
  }
})

await analyzeWorkoutTask.trigger({ workoutId })
```

**Problem:** Only 2 workouts could be analyzed at a time across ALL users.

### After (Current Approach)

```typescript
export const analyzeWorkoutTask = task({
  id: 'analyze-workout',
  queue: userAnalysisQueue,
  run: async (payload) => {
    return { success: true }
  }
})

await analyzeWorkoutTask.trigger({ workoutId }, { concurrencyKey: userId })
```

**Solution:** Each user gets their own queue with limit of 2.

## Performance Characteristics

- **Per-user isolation**: One user's heavy usage doesn't block other users
- **Fair resource allocation**: Each user gets equal access to processing capacity
- **Automatic queueing**: Tasks wait in line if user hits their limit
- **No polling needed**: Trigger.dev handles queue management
- **Scalable**: Works for any number of users without configuration changes

## References

- [Trigger.dev Queue Concurrency Documentation](https://trigger.dev/docs/queue-concurrency)
- [Queue Configuration](../trigger/queues.ts)
- [Example Implementation](../server/api/workouts/[id]/analyze.post.ts)
