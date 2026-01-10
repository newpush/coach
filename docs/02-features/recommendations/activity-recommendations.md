# Activity Recommendations Feature

## Overview

AI-powered workout recommendation system that analyzes athlete's current recovery state, training history, and planned workouts to provide intelligent suggestions for optimizing daily and weekly training.

## Feature Components

### Phase 1: Today's Activity Recommendation

**User Story:** As an athlete, I want AI to analyze my current recovery and today's planned workout to recommend whether I should proceed as planned, modify the workout, or take a rest day.

### Phase 2: Weekly Planning

**User Story:** As an athlete, I want AI to review my week's training plan and suggest optimizations based on my fitness trends, recovery patterns, and training goals.

---

## Phase 1: Today's Activity Recommendation

### Requirements

#### Data Inputs

1. **Today's Planned Workout** (from Intervals.icu)
   - Duration, intensity, TSS, type
   - Structured intervals/zones
   - Description and goals

2. **Current Recovery State**
   - Today's HRV (from daily metrics)
   - Sleep quality and duration
   - Recovery score
   - Resting heart rate

3. **Recent Training Context**
   - Last 7 days workouts
   - Recent TSS/load
   - CTL/ATL trends (fitness/fatigue)
   - **AI Analysis Insights from Recent Workouts**: Strengths, weaknesses/areas for improvement, and previous technical recommendations captured during workout analysis.
4. **Athlete Profile**
   - FTP, weight, max HR
   - Training goals/preferences
   - Historical recovery patterns

#### AI Analysis Output

Structured JSON with:

```json
{
  "recommendation": "proceed" | "modify" | "reduce_intensity" | "rest",
  "confidence": 0.0-1.0,
  "reasoning": "Detailed explanation",
  "planned_workout": {
    "original_title": "...",
    "original_tss": 100,
    "original_duration_min": 60
  },
  "suggested_modifications": {
    "action": "reduce_duration" | "lower_zones" | "make_easier" | "full_rest",
    "new_title": "Modified: ...",
    "new_tss": 75,
    "new_duration_min": 45,
    "zone_adjustments": "Lower FTP targets by 10W",
    "description": "Reduce intervals from 5x5min to 3x5min"
  },
  "recovery_analysis": {
    "hrv_status": "below_baseline" | "normal" | "above_baseline",
    "sleep_quality": "poor" | "fair" | "good" | "excellent",
    "fatigue_level": "high" | "moderate" | "low",
    "readiness_score": 0-100
  },
  "key_factors": [
    "HRV down 15% from baseline",
    "Poor sleep (5.5 hours)",
    "High TSS (450) in last 3 days"
  ]
}
```

### Technical Implementation

#### 1. Backend API Endpoint

**File:** `server/api/recommendations/today.post.ts`

```typescript
// POST /api/recommendations/today
// Triggers AI analysis for today's recommendation
export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const userId = (session.user as any).id

  // Trigger background job
  const handle = await tasks.trigger('recommend-today-activity', {
    userId,
    date: new Date()
  })

  return {
    success: true,
    jobId: handle.id,
    message: "Generating today's recommendation"
  }
})
```

**File:** `server/api/recommendations/today.get.ts`

```typescript
// GET /api/recommendations/today
// Returns the latest recommendation for today
export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const userId = (session.user as any).id
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Find most recent recommendation for today
  const recommendation = await prisma.activityRecommendation.findFirst({
    where: {
      userId,
      date: today
    },
    orderBy: { createdAt: 'desc' }
  })

  return recommendation
})
```

#### 2. Database Schema Addition

**File:** `prisma/schema.prisma`

Add new model:

```prisma
model ActivityRecommendation {
  id          String   @id @default(uuid())
  userId      String
  date        DateTime @db.Date

  // Analysis results
  recommendation String   // proceed, modify, reduce_intensity, rest
  confidence     Float    // 0.0 to 1.0
  reasoning      String   @db.Text

  // Structured JSON with full analysis
  analysisJson   Json?

  // Linked planned workout (if exists)
  plannedWorkoutId String?
  plannedWorkout   PlannedWorkout? @relation(fields: [plannedWorkoutId], references: [id])

  // Status tracking
  status      String   @default("PENDING") // PENDING, PROCESSING, COMPLETED, FAILED
  modelVersion String?

  // User actions
  userAccepted Boolean? // Did user accept the recommendation?
  userModified Boolean? // Did user modify before accepting?
  appliedToIntervals Boolean? @default(false) // Synced to Intervals.icu?

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([userId, date])
}

// Update PlannedWorkout model to add relation
model PlannedWorkout {
  // ... existing fields ...
  recommendations ActivityRecommendation[]
}

// Update User model to add relation
model User {
  // ... existing fields ...
  activityRecommendations ActivityRecommendation[]
}
```

