import './init'
import { logger, task, batch } from '@trigger.dev/sdk/v3'
import { prisma } from '../server/utils/db'
import { ingestStravaTask } from './ingest-strava'
import { ingestWhoopTask } from './ingest-whoop'
import { ingestOuraTask } from './ingest-oura'
import { ingestWithingsTask } from './ingest-withings'
import { ingestIntervalsTask } from './ingest-intervals'
import { ingestYazioTask } from './ingest-yazio'
import { ingestFitbitTask } from './ingest-fitbit'
import { ingestHevyTask } from './ingest-hevy'
import { ingestPolarTask } from './ingest-polar'
import { generateAthleteProfileTask } from './generate-athlete-profile'
import { processSyncQueueTask } from './process-sync-queue'
import { deduplicateWorkoutsTask } from './deduplicate-workouts'
import { recommendTodayActivityTask } from './recommend-today-activity'
import { analyzeNutritionTask } from './analyze-nutrition'
import { getUserTimezone, getUserLocalDate } from '../server/utils/date'
import { getUserAiSettings } from '../server/utils/ai-settings'
import { auditLogRepository } from '../server/utils/repositories/auditLogRepository'
import type { IngestionResult } from './types'

export const ingestAllTask = task({
  id: 'ingest-all',
  maxDuration: 3600, // 1 hour to allow for sequential sub-tasks
  run: async (payload: { userId: string; startDate: string; endDate: string }) => {
    const { userId, startDate, endDate } = payload

    logger.log('='.repeat(60))
    logger.log('🔄 BATCH INGESTION STARTING')
    logger.log('='.repeat(60))
    logger.log(`User ID: ${userId}`)
    logger.log(`Date Range: ${startDate} to ${endDate}`)
    logger.log('')

    // 1. Flush Sync Queue (Push pending changes to Intervals.icu)
    // We do this first so external systems are up-to-date before we fetch from them.
    try {
      logger.log('📤 Triggering Sync Queue Processing (Push)...')
      await processSyncQueueTask.trigger({})
      logger.log('✅ Sync Queue flushed')
    } catch (error) {
      logger.warn('⚠️ Failed to trigger sync queue processing', { error })
    }

    // Fetch all active integrations for the user
    const integrations = await prisma.integration.findMany({
      where: {
        userId
      }
    })

    if (integrations.length === 0) {
      logger.log('⚠️  No integrations found for user')
      return {
        success: true,
        message: 'No integrations to sync',
        results: []
      }
    }

    logger.log(`Found ${integrations.length} integration(s):`)
    integrations.forEach((integration) => {
      logger.log(
        `  • ${integration.provider} (last sync: ${integration.lastSyncAt ? integration.lastSyncAt.toISOString() : 'never'})`
      )
    })
    logger.log('')

    // Build task triggers based on available integrations
    const tasksTrigger = []

    for (const integration of integrations) {
      const taskPayload = { userId, startDate, endDate }

      switch (integration.provider) {
        case 'strava':
          tasksTrigger.push({
            task: ingestStravaTask,
            payload: taskPayload
          })
          break
        case 'whoop':
          tasksTrigger.push({
            task: ingestWhoopTask,
            payload: taskPayload
          })
          break
        case 'oura':
          tasksTrigger.push({
            task: ingestOuraTask,
            payload: taskPayload
          })
          break
        case 'withings':
          tasksTrigger.push({
            task: ingestWithingsTask,
            payload: taskPayload
          })
          break
        case 'intervals':
          tasksTrigger.push({
            task: ingestIntervalsTask,
            payload: taskPayload
          })
          break
        case 'yazio':
          tasksTrigger.push({
            task: ingestYazioTask,
            payload: taskPayload
          })
          break
        case 'fitbit':
          tasksTrigger.push({
            task: ingestFitbitTask,
            payload: taskPayload
          })
          break
        case 'hevy':
          tasksTrigger.push({
            task: ingestHevyTask,
            payload: { userId, fullSync: false }
          })
          break
        case 'polar':
          tasksTrigger.push({
            task: ingestPolarTask,
            payload: { userId }
          })
          break
        default:
          logger.warn(`Unknown provider: ${integration.provider}`)
      }
    }

    if (tasksTrigger.length === 0) {
      logger.log('⚠️  No supported integrations to sync')
      return {
        success: true,
        message: 'No supported integrations found',
        results: []
      }
    }

    logger.log(`🚀 Triggering ${tasksTrigger.length} ingestion task(s) sequentially...`)
    logger.log('')

    // Trigger all tasks sequentially to avoid BatchTriggerError in production
    const results = []
    const anyDataUpdated = false
    let newWorkoutsIngested = false
    let yazioUpdated = false
    let anyWellnessUpdated = false

    for (const item of tasksTrigger) {
      const integration = integrations.find((i) => {
        if (item.task.id === 'ingest-strava' && i.provider === 'strava') return true
        if (item.task.id === 'ingest-whoop' && i.provider === 'whoop') return true
        if (item.task.id === 'ingest-oura' && i.provider === 'oura') return true
        if (item.task.id === 'ingest-withings' && i.provider === 'withings') return true
        if (item.task.id === 'ingest-intervals' && i.provider === 'intervals') return true
        if (item.task.id === 'ingest-yazio' && i.provider === 'yazio') return true
        if (item.task.id === 'ingest-fitbit' && i.provider === 'fitbit') return true
        if (item.task.id === ingestHevyTask.id && i.provider === 'hevy') return true
        if (item.task.id === ingestPolarTask.id && i.provider === 'polar') return true
        return false
      })

      logger.log(`Starting ingestion for ${integration?.provider || item.task.id}...`)

      try {
        const run = await (item.task as any).triggerAndWait(item.payload as any, {
          concurrencyKey: userId
        })

        if (run.ok) {
          logger.log(`✅ ${integration?.provider || item.task.id}: SUCCESS`)
          // logger.log(`   ${JSON.stringify(run.output, null, 2)}`)

          const output = run.output as IngestionResult
          const counts = output.counts || {}

          console.log(`[DEBUG] ${integration?.provider} results:`, JSON.stringify(counts))

          // Track if any meaningful data was updated to trigger profile generation
          const workoutsCount = counts.workouts || counts.activity || 0
          const wellnessCount = counts.wellness || 0
          const sleepCount = counts.sleep || 0
          const plannedCount = counts.plannedWorkouts || 0
          const eventCount = counts.events || 0
          const nutritionCount = counts.nutrition || 0

          if (workoutsCount > 0) {
            console.log(
              `[DEBUG] ${integration?.provider} added ${workoutsCount} NEW workouts. Setting newWorkoutsIngested = true`
            )
            newWorkoutsIngested = true
          }

          if (wellnessCount > 0 || sleepCount > 0) {
            console.log(
              `[DEBUG] ${integration?.provider} added NEW health data (wellness: ${wellnessCount}, sleep: ${sleepCount}). (Triggering readiness check later)`
            )
            anyWellnessUpdated = true
          }

          if (item.task.id === 'ingest-yazio' && nutritionCount > 0) {
            console.log(
              `[DEBUG] ${integration?.provider} added NEW nutrition data (${nutritionCount}). (Triggering nutrition analysis later)`
            )
            yazioUpdated = true
          }

          if (plannedCount > 0 || eventCount > 0) {
            console.log(
              `[DEBUG] ${integration?.provider} added ${plannedCount} planned workouts and ${eventCount} events.`
            )
          }

          // Check specifically for wellness updates for readiness check
          if (wellnessCount > 0 || sleepCount > 0) {
            anyWellnessUpdated = true
          }

          // Check specifically for Yazio updates for nutrition analysis
          if (item.task.id === 'ingest-yazio' && nutritionCount > 0) {
            yazioUpdated = true
          }

          results.push({
            provider: integration?.provider || item.task.id,
            status: 'success',
            data: run.output
          })
        } else {
          logger.error(`❌ ${integration?.provider || item.task.id}: FAILED`)
          logger.error(`   Error: ${run.error}`)

          results.push({
            provider: integration?.provider || item.task.id,
            status: 'failed',
            error: run.error
          })
        }
      } catch (error) {
        logger.error(`❌ ${integration?.provider || item.task.id}: CRITICAL ERROR`)
        logger.error(`   Error: ${error}`)

        results.push({
          provider: integration?.provider || item.task.id,
          status: 'failed',
          error
        })
      }
    }

    logger.log('='.repeat(60))
    logger.log('📊 BATCH INGESTION RESULTS')
    logger.log('='.repeat(60))

    const successCount = results.filter((r) => r.status === 'success').length
    const failedCount = results.filter((r) => r.status === 'failed').length

    console.log(
      `[DEBUG] Final Sync Summary - newWorkoutsIngested: ${newWorkoutsIngested}, anyWellnessUpdated: ${anyWellnessUpdated}, yazioUpdated: ${yazioUpdated}`
    )

    logger.log('')
    logger.log('Summary:')
    logger.log(`  ✅ Successful: ${successCount}`)
    logger.log(`  ❌ Failed: ${failedCount}`)
    logger.log(`  📊 Total: ${results.length}`)
    logger.log(`  🏃 New Workouts: ${newWorkoutsIngested}`)
    logger.log('='.repeat(60))

    // CHAIN: Deduplicate Workouts (Autonomously)
    if (newWorkoutsIngested) {
      console.log('[DEBUG] Triggering Workout Deduplication chain...')
      logger.log('🔄 Chaining: Triggering Workout Deduplication...')
      try {
        await deduplicateWorkoutsTask.trigger(
          {
            userId,
            dryRun: false
          },
          {
            concurrencyKey: userId,
            tags: [`user:${userId}`]
          }
        )
        logger.log('✅ Triggered deduplicate-workouts')
      } catch (err) {
        logger.error('❌ Failed to chain deduplicate-workouts', { err })
      }
    }

    // CHAIN: Trigger Athlete Profile Generation
    if (newWorkoutsIngested) {
      console.log('[DEBUG] Triggering Athlete Profile Generation chain...')
      logger.log('🔄 Chaining: Triggering Athlete Profile Generation...')
      try {
        // Create a placeholder report
        const report = await prisma.report.create({
          data: {
            userId,
            type: 'ATHLETE_PROFILE',
            status: 'QUEUED',
            dateRangeStart: new Date(startDate),
            dateRangeEnd: new Date(endDate)
          }
        })

        await generateAthleteProfileTask.trigger(
          {
            userId,
            reportId: report.id,
            triggerRecommendation: true // Always true here since we only enter if newWorkoutsIngested is true
          },
          {
            concurrencyKey: userId,
            tags: [`user:${userId}`]
          }
        )
        logger.log('✅ Triggered generate-athlete-profile')
      } catch (err) {
        logger.error('❌ Failed to chain generate-athlete-profile', { err })
      }
    } else {
      console.log('[DEBUG] Skipping Athlete Profile Generation: No new workouts.')
      logger.log('ℹ️ Skipping Athlete Profile Generation: No new workouts found.')
    }

    // CHAIN: Auto-Analyze Nutrition (if updated)
    if (yazioUpdated) {
      try {
        const aiSettings = await getUserAiSettings(userId)
        if (aiSettings.aiAutoAnalyzeNutrition) {
          logger.log('🤖 [Auto-Analyze] Nutrition updated: Checking for unanalyzed records...')
          // Find unanalyzed nutrition records in the date range
          const unanalyzedNutrition = await prisma.nutrition.findMany({
            where: {
              userId,
              date: {
                gte: new Date(startDate),
                lte: new Date(endDate)
              },
              aiAnalysisStatus: 'NOT_STARTED'
            },
            select: { id: true, date: true }
          })

          if (unanalyzedNutrition.length > 0) {
            logger.log(
              `🤖 [Auto-Analyze] Found ${unanalyzedNutrition.length} unanalyzed nutrition records. Triggering analysis...`
            )
            for (const record of unanalyzedNutrition) {
              await analyzeNutritionTask.trigger({ nutritionId: record.id })
              // Log the action
              await auditLogRepository.log({
                userId,
                action: 'AUTO_ANALYZE_NUTRITION',
                resourceType: 'Nutrition',
                resourceId: record.id,
                metadata: { date: record.date.toISOString() }
              })
            }
          }
        }
      } catch (err) {
        logger.error('❌ [Auto-Analyze] Failed to trigger nutrition analysis', { err })
      }
    }

    // CHAIN: Check Readiness (if wellness updated)
    if (anyWellnessUpdated) {
      try {
        const aiSettings = await getUserAiSettings(userId)
        if (aiSettings.aiAutoAnalyzeReadiness) {
          logger.log('🤖 [Auto-Analyze] Wellness updated: Checking readiness...')
          const timezone = await getUserTimezone(userId)
          const todayLocal = getUserLocalDate(timezone)

          await recommendTodayActivityTask.trigger(
            {
              userId,
              date: todayLocal
            },
            {
              concurrencyKey: userId,
              tags: [`user:${userId}`]
            }
          )
          logger.log('🤖 [Auto-Analyze] ✅ Triggered recommend-today-activity (Readiness Check)')

          // Log the action
          await auditLogRepository.log({
            userId,
            action: 'AUTO_ANALYZE_READINESS',
            resourceType: 'ActivityRecommendation',
            metadata: { date: todayLocal.toISOString() }
          })
        }
      } catch (err) {
        logger.error('❌ [Auto-Analyze] Failed to trigger readiness check', { err })
      }
    }

    return {
      success: failedCount === 0,
      successCount,
      failedCount,
      total: results.length,
      results,
      userId,
      startDate,
      endDate
    }
  }
})
