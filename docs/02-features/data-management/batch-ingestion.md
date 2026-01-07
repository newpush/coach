# Batch Data Ingestion

## Overview

The batch ingestion feature allows you to efficiently sync data from all connected integrations in a single operation. Instead of triggering each integration's sync task individually, you can use the `ingest-all` task to trigger all integrations in parallel.

## Architecture

The batch ingestion uses Trigger.dev's `batch.triggerByTaskAndWait()` functionality to:

1. Query all active integrations for a user
2. Trigger the appropriate ingestion task for each integration in parallel
3. Wait for all tasks to complete
4. Return a comprehensive summary of all sync operations

### Task Hierarchy

```
ingest-all (parent task)
├── ingest-strava (if Strava connected)
├── ingest-whoop (if Whoop connected)
├── ingest-intervals (if Intervals.icu connected)
└── ingest-yazio (if Yazio connected)
```

## Benefits

### 1. **Parallel Execution**

All integrations sync simultaneously rather than sequentially, significantly reducing total sync time.

**Example:**

- Sequential: Strava (30s) + Whoop (20s) + Intervals (40s) = 90s total
- Parallel: max(30s, 20s, 40s) = 40s total

### 2. **Single API Call**

Trigger one task instead of making separate API calls for each integration.

### 3. **Comprehensive Results**

Get a unified response showing the status of all sync operations:

```json
{
  "success": true,
  "successCount": 3,
  "failedCount": 1,
  "total": 4,
  "results": [
    {
      "provider": "strava",
      "status": "success",
      "data": { "workouts": 5, "skipped": 2 }
    },
    {
      "provider": "whoop",
      "status": "success",
      "data": { "count": 7 }
    },
    {
      "provider": "intervals",
      "status": "failed",
      "error": "API rate limit exceeded"
    }
  ]
}
```

### 4. **Fault Tolerance**

If one integration fails, others continue processing. The batch task reports all results, both successful and failed.

### 5. **Optimized Date Ranges**

The batch sync uses a moderate 7-day window that balances:

- API rate limits across all services
- Recent data freshness
- Sync performance

## Usage

### From Backend API

```typescript
import { tasks } from '@trigger.dev/sdk/v3'

const handle = await tasks.trigger('ingest-all', {
  userId: 'user-123',
  startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  endDate: new Date().toISOString()
})
```

### From Frontend (via API endpoint)

```typescript
const response = await $fetch('/api/integrations/sync', {
  method: 'POST',
  body: { provider: 'all' }
})

console.log(`Batch sync started: ${response.jobId}`)
```

### Individual Provider Sync (still available)

```typescript
const response = await $fetch('/api/integrations/sync', {
  method: 'POST',
  body: { provider: 'strava' }
})
```

## Date Range Strategy

### Batch Sync (`provider: 'all'`)

- **Window**: Last 7 days
- **Rationale**: Balances API rate limits across multiple services while capturing recent activity

### Individual Syncs

Each provider has optimized date ranges:

| Provider          | Lookback | Lookahead | Reason                                          |
| ----------------- | -------- | --------- | ----------------------------------------------- |
| **Strava**        | 7 days   | -         | Respects API rate limits (200 req/15min)        |
| **Whoop**         | 90 days  | -         | Comprehensive recovery data                     |
| **Intervals.icu** | 90 days  | 30 days   | Historical + planned workouts                   |
| **Yazio**         | 5 days   | -         | Avoids rate limiting on detailed nutrition data |

## Implementation Details

### Task Definition

The [`trigger/ingest-all.ts`](../trigger/ingest-all.ts) task:

1. Fetches all integrations for the user
2. Maps each integration to its corresponding ingestion task
3. Uses `batch.triggerByTaskAndWait()` for parallel execution
4. Processes results and provides comprehensive reporting

