# Coach Watts - Project Structure

## Overview

Coach Watts follows a standard Nuxt 3 full-stack application structure with additional folders for background jobs (Trigger.dev) and database management (Prisma).

## Complete Directory Structure

```
coach-watts/
├── .env                      # Environment variables (API Keys, Database)
├── .gitignore               # Git ignore patterns
├── nuxt.config.ts           # Nuxt Configuration
├── tsconfig.json            # TypeScript configuration
├── package.json             # Node dependencies
├── README.md                # Project documentation
│
├── prisma/                  # Database Layer
│   ├── schema.prisma        # Database schema definition
│   ├── migrations/          # Database migration history
│   └── seed.ts             # Database seeding script
│
├── server/                  # Backend/API Layer
│   ├── api/                 # Nuxt API Routes (RESTful endpoints)
│   │   ├── auth/            # Authentication endpoints
│   │   │   └── [...].ts     # NuxtAuth catch-all handler
│   │   ├── webhooks/        # External service webhooks
│   │   │   ├── intervals.ts # Intervals.icu webhook handler
│   │   │   └── whoop.ts     # Whoop webhook handler
│   │   ├── reports/         # Report management
│   │   │   ├── index.ts     # List reports
│   │   │   ├── [id].ts      # Get single report
│   │   │   └── generate.ts  # Trigger report generation
│   │   ├── integrations/    # Integration management
│   │   │   ├── index.ts     # List user integrations
│   │   │   ├── connect.ts   # Initiate OAuth flow
│   │   │   └── callback.ts  # OAuth callback handler
│   │   ├── workouts/        # Workout data endpoints
│   │   │   ├── index.ts     # List workouts
│   │   │   └── [id].ts      # Get workout details
│   │   └── metrics/         # Daily metrics endpoints
│   │       └── index.ts     # Get metrics for date range
│   │
│   ├── utils/               # Server utilities
│   │   ├── db.ts           # Prisma client instance
│   │   ├── gemini.ts       # Google Gemini API wrapper
│   │   ├── intervals.ts    # Intervals.icu API client
│   │   ├── whoop.ts        # Whoop API client
│   │   └── auth.ts         # Auth helper functions
│   │
│   ├── middleware/          # Server middleware
│   │   ├── auth.ts         # Authentication check
│   │   └── ratelimit.ts    # API rate limiting
│   │
│   └── plugins/             # Server plugins
│       └── prisma.ts       # Prisma client initialization
│
├── trigger/                 # Background Jobs (Trigger.dev)
│   ├── client.ts           # Trigger.dev client setup
│   ├── config.ts           # Job configuration
│   │
│   └── jobs/               # Job definitions
│       ├── ingest-intervals.ts    # Fetch Intervals.icu data
│       ├── ingest-whoop.ts        # Fetch Whoop data
│       ├── generate-weekly-report.ts  # AI analysis job
│       ├── daily-coach.ts         # Daily suggestion job
│       └── sync-calendar.ts       # Sync training calendar
│
├── pages/                   # Frontend Pages (Vue SFCs)
│   ├── index.vue           # Landing page
│   ├── login.vue           # Login page
│   ├── dashboard.vue       # Main dashboard
│   ├── settings.vue        # User settings & integrations
│   │
│   ├── reports/            # Report pages
│   │   ├── index.vue       # Report list
│   │   └── [id].vue        # Single report view
│   │
│   ├── workouts/           # Workout pages
│   │   ├── index.vue       # Workout calendar/list
│   │   └── [id].vue        # Workout details
│   │
│   └── profile.vue         # User profile
│
├── components/              # Vue Components
│   ├── auth/               # Authentication components
│   │   ├── LoginButton.vue
│   │   └── LogoutButton.vue
│   │
│   ├── dashboard/          # Dashboard widgets
│   │   ├── ReadinessCard.vue    # Today's readiness display
│   │   ├── ActivityFeed.vue     # Recent workouts
│   │   ├── MetricsChart.vue     # HRV/Recovery trends
│   │   └── CoachSuggestion.vue  # AI recommendations
│   │
│   ├── integrations/       # Integration components
│   │   ├── ConnectButton.vue    # OAuth connect button
│   │   ├── IntegrationCard.vue  # Integration status card
│   │   └── SyncStatus.vue       # Sync progress indicator
│   │
│   ├── reports/            # Report components
│   │   ├── ReportCard.vue       # Report preview card
│   │   ├── MarkdownViewer.vue   # Markdown renderer
│   │   └── GenerateButton.vue   # Trigger report generation
│   │
│   ├── workouts/           # Workout components
│   │   ├── WorkoutCard.vue      # Workout summary card
│   │   ├── PowerCurve.vue       # Power curve chart
│   │   └── ZoneDistribution.vue # Training zone breakdown
│   │
│   └── ui/                 # Reusable UI components
│       ├── Card.vue
│       ├── Button.vue
│       ├── Loading.vue
│       └── ErrorMessage.vue
│
├── composables/             # Vue Composables
│   ├── useAuth.ts          # Authentication composable
│   ├── useWorkouts.ts      # Workout data fetching
│   ├── useMetrics.ts       # Metrics data fetching
│   ├── useReports.ts       # Report management
│   └── useIntegrations.ts  # Integration management
│
├── layouts/                 # Page Layouts
│   ├── default.vue         # Default app layout
│   ├── auth.vue            # Login/signup layout
│   └── dashboard.vue       # Dashboard layout (with sidebar)
│
├── middleware/              # Route Middleware
│   ├── auth.ts             # Protected route middleware
│   └── guest.ts            # Guest-only route middleware
│
├── plugins/                 # Vue Plugins
│   ├── auth.ts             # NuxtAuth plugin
│   └── dayjs.ts            # Date formatting plugin
│
├── public/                  # Static Assets
│   ├── favicon.ico
│   ├── robots.txt
│   └── images/
│       └── logo.svg
│
├── assets/                  # Build-time Assets
│   ├── css/
│   │   └── main.css        # Global styles
│   └── images/
│
├── types/                   # TypeScript Type Definitions
│   ├── api.ts              # API response types
│   ├── workout.ts          # Workout-related types
│   ├── metric.ts           # Metric-related types
│   └── integration.ts      # Integration types
│
├── utils/                   # Shared Utilities
│   ├── formatters.ts       # Data formatting helpers
│   ├── calculations.ts     # Training calculations (TSS, IF, etc.)
│   └── validators.ts       # Input validation
│
└── docs/                    # Documentation
    ├── README.md           # Documentation index
    ├── architecture.md     # System architecture
    ├── database-schema.md  # Database design
    ├── project-structure.md # This file
    └── implementation-guide.md # Step-by-step build guide
```

