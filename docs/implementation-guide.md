# Coach Watts - Implementation Guide

## Overview

This guide provides a sequential, step-by-step approach to building the Coach Watts application. Each phase includes detailed prompts designed for use with SWE agents or as a developer implementation checklist.

## Prerequisites

Before starting, ensure you have:
- Node.js 18+ installed
- pnpm (recommended) or npm
- PostgreSQL database (local or cloud)
- Google Cloud account (for Gemini API)
- Google OAuth credentials
- Intervals.icu account (optional for testing)
- Whoop account (optional for testing)

## Phase 1: Scaffold & Database

### Prompt 1: Project Initialization

**Goal:** Create a new Nuxt 3 project with essential dependencies

**Instructions:**
1. Create a new Nuxt 3 project named `coach-watts`
2. Initialize the project
3. Install `@nuxt/ui` for the component library
4. Install `prisma` as a dev dependency and `@prisma/client` as a dependency
5. Initialize Prisma with PostgreSQL (`npx prisma init`)
6. Create a `.env` file with a placeholder `DATABASE_URL`
7. Ensure the project runs successfully on `localhost:3000`

**Commands:**
```bash
# Create project
npx nuxi@latest init coach-watts
cd coach-watts

# Install dependencies
pnpm add @nuxt/ui
pnpm add @prisma/client
pnpm add -D prisma

# Initialize Prisma
npx prisma init

# Create .env file
echo "DATABASE_URL=\"postgresql://user:password@localhost:5432/coach_watts\"" > .env

# Test run
pnpm dev
```

**Expected Output:**
- Project running on `http://localhost:3000`
- Prisma folder created with `schema.prisma`
- `.env` file with database URL

**Validation:**
- [ ] Nuxt dev server starts without errors
- [ ] `prisma/schema.prisma` file exists
- [ ] `.env` file contains `DATABASE_URL`

---

### Prompt 2: Schema Definition

**Goal:** Set up the complete database schema

**Instructions:**
1. Update the `prisma/schema.prisma` file
2. Copy the complete schema from `docs/database-schema.md`
3. Run a migration named `init_schema`
4. Generate Prisma Client

**Schema to Apply:**
```prisma
// Copy the complete schema from docs/database-schema.md
// Located in the "Complete Schema" section
```

**Commands:**
```bash
# After updating schema.prisma
npx prisma migrate dev --name init_schema
npx prisma generate
```

**Expected Output:**
- Migration files created in `prisma/migrations/`
- Database tables created
- Prisma Client generated

**Validation:**
- [ ] Migration runs successfully
- [ ] All tables visible in Prisma Studio (`npx prisma studio`)
- [ ] No TypeScript errors in IDE

---

## Phase 2: Authentication

### Prompt 3: Google SSO Setup

**Goal:** Implement authentication using NuxtAuth with Google provider

**Instructions:**
1. Install `@sidebase/nuxt-auth` and `next-auth`
2. Configure NuxtAuth module in `nuxt.config.ts` with PrismaAdapter
3. Create auth handler at `server/api/auth/[...].ts`
4. Configure Google Provider with environment variables
5. Add "Sign In with Google" button on `pages/login.vue`
6. Protect `/dashboard` route for authenticated users only

**Commands:**
```bash
# Install dependencies
pnpm add @sidebase/nuxt-auth @auth/core @auth/prisma-adapter
pnpm add next-auth
```

**Configuration:**

`nuxt.config.ts`:
```typescript
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@sidebase/nuxt-auth'],
  
  auth: {
    baseURL: process.env.AUTH_ORIGIN || 'http://localhost:3000/api/auth',
    provider: {
      type: 'authjs'
    }
  }
})
```

`server/api/auth/[...].ts`:
```typescript
import { NuxtAuthHandler } from '#auth'
import GoogleProvider from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '~/server/utils/db'

export default NuxtAuthHandler({
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!
    })
  ],
  secret: process.env.AUTH_SECRET
})
```

`pages/login.vue`:
```vue
<template>
  <div class="min-h-screen flex items-center justify-center">
    <UCard>
      <template #header>
        <h1 class="text-2xl font-bold">Welcome to Coach Watts</h1>
      </template>
      
      <UButton @click="signIn('google')">
        Sign in with Google
      </UButton>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const { signIn } = useAuth()

definePageMeta({
  layout: 'auth',
  middleware: 'guest'
})
</script>
```

`middleware/auth.ts`:
```typescript
export default defineNuxtRouteMiddleware((to, from) => {
  const { status } = useAuth()
  
  if (status.value !== 'authenticated') {
    return navigateTo('/login')
  }
})
```

**Environment Variables:**
```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
AUTH_SECRET=generate-random-secret-here
AUTH_ORIGIN=http://localhost:3000/api/auth
```

**Validation:**
- [ ] Login page renders
- [ ] Google OAuth flow works
- [ ] User record created in database
- [ ] Protected routes redirect to login
- [ ] Session persists on refresh

---

## Phase 3: Integration Logic (The "Senses")

### Prompt 4: Trigger.dev V3 Setup

**Goal:** Set up background job infrastructure

**Instructions:**
1. Install Trigger.dev SDK (`@trigger.dev/sdk`)
2. Initialize configuration in `trigger.config.ts`
3. Create `trigger/` folder at project root
4. Create a test job `trigger/test.ts` to verify setup

