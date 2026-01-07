# Chat Training Plan Integration - Architecture

## Overview

This document outlines the architecture for integrating training plan management into the Chat interface, allowing users to view, modify, and manage their planned workouts through conversational AI interaction.

## Design Decisions (User-Confirmed)

1. **Planned Workouts Context**: 14 days of future planned workouts in initial chat context
2. **Modification Granularity**: Full modification capability (date, time, type, duration, TSS, description)
3. **Intervals.icu Sync**: Save locally with async retry mechanism on failure
4. **Plan Generation**: Always request user confirmation before triggering generation

## System Architecture

### 1. Data Flow Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Chat Interface                           │
│  User Request → AI Analyzes → Tool Calls → Updates → Response  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Chat Context Layer                            │
│  - User Profile & Scores                                         │
│  - Recent Activity (7 days)                                      │
│  - Planned Workouts (14 days) ← NEW                             │
│  - Training Availability ← NEW                                   │
│  - Current Training Plan ← NEW                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Chat Tools Layer                            │
│  Existing:                    NEW:                               │
│  - get_recent_workouts       - get_planned_workouts             │
│  - get_workout_details       - create_planned_workout           │
│  - get_nutrition_log         - update_planned_workout           │
│  - get_wellness_metrics      - delete_planned_workout           │
│  - search_workouts           - get_training_availability        │
│  - get_performance_metrics   - update_training_availability     │
│                              - generate_training_plan           │
│                              - get_current_plan                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     API Endpoints Layer                          │
│  /api/planned-workouts/                                         │
│    - GET (list)              - POST (create)                     │
│    - GET /:id (details) ← NEW                                   │
│    - PATCH /:id (update) ← NEW                                  │
│    - DELETE /:id (existing)                                      │
│  /api/availability/ (existing)                                   │
│  /api/plans/                                                     │
│    - GET /current (existing) - POST /generate (existing)         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  Business Logic Layer                            │
│  - Validation & Authorization                                    │
│  - Data Transformation                                           │
│  - Intervals.icu Sync Management ← NEW                          │
│  - Conflict Resolution ← NEW                                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Data Persistence                              │
│  Local DB (PostgreSQL/Prisma)   ↔   Intervals.icu API          │
│  - PlannedWorkout                   - Events API                 │
│  - TrainingAvailability              - Activities API            │
│  - WeeklyTrainingPlan                                           │
│  - SyncQueue ← NEW                                              │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Database Schema Changes

#### New Table: SyncQueue

```prisma
model SyncQueue {
  id            String   @id @default(uuid())
  userId        String
  entityType    String
  entityId      String
  operation     String
  payload       Json
  status        String   @default("PENDING")
  attempts      Int      @default(0)
  lastAttempt   DateTime?
  error         String?  @db.Text
  completedAt   DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, status])
  @@index([status, createdAt])
}
```

#### Updates to PlannedWorkout

Add these new fields to the existing PlannedWorkout model:

```prisma
syncStatus      String?  @default("SYNCED")
lastSyncedAt    DateTime?
syncError       String?  @db.Text
modifiedLocally Boolean  @default(false)
```

### 3. New Chat Tools

#### Tool 1: get_planned_workouts

```typescript
{
  name: 'get_planned_workouts',
  description: 'Fetch upcoming planned workouts for the athlete. Use this when user asks about their training schedule, upcoming workouts, or what they have planned.',
  parameters: {
    start_date: 'Start date in ISO format (default: today)',
    end_date: 'End date in ISO format (default: start_date + 14 days)',
    include_completed: 'Include completed workouts (default: false)'
  }
}
```

**Returns**:

```typescript
{
  count: number,
  date_range: { start: string, end: string },
  workouts: Array<{
    id: string,
    date: string,
    title: string,
    description: string,
    type: string,
    duration_minutes: number,
    tss: number,
    intensity: string,
    location: string,
    completed: boolean,
    sync_status: string
  }>
}
```

#### Tool 2: create_planned_workout

```typescript
{
  name: 'create_planned_workout',
  description: 'Create a new planned workout. Use when user wants to add a workout to their schedule.',
  parameters: {
    date: 'Date for the workout (ISO format, required)',
    title: 'Workout title (required)',
    description: 'Detailed workout description',
    type: 'Workout type: Ride, Run, Gym, Swim, Rest, Active Recovery',
    duration_minutes: 'Planned duration in minutes',
    tss: 'Target Training Stress Score',
    intensity: 'Intensity level: recovery, easy, moderate, hard, very_hard',
    time_of_day: 'Preferred time: morning, afternoon, evening'
  }
}
```

#### Tool 3: update_planned_workout