## Directory Purposes

### Root Level

| File/Folder | Purpose |
|-------------|---------|
| `.env` | Environment variables (secrets, API keys) |
| `nuxt.config.ts` | Nuxt framework configuration |
| `tsconfig.json` | TypeScript compiler configuration |
| `package.json` | Node.js dependencies and scripts |

### `/prisma` - Database Layer

**Purpose:** Database schema, migrations, and seeding

| File | Purpose |
|------|---------|
| `schema.prisma` | Single source of truth for database structure |
| `migrations/` | SQL migration history for version control |
| `seed.ts` | Script to populate database with test data |

**Key Commands:**
```bash
npx prisma migrate dev     # Create and apply migration
npx prisma generate        # Generate Prisma Client
npx prisma studio          # Database GUI
npx prisma db seed         # Run seed script
```

### `/server` - Backend API Layer

**Purpose:** All server-side code (API routes, utilities, middleware)

#### `/server/api` - API Routes

**Convention:** File structure maps to URL routes

Examples:
- `api/workouts/index.ts` → `/api/workouts` (GET, POST)
- `api/workouts/[id].ts` → `/api/workouts/:id` (GET, PUT, DELETE)
- `api/auth/[...].ts` → `/api/auth/*` (Catch-all for NuxtAuth)

**Route Handlers:**
```typescript
// server/api/workouts/index.ts
export default defineEventHandler(async (event) => {
  const userId = event.context.auth.userId
  const workouts = await prisma.workout.findMany({
    where: { userId }
  })
  return workouts
})
```