**Commands:**
```bash
# Install Trigger.dev
pnpm add @trigger.dev/sdk

# Initialize (follow prompts)
npx trigger.dev@latest init
```

**Configuration:**

`trigger.config.ts`:
```typescript
import { defineConfig } from '@trigger.dev/sdk/v3'

export default defineConfig({
  project: 'your-project-id',
  runtime: 'node',
  logLevel: 'log',
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true
    }
  },
  dirs: ['./trigger']
})
```

`trigger/test.ts`:
```typescript
import { task } from '@trigger.dev/sdk/v3'

export const testJob = task({
  id: 'test-job',
  run: async (payload: { message: string }) => {
    console.log('Test job running:', payload.message)
    return { success: true }
  }
})
```

**Commands to Test:**
```bash
# Run Trigger.dev dev server
npx trigger.dev@latest dev

# In another terminal, trigger the job
npx trigger.dev@latest test --task-id test-job
```

**Validation:**
- [ ] Trigger.dev dashboard accessible
- [ ] Test job appears in dashboard
- [ ] Job executes successfully
- [ ] Logs visible in dashboard

---

### Prompt 5: Intervals.icu Client & Ingestion Job

**Goal:** Fetch workout data from Intervals.icu

**Instructions:**
1. Create `server/utils/intervals.ts` service
2. Implement `fetchIntervalsWorkouts()` function
3. Use endpoint: `https://intervals.icu/api/v1/athlete/{athleteId}/activities`
4. Create Trigger.dev job `trigger/ingest-intervals.ts`
5. Job should fetch user's token, call API, and upsert to database

**Implementation:**

`server/utils/intervals.ts`:
```typescript
import type { Integration } from '@prisma/client'

interface IntervalsActivity {
  id: string
  start_date_local: string
  name: string
  type: string
  moving_time: number
  distance: number
  average_watts?: number
  max_watts?: number
  normalized_power?: number
  tss?: number
  intensity?: number
  // ... other fields
}

export async function fetchIntervalsWorkouts(
  integration: Integration,
  startDate: Date,
  endDate: Date
): Promise<IntervalsActivity[]> {
  const athleteId = integration.externalUserId || '0' // 0 means authenticated user
  
  const response = await fetch(
    `https://intervals.icu/api/v1/athlete/${athleteId}/activities?oldest=${startDate.toISOString()}&newest=${endDate.toISOString()}`,
    {
      headers: {
        'Authorization': `Bearer ${integration.accessToken}`
      }
    }
  )
  
  if (!response.ok) {
    throw new Error(`Intervals API error: ${response.statusText}`)
  }
  
  return await response.json()
}

export function normalizeIntervalsWorkout(activity: IntervalsActivity, userId: string) {
  return {
    userId,
    externalId: activity.id,
    source: 'intervals',
    date: new Date(activity.start_date_local),
    title: activity.name,
    type: activity.type,
    durationSec: activity.moving_time,
    distanceMeters: activity.distance,
    averageWatts: activity.average_watts,
    maxWatts: activity.max_watts,
    normalizedPower: activity.normalized_power,
    tss: activity.tss,
    if: activity.intensity,
    rawJson: activity
  }
}
```

`trigger/ingest-intervals.ts`:
```typescript
import { task } from '@trigger.dev/sdk/v3'
import { prisma } from '~/server/utils/db'
import { fetchIntervalsWorkouts, normalizeIntervalsWorkout } from '~/server/utils/intervals'

export const ingestIntervals = task({
  id: 'ingest-intervals',
  run: async (payload: { userId: string; startDate: string; endDate: string }) => {
    const { userId, startDate, endDate } = payload
    
    // Fetch integration
    const integration = await prisma.integration.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: 'intervals'
        }
      }
    })
    
    if (!integration) {
      throw new Error('Intervals integration not found')
    }
    
    // Update sync status
    await prisma.integration.update({
      where: { id: integration.id },
      data: { syncStatus: 'SYNCING' }
    })
    
    try {
      // Fetch activities
      const activities = await fetchIntervalsWorkouts(
        integration,
        new Date(startDate),
        new Date(endDate)
      )
      
      // Upsert workouts
      for (const activity of activities) {
        const workout = normalizeIntervalsWorkout(activity, userId)
        
        await prisma.workout.upsert({
          where: {
            userId_source_externalId: {
              userId,
              source: 'intervals',
              externalId: workout.externalId
            }
          },
          update: workout,
          create: workout
        })
      }
      
      // Update sync status
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          syncStatus: 'SUCCESS',
          lastSyncAt: new Date(),
          errorMessage: null
        }
      })
      
      return {
        success: true,
        count: activities.length
      }
    } catch (error) {
      // Update error status
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          syncStatus: 'FAILED',
          errorMessage: error.message
        }
      })
      
      throw error
    }
  }
})
```

**API Endpoint to Trigger:**

`server/api/integrations/sync.post.ts`:
```typescript
export default defineEventHandler(async (event) => {
  const { provider } = await readBody(event)
  const session = await getServerSession(event)
  
  if (!session?.user) {
    throw createError({ statusCode: 401 })
  }
  
  // Trigger background job
  const handle = await tasks.trigger('ingest-intervals', {
    userId: session.user.id,
    startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), // Last 90 days
    endDate: new Date().toISOString()
  })
  
  return {
    jobId: handle.id
  }
})
```

**Validation:**
- [ ] Job appears in Trigger.dev dashboard
- [ ] Workouts fetched from Intervals.icu
- [ ] Data normalized correctly
- [ ] Workouts created in database
- [ ] Duplicate prevention works

---

### Prompt 6: Whoop Client & Ingestion Job

**Goal:** Fetch recovery data from Whoop

**Instructions:**
1. Create `server/utils/whoop.ts` service
2. Implement `fetchWhoopRecovery()` function
3. Use endpoint: `https://api.prod.whoop.com/developer/v1/recovery`
4. Create Trigger.dev job `trigger/ingest-whoop.ts`
5. Map recovery data to `DailyMetric` model