```typescript
{
  name: 'update_planned_workout',
  description: 'Modify an existing planned workout. Can change any aspect of the workout.',
  parameters: {
    workout_id: 'ID of the workout to update (required)',
    date: 'New date (optional)',
    title: 'New title (optional)',
    description: 'New description (optional)',
    type: 'New type (optional)',
    duration_minutes: 'New duration (optional)',
    tss: 'New TSS target (optional)',
    intensity: 'New intensity (optional)',
    time_of_day: 'New time of day (optional)'
  }
}
```

#### Tool 4: delete_planned_workout

```typescript
{
  name: 'delete_planned_workout',
  description: 'Remove a planned workout from the schedule.',
  parameters: {
    workout_id: 'ID of the workout to delete (required)',
    reason: 'Optional reason for deletion (for context)'
  }
}
```

#### Tool 5: get_training_availability

```typescript
{
  name: 'get_training_availability',
  description: 'Get user training availability schedule (when they can train).',
  parameters: {}
}
```

**Returns**:

```typescript
{
  availability: Array<{
    day_of_week: number
    day_name: string
    morning: boolean
    afternoon: boolean
    evening: boolean
    bike_access: boolean
    gym_access: boolean
    indoor_only: boolean
    outdoor_only: boolean
    notes: string
  }>
}
```

#### Tool 6: update_training_availability

```typescript
{
  name: 'update_training_availability',
  description: 'Update when the user can train during the week.',
  parameters: {
    day_of_week: 'Day to update (0=Sunday, 1=Monday, etc.) (required)',
    morning: 'Available in morning (boolean)',
    afternoon: 'Available in afternoon (boolean)',
    evening: 'Available in evening (boolean)',
    bike_access: 'Has bike/trainer access (boolean)',
    gym_access: 'Has gym access (boolean)',
    indoor_only: 'Indoor only constraint (boolean)',
    outdoor_only: 'Outdoor only constraint (boolean)',
    notes: 'Additional notes/constraints'
  }
}
```

#### Tool 7: generate_training_plan

```typescript
{
  name: 'generate_training_plan',
  description: 'Generate a new AI-powered training plan. ALWAYS confirm with user before calling this.',
  parameters: {
    days: 'Number of days to plan (1-14, default: 7)',
    start_date: 'Plan start date (ISO format, default: tomorrow)',
    focus: 'Training focus: endurance, speed, strength, recovery, mixed',
    user_confirmed: 'User explicitly confirmed generation (required: true)'
  }
}
```

#### Tool 8: get_current_plan

```typescript
{
  name: 'get_current_plan',
  description: 'Get the current active training plan with all details.',
  parameters: {}
}
```

**Returns**:

```typescript
{
  plan: {
    id: string,
    week_start: string,
    week_end: string,
    days_planned: number,
    status: string,
    total_tss: number,
    workout_count: number,
    summary: string,
    days: Array<DayPlan>,
    generated_at: string,
    model_version: string
  }
}
```

### 4. Enhanced Chat Context

The initial system instruction will include:

```markdown
## Planned Workouts (Next 14 Days)

You have upcoming workouts scheduled:

[For each planned workout:]

- **{Date}** ({Day of Week}): {Title}
  - Type: {Type} | Duration: {Duration}min | TSS: {TSS}
  - Status: {Synced/Pending/Local Only}
  - Description: {Description}
  - Time of Day: {Time}

## Training Availability

Your weekly training schedule:

[For each day:]

- **{Day}**: {morning/afternoon/evening availability}
  - Equipment: {bike, gym, none}
  - Constraints: {indoor only, outdoor only, etc.}

## Current Training Plan

Active plan for {week range}:

- Total TSS: {totalTSS}
- Workouts: {count}
- Focus: {plan summary}

**IMPORTANT PLANNING CONTEXT:**

- You can see the user's planned workouts and availability above
- Use this context to give informed advice about their schedule
- When user asks about "my schedule" or "what's planned", reference this data
- Only use tools when you need to create/modify/delete workouts or get older data
```

### 5. Intervals.icu Sync Management

#### Sync Strategy

**Immediate Sync with Fallback**:

```typescript
async function syncToIntervals(operation: string, data: any, userId: string) {
  try {
    const result = await intervalsApi[operation](data)
    return { success: true, synced: true, data: result }
  } catch (error) {
    await queueSyncOperation({
      userId,
      operation,
      data,
      error: error.message
    })
    return {
      success: true,
      synced: false,
      message: 'Saved locally, will sync when connection is restored'
    }
  }
}
```

#### Retry Mechanism

**Background Job** (Trigger.dev task):

```typescript
task({
  id: 'sync-intervals-queue',
  queue: syncQueue,
  run: async () => {
    const pending = await prisma.syncQueue.findMany({
      where: {
        status: { in: ['PENDING', 'FAILED'] },
        attempts: { lt: 3 }
      },
      orderBy: { createdAt: 'asc' },
      take: 50
    })

    for (const item of pending) {
      try {
        await processSyncItem(item)
      } catch (error) {
        await updateSyncFailure(item.id, error)
      }
    }
  }
})
```

