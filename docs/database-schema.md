# Coach Watts - Database Schema

## Overview

The database schema is designed to support a multi-source fitness coaching application with AI-generated insights. It uses PostgreSQL as the database and Prisma as the ORM.

## Schema Design Principles

1. **Separation of Concerns:** Authentication (NuxtAuth tables) separate from business logic
2. **Data Normalization:** Unified format for data from multiple sources
3. **Extensibility:** Easy to add new integration providers
4. **Type Safety:** Leverages Prisma for compile-time type checking
5. **Performance:** Strategic indexes on frequently queried fields

## Complete Schema

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// --------------------------------------
// User & Auth (NuxtAuth / NextAuth Standard)
// --------------------------------------

model User {
  id            String    @id @default(uuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // Settings for Coaching
  ftp           Int?      // Functional Threshold Power (Watts)
  maxHr         Int?      // Max Heart Rate
  weight        Float?    // Weight in kg (for W/kg calcs)
  dob           DateTime? // Date of birth for age-based metrics

  // Relations
  accounts      Account[]
  sessions      Session[]
  integrations  Integration[] // External App Connections (Whoop, Intervals)
  workouts      Workout[]
  dailyMetrics  DailyMetric[]
  reports       Report[]
}

model Account {
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([provider, providerAccountId])
}

model Session {
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model VerificationToken {
  identifier String
  token      String
  expires    DateTime

  @@id([identifier, token])
}

// --------------------------------------
// App Integrations (The "Senses")
// --------------------------------------

// Stores tokens for external fitness apps (Intervals.icu, Whoop, Strava)
// Distinct from 'Account' which is for Login/SSO
model Integration {
  id             String    @id @default(uuid())
  userId         String
  provider       String    // "intervals", "whoop", "strava", "garmin"
  
  // Auth Data
  accessToken    String
  refreshToken   String?
  expiresAt      DateTime?
  externalUserId String?   // The user's ID in the external system
  scope          String?   // What permissions we have

  // Sync Status
  lastSyncAt     DateTime?
  syncStatus     String?   // "SUCCESS", "FAILED", "SYNCING"
  errorMessage   String?

  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, provider])
}

// --------------------------------------
// Normalized Fitness Data
// --------------------------------------

// A unified structure for workouts from any provider
model Workout {
  id              String   @id @default(uuid())
  userId          String
  externalId      String   // ID from the source (e.g., Strava Activity ID)
  source          String   // "intervals", "strava"
  
  // Core Data
  date            DateTime
  title           String
  description     String?  @db.Text
  type            String?  // "Ride", "Run", "WeightTraining"

  // Performance Metrics
  durationSec     Int
  distanceMeters  Float?
  elevationGain   Int?
  
  // Power & Heart Rate
  averageWatts    Int?
  maxWatts        Int?
  normalizedPower Int?
  averageHr       Int?
  maxHr           Int?
  
  // Training Load
  tss             Float?   // Training Stress Score
  if              Float?   // Intensity Factor
  kilojoules      Int?
  
  // Raw Data storage (optional, for re-analysis)
  rawJson         Json?    // Store the original full payload if needed

  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, date])
  @@unique([userId, source, externalId]) // Prevent duplicates
}

// Normalized Daily Health Data (Recovery, Sleep)
model DailyMetric {
  id             String   @id @default(uuid())
  userId         String
  date           DateTime @db.Date // YYYY-MM-DD
  source         String   // "whoop", "garmin", "oura"

  // Heart & Recovery
  hrv            Float?   // rMSSD (ms)
  restingHr      Int?
  
  // Sleep
  sleepScore     Int?     // 0-100
  hoursSlept     Float?
  
  // Proprietary Scores (Normalized)
  recoveryScore  Int?     // 0-100 (Whoop style)
  strainScore    Float?   // 0-21 (Whoop style) or similar
  
  spO2           Float?

  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, date])
}

// --------------------------------------
// AI Agent Outputs
// --------------------------------------