#### `/server/utils` - Server Utilities

**Purpose:** Reusable server-side functions

| File | Purpose |
|------|---------|
| `db.ts` | Exports configured Prisma client instance |
| `gemini.ts` | Wrapper for Google Gemini API calls |
| `intervals.ts` | Intervals.icu API client with auth |
| `whoop.ts` | Whoop API client with token refresh |
| `auth.ts` | Helper functions for authentication |

**Example:**
```typescript
// server/utils/db.ts
import { PrismaClient } from '@prisma/client'

const prismaClientSingleton = () => {
  return new PrismaClient()
}

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>
}

export const prisma = globalThis.prisma ?? prismaClientSingleton()

if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma
```

#### `/server/middleware` - Server Middleware

**Purpose:** Request interceptors and processors

| File | Purpose |
|------|---------|
| `auth.ts` | Verify JWT tokens, attach user to context |
| `ratelimit.ts` | Prevent API abuse with rate limiting |

### `/trigger` - Background Jobs

**Purpose:** Long-running tasks offloaded from main API

#### Job Types

1. **Data Ingestion:**
   - `ingest-intervals.ts` - Fetch workout data
   - `ingest-whoop.ts` - Fetch recovery data
   - `sync-calendar.ts` - Sync training plans

2. **AI Processing:**
   - `generate-weekly-report.ts` - Deep analysis (Gemini Pro)
   - `daily-coach.ts` - Quick suggestions (Gemini Flash)

**Job Structure:**
```typescript
// trigger/jobs/daily-coach.ts
import { client } from '../client'

export const dailyCoach = client.defineJob({
  id: 'daily-coach',
  name: 'Daily Coach Suggestion',
  version: '1.0.0',
  trigger: scheduleDay({ dayOfWeek: 'every' }),
  run: async (payload, io) => {
    // Job logic here
  }
})
```

### `/pages` - Frontend Pages

**Purpose:** File-based routing (each `.vue` file is a route)

| Route | File | Purpose |
|-------|------|---------|
| `/` | `index.vue` | Landing page |
| `/login` | `login.vue` | Authentication |
| `/dashboard` | `dashboard.vue` | Main app view |
| `/settings` | `settings.vue` | User preferences |
| `/reports` | `reports/index.vue` | Report list |
| `/reports/:id` | `reports/[id].vue` | Single report |
| `/workouts` | `workouts/index.vue` | Workout calendar |
| `/workouts/:id` | `workouts/[id].vue` | Workout details |

**Dynamic Routes:**
- `[id].vue` - Single parameter
- `[...slug].vue` - Catch-all route

### `/components` - Vue Components

**Purpose:** Reusable UI building blocks

**Organization Strategy:**
- Group by feature/domain (not by component type)
- Co-locate related components
- Use descriptive names

**Naming Convention:**
```
ComponentName.vue (PascalCase)
```

**Component Categories:**

1. **Feature Components:** `dashboard/`, `reports/`, `workouts/`
2. **Integration Components:** `integrations/`
3. **UI Components:** `ui/` (generic, reusable)
4. **Auth Components:** `auth/`

### `/composables` - Vue Composables

**Purpose:** Reusable stateful logic

**Convention:** Prefix with `use`

```typescript
// composables/useWorkouts.ts
export const useWorkouts = () => {
  const workouts = ref([])
  const loading = ref(false)
  
  const fetchWorkouts = async () => {
    loading.value = true
    const data = await $fetch('/api/workouts')
    workouts.value = data
    loading.value = false
  }
  
  return { workouts, loading, fetchWorkouts }
}
```

**Usage in Components:**
```vue
<script setup>
const { workouts, loading, fetchWorkouts } = useWorkouts()
onMounted(() => fetchWorkouts())
</script>
```