**Scheduled Execution**:

- Every 5 minutes for failed items
- After 3 failures, mark as permanently failed and notify user
- User can manually trigger resync from UI

### 6. API Endpoints

#### New Endpoints

**GET /api/planned-workouts/:id**

```typescript
export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const workoutId = event.context.params?.id

  const workout = await prisma.plannedWorkout.findUnique({
    where: { id: workoutId },
    include: {
      user: { select: { name: true, ftp: true } }
    }
  })

  if (workout.userId !== session.user.id) {
    throw createError({ statusCode: 403 })
  }

  return workout
})
```

**PATCH /api/planned-workouts/:id**

```typescript
export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const workoutId = event.context.params?.id
  const body = await readBody(event)

  const existing = await prisma.plannedWorkout.findUnique({
    where: { id: workoutId }
  })

  if (!existing || existing.userId !== session.user.id) {
    throw createError({ statusCode: 403 })
  }

  const updated = await prisma.plannedWorkout.update({
    where: { id: workoutId },
    data: {
      ...body,
      modifiedLocally: true,
      syncStatus: 'PENDING'
    }
  })

  const syncResult = await syncToIntervals('update', updated, session.user.id)

  await prisma.plannedWorkout.update({
    where: { id: workoutId },
    data: {
      syncStatus: syncResult.synced ? 'SYNCED' : 'PENDING',
      lastSyncedAt: syncResult.synced ? new Date() : undefined
    }
  })

  return {
    success: true,
    workout: updated,
    syncStatus: syncResult.synced ? 'synced' : 'pending',
    message: syncResult.message
  }
})
```

### 7. Error Handling & User Feedback

#### Error Types

1. **Validation Errors** (400)
   - Missing required fields
   - Invalid date formats
   - Conflicting constraints

2. **Authorization Errors** (403)
   - Attempting to modify another user's workouts

3. **Sync Errors** (handled gracefully)
   - Intervals.icu API unavailable
   - Rate limiting
   - Network issues

4. **Conflict Errors** (409)
   - Workout already exists for that date
   - Availability conflicts

#### User Feedback Strategy

```typescript
{
  success: boolean,
  data?: any,
  sync_status?: 'synced' | 'pending' | 'failed',
  message: string,
  warnings?: string[],
  suggestions?: string[]
}
```

**AI Response Guidelines**:

- Always inform user of sync status
- If sync failed, explain it's saved locally and will retry
- Provide actionable suggestions if there are conflicts
- Celebrate successful operations naturally

Example AI responses:

```
✅ Synced: "Done! I've moved your Tuesday ride to Wednesday and synced it to Intervals.icu."

⏳ Pending: "Got it! I've rescheduled your workout. It's saved locally and will sync to Intervals.icu shortly."

⚠️ Failed: "I've updated your plan locally, but couldn't reach Intervals.icu right now. Don't worry - it'll sync automatically when the connection is back."
```

### 8. Conflict Resolution

#### Availability Conflicts

When creating/modifying workouts, check against availability:

```typescript
async function validateWorkoutAgainstAvailability(
  workout: PlannedWorkoutInput,
  userId: string
): Promise<ValidationResult> {
  const dayOfWeek = new Date(workout.date).getDay()
  const availability = await getAvailability(userId, dayOfWeek)

  const conflicts = []

  if (workout.timeOfDay === 'morning' && !availability.morning) {
    conflicts.push('You marked yourself unavailable in the morning on this day')
  }

  if (workout.type === 'Ride' && !availability.bikeAccess) {
    conflicts.push("You don't have bike access on this day")
  }

  if (workout.type === 'Gym' && !availability.gymAccess) {
    conflicts.push("You don't have gym access on this day")
  }

  if (availability.indoorOnly && workout.location === 'outdoor') {
    conflicts.push('This day is marked indoor only')
  }

  return {
    valid: conflicts.length === 0,
    conflicts,
    suggestions: generateSuggestions(conflicts, availability)
  }
}
```

**AI Handling**:

- If conflicts exist, inform user and ask for confirmation
- Suggest alternative dates/times that match availability
- Allow user to override if they explicitly want to

### 9. Plan Generation Integration

#### Confirmation Flow