```typescript
export const ingestAllTask = task({
  id: 'ingest-all',
  run: async (payload: { userId: string; startDate: string; endDate: string }) => {
    const integrations = await prisma.integration.findMany({
      where: { userId }
    })

    const tasksTrigger = []
    for (const integration of integrations) {
      switch (integration.provider) {
        case 'strava':
          tasksTrigger.push({ task: ingestStravaTask, payload })
          break
        case 'whoop':
          tasksTrigger.push({ task: ingestWhoopTask, payload })
          break
        case 'intervals':
          tasksTrigger.push({ task: ingestIntervalsTask, payload })
          break
        case 'yazio':
          tasksTrigger.push({ task: ingestYazioTask, payload })
          break
      }
    }

    const { runs } = await batch.triggerByTaskAndWait(tasksTrigger)

    return { success, results }
  }
})
```

### API Endpoint Enhancement

The [`server/api/integrations/sync.post.ts`](../server/api/integrations/sync.post.ts) endpoint now accepts:

- `provider: 'strava' | 'whoop' | 'intervals' | 'yazio'` - Sync individual integration
- `provider: 'all'` - Sync all connected integrations in parallel

## Error Handling

### Integration-Level Failures

If one integration fails, others continue. The batch task:

- Marks the specific integration as failed
- Continues processing other integrations
- Reports all results in the response

### Task-Level Failures

If the batch task itself fails (e.g., database connection error):

- The entire operation fails
- No integrations are marked as synced
- The error is logged and returned to the caller

## Monitoring

### Task Execution

View batch sync progress in the Trigger.dev dashboard:

```
https://cloud.trigger.dev/runs/{handle.id}
```

### Individual Child Tasks

Each child task (integration sync) appears as a subtask in the dashboard, allowing you to drill down into specific integration sync details.

### Integration Status

After sync, check integration status:

```typescript
const integration = await prisma.integration.findUnique({
  where: {
    userId_provider: {
      userId: 'user-123',
      provider: 'strava'
    }
  }
})

console.log(integration.syncStatus)
console.log(integration.lastSyncAt)
console.log(integration.errorMessage)
```

## Best Practices

### 1. Use Batch Sync for Dashboard/Refresh Actions

When users click "Refresh All Data" or visit their dashboard:

```typescript
await $fetch('/api/integrations/sync', {
  method: 'POST',
  body: { provider: 'all' }
})
```

### 2. Use Individual Sync for Initial Connection

When a user first connects an integration, sync just that provider:

```typescript
await $fetch('/api/integrations/sync', {
  method: 'POST',
  body: { provider: 'strava' }
})
```

### 3. Consider Scheduled Batch Syncs

Set up a cron trigger for automatic daily syncs:

```typescript
export const dailyBatchSync = task({
  id: 'daily-batch-sync',
  trigger: schedules.cron({
    cron: '0 6 * * *'
  }),
  run: async () => {
    const users = await prisma.user.findMany({
      include: { integrations: true }
    })

    for (const user of users) {
      if (user.integrations.length > 0) {
        await ingestAllTask.trigger({
          userId: user.id,
          startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString()
        })
      }
    }
  }
})
```

## Testing

Test the batch ingestion with the provided script:

```bash
npx tsx scripts/test-batch-ingest.ts
```

## Performance Considerations

### API Rate Limits

Each child task respects its integration's rate limits:

- Strava: Built-in delays between detail fetches
- Yazio: Uses database caching for product details
- Whoop: Batch API calls where possible
- Intervals.icu: No strict rate limits

### Database Connection Pool

Parallel tasks share the database connection pool. With default Prisma settings (10 connections), up to 10 concurrent operations can run efficiently.

### Memory Usage

Each child task runs in its own execution context, so memory is isolated. The parent task only holds metadata about child task runs.

## Future Enhancements

### 1. Selective Sync

Allow users to specify which integrations to include:

```typescript
await tasks.trigger('ingest-all', {
  userId,
  startDate,
  endDate,
  providers: ['strava', 'whoop']
})
```

### 2. Priority-Based Execution

Sync critical integrations first with higher priority queues.

### 3. Incremental Sync

Only sync data that has changed since last sync:

```typescript
const lastSync = integration.lastSyncAt
const startDate = lastSync || defaultStartDate
```

## Related Documentation

- [Trigger.dev Batch Triggering](https://trigger.dev/docs/triggering)
- [Strava Integration](./strava-integration.md)
- [Whoop Integration](./whoop-integration.md)
- [Intervals.icu Integration](./intervals-profile-data.md)
- [Yazio Integration](./yazio-integration.md)
