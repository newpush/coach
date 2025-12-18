# Task Dependency System

## Overview

The Task Dependency System provides a hierarchical view of all data processing tasks in Coach Watts, showing their dependencies and allowing users to track real-time progress during full synchronization and analysis operations.

## Architecture

### Components

1. **Type Definitions** (`types/task-dependencies.ts`)
   - Defines task structure and relationships
   - Provides utility functions for dependency management
   - Calculates overall progress

2. **Visualization Component** (`app/components/TaskDependencyGraph.vue`)
   - Interactive UI showing all tasks grouped by category
   - Real-time progress updates via Server-Sent Events
   - Status indicators for each task

3. **Orchestration API** (`server/api/orchestrate/full-sync.post.ts`)
   - Manages sequential execution of tasks based on dependencies
   - Handles parallel execution within each level
   - Broadcasts progress updates to connected clients

4. **Progress Stream** (`server/api/orchestrate/progress.get.ts`)
   - Server-Sent Events endpoint for real-time updates
   - Maintains connections with active clients
   - Sends task status changes and overall progress

## Task Hierarchy

### Level 1: Data Ingestion
Tasks that sync data from external integrations (can run in parallel):
- **Sync Intervals.icu**: Workouts, wellness, planned workouts
- **Sync Whoop**: Recovery metrics, sleep data, strain
- **Sync Yazio**: Nutrition data and meal logs
- **Sync Strava**: Activity data

### Level 2: AI Analysis
Tasks that analyze individual data items (depends on Level 1):
- **Analyze Workouts**: AI analysis of recent workouts
- **Analyze Nutrition**: AI analysis of nutrition entries

### Level 3: Athlete Profile
Task that creates comprehensive profile (depends on Level 2):
- **Generate Athlete Profile**: Synthesizes all analyzed data into athlete profile

### Level 4: Reports & Planning
Tasks that generate insights and plans (depends on Level 3):
- **Generate Weekly Report**: Performance analysis and insights
- **Generate Training Plan**: Next week's training plan
- **Today's Training**: Daily workout recommendations

### Level 5: Performance Insights
Tasks that create detailed explanations (depends on Level 4):
- **Performance Insights**: Detailed score explanations and trends

## Dependency Rules

1. **Sequential Levels**: Each level must complete before the next begins
2. **Parallel Execution**: Tasks within the same level run in parallel
3. **Required Tasks**: If a required task fails, the orchestration stops
4. **Optional Tasks**: Optional task failures don't block dependent tasks
5. **Skipped Tasks**: Tasks are skipped if dependencies aren't met

## Usage

### User Flow

1. Navigate to the **Data** page (`/data`)
2. Scroll to the **Data Pipeline Status** section at the bottom
3. Click **"🔄 Update All Data"** button
4. Monitor real-time progress:
   - Overall progress bar shows completion percentage
   - Each task shows its current status (Pending/Running/Completed/Failed)
   - Running tasks display progress bars and messages
   - Completed tasks show completion time
5. Receive notification when sync completes

### Status Indicators

- **⭕ Pending**: Task waiting for dependencies
- **🔵 Running**: Task currently executing
- **✅ Completed**: Task finished successfully
- **❌ Failed**: Task encountered an error
- **⊝ Skipped**: Task skipped due to unmet dependencies

### Progress Updates

The system provides:
- Real-time task status updates
- Individual task progress (0-100%)
- Overall pipeline progress
- Estimated time remaining
- Error messages with details

## API Endpoints

### POST `/api/orchestrate/full-sync`
Starts the full synchronization and analysis pipeline.

**Authentication**: Required

**Response**:
```json
{
  "success": true,
  "message": "Full sync started"
}
```

### GET `/api/orchestrate/progress`
Server-Sent Events stream for real-time progress updates.

**Authentication**: Required

**Event Types**:
- `init`: Initial state when connecting
- `task_update`: Individual task status change
- `progress`: Overall progress update
- `complete`: All tasks completed
- `error`: Error occurred
- `ping`: Keep-alive message

## Task Configuration

Tasks are defined in `types/task-dependencies.ts` with:

```typescript
{
  id: string                  // Unique task identifier
  name: string                // Display name
  description: string         // User-friendly description
  category: TaskCategory      // ingestion, analysis, profile, reports, planning, insights
  dependsOn: string[]         // Array of task IDs that must complete first
  estimatedDuration: number   // Estimated seconds to complete
  required: boolean           // Whether failure blocks dependent tasks
  endpoint?: string           // API endpoint to trigger
  triggerId?: string          // Trigger.dev task ID
}
```

## Adding New Tasks

To add a new task to the system:

1. **Define the task** in `TASK_DEPENDENCIES` in `types/task-dependencies.ts`:
```typescript
'new-task-id': {
  id: 'new-task-id',
  name: 'New Task Name',
  description: 'What this task does',
  category: 'analysis', // or appropriate category
  dependsOn: ['prerequisite-task-id'],
  estimatedDuration: 60,
  required: false,
  endpoint: '/api/new-task/endpoint',
  triggerId: 'new-task-trigger-id'
}
```

2. **Handle execution** in `server/api/orchestrate/full-sync.post.ts`:
   - The system automatically determines execution order
   - Add specific handling if needed in the `executeTask` function

3. **Test the integration**:
   - Verify task appears in the UI
   - Confirm dependencies work correctly
   - Check progress updates are sent

## Error Handling

The system handles errors at multiple levels:

1. **Task-Level Errors**:
   - Caught and logged
   - Task marked as failed
   - Error message displayed to user
   - Dependent tasks may be skipped

2. **Required Task Failures**:
   - Stops the entire orchestration
   - Displays error notification
   - Allows user to retry

3. **Connection Errors**:
   - SSE automatically reconnects
   - State is maintained server-side
   - Progress resumes after reconnection

## Performance Considerations

- **Parallel Execution**: Tasks within same level run concurrently for speed
- **Progress Tracking**: Minimal overhead, only updates on state changes
- **Connection Management**: Automatic cleanup of inactive connections
- **Memory Usage**: Active sync states cleared after completion

## Future Enhancements

Potential improvements:
1. Historical sync logs and analytics
2. Ability to retry individual failed tasks
3. Configurable task priorities
4. Estimated completion times
5. Notification when sync completes
6. Dependency graph visualization
7. Task scheduling and automation
8. Webhook integrations