import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import fs from 'fs'

const pool = new pg.Pool({
  connectionString: 'postgresql://coach:3JXkrGaUZURywjZk@185.112.156.142:4426/coach'
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// Minimal schema definition to check against
// This is manually extracted from prisma/schema.prisma to avoid parsing complexity
const expectedSchema: Record<string, string[]> = {
  User: [
    'id',
    'name',
    'email',
    'emailVerified',
    'image',
    'createdAt',
    'updatedAt',
    'ftp',
    'maxHr',
    'weight',
    'dob',
    'language',
    'weightUnits',
    'height',
    'heightUnits',
    'distanceUnits',
    'temperatureUnits',
    'restingHr',
    'form',
    'visibility',
    'sex',
    'city',
    'state',
    'country',
    'timezone',
    'hrZones',
    'powerZones',
    'aiPersona',
    'aiModelPreference',
    'aiAutoAnalyzeWorkouts',
    'aiAutoAnalyzeNutrition',
    'currentFitnessScore',
    'recoveryCapacityScore',
    'nutritionComplianceScore',
    'trainingConsistencyScore',
    'profileLastUpdated',
    'currentFitnessExplanation',
    'recoveryCapacityExplanation',
    'nutritionComplianceExplanation',
    'trainingConsistencyExplanation',
    'currentFitnessExplanationJson',
    'recoveryCapacityExplanationJson',
    'nutritionComplianceExplanationJson',
    'trainingConsistencyExplanationJson'
  ],
  CoachingRelationship: [
    'id',
    'coachId',
    'athleteId',
    'status',
    'permissions',
    'createdAt',
    'updatedAt'
  ],
  CoachingInvite: [
    'id',
    'athleteId',
    'code',
    'expiresAt',
    'usedBy',
    'status',
    'createdAt',
    'updatedAt'
  ],
  Goal: [
    'id',
    'userId',
    'type',
    'title',
    'description',
    'metric',
    'currentValue',
    'targetValue',
    'startValue',
    'targetDate',
    'eventDate',
    'eventType',
    'status',
    'priority',
    'aiContext',
    'createdAt',
    'updatedAt'
  ],
  Account: [
    'userId',
    'type',
    'provider',
    'providerAccountId',
    'refresh_token',
    'access_token',
    'expires_at',
    'token_type',
    'scope',
    'id_token',
    'session_state',
    'createdAt',
    'updatedAt'
  ],
  Session: ['sessionToken', 'userId', 'expires', 'createdAt', 'updatedAt'],
  VerificationToken: ['identifier', 'token', 'expires'],
  Integration: [
    'id',
    'userId',
    'provider',
    'accessToken',
    'refreshToken',
    'expiresAt',
    'externalUserId',
    'scope',
    'lastSyncAt',
    'initialSyncCompleted',
    'syncStatus',
    'errorMessage'
  ],
  Workout: [
    'id',
    'userId',
    'externalId',
    'source',
    'date',
    'title',
    'description',
    'type',
    'durationSec',
    'distanceMeters',
    'elevationGain',
    'averageWatts',
    'maxWatts',
    'normalizedPower',
    'weightedAvgWatts',
    'averageHr',
    'maxHr',
    'averageCadence',
    'maxCadence',
    'averageSpeed',
    'tss',
    'trainingLoad',
    'intensity',
    'kilojoules',
    'trimp',
    'ftp',
    'variabilityIndex',
    'powerHrRatio',
    'efficiencyFactor',
    'decoupling',
    'polarizationIndex',
    'ctl',
    'atl',
    'rpe',
    'sessionRpe',
    'feel',
    'avgTemp',
    'trainer',
    'lrBalance',
    'calories',
    'elapsedTimeSec',
    'deviceName',
    'commute',
    'isPrivate',
    'gearId',
    'aiAnalysis',
    'aiAnalysisJson',
    'aiAnalysisStatus',
    'aiAnalyzedAt',
    'overallScore',
    'technicalScore',
    'effortScore',
    'pacingScore',
    'executionScore',
    'overallQualityExplanation',
    'technicalExecutionExplanation',
    'effortManagementExplanation',
    'pacingStrategyExplanation',
    'executionConsistencyExplanation',
    'rawJson',
    'notes',
    'notesUpdatedAt',
    'shareToken',
    'isDuplicate',
    'duplicateOf',
    'completenessScore',
    'plannedWorkoutId',
    'createdAt',
    'updatedAt'
  ],
  WorkoutStream: [
    'id',
    'workoutId',
    'time',
    'distance',
    'velocity',
    'heartrate',
    'cadence',
    'watts',
    'altitude',
    'latlng',
    'grade',
    'moving',
    'avgPacePerKm',
    'paceVariability',
    'lapSplits',
    'paceZones',
    'pacingStrategy',
    'surges',
    'createdAt',
    'updatedAt'
  ],
  PlannedWorkout: [
    'id',
    'userId',
    'externalId',
    'date',
    'title',
    'description',
    'type',
    'category',
    'durationSec',
    'distanceMeters',
    'tss',
    'workIntensity',
    'completed',
    'syncStatus',
    'lastSyncedAt',
    'syncError',
    'modifiedLocally',
    'rawJson',
    'shareToken',
    'createdAt',
    'updatedAt'
  ],
  DailyMetric: [
    'id',
    'userId',
    'date',
    'source',
    'hrv',
    'restingHr',
    'sleepScore',
    'hoursSlept',
    'recoveryScore',
    'strainScore',
    'spO2'
  ],
  Wellness: [
    'id',
    'userId',
    'date',
    'hrv',
    'hrvSdnn',
    'restingHr',
    'avgSleepingHr',
    'sleepSecs',
    'sleepHours',
    'sleepScore',
    'sleepQuality',
    'readiness',
    'recoveryScore',
    'soreness',
    'fatigue',
    'stress',
    'mood',
    'motivation',
    'weight',
    'spO2',
    'ctl',
    'atl',
    'comments',
    'rawJson',
    'createdAt',
    'updatedAt'
  ],
  Nutrition: [
    'id',
    'userId',
    'date',
    'calories',
    'protein',
    'carbs',
    'fat',
    'fiber',
    'sugar',
    'breakfast',
    'lunch',
    'dinner',
    'snacks',
    'caloriesGoal',
    'proteinGoal',
    'carbsGoal',
    'fatGoal',
    'waterMl',
    'aiAnalysis',
    'aiAnalysisJson',
    'aiAnalysisStatus',
    'aiAnalyzedAt',
    'overallScore',
    'macroBalanceScore',
    'qualityScore',
    'adherenceScore',
    'hydrationScore',
    'nutritionalBalanceExplanation',
    'calorieAdherenceExplanation',
    'macroDistributionExplanation',
    'hydrationStatusExplanation',
    'timingOptimizationExplanation',
    'rawJson',
    'notes',
    'notesUpdatedAt',
    'createdAt',
    'updatedAt'
  ],
  YazioProductCache: [
    'id',
    'productId',
    'name',
    'brand',
    'baseUnit',
    'nutrients',
    'fetchedAt',
    'expiresAt',
    'createdAt',
    'updatedAt'
  ],
  Report: [
    'id',
    'userId',
    'type',
    'status',
    'createdAt',
    'updatedAt',
    'dateRangeStart',
    'dateRangeEnd',
    'modelVersion',
    'markdown',
    'analysisJson',
    'latex',
    'pdfUrl',
    'overallScore',
    'trainingLoadScore',
    'recoveryScore',
    'progressScore',
    'consistencyScore',
    'trainingLoadExplanation',
    'recoveryBalanceExplanation',
    'progressTrendExplanation',
    'adaptationReadinessExplanation',
    'injuryRiskExplanation',
    'suggestions'
  ],
  ReportWorkout: ['id', 'reportId', 'workoutId', 'createdAt'],
  ReportNutrition: ['id', 'reportId', 'nutritionId', 'createdAt'],
  ActivityRecommendation: [
    'id',
    'userId',
    'date',
    'recommendation',
    'confidence',
    'reasoning',
    'analysisJson',
    'plannedWorkoutId',
    'status',
    'modelVersion',
    'userAccepted',
    'userModified',
    'appliedToIntervals',
    'createdAt',
    'updatedAt'
  ],
  TrainingAvailability: [
    'id',
    'userId',
    'dayOfWeek',
    'morning',
    'afternoon',
    'evening',
    'preferredTypes',
    'indoorOnly',
    'outdoorOnly',
    'gymAccess',
    'bikeAccess',
    'notes',
    'createdAt',
    'updatedAt'
  ],
  WeeklyTrainingPlan: [
    'id',
    'userId',
    'weekStartDate',
    'weekEndDate',
    'daysPlanned',
    'status',
    'generatedBy',
    'modelVersion',
    'planJson',
    'totalTSS',
    'totalDuration',
    'workoutCount',
    'userAccepted',
    'userModified',
    'appliedToIntervals',
    'notes',
    'adjustmentReason',
    'createdAt',
    'updatedAt'
  ],
  ScoreTrendExplanation: [
    'id',
    'userId',
    'type',
    'period',
    'metric',
    'score',
    'analysisData',
    'generatedAt',
    'expiresAt',
    'createdAt',
    'updatedAt'
  ],
  ChatRoom: ['id', 'name', 'avatar', 'createdAt', 'updatedAt'],
  ChatParticipant: ['id', 'userId', 'roomId', 'lastSeen'],
  ChatMessage: [
    'id',
    'content',
    'roomId',
    'senderId',
    'files',
    'replyToId',
    'seen',
    'metadata',
    'createdAt',
    'updatedAt'
  ],
  SyncQueue: [
    'id',
    'userId',
    'entityType',
    'entityId',
    'operation',
    'payload',
    'status',
    'attempts',
    'lastAttempt',
    'error',
    'completedAt',
    'createdAt',
    'updatedAt'
  ],
  LlmUsage: [
    'id',
    'userId',
    'provider',
    'model',
    'modelType',
    'operation',
    'entityType',
    'entityId',
    'promptTokens',
    'completionTokens',
    'totalTokens',
    'estimatedCost',
    'durationMs',
    'retryCount',
    'success',
    'errorType',
    'errorMessage',
    'promptPreview',
    'responsePreview',
    'promptFull',
    'responseFull',
    'createdAt'
  ]
}

async function main() {
  console.log('Starting comprehensive schema drift check...')

  try {
    // Get all columns for all tables in production
    const prodColumns = (await prisma.$queryRaw`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns 
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position;
    `) as any[]

    // Group by table
    const prodSchema: Record<string, Set<string>> = {}
    for (const col of prodColumns) {
      if (!prodSchema[col.table_name]) {
        prodSchema[col.table_name] = new Set()
      }
      prodSchema[col.table_name].add(col.column_name)
    }

    // Compare
    const missingColumns: Record<string, string[]> = {}

    // Tables to create
    const missingTables = []

    for (const [table, expectedCols] of Object.entries(expectedSchema)) {
      if (!prodSchema[table]) {
        console.error(`CRITICAL: Table ${table} missing in production!`)
        missingTables.push(table)
        continue
      }

      const missing = expectedCols.filter((col) => !prodSchema[table].has(col))
      if (missing.length > 0) {
        missingColumns[table] = missing
        console.log(`Table ${table} is missing columns: ${missing.join(', ')}`)
      }
    }

    // Create Missing Tables
    if (missingTables.length > 0) {
      console.log('\n--- CREATING MISSING TABLES ---\n')

      if (missingTables.includes('CoachingRelationship')) {
        const sql = `
            CREATE TABLE "CoachingRelationship" (
                "id" TEXT NOT NULL,
                "coachId" TEXT NOT NULL,
                "athleteId" TEXT NOT NULL,
                "status" TEXT NOT NULL DEFAULT 'ACTIVE',
                "permissions" JSONB,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL,
                CONSTRAINT "CoachingRelationship_pkey" PRIMARY KEY ("id")
            );
            CREATE UNIQUE INDEX "CoachingRelationship_coachId_athleteId_key" ON "CoachingRelationship"("coachId", "athleteId");
            CREATE INDEX "CoachingRelationship_coachId_idx" ON "CoachingRelationship"("coachId");
            CREATE INDEX "CoachingRelationship_athleteId_idx" ON "CoachingRelationship"("athleteId");
            ALTER TABLE "CoachingRelationship" ADD CONSTRAINT "CoachingRelationship_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
            ALTER TABLE "CoachingRelationship" ADD CONSTRAINT "CoachingRelationship_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
            `
        console.log(sql)
        await prisma.$executeRawUnsafe(sql)
      }

      if (missingTables.includes('CoachingInvite')) {
        const sql = `
            CREATE TABLE "CoachingInvite" (
                "id" TEXT NOT NULL,
                "athleteId" TEXT NOT NULL,
                "code" TEXT NOT NULL,
                "expiresAt" TIMESTAMP(3) NOT NULL,
                "usedBy" TEXT,
                "status" TEXT NOT NULL DEFAULT 'PENDING',
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL,
                CONSTRAINT "CoachingInvite_pkey" PRIMARY KEY ("id")
            );
            CREATE UNIQUE INDEX "CoachingInvite_code_key" ON "CoachingInvite"("code");
            CREATE INDEX "CoachingInvite_code_idx" ON "CoachingInvite"("code");
            ALTER TABLE "CoachingInvite" ADD CONSTRAINT "CoachingInvite_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
            `
        console.log(sql)
        await prisma.$executeRawUnsafe(sql)
      }
    }

    // Generate Fix Script
    if (Object.keys(missingColumns).length > 0) {
      console.log('\n--- GENERATING FIX SCRIPT ---\n')

      for (const [table, cols] of Object.entries(missingColumns)) {
        for (const col of cols) {
          let sql = ''

          // Heuristic for types based on column name or schema knowledge
          // This is a simplified mapper, might need adjustment for specific fields
          if (col.endsWith('At'))
            sql = `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${col}" TIMESTAMP(3);`
          else if (col.endsWith('Id'))
            sql = `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${col}" TEXT;`
          else if (col.endsWith('Json'))
            sql = `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${col}" JSONB;`
          else if (
            col.startsWith('is') ||
            col.startsWith('has') ||
            col === 'completed' ||
            col === 'commute' ||
            col === 'trainer'
          )
            sql = `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${col}" BOOLEAN DEFAULT false;`
          else if (
            col.includes('Score') ||
            col.includes('Count') ||
            col.includes('Sec') ||
            col.includes('Watts') ||
            col.includes('Hr') ||
            col === 'calories' ||
            col === 'rpe'
          )
            sql = `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${col}" INTEGER;`
          else if (
            col === 'description' ||
            col === 'notes' ||
            col.endsWith('Explanation') ||
            col === 'aiAnalysis'
          )
            sql = `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${col}" TEXT;`
          else if (['metadata', 'rawJson', 'files', 'seen'].includes(col))
            sql = `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${col}" JSONB;`
          else sql = `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${col}" TEXT;` // Default to text

          console.log(sql)
          await prisma.$executeRawUnsafe(sql)
        }
      }
      console.log('\n--- FIXES APPLIED ---\n')
    } else {
      console.log('No missing columns found!')
    }
  } catch (error) {
    console.error('Error during inspection:', error)
  }
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