```typescript
async function handleGeneratePlan(args: any, userId: string) {
  if (!args.user_confirmed) {
    return {
      error: 'User confirmation required',
      message:
        'Please confirm that you want to generate a new training plan. This will replace your current plan.',
      require_confirmation: true
    }
  }

  const handle = await tasks.trigger('generate-weekly-plan', {
    userId,
    startDate: args.start_date || new Date(),
    daysToPlann: args.days || 7
  })

  return {
    success: true,
    job_id: handle.id,
    message: `Generating your ${args.days || 7}-day plan. This will take about 10-15 seconds.`,
    estimated_completion: new Date(Date.now() + 15000).toISOString()
  }
}
```

**AI Conversation Pattern**:

```
User: "Can you create a plan for next week?"
AI: "I can generate a 7-day training plan for you starting Monday. Based on your current fitness and availability, I'll create a balanced mix of workouts. Should I go ahead and generate it?"

User: "Yes"
AI: [calls generate_training_plan with user_confirmed=true]
    "Generating your plan now... This should take about 15 seconds."
    [waits, then fetches plan]
    "Your plan is ready! Here's what I've created for you..."
```

### 10. Implementation Sequence

#### Phase 1: Database & API Foundation (Priority: HIGH)

1. Create SyncQueue model and migration
2. Update PlannedWorkout model with sync fields
3. Create PATCH endpoint for planned workouts
4. Create GET /:id endpoint for workout details
5. Implement sync retry mechanism utility functions

#### Phase 2: Chat Tools Implementation (Priority: HIGH)

6. Add get_planned_workouts tool
7. Add create_planned_workout tool
8. Add update_planned_workout tool
9. Add delete_planned_workout tool (enhance existing)
10. Add get_training_availability tool
11. Add update_training_availability tool
12. Add generate_training_plan tool
13. Add get_current_plan tool

#### Phase 3: Context Enhancement (Priority: HIGH)

14. Fetch planned workouts in chat context (14 days ahead)
15. Fetch training availability in chat context
16. Fetch current training plan summary
17. Update system instructions with planning capabilities

#### Phase 4: Sync & Background Jobs (Priority: MEDIUM)

18. Implement sync queue background task
19. Set up scheduled sync retry job
20. Add manual resync API endpoint
21. Implement conflict resolution logic

#### Phase 5: Testing & Refinement (Priority: MEDIUM)

22. Test all tool calls with various scenarios
23. Test sync retry mechanism
24. Test conflict resolution
25. Test plan generation flow
26. UI feedback improvements

#### Phase 6: Documentation & Polish (Priority: LOW)

27. Update user documentation
28. Add inline help text
29. Create demo video/walkthrough
30. Performance optimization

### 11. Technical Considerations

#### Performance Optimizations

1. **Caching**:
   - Cache availability data (rarely changes)
   - Cache current plan for 5 minutes
   - Invalidate on updates

2. **Batch Operations**:
   - Allow bulk workout creation/updates
   - Batch sync operations to Intervals.icu

3. **Query Optimization**:
   - Add database indexes on frequently queried fields
   - Use select specific fields to reduce payload

#### Security Considerations

1. **Authorization**:
   - Always verify user owns the workout/plan
   - Rate limit plan generation (max 10/hour per user)
   - Rate limit sync operations

2. **Input Validation**:
   - Sanitize all user inputs
   - Validate date ranges
   - Validate workout types against enum

3. **Data Privacy**:
   - Never expose other users' plans
   - Log sensitive operations
   - Encrypt sync queue payloads

#### Monitoring & Observability

1. **Metrics to Track**:
   - Sync success/failure rates
   - Average sync latency
   - Tool usage frequency
   - Plan generation success rate
   - API response times

2. **Alerting**:
   - Alert if sync failure rate > 20%
   - Alert if Intervals.icu API is down
   - Alert if sync queue grows > 1000 items

3. **Logging**:
   - Log all tool calls with user ID and timestamp
   - Log sync operations
   - Log API errors with context

### 12. Future Enhancements

1. **Smart Rescheduling**:
   - AI suggests optimal workout rearrangement
   - Consider weather, recovery, upcoming events

2. **Workout Library**:
   - Save favorite workouts as templates
   - Share workouts with other users
   - Import workouts from TrainingPeaks

3. **Advanced Conflict Resolution**:
   - Auto-resolve simple conflicts
   - ML-based optimal scheduling

4. **Multi-Platform Sync**:
   - Sync with TrainingPeaks
   - Sync with Garmin Calendar
   - Sync with Strava

5. **Voice Integration**:
   - Voice commands for quick updates
   - Audio feedback during workouts

## Conclusion

This architecture provides a robust, user-friendly system for managing training plans through chat. The key benefits are:

- **Conversational**: Natural language interaction
- **Intelligent**: AI understands context and makes smart suggestions
- **Reliable**: Offline-first with sync retry
- **Comprehensive**: Full CRUD operations on workouts
- **Integrated**: Seamlessly works with existing systems

The phased implementation approach ensures we can deliver value incrementally while maintaining system stability.