**Implementation:**

`server/utils/whoop.ts`:
```typescript
import type { Integration } from '@prisma/client'

interface WhoopRecovery {
  cycle_id: number
  sleep_id: number
  user_id: number
  created_at: string
  updated_at: string
  score_state: string
  score: {
    user_calibrating: boolean
    recovery_score: number
    resting_heart_rate: number
    hrv_rmssd_milli: number
    spo2_percentage: number
    skin_temp_celsius: number
  }
  sleep: {
    id: number
    score: number
    total_sleep_duration_milli: number
  }
}

export async function fetchWhoopRecovery(
  integration: Integration,
  startDate: Date,
  endDate: Date
): Promise<WhoopRecovery[]> {
  const response = await fetch(
    `https://api.prod.whoop.com/developer/v1/recovery?start=${startDate.toISOString()}&end=${endDate.toISOString()}`,
    {
      headers: {
        'Authorization': `Bearer ${integration.accessToken}`
      }
    }
  )
  
  if (!response.ok) {
    throw new Error(`Whoop API error: ${response.statusText}`)
  }
  
  const data = await response.json()
  return data.records || []
}

export function normalizeWhoopRecovery(recovery: WhoopRecovery, userId: string) {
  return {
    userId,
    date: new Date(recovery.created_at),
    source: 'whoop',
    hrv: recovery.score.hrv_rmssd_milli,
    restingHr: recovery.score.resting_heart_rate,
    recoveryScore: recovery.score.recovery_score,
    spO2: recovery.score.spo2_percentage,
    sleepScore: recovery.sleep.score,
    hoursSlept: recovery.sleep.total_sleep_duration_milli / (1000 * 60 * 60)
  }
}
```

`trigger/ingest-whoop.ts`:
```typescript
import { task } from '@trigger.dev/sdk/v3'
import { prisma } from '~/server/utils/db'
import { fetchWhoopRecovery, normalizeWhoopRecovery } from '~/server/utils/whoop'

export const ingestWhoop = task({
  id: 'ingest-whoop',
  run: async (payload: { userId: string; startDate: string; endDate: string }) => {
    const { userId, startDate, endDate } = payload
    
    const integration = await prisma.integration.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: 'whoop'
        }
      }
    })
    
    if (!integration) {
      throw new Error('Whoop integration not found')
    }
    
    await prisma.integration.update({
      where: { id: integration.id },
      data: { syncStatus: 'SYNCING' }
    })
    
    try {
      const recoveryData = await fetchWhoopRecovery(
        integration,
        new Date(startDate),
        new Date(endDate)
      )
      
      for (const recovery of recoveryData) {
        const metric = normalizeWhoopRecovery(recovery, userId)
        
        await prisma.dailyMetric.upsert({
          where: {
            userId_date: {
              userId,
              date: metric.date
            }
          },
          update: metric,
          create: metric
        })
      }
      
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          syncStatus: 'SUCCESS',
          lastSyncAt: new Date(),
          errorMessage: null
        }
      })
      
      return {
        success: true,
        count: recoveryData.length
      }
    } catch (error) {
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          syncStatus: 'FAILED',
          errorMessage: error.message
        }
      })
      
      throw error
    }
  }
})
```

**Validation:**
- [ ] Whoop API authentication works
- [ ] Recovery data fetched
- [ ] Data normalized to DailyMetric format
- [ ] Upserts prevent duplicates
- [ ] Sync status tracked

---

## Phase 4: AI Logic (The "Brain")

### Prompt 7: Gemini 2.5 Client Setup

**Goal:** Initialize Google Gemini AI client

**Instructions:**
1. Install Google Generative AI SDK (`@google/generative-ai`)
2. Create `server/utils/gemini.ts`
3. Export `generateCoachAnalysis()` function
4. Support both Flash and Pro models
5. Ensure API key from environment

**Commands:**
```bash
pnpm add @google/generative-ai
```

**Implementation:**

`server/utils/gemini.ts`:
```typescript
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export type GeminiModel = 'flash' | 'pro'

const MODEL_NAMES = {
  flash: 'gemini-2.0-flash-exp',
  pro: 'gemini-2.0-flash-thinking-exp-1219'
} as const

export async function generateCoachAnalysis(
  prompt: string,
  modelType: GeminiModel = 'flash'
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: MODEL_NAMES[modelType]
  })
  
  const result = await model.generateContent(prompt)
  const response = result.response
  return response.text()
}