#### 3. Trigger Job

**File:** `trigger/recommend-today-activity.ts`

```typescript
import { logger, task } from '@trigger.dev/sdk/v3'
import { generateStructuredAnalysis, buildWorkoutSummary } from '../server/utils/gemini'
import { prisma } from '../server/utils/db'

const recommendationSchema = {
  type: 'object',
  properties: {
    recommendation: {
      type: 'string',
      enum: ['proceed', 'modify', 'reduce_intensity', 'rest']
    },
    confidence: { type: 'number' },
    reasoning: { type: 'string' },
    planned_workout: {
      type: 'object',
      properties: {
        original_title: { type: 'string' },
        original_tss: { type: 'number' },
        original_duration_min: { type: 'number' }
      }
    },
    suggested_modifications: {
      type: 'object',
      properties: {
        action: { type: 'string' },
        new_title: { type: 'string' },
        new_tss: { type: 'number' },
        new_duration_min: { type: 'number' },
        zone_adjustments: { type: 'string' },
        description: { type: 'string' }
      }
    },
    recovery_analysis: {
      type: 'object',
      properties: {
        hrv_status: { type: 'string' },
        sleep_quality: { type: 'string' },
        fatigue_level: { type: 'string' },
        readiness_score: { type: 'number' }
      }
    },
    key_factors: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: ['recommendation', 'confidence', 'reasoning']
}

export const recommendTodayActivityTask = task({
  id: 'recommend-today-activity',
  maxDuration: 300,
  run: async (payload: { userId: string; date: Date }) => {
    const { userId, date } = payload

    // Set date to start of day
    const today = new Date(date)
    today.setHours(0, 0, 0, 0)

    // Fetch all required data
    const [plannedWorkout, todayMetric, recentWorkouts, user] = await Promise.all([
      // Today's planned workout
      prisma.plannedWorkout.findFirst({
        where: { userId, date: today },
        orderBy: { createdAt: 'desc' }
      }),

      // Today's recovery metrics
      prisma.dailyMetric.findUnique({
        where: { userId_date: { userId, date: today } }
      }),

      // Last 7 days of workouts for context
      prisma.workout.findMany({
        where: {
          userId,
          date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          durationSec: { gt: 0 }
        },
        orderBy: { date: 'desc' }
      }),

      // User profile
      prisma.user.findUnique({
        where: { id: userId },
        select: { ftp: true, weight: true, maxHr: true }
      })
    ])

    // Build comprehensive prompt
    const prompt = `You are an expert cycling coach analyzing today's training for your athlete.

ATHLETE PROFILE:
- FTP: ${user?.ftp || 'Unknown'} watts
- Weight: ${user?.weight || 'Unknown'} kg
- Max HR: ${user?.maxHr || 'Unknown'} bpm

TODAY'S PLANNED WORKOUT:
${
  plannedWorkout
    ? `
- Title: ${plannedWorkout.title}
- Duration: ${plannedWorkout.durationSec ? Math.round(plannedWorkout.durationSec / 60) : 'Unknown'} minutes
- TSS: ${plannedWorkout.tss || 'Unknown'}
- Type: ${plannedWorkout.type || 'Unknown'}
- Description: ${plannedWorkout.description || 'None'}
`
    : 'No workout planned for today'
}

TODAY'S RECOVERY METRICS:
${
  todayMetric
    ? `
- Recovery Score: ${todayMetric.recoveryScore}%
- HRV: ${todayMetric.hrv} ms
- Resting HR: ${todayMetric.restingHr} bpm
- Sleep: ${todayMetric.hoursSlept?.toFixed(1)} hours (Score: ${todayMetric.sleepScore}%)
`
    : 'No recovery data available'
}

RECENT TRAINING (Last 7 days):
${recentWorkouts.length > 0 ? buildWorkoutSummary(recentWorkouts) : 'No recent workouts'}

TASK:
Analyze whether the athlete should proceed with today's planned workout or modify it based on their current recovery state and recent training load.

DECISION CRITERIA:
- Recovery < 33%: Strong recommendation for rest
- Recovery 33-50%: Reduce intensity significantly
- Recovery 50-67%: Modify if workout is hard
- Recovery 67-80%: Proceed as planned
- Recovery > 80%: Good day for intensity

- Low HRV (< -15% from baseline): Caution on intensity
- Poor sleep (< 6 hours): Reduce volume/intensity
- High recent TSS (> 400 in 3 days): Consider recovery