### `/layouts` - Page Layouts

**Purpose:** Wrapper templates for pages

| Layout | Purpose |
|--------|---------|
| `default.vue` | Standard app layout (header, footer) |
| `auth.vue` | Minimal layout for login/signup |
| `dashboard.vue` | Dashboard with sidebar navigation |

**Usage in Pages:**
```vue
<script setup>
definePageMeta({
  layout: 'dashboard'
})
</script>
```

### `/middleware` - Route Middleware

**Purpose:** Code that runs before route navigation

| Middleware | Purpose |
|------------|---------|
| `auth.ts` | Redirect to login if not authenticated |
| `guest.ts` | Redirect to dashboard if authenticated |

**Usage:**
```vue
<script setup>
definePageMeta({
  middleware: 'auth'
})
</script>
```

### `/types` - TypeScript Types

**Purpose:** Shared type definitions

**Organization:**
- One file per domain
- Export interfaces and types
- Use for API contracts

**Example:**
```typescript
// types/workout.ts
export interface Workout {
  id: string
  date: Date
  title: string
  durationSec: number
  tss: number
  // ...
}

export interface WorkoutFilters {
  startDate?: Date
  endDate?: Date
  type?: string
}
```

### `/utils` - Shared Utilities

**Purpose:** Pure functions usable anywhere (client or server)

| File | Purpose |
|------|---------|
| `formatters.ts` | Format dates, numbers, durations |
| `calculations.ts` | Calculate TSS, IF, W/kg, etc. |
| `validators.ts` | Validate user input |

**Example:**
```typescript
// utils/calculations.ts
export const calculateTSS = (
  normalizedPower: number,
  ftp: number,
  durationHours: number
): number => {
  const intensity = normalizedPower / ftp
  return Math.round(durationHours * intensity * intensity * 100)
}
```

### `/docs` - Documentation

**Purpose:** Project documentation for reference

| File | Purpose |
|------|---------|
| `README.md` | Documentation overview |
| `architecture.md` | System design and decisions |
| `database-schema.md` | Database structure details |
| `project-structure.md` | This file |
| `implementation-guide.md` | Step-by-step build guide |

## File Naming Conventions

### Backend (Server)

- **API Routes:** `kebab-case.ts`
  - Example: `generate-report.ts`

- **Utilities:** `camelCase.ts`
  - Example: `gemini.ts`, `intervals.ts`

### Frontend

- **Components:** `PascalCase.vue`
  - Example: `WorkoutCard.vue`

- **Pages:** `kebab-case.vue` or `[param].vue`
  - Example: `user-settings.vue`, `[id].vue`

- **Composables:** `useCamelCase.ts`
  - Example: `useWorkouts.ts`

### General

- **Config Files:** `kebab-case.ts`
  - Example: `nuxt.config.ts`, `tsconfig.json`

- **Types:** `kebab-case.ts`
  - Example: `workout-types.ts`

## Import Path Aliases

Nuxt provides automatic aliases:

```typescript
// Instead of: ../../../../utils/formatters
import { formatDate } from '~/utils/formatters'

// Instead of: ../../components/ui/Button
import Button from '~/components/ui/Button.vue'

// Server-side imports
import { prisma } from '~/server/utils/db'
```

**Available Aliases:**
- `~` or `@` - Project root
- `~~` or `@@` - Source directory
- `#app` - Nuxt app directory
- `#imports` - Auto-imported functions

## Development Workflow

### Starting Development

```bash
# Install dependencies
pnpm install

# Start database (Docker)
docker-compose up -d

# Run migrations
npx prisma migrate dev

# Start dev server
pnpm dev

# In another terminal, start Trigger.dev
pnpm trigger:dev
```

### Adding New Features

1. **Database Changes:**
   ```bash
   # Update prisma/schema.prisma
   npx prisma migrate dev --name add_feature
   ```

2. **API Endpoints:**
   - Create file in `server/api/`
   - Add route handler
   - Test with API client