export async function generateStructuredAnalysis<T>(
  prompt: string,
  schema: any,
  modelType: GeminiModel = 'flash'
): Promise<T> {
  const model = genAI.getGenerativeModel({
    model: MODEL_NAMES[modelType],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema
    }
  })
  
  const result = await model.generateContent(prompt)
  const response = result.response
  return JSON.parse(response.text())
}

export function buildWorkoutSummary(workouts: any[]): string {
  return workouts.map(w => 
    `${w.date.toISOString()}: ${w.title} - ${w.durationSec}s, ${w.tss || 'N/A'} TSS, ${w.averageWatts || 'N/A'}W avg`
  ).join('\n')
}

export function buildMetricsSummary(metrics: any[]): string {
  return metrics.map(m =>
    `${m.date.toISOString()}: Recovery ${m.recoveryScore}%, HRV ${m.hrv}ms, Sleep ${m.hoursSlept}h`
  ).join('\n')
}
```

**Environment Variable:**
```env
GEMINI_API_KEY=your-api-key-here
```

**Validation:**
- [ ] Gemini client initializes
- [ ] API key loaded from environment
- [ ] Test prompt returns response
- [ ] Both Flash and Pro models work

---

### Prompt 8: The "Analyst" Job (Weekly Report)

**Goal:** Generate comprehensive weekly analysis reports

**Instructions:**
1. Create `trigger/generate-weekly-report.ts` job
2. Query last 30 days of workouts and metrics
3. Format data for Gemini Pro
4. Use Chain-of-Thought prompting
5. Save Markdown result to Report table

**Implementation:**

`trigger/generate-weekly-report.ts`:
```typescript
import { task } from '@trigger.dev/sdk/v3'
import { prisma } from '~/server/utils/db'
import { 
  generateCoachAnalysis, 
  buildWorkoutSummary, 
  buildMetricsSummary 
} from '~/server/utils/gemini'

export const generateWeeklyReport = task({
  id: 'generate-weekly-report',
  run: async (payload: { userId: string; reportId: string }) => {
    const { userId, reportId } = payload
    
    // Update report status
    await prisma.report.update({
      where: { id: reportId },
      data: { status: 'PROCESSING' }
    })
    
    try {
      // Calculate date range (last 30 days)
      const endDate = new Date()
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      
      // Fetch data
      const [workouts, metrics, user] = await Promise.all([
        prisma.workout.findMany({
          where: {
            userId,
            date: { gte: startDate, lte: endDate }
          },
          orderBy: { date: 'asc' }
        }),
        prisma.dailyMetric.findMany({
          where: {
            userId,
            date: { gte: startDate, lte: endDate }
          },
          orderBy: { date: 'asc' }
        }),
        prisma.user.findUnique({
          where: { id: userId },
          select: { ftp: true, weight: true }
        })
      ])
      
      // Build prompt
      const prompt = `You are an expert cycling coach analyzing training data.

USER PROFILE:
- FTP: ${user?.ftp || 'Unknown'} watts
- Weight: ${user?.weight || 'Unknown'} kg

WORKOUTS (Last 30 days):
${buildWorkoutSummary(workouts)}

DAILY METRICS (Recovery & Sleep):
${buildMetricsSummary(metrics)}

ANALYSIS INSTRUCTIONS:
1. Calculate training load distribution (easy, moderate, hard days)
2. Identify trends in HRV vs training intensity
3. Look for signs of overreaching or undertraining
4. Analyze power progression and fatigue accumulation
5. Provide specific recommendations for the next training block

OUTPUT FORMAT: Professional markdown report with sections:
- Executive Summary
- Training Load Analysis
- Recovery Trends
- Power Progression
- Recommendations

Begin your analysis:`

      // Generate with Gemini Pro
      const markdown = await generateCoachAnalysis(prompt, 'pro')
      
      // Save report
      await prisma.report.update({
        where: { id: reportId },
        data: {
          status: 'COMPLETED',
          markdown,
          modelVersion: 'gemini-2.5-pro',
          dateRangeStart: startDate,
          dateRangeEnd: endDate
        }
      })
      
      return {
        success: true,
        reportId
      }
    } catch (error) {
      await prisma.report.update({
        where: { id: reportId },
        data: {
          status: 'FAILED',
          errorMessage: error.message
        }
      })
      
      throw error
    }
  }
})
```

**API Endpoint:**

`server/api/reports/generate.post.ts`:
```typescript
export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401 })
  }
  
  // Create report record
  const report = await prisma.report.create({
    data: {
      userId: session.user.id,
      type: 'WEEKLY_ANALYSIS',
      status: 'PENDING',
      dateRangeStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      dateRangeEnd: new Date()
    }
  })
  
  // Trigger background job
  const handle = await tasks.trigger('generate-weekly-report', {
    userId: session.user.id,
    reportId: report.id
  })
  
  return {
    reportId: report.id,
    jobId: handle.id
  }
})
```

**Validation:**
- [ ] Report created with PENDING status
- [ ] Job triggered successfully
- [ ] Data fetched and formatted
- [ ] Gemini generates markdown
- [ ] Report saved with COMPLETED status

---

### Prompt 9: The "Coach" Job (Daily Check)

**Goal:** Generate quick daily coaching suggestions

**Instructions:**
1. Create `trigger/daily-coach.ts` job
2. Fetch yesterday's load and today's recovery
3. Apply decision logic for workout adjustments
4. Use Gemini Flash for fast, cost-effective suggestions
5. Store structured JSON output

**Implementation:**

`trigger/daily-coach.ts`:
```typescript
import { task } from '@trigger.dev/sdk/v3'
import { prisma } from '~/server/utils/db'
import { generateStructuredAnalysis } from '~/server/utils/gemini'

const suggestionSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['proceed', 'modify', 'rest', 'reduce_intensity']
    },
    reason: { type: 'string' },
    confidence: { type: 'number' },
    modification: { type: 'string' }
  },
  required: ['action', 'reason', 'confidence']
}

export const dailyCoach = task({
  id: 'daily-coach',
  run: async (payload: { userId: string }) => {
    const { userId } = payload
    
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const today = new Date()
    
    // Fetch data
    const [yesterdayWorkout, todayMetric, plannedWorkout] = await Promise.all([
      prisma.workout.findFirst({
        where: {
          userId,
          date: { gte: yesterday, lt: today }
        },
        orderBy: { date: 'desc' }
      }),
      prisma.dailyMetric.findUnique({
        where: {
          userId_date: {
            userId,
            date: today
          }
        }
      }),
      // In real implementation, fetch from Intervals.icu calendar
      prisma.workout.findFirst({
        where: {
          userId,
          date: { gte: today },
          source: 'intervals'
        },
        orderBy: { date: 'asc' }
      })
    ])
    
    // Build prompt
    const prompt = `You are a cycling coach providing daily workout guidance.

YESTERDAY'S TRAINING:
${yesterdayWorkout ? `${yesterdayWorkout.title} - TSS: ${yesterdayWorkout.tss}, Duration: ${yesterdayWorkout.durationSec}s` : 'Rest day'}

TODAY'S RECOVERY:
- Recovery Score: ${todayMetric?.recoveryScore || 'Unknown'}%
- HRV: ${todayMetric?.hrv || 'Unknown'} ms
- Sleep: ${todayMetric?.hoursSlept || 'Unknown'} hours

PLANNED WORKOUT:
${plannedWorkout ? plannedWorkout.title : 'No workout scheduled'}

DECISION LOGIC:
- If recovery < 33% and high intensity planned → suggest rest or easy ride
- If recovery > 80% and low intensity planned → consider adding intensity
- If recovery 33-80% → proceed as planned

Provide a structured recommendation:`

    const suggestion = await generateStructuredAnalysis(
      prompt,
      suggestionSchema,
      'flash'
    )
    
    // Save suggestion as report
    const report = await prisma.report.create({
      data: {
        userId,
        type: 'DAILY_SUGGESTION',
        status: 'COMPLETED',
        dateRangeStart: today,
        dateRangeEnd: today,
        modelVersion: 'gemini-2.5-flash',
        suggestions: suggestion
      }
    })
    
    return {
      success: true,
      reportId: report.id,
      suggestion
    }
  }
})
```

**Scheduled Trigger:**

`trigger/scheduled.ts`:
```typescript
import { schedules } from '@trigger.dev/sdk/v3'

export const dailyCoachSchedule = schedules.task({
  id: 'daily-coach-schedule',
  cron: '0 6 * * *', // 6 AM daily
  run: async (payload, { ctx }) => {
    // Get all users with active integrations
    const users = await prisma.user.findMany({
      where: {
        integrations: {
          some: {
            provider: 'whoop',
            syncStatus: 'SUCCESS'
          }
        }
      }
    })
    
    // Trigger daily coach for each user
    for (const user of users) {
      await tasks.trigger('daily-coach', {
        userId: user.id
      })
    }
  }
})
```

**Validation:**
- [ ] Job runs on schedule
- [ ] Data fetched correctly
- [ ] Decision logic applied
- [ ] Structured JSON returned
- [ ] Suggestion saved to database

---

## Phase 5: Frontend Dashboard

### Prompt 10: Dashboard UI

**Goal:** Build main dashboard with readiness and activity views

**Instructions:**
1. Create `/dashboard` page
2. Use Nuxt UI components (Cards, Grid)
3. Display today's readiness (HRV, Sleep, Recovery)
4. Show recent activities list
5. Add "Generate Deep Analysis" button

**Implementation:**

`pages/dashboard.vue`:
```vue
<template>
  <div class="container mx-auto p-6">
    <h1 class="text-3xl font-bold mb-6">Dashboard</h1>
    
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Today's Readiness -->
      <div class="lg:col-span-1">
        <ReadinessCard :metric="todayMetric" />
        <CoachSuggestion :suggestion="dailySuggestion" class="mt-4" />
      </div>
      
      <!-- Recent Activity -->
      <div class="lg:col-span-2">
        <UCard>
          <template #header>
            <div class="flex justify-between items-center">
              <h2 class="text-xl font-semibold">Recent Activity</h2>
              <UButton @click="generateReport" :loading="generating">
                Generate Deep Analysis
              </UButton>
            </div>
          </template>
          
          <ActivityFeed :workouts="recentWorkouts" />
        </UCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

const generating = ref(false)

// Fetch data
const { data: todayMetric } = await useFetch('/api/metrics/today')
const { data: dailySuggestion } = await useFetch('/api/reports/daily-suggestion')
const { data: recentWorkouts } = await useFetch('/api/workouts?limit=10')