model Report {
  id             String   @id @default(uuid())
  userId         String
  type           String   // "WEEKLY_ANALYSIS", "RACE_PREP", "DAILY_SUGGESTION"
  status         String   // "PENDING", "PROCESSING", "COMPLETED", "FAILED"
  
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  
  // Metadata
  dateRangeStart DateTime
  dateRangeEnd   DateTime
  modelVersion   String?  // e.g., "gemini-2.5-pro"
  
  // Content
  markdown       String?  @db.Text
  latex          String?  @db.Text // If we generated a formal document
  pdfUrl         String?  // URL to stored PDF in S3/Blob storage
  
  // Structured Suggestions (for the "Coach" agent)
  suggestions    Json?    // e.g., { "action": "rest", "reason": "HRV low" }

  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

## Table Details

### User Table

**Purpose:** Central user profile and authentication anchor

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `email` | String | Unique email (required for auth) |
| `name` | String? | Display name |
| `image` | String? | Profile picture URL |
| `emailVerified` | DateTime? | Email verification timestamp |
| `ftp` | Int? | Functional Threshold Power in watts |
| `maxHr` | Int? | Maximum heart rate |
| `weight` | Float? | Weight in kg for power/weight calculations |
| `dob` | DateTime? | Date of birth for age-graded metrics |

**Coaching Settings:**
- FTP, maxHr, weight, dob are used for personalized training zones
- These can be auto-updated from integration data or manually set

**Relationships:**
- Has many: Accounts (OAuth providers)
- Has many: Sessions (active login sessions)
- Has many: Integrations (Whoop, Intervals, etc.)
- Has many: Workouts (training activities)
- Has many: DailyMetrics (recovery data)
- Has many: Reports (AI-generated insights)

### Account Table

**Purpose:** NuxtAuth/NextAuth standard OAuth connections

| Field | Type | Description |
|-------|------|-------------|
| `provider` | String | OAuth provider (google, github, etc.) |
| `providerAccountId` | String | User's ID in the provider system |
| `access_token` | String? | OAuth access token |
| `refresh_token` | String? | OAuth refresh token |
| `expires_at` | Int? | Token expiration timestamp |

**Composite Primary Key:** `[provider, providerAccountId]`

**Important:** This is for SSO authentication, NOT for fitness app integrations

### Session Table

**Purpose:** Active login sessions

| Field | Type | Description |
|-------|------|-------------|
| `sessionToken` | String | Unique session identifier |
| `userId` | String | Reference to User |
| `expires` | DateTime | Session expiration |

**Security:** Sessions expire and must be refreshed

### Integration Table

**Purpose:** External fitness app OAuth connections and sync status

| Field | Type | Description |
|-------|------|-------------|
| `provider` | String | "intervals", "whoop", "strava", "garmin" |
| `accessToken` | String | API access token (encrypted) |
| `refreshToken` | String? | Token refresh capability |
| `expiresAt` | DateTime? | Token expiration |
| `externalUserId` | String? | User's ID in external system |
| `lastSyncAt` | DateTime? | Last successful data sync |
| `syncStatus` | String? | "SUCCESS", "FAILED", "SYNCING" |
| `errorMessage` | String? | Details if sync failed |

**Unique Constraint:** `[userId, provider]` - One connection per provider per user

**Security Consideration:**
- Access tokens should be encrypted at rest
- Consider using a secrets manager for production
- Implement token refresh logic before expiration

### Workout Table

**Purpose:** Normalized training activity data from multiple sources

| Field | Type | Description |
|-------|------|-------------|
| `externalId` | String | Source system's activity ID |
| `source` | String | "intervals", "strava", "garmin" |
| `date` | DateTime | Activity start time |
| `title` | String | Activity name |
| `type` | String? | "Ride", "Run", "WeightTraining" |
| `durationSec` | Int | Duration in seconds |
| `distanceMeters` | Float? | Distance covered |
| `averageWatts` | Int? | Average power output |
| `normalizedPower` | Int? | NP (weighted average) |
| `tss` | Float? | Training Stress Score |
| `if` | Float? | Intensity Factor (NP/FTP) |
| `rawJson` | Json? | Original API response |

**Unique Constraint:** `[userId, source, externalId]` - Prevents duplicate imports

**Index:** `[userId, date]` - Optimizes time-range queries

**Key Metrics:**
- **TSS (Training Stress Score):** Quantifies training load
- **IF (Intensity Factor):** Measures workout intensity relative to FTP
- **Normalized Power:** Better indicator than average power for variable efforts

### DailyMetric Table

**Purpose:** Daily health and recovery data

| Field | Type | Description |
|-------|------|-------------|
| `date` | Date | Calendar date (YYYY-MM-DD) |
| `source` | String | "whoop", "garmin", "oura" |
| `hrv` | Float? | Heart Rate Variability (rMSSD in ms) |
| `restingHr` | Int? | Resting heart rate |
| `sleepScore` | Int? | 0-100 sleep quality score |
| `hoursSlept` | Float? | Total sleep duration |
| `recoveryScore` | Int? | 0-100 recovery readiness |
| `strainScore` | Float? | 0-21 daily strain |
| `spO2` | Float? | Blood oxygen saturation |

**Unique Constraint:** `[userId, date]` - One record per day per user

**Note:** If multiple sources provide data for the same day, use the most reliable source (priority: Whoop > Garmin > Oura for recovery)

### Report Table

**Purpose:** AI-generated coaching insights and recommendations

| Field | Type | Description |
|-------|------|-------------|
| `type` | String | Report category |
| `status` | String | Processing state |
| `dateRangeStart` | DateTime | Analysis period start |
| `dateRangeEnd` | DateTime | Analysis period end |
| `modelVersion` | String? | AI model used |
| `markdown` | Text? | Report in Markdown format |
| `latex` | Text? | Report in LaTeX format |
| `pdfUrl` | String? | Link to generated PDF |
| `suggestions` | Json? | Structured recommendations |

**Report Types:**
- `WEEKLY_ANALYSIS`: Comprehensive weekly review
- `RACE_PREP`: Pre-race taper analysis
- `DAILY_SUGGESTION`: Morning coaching brief
- `CUSTOM`: User-requested analysis

**Status Flow:**
```
PENDING → PROCESSING → COMPLETED
                    ↓
                  FAILED
```

**Suggestions JSON Structure:**
```json
{
  "action": "reduce_intensity",
  "reason": "HRV below baseline for 3 consecutive days",
  "confidence": 0.85,
  "alternatives": ["rest_day", "active_recovery"]
}
```

## Indexes and Performance

### Critical Indexes

1. **Workout Queries:**
   ```prisma
   @@index([userId, date])
   ```
   - Optimizes time-range queries for analysis
   - Most common query pattern: "workouts in last 30 days"

2. **Unique Constraints:**
   ```prisma
   @@unique([userId, source, externalId])
   @@unique([userId, date])
   @@unique([userId, provider])
   ```
   - Prevents data duplication
   - Ensures data integrity

### Query Patterns

**Common Queries:**

1. Get recent workouts:
```typescript
await prisma.workout.findMany({
  where: {
    userId,
    date: {
      gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    }
  },
  orderBy: { date: 'desc' }
})
```

2. Get daily metrics for date range:
```typescript
await prisma.dailyMetric.findMany({
  where: {
    userId,
    date: {
      gte: startDate,
      lte: endDate
    }
  },
  orderBy: { date: 'asc' }
})
```

3. Get user with all integrations:
```typescript
await prisma.user.findUnique({
  where: { id: userId },
  include: {
    integrations: true,
    workouts: {
      take: 10,
      orderBy: { date: 'desc' }
    }
  }
})
```

## Data Integrity Rules

### Cascade Deletion

All user-related data is deleted when user is deleted:
```prisma
onDelete: Cascade
```

**Affected Tables:**
- Accounts
- Sessions
- Integrations
- Workouts
- DailyMetrics
- Reports

### Data Validation

**Application Level:**
- FTP must be > 0 and < 500 watts (realistic range)
- Weight must be > 30 and < 200 kg
- Recovery scores: 0-100
- HRV: positive values only
- Dates: not in future (for historical data)

**Database Level:**
- NOT NULL constraints on critical fields
- UNIQUE constraints prevent duplicates
- Foreign key constraints ensure referential integrity

## Migration Strategy

### Initial Setup

```bash
# Initialize Prisma
npx prisma init

# Create first migration
npx prisma migrate dev --name init_schema

# Generate Prisma Client
npx prisma generate
```

### Future Migrations

**Adding a field:**
```bash
npx prisma migrate dev --name add_vo2max_to_user
```

**Changing a field:**
```bash
npx prisma migrate dev --name make_ftp_required
```

**Best Practices:**
- Always test migrations in development first
- Backup production database before applying
- Use descriptive migration names
- Review generated SQL before applying

## Security Considerations

### Sensitive Data

**Access Tokens:**
- Should be encrypted at rest
- Consider using Prisma field-level encryption
- Alternative: Store in secrets manager (AWS Secrets Manager, Vault)

**User Data:**
- Implement Row-Level Security (RLS) in production
- Never expose tokens in API responses
- Use environment variables for database connection

### Access Control

**Prisma Middleware:**
```typescript
prisma.$use(async (params, next) => {
  if (params.model === 'Workout') {
    // Always filter by userId
    if (!params.args.where?.userId) {
      throw new Error('userId required')
    }
  }
  return next(params)
})
```

## Backup and Recovery

### Recommended Strategy

1. **Automated Backups:**
   - Daily full backups
   - Point-in-time recovery enabled
   - 30-day retention period

2. **Backup Verification:**
   - Weekly restore tests
   - Automated backup integrity checks

3. **Disaster Recovery:**
   - Cross-region replication
   - Documented recovery procedures
   - RTO: 4 hours, RPO: 1 hour

## Future Schema Enhancements

### Planned Additions

1. **Race/Event Tracking:**
```prisma
model Race {
  id          String   @id @default(uuid())
  userId      String
  name        String
  date        DateTime
  distance    Float
  targetPower Int?
  result      Json?
}
```

2. **Training Plans:**
```prisma
model TrainingPlan {
  id          String   @id @default(uuid())
  userId      String
  name        String
  startDate   DateTime
  endDate     DateTime
  weeks       Json     // Structured plan data
}
```

3. **Social Features:**
```prisma
model Following {
  followerId  String
  followingId String
  createdAt   DateTime @default(now())
  
  @@id([followerId, followingId])
}
```

## Environment Variables

Required for database connection:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/coach_watts?schema=public"
DIRECT_URL="postgresql://user:password@localhost:5432/coach_watts?schema=public"
```

**Note:** `DIRECT_URL` is needed for migrations when using connection poolers like PgBouncer.