3. **Frontend Components:**
   - Create component in appropriate folder
   - Use in pages
   - Style with Tailwind

4. **Background Jobs:**
   - Create job in `trigger/jobs/`
   - Register in Trigger.dev dashboard
   - Test job execution

### Testing Structure

```
tests/
├── unit/               # Unit tests
│   ├── utils/
│   └── components/
├── integration/        # Integration tests
│   └── api/
└── e2e/               # End-to-end tests
    └── flows/
```

## Build Output

### Development Build

```bash
pnpm dev
```

Output: `.nuxt/` directory (auto-generated, gitignored)

### Production Build

```bash
pnpm build
```

Output:
- `.output/` - Production build
  - `server/` - Server bundle
  - `public/` - Static assets

### Deployment

**Server:**
```bash
node .output/server/index.mjs
```

**Environment:**
- Set `DATABASE_URL`
- Set `NUXT_AUTH_SECRET`
- Set all API keys

## Configuration Files

### `nuxt.config.ts`

Main configuration file:

```typescript
export default defineNuxtConfig({
  modules: [
    '@nuxt/ui',
    '@sidebase/nuxt-auth'
  ],
  
  runtimeConfig: {
    // Server-only (private)
    geminiApiKey: process.env.GEMINI_API_KEY,
    
    public: {
      // Client-accessible
      apiBase: process.env.NUXT_PUBLIC_API_BASE
    }
  },
  
  // Other config...
})
```

### `tsconfig.json`

TypeScript configuration (auto-generated by Nuxt)

### `.env`

Environment variables (never commit!):

```env
# Database
DATABASE_URL="postgresql://..."

# Authentication
NUXT_AUTH_SECRET="random-secret"
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# External APIs
INTERVALS_CLIENT_ID="..."
WHOOP_CLIENT_ID="..."
GEMINI_API_KEY="..."

# Trigger.dev
TRIGGER_API_KEY="..."
TRIGGER_API_URL="..."
```

## Best Practices

### 1. File Organization

✅ **Do:**
- Group by feature/domain
- Keep related files close
- Use descriptive names

❌ **Don't:**
- Create deep nesting (>3 levels)
- Mix concerns in a single file
- Use generic names like `utils.ts`

### 2. Component Structure

✅ **Do:**
```vue
<script setup lang="ts">
// Imports
// Composables
// Props
// State
// Computed
// Methods
// Lifecycle hooks
</script>

<template>
  <!-- Template -->
</template>

<style scoped>
/* Scoped styles */
</style>
```

### 3. API Design

✅ **Do:**
- Use RESTful conventions
- Return consistent response format
- Handle errors gracefully

❌ **Don't:**
- Mix HTTP methods in single file
- Return different formats for same endpoint
- Expose sensitive data

### 4. Code Quality

- **TypeScript:** Use types everywhere
- **Linting:** Follow ESLint rules
- **Formatting:** Use Prettier
- **Comments:** Explain "why", not "what"

## Tools and Extensions

### Recommended VS Code Extensions

- Volar (Vue Language Features)
- Prisma
- ESLint
- Prettier
- Tailwind CSS IntelliSense
- TypeScript Vue Plugin

### Command Palette

```json
{
  "scripts": {
    "dev": "nuxt dev",
    "build": "nuxt build",
    "generate": "nuxt generate",
    "preview": "nuxt preview",
    "postinstall": "nuxt prepare",
    "lint": "eslint .",
    "format": "prettier --write .",
    "prisma:studio": "npx prisma studio",
    "prisma:migrate": "npx prisma migrate dev",
    "trigger:dev": "npx trigger.dev@latest dev"
  }
}
```

## Conclusion

This project structure is designed for:
- **Scalability:** Easy to add new features
- **Maintainability:** Clear separation of concerns
- **Developer Experience:** Intuitive organization
- **Type Safety:** TypeScript throughout
- **Performance:** Optimized build and runtime

Follow these conventions to maintain consistency as the project grows.