const generateReport = async () => {
  generating.value = true
  try {
    const { reportId } = await $fetch('/api/reports/generate', {
      method: 'POST'
    })
    await navigateTo(`/reports/${reportId}`)
  } finally {
    generating.value = false
  }
}
</script>
```

`components/dashboard/ReadinessCard.vue`:
```vue
<template>
  <UCard>
    <template #header>
      <h2 class="text-xl font-semibold">Today's Readiness</h2>
    </template>
    
    <div v-if="metric" class="space-y-4">
      <div class="flex items-center justify-between">
        <span class="text-gray-600">Recovery</span>
        <span class="text-2xl font-bold" :class="recoveryColor">
          {{ metric.recoveryScore }}%
        </span>
      </div>
      
      <div class="flex items-center justify-between">
        <span class="text-gray-600">HRV</span>
        <span class="text-lg">{{ metric.hrv }} ms</span>
      </div>
      
      <div class="flex items-center justify-between">
        <span class="text-gray-600">Sleep</span>
        <span class="text-lg">{{ metric.hoursSlept?.toFixed(1) }}h</span>
      </div>
    </div>
    
    <div v-else class="text-gray-500 text-center py-8">
      No data available
    </div>
  </UCard>
</template>

<script setup lang="ts">
const props = defineProps<{
  metric: any
}>()

const recoveryColor = computed(() => {
  const score = props.metric?.recoveryScore || 0
  if (score < 33) return 'text-red-600'
  if (score < 67) return 'text-yellow-600'
  return 'text-green-600'
})
</script>
```

`components/dashboard/CoachSuggestion.vue`:
```vue
<template>
  <UCard v-if="suggestion">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-light-bulb" class="w-5 h-5" />
        <h3 class="font-semibold">Coach Suggestion</h3>
      </div>
    </template>
    
    <div class="space-y-2">
      <p class="font-medium">{{ actionText }}</p>
      <p class="text-sm text-gray-600">{{ suggestion.reason }}</p>
      <p v-if="suggestion.modification" class="text-sm text-blue-600">
        {{ suggestion.modification }}
      </p>
    </div>
  </UCard>
</template>

<script setup lang="ts">
const props = defineProps<{
  suggestion: any
}>()

const actionText = computed(() => {
  switch (props.suggestion?.action) {
    case 'rest': return '🛌 Rest Day Recommended'
    case 'reduce_intensity': return '📉 Reduce Intensity'
    case 'modify': return '🔄 Modify Workout'
    default: return '✅ Proceed as Planned'
  }
})
</script>
```

**Validation:**
- [ ] Dashboard renders with layout
- [ ] Today's metrics display
- [ ] Recent workouts list
- [ ] Generate button triggers job
- [ ] Navigation to report works

---

### Prompt 11: Report View

**Goal:** Create report viewing page with markdown rendering

**Instructions:**
1. Create `/reports/[id].vue` page
2. Fetch report by ID
3. Render markdown using `@nuxtjs/mdc`
4. Style with Tailwind typography
5. Add download PDF button (placeholder)

**Commands:**
```bash
pnpm add @nuxtjs/mdc
```

**Configuration:**

`nuxt.config.ts`:
```typescript
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@sidebase/nuxt-auth', '@nuxtjs/mdc']
})
```

**Implementation:**

`pages/reports/[id].vue`:
```vue
<template>
  <div class="container mx-auto p-6 max-w-4xl">
    <div v-if="pending" class="flex justify-center py-20">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin" />
    </div>
    
    <div v-else-if="report">
      <!-- Header -->
      <div class="mb-6">
        <NuxtLink to="/reports" class="text-blue-600 hover:underline">
          ← Back to Reports
        </NuxtLink>
        <h1 class="text-3xl font-bold mt-4">{{ reportTitle }}</h1>
        <p class="text-gray-600 mt-2">
          {{ formatDateRange(report.dateRangeStart, report.dateRangeEnd) }}
        </p>
      </div>
      
      <!-- Status -->
      <UAlert
        v-if="report.status !== 'COMPLETED'"
        :color="statusColor"
        :title="statusText"
        class="mb-6"
      />
      
      <!-- Content -->
      <UCard v-if="report.status === 'COMPLETED'" class="prose prose-lg max-w-none">
        <MDC :value="report.markdown" />
      </UCard>
      
      <!-- Actions -->
      <div class="mt-6 flex gap-4">
        <UButton
          color="gray"
          @click="downloadPDF"
          :disabled="!report.pdfUrl"
        >
          Download PDF
        </UButton>
        <UButton
          color="gray"
          variant="outline"
          @click="shareReport"
        >
          Share
        </UButton>
      </div>
    </div>
    
    <div v-else class="text-center py-20">
      <p class="text-gray-600">Report not found</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const reportId = route.params.id as string

const { data: report, pending } = await useFetch(`/api/reports/${reportId}`)

const reportTitle = computed(() => {
  if (!report.value) return ''
  const types = {
    'WEEKLY_ANALYSIS': 'Weekly Training Analysis',
    'RACE_PREP': 'Race Preparation Report',
    'DAILY_SUGGESTION': 'Daily Coaching Brief'
  }
  return types[report.value.type] || 'Report'
})

const statusColor = computed(() => {
  const colors = {
    'PENDING': 'yellow',
    'PROCESSING': 'blue',
    'FAILED': 'red',
    'COMPLETED': 'green'
  }
  return colors[report.value?.status] || 'gray'
})