Provide specific, actionable recommendations with clear reasoning.`

    // Generate recommendation
    const analysis = await generateStructuredAnalysis(
      prompt,
      recommendationSchema,
      'pro' // Use thinking model for important decisions
    )

    // Save to database
    const recommendation = await prisma.activityRecommendation.create({
      data: {
        userId,
        date: today,
        recommendation: analysis.recommendation,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        analysisJson: analysis as any,
        plannedWorkoutId: plannedWorkout?.id,
        status: 'COMPLETED',
        modelVersion: 'gemini-2.0-flash-thinking-exp-1219'
      }
    })

    logger.log('Recommendation generated', {
      recommendationId: recommendation.id,
      decision: analysis.recommendation
    })

    return {
      success: true,
      recommendationId: recommendation.id,
      recommendation: analysis.recommendation
    }
  }
})
```

#### 4. Intervals.icu Update API

**File:** `server/api/integrations/intervals/update-workout.post.ts`

```typescript
// POST /api/integrations/intervals/update-workout
// Updates a planned workout in Intervals.icu
export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const userId = (session.user as any).id
  const body = await readBody(event)

  const { workoutId, updates } = body
  // updates: { title?, description?, tss?, durationSec?, ... }

  // Get Intervals.icu integration
  const integration = await prisma.integration.findFirst({
    where: { userId, provider: 'intervals' }
  })

  if (!integration) {
    throw createError({ statusCode: 400, message: 'Intervals.icu not connected' })
  }

  // Get planned workout
  const workout = await prisma.plannedWorkout.findUnique({
    where: { id: workoutId }
  })

  if (!workout || workout.userId !== userId) {
    throw createError({ statusCode: 404, message: 'Workout not found' })
  }

  // Update in Intervals.icu via API
  const intervalsAPI = `https://intervals.icu/api/v1/athlete/${integration.externalUserId}`
  const response = await fetch(`${intervalsAPI}/events/${workout.externalId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Basic ${Buffer.from(`API_KEY:${integration.accessToken}`).toString('base64')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: updates.title || workout.title,
      description: updates.description || workout.description,
      movingTime: updates.durationSec || workout.durationSec
      // Add other fields as needed
    })
  })

  if (!response.ok) {
    throw createError({
      statusCode: response.status,
      message: 'Failed to update workout in Intervals.icu'
    })
  }

  // Update local database
  await prisma.plannedWorkout.update({
    where: { id: workoutId },
    data: updates
  })

  return { success: true, message: 'Workout updated successfully' }
})
```

#### 5. Dashboard UI Addition

**File:** `app/pages/dashboard.vue`

Add new card after Athlete Profile:

```vue
<!-- Today's Recommendation Card -->
<UCard v-if="intervalsConnected">
  <template #header>
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-light-bulb" class="w-5 h-5" />
        <h3 class="font-semibold">Today's Training</h3>
      </div>
      <UBadge v-if="todayRecommendation" :color="getRecommendationColor(todayRecommendation.recommendation)">
        {{ getRecommendationLabel(todayRecommendation.recommendation) }}
      </UBadge>
    </div>
  </template>
  
  <div v-if="loadingRecommendation" class="text-sm text-muted py-4 text-center">
    <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin inline" />
    Analyzing...
  </div>
  
  <div v-else-if="!todayRecommendation" class="space-y-3">
    <p class="text-sm text-muted">
      Get AI-powered guidance for today's training based on your recovery and planned workout.
    </p>
    <UButton 
      @click="generateTodayRecommendation" 
      block
      :loading="generatingRecommendation"
    >
      Get Today's Recommendation
    </UButton>
  </div>
  
  <div v-else class="space-y-3">
    <p class="text-sm">{{ todayRecommendation.reasoning }}</p>
    
    <div v-if="todayRecommendation.analysisJson?.suggested_modifications" class="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
      <p class="text-sm font-medium mb-2">Suggested Modification:</p>
      <p class="text-sm">{{ todayRecommendation.analysisJson.suggested_modifications.description }}</p>
    </div>
    
    <div class="flex gap-2">
      <UButton 
        variant="outline" 
        size="sm"
        @click="openRecommendationModal"
      >
        View Details
      </UButton>
      <UButton 
        size="sm"
        @click="generateTodayRecommendation"
      >
        Refresh
      </UButton>
    </div>
  </div>
</UCard>
```

Add modal component:

```vue
<UModal v-model="showRecommendationModal">
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold">Today's Training Recommendation</h3>
        <UButton 
          color="gray" 
          variant="ghost" 
          icon="i-heroicons-x-mark" 
          @click="showRecommendationModal = false"
        />
      </div>
    </template>
    
    <div v-if="todayRecommendation" class="space-y-4">
      <!-- Recommendation Badge -->
      <div class="text-center">
        <UBadge 
          :color="getRecommendationColor(todayRecommendation.recommendation)" 
          size="lg"
          class="text-lg px-4 py-2"
        >
          {{ getRecommendationLabel(todayRecommendation.recommendation) }}
        </UBadge>
        <p class="text-sm text-muted mt-2">Confidence: {{ (todayRecommendation.confidence * 100).toFixed(0) }}%</p>
      </div>
      
      <!-- Reasoning -->
      <div>
        <h4 class="font-medium mb-2">Why?</h4>
        <p class="text-sm text-muted">{{ todayRecommendation.reasoning }}</p>
      </div>
      
      <!-- Key Factors -->
      <div v-if="todayRecommendation.analysisJson?.key_factors">
        <h4 class="font-medium mb-2">Key Factors:</h4>
        <ul class="space-y-1">
          <li v-for="(factor, idx) in todayRecommendation.analysisJson.key_factors" :key="idx" class="text-sm flex gap-2">
            <UIcon name="i-heroicons-chevron-right" class="w-4 h-4 mt-0.5" />
            <span>{{ factor }}</span>
          </li>
        </ul>
      </div>
      
      <!-- Planned Workout -->
      <div v-if="todayRecommendation.analysisJson?.planned_workout">
        <h4 class="font-medium mb-2">Original Plan:</h4>
        <div class="bg-gray-50 dark:bg-gray-800 p-3 rounded">
          <p class="font-medium">{{ todayRecommendation.analysisJson.planned_workout.original_title }}</p>
          <p class="text-sm text-muted">
            {{ todayRecommendation.analysisJson.planned_workout.original_duration_min }} min • 
            {{ todayRecommendation.analysisJson.planned_workout.original_tss }} TSS
          </p>
        </div>
      </div>
      
      <!-- Suggested Modifications -->
      <div v-if="todayRecommendation.analysisJson?.suggested_modifications">
        <h4 class="font-medium mb-2">Suggested Changes:</h4>
        <div class="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
          <p class="font-medium">{{ todayRecommendation.analysisJson.suggested_modifications.new_title }}</p>
          <p class="text-sm text-muted mb-2">
            {{ todayRecommendation.analysisJson.suggested_modifications.new_duration_min }} min • 
            {{ todayRecommendation.analysisJson.suggested_modifications.new_tss }} TSS
          </p>
          <p class="text-sm">{{ todayRecommendation.analysisJson.suggested_modifications.description }}</p>
        </div>
      </div>
    </div>
    
    <template #footer>
      <div class="flex gap-2 justify-end">
        <UButton color="gray" variant="outline" @click="showRecommendationModal = false">
          Close
        </UButton>
        <UButton 
          v-if="todayRecommendation.analysisJson?.suggested_modifications"
          @click="applyRecommendation"
          :loading="applyingRecommendation"
        >
          Apply to Intervals.icu
        </UButton>
      </div>
    </template>
  </UCard>
</UModal>
```

Add script methods:

```vue
<script setup lang="ts">
  // ... existing code ...

  const showRecommendationModal = ref(false)
  const todayRecommendation = ref<any>(null)
  const loadingRecommendation = ref(false)
  const generatingRecommendation = ref(false)
  const applyingRecommendation = ref(false)

  // Fetch today's recommendation on load
  async function fetchTodayRecommendation() {
    if (!intervalsConnected.value) return

    try {
      loadingRecommendation.value = true
      todayRecommendation.value = await $fetch('/api/recommendations/today')
    } catch (error) {
      console.error('Error fetching recommendation:', error)
    } finally {
      loadingRecommendation.value = false
    }
  }

  // Generate new recommendation
  async function generateTodayRecommendation() {
    generatingRecommendation.value = true
    try {
      await $fetch('/api/recommendations/today', { method: 'POST' })

      // Poll for result
      setTimeout(async () => {
        await fetchTodayRecommendation()
        generatingRecommendation.value = false
      }, 5000)
    } catch (error) {
      console.error('Error generating recommendation:', error)
      generatingRecommendation.value = false
    }
  }

  // Apply recommendation to Intervals.icu
  async function applyRecommendation() {
    if (!todayRecommendation.value?.plannedWorkoutId) return

    applyingRecommendation.value = true
    try {
      const modifications = todayRecommendation.value.analysisJson.suggested_modifications

      await $fetch('/api/integrations/intervals/update-workout', {
        method: 'POST',
        body: {
          workoutId: todayRecommendation.value.plannedWorkoutId,
          updates: {
            title: modifications.new_title,
            description: modifications.description,
            durationSec: modifications.new_duration_min * 60
            // Add TSS and other fields as needed
          }
        }
      })

      // Update local state
      await prisma.activityRecommendation.update({
        where: { id: todayRecommendation.value.id },
        data: {
          userAccepted: true,
          appliedToIntervals: true
        }
      })

      showRecommendationModal.value = false
      // Show success toast
    } catch (error) {
      console.error('Error applying recommendation:', error)
      // Show error toast
    } finally {
      applyingRecommendation.value = false
    }
  }

  function openRecommendationModal() {
    showRecommendationModal.value = true
  }

  function getRecommendationColor(rec: string) {
    const colors: Record<string, string> = {
      proceed: 'success',
      modify: 'warning',
      reduce_intensity: 'warning',
      rest: 'error'
    }
    return colors[rec] || 'neutral'
  }

  function getRecommendationLabel(rec: string) {
    const labels: Record<string, string> = {
      proceed: '✓ Proceed as Planned',
      modify: '⟳ Modify Workout',
      reduce_intensity: '↓ Reduce Intensity',
      rest: '⏸ Rest Day'
    }
    return labels[rec] || rec
  }

  // Fetch on mount
  onMounted(async () => {
    // ... existing onMounted code ...
    await fetchTodayRecommendation()
  })
</script>
```

---

## Phase 2: Weekly Planning

### Requirements

#### Data Inputs

1. **Week's Planned Workouts** (7 days)
2. **Recent Training History** (last 3-4 weeks)
3. **Current Fitness Metrics** (CTL, ATL, TSB)
4. **Recovery Trends**
5. **Athlete Goals** (event dates, focus areas)

#### AI Analysis Output

Structured JSON with array of workout recommendations:

```json
{
  "week_overview": {
    "current_ctl": 85,
    "weekly_tss_target": 500-600,
    "focus": "Build endurance base",
    "key_sessions": ["Tuesday intervals", "Saturday long ride"]
  },
  "workout_recommendations": [
    {
      "date": "2024-01-15",
      "original_workout": { ... },
      "recommendation": "keep" | "modify" | "replace" | "add" | "remove",
      "suggested_workout": { ... },
      "reasoning": "..."
    }
  ],
  "weekly_structure": {
    "hard_days": 2,
    "moderate_days": 2,
    "easy_days": 2,
    "rest_days": 1
  }
}
```

### Implementation Notes

Similar structure to Phase 1 but with:

- `trigger/recommend-weekly-plan.ts`
- `server/api/recommendations/week.post.ts`
- `server/api/recommendations/week.get.ts`
- UI in `app/pages/data.vue` in the planned workouts section
- Batch update capability for multiple workouts
- Selective acceptance (checkboxes for each day)

---

## Database Migration

Run migration to add ActivityRecommendation model:

```bash
npx prisma migrate dev --name add_activity_recommendations
```

---

## Testing Checklist

### Phase 1

- [ ] Generate recommendation with no planned workout
- [ ] Generate recommendation with planned workout
- [ ] Test with various recovery scores (low, medium, high)
- [ ] Test with missing recovery data
- [ ] Verify AI suggestions are appropriate
- [ ] Test applying modifications to Intervals.icu
- [ ] Test error handling (API failures, etc.)
- [ ] Test UI modal interactions
- [ ] Test recommendation refresh

### Phase 2

- [ ] Generate weekly plan with full schedule
- [ ] Generate plan with partial schedule
- [ ] Test selective workout updates
- [ ] Test batch sync to Intervals.icu
- [ ] Verify weekly TSS balance
- [ ] Test with different training focuses

---

## Future Enhancements

1. **Historical Tracking**
   - Track whether users follow recommendations
   - Learn from user preferences
   - Improve AI suggestions over time

2. **Goal Integration**
   - Link to race/event dates
   - Periodization support
   - Training phase awareness

3. **Advanced Modifications**
   - Specific zone/interval adjustments
   - Workout library suggestions
   - Alternative workout recommendations

4. **Notifications**
   - Morning recommendation alerts
   - Weekly planning reminders
   - Recovery alerts

5. **Mobile Support**
   - Push notifications
   - Quick accept/reject actions
   - Voice input for modifications

---

## References

- Intervals.icu API: https://intervals.icu/api/
- Existing trigger tasks: `trigger/daily-coach.ts`, `trigger/analyze-workout.ts`
- Existing report generation: `trigger/generate-weekly-report.ts`
- Gemini AI utils: `server/utils/gemini.ts`