const statusText = computed(() => {
  const texts = {
    'PENDING': 'Report generation queued...',
    'PROCESSING': 'Analyzing your training data...',
    'FAILED': 'Report generation failed. Please try again.',
    'COMPLETED': 'Report ready!'
  }
  return texts[report.value?.status] || ''
})

const formatDateRange = (start: string, end: string) => {
  const startDate = new Date(start).toLocaleDateString()
  const endDate = new Date(end).toLocaleDateString()
  return `${startDate} - ${endDate}`
}

const downloadPDF = () => {
  if (report.value?.pdfUrl) {
    window.open(report.value.pdfUrl, '_blank')
  } else {
    // Fallback: print to PDF
    window.print()
  }
}

const shareReport = () => {
  // TODO: Implement sharing functionality
  alert('Sharing functionality coming soon!')
}
</script>

<style>
/* Custom prose styles for markdown */
.prose h2 {
  @apply mt-8 mb-4 text-2xl font-bold;
}

.prose h3 {
  @apply mt-6 mb-3 text-xl font-semibold;
}

.prose p {
  @apply my-4;
}

.prose ul {
  @apply my-4 list-disc list-inside;
}
</style>
```

**API Endpoint:**

`server/api/reports/[id].get.ts`:
```typescript
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const session = await getServerSession(event)
  
  if (!session?.user) {
    throw createError({ statusCode: 401 })
  }
  
  const report = await prisma.report.findFirst({
    where: {
      id,
      userId: session.user.id
    }
  })
  
  if (!report) {
    throw createError({ statusCode: 404, message: 'Report not found' })
  }
  
  return report
})
```

**Validation:**
- [ ] Report fetches by ID
- [ ] Markdown renders correctly
- [ ] Typography styling applied
- [ ] Status indicators work
- [ ] Download button functional

---

## Phase 6: Polish

### Prompt 12: Settings & Connections

**Goal:** Create settings page with integration management

**Instructions:**
1. Create `/settings` page
2. Display user profile info
3. Create "Connections" card
4. Add buttons for "Connect Intervals.icu" and "Connect Whoop"
5. Scaffold OAuth callback routes

**Implementation:**

`pages/settings.vue`:
```vue
<template>
  <div class="container mx-auto p-6 max-w-4xl">
    <h1 class="text-3xl font-bold mb-6">Settings</h1>
    
    <div class="space-y-6">
      <!-- Profile -->
      <UCard>
        <template #header>
          <h2 class="text-xl font-semibold">Profile</h2>
        </template>
        
        <UForm :state="profile" @submit="saveProfile">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UFormGroup label="FTP (Watts)">
              <UInput v-model.number="profile.ftp" type="number" />
            </UFormGroup>
            
            <UFormGroup label="Max HR">
              <UInput v-model.number="profile.maxHr" type="number" />
            </UFormGroup>
            
            <UFormGroup label="Weight (kg)">
              <UInput v-model.number="profile.weight" type="number" step="0.1" />
            </UFormGroup>
            
            <UFormGroup label="Date of Birth">
              <UInput v-model="profile.dob" type="date" />
            </UFormGroup>
          </div>
          
          <div class="mt-4">
            <UButton type="submit" :loading="saving">
              Save Profile
            </UButton>
          </div>
        </UForm>
      </UCard>
      
      <!-- Connections -->
      <UCard>
        <template #header>
          <h2 class="text-xl font-semibold">Connections</h2>
        </template>
        
        <div class="space-y-4">
          <IntegrationCard
            provider="intervals"
            :integration="integrations?.intervals"
            @connect="connectIntegration('intervals')"
            @disconnect="disconnectIntegration('intervals')"
          />
          
          <IntegrationCard
            provider="whoop"
            :integration="integrations?.whoop"
            @connect="connectIntegration('whoop')"
            @disconnect="disconnectIntegration('whoop')"
          />
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

const { data: user } = await useFetch('/api/user')
const { data: integrations } = await useFetch('/api/integrations')

const profile = ref({
  ftp: user.value?.ftp,
  maxHr: user.value?.maxHr,
  weight: user.value?.weight,
  dob: user.value?.dob?.split('T')[0]
})

const saving = ref(false)

const saveProfile = async () => {
  saving.value = true
  try {
    await $fetch('/api/user', {
      method: 'PUT',
      body: profile.value
    })
    // Show success message
  } finally {
    saving.value = false
  }
}

const connectIntegration = (provider: string) => {
  // Redirect to OAuth flow
  window.location.href = `/api/integrations/connect?provider=${provider}`
}

const disconnectIntegration = async (provider: string) => {
  await $fetch(`/api/integrations/${provider}`, {
    method: 'DELETE'
  })
  // Refresh integrations
  await refreshNuxtData('integrations')
}
</script>
```

`components/integrations/IntegrationCard.vue`:
```vue
<template>
  <div class="flex items-center justify-between p-4 border rounded-lg">
    <div class="flex items-center gap-4">
      <img
        :src="providerLogo"
        :alt="providerName"
        class="w-12 h-12 rounded"
      />
      <div>
        <h3 class="font-semibold">{{ providerName }}</h3>
        <p class="text-sm text-gray-600">{{ providerDescription }}</p>
        <p v-if="integration" class="text-xs text-gray-500 mt-1">
          Last synced: {{ formatDate(integration.lastSyncAt) }}
        </p>
      </div>
    </div>
    
    <UButton
      v-if="!integration"
      @click="$emit('connect')"
    >
      Connect
    </UButton>
    
    <div v-else class="flex gap-2">
      <UBadge :color="statusColor">{{ integration.syncStatus }}</UBadge>
      <UButton
        color="gray"
        variant="outline"
        @click="$emit('disconnect')"
      >
        Disconnect
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  provider: string
  integration: any
}>()

defineEmits(['connect', 'disconnect'])

const providerInfo = {
  intervals: {
    name: 'Intervals.icu',
    description: 'Power data and training calendar',
    logo: '/images/intervals-logo.png'
  },
  whoop: {
    name: 'Whoop',
    description: 'Recovery, HRV, and sleep tracking',
    logo: '/images/whoop-logo.png'
  }
}

const providerName = providerInfo[props.provider]?.name
const providerDescription = providerInfo[props.provider]?.description
const providerLogo = providerInfo[props.provider]?.logo

const statusColor = computed(() => {
  switch (props.integration?.syncStatus) {
    case 'SUCCESS': return 'green'
    case 'SYNCING': return 'blue'
    case 'FAILED': return 'red'
    default: return 'gray'
  }
})

const formatDate = (date: string) => {
  return date ? new Date(date).toLocaleString() : 'Never'
}
</script>
```

**OAuth Endpoints:**

`server/api/integrations/connect.get.ts`:
```typescript
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const provider = query.provider as string
  const session = await getServerSession(event)
  
  if (!session?.user) {
    throw createError({ statusCode: 401 })
  }
  
  // OAuth configuration
  const configs = {
    intervals: {
      authUrl: 'https://intervals.icu/oauth/authorize',
      clientId: process.env.INTERVALS_CLIENT_ID,
      redirectUri: `${process.env.APP_URL}/api/integrations/callback?provider=intervals`,
      scope: 'read:activities read:calendar'
    },
    whoop: {
      authUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
      clientId: process.env.WHOOP_CLIENT_ID,
      redirectUri: `${process.env.APP_URL}/api/integrations/callback?provider=whoop`,
      scope: 'read:recovery read:sleep'
    }
  }
  
  const config = configs[provider]
  if (!config) {
    throw createError({ statusCode: 400, message: 'Invalid provider' })
  }
  
  // Build OAuth URL
  const authUrl = new URL(config.authUrl)
  authUrl.searchParams.set('client_id', config.clientId!)
  authUrl.searchParams.set('redirect_uri', config.redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', config.scope)
  authUrl.searchParams.set('state', session.user.id) // CSRF protection
  
  // Redirect to OAuth provider
  return sendRedirect(event, authUrl.toString())
})
```

`server/api/integrations/callback.get.ts`:
```typescript
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const provider = query.provider as string
  const code = query.code as string
  const state = query.state as string // userId
  
  // Exchange code for token
  // Store in Integration table
  // Trigger initial sync
  
  // Redirect back to settings
  return sendRedirect(event, '/settings?connected=true')
})
```

**Validation:**
- [ ] Settings page renders
- [ ] Profile form works
- [ ] Integration cards display
- [ ] OAuth flow initiates
- [ ] Callback handles token exchange

---

## Next Steps

After completing all phases:

1. **Testing:**
   - Unit tests for utilities
   - Integration tests for API endpoints
   - E2E tests for critical user flows

2. **Deployment:**
   - Set up CI/CD pipeline
   - Configure production environment
   - Deploy to hosting platform (Vercel, Netlify, etc.)

3. **Monitoring:**
   - Set up error tracking (Sentry)
   - Add analytics
   - Monitor job execution in Trigger.dev

4. **Documentation:**
   - API documentation
   - User guide
   - Developer onboarding

## Troubleshooting

### Common Issues

1. **Prisma Client not generated:**
   ```bash
   npx prisma generate
   ```

2. **Database migrations fail:**
   ```bash
   npx prisma migrate reset
   npx prisma migrate dev
   ```

3. **Trigger.dev jobs not appearing:**
   - Check `trigger.config.ts` is correct
   - Ensure dev server is running
   - Check Trigger.dev dashboard for errors

4. **OAuth callback fails:**
   - Verify redirect URIs match exactly
   - Check environment variables are set
   - Ensure HTTPS in production

## Environment Variables Checklist

```env
# Database
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Authentication
AUTH_SECRET=random-secret-here
AUTH_ORIGIN=http://localhost:3000/api/auth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# External APIs
INTERVALS_CLIENT_ID=...
INTERVALS_CLIENT_SECRET=...
WHOOP_CLIENT_ID=...
WHOOP_CLIENT_SECRET=...

# AI
GEMINI_API_KEY=...

# Background Jobs
TRIGGER_API_KEY=...
TRIGGER_API_URL=...

# Application
APP_URL=http://localhost:3000
NODE_ENV=development
```

## Conclusion

This implementation guide provides a complete roadmap for building Coach Watts. Follow each phase sequentially, validating work at each step before proceeding. The modular structure allows for parallel development of different components once the foundation is established.

For questions or issues, refer to:
- [Architecture Documentation](./architecture.md)
- [Database Schema](./database-schema.md)
- [Project Structure](./project-structure.md)