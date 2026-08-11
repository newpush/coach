import { generateStructuredAnalysis } from '../gemini'
import { prisma } from '../db'
import { attachStreamToWorkout } from '../repositories/workoutStreamRepository'
import { workoutRepository } from '../repositories/workoutRepository'
import { sportSettingsRepository } from '../repositories/sportSettingsRepository'
import { getUserTimezone, formatUserDate, calculateAge, getUserLocalDate } from '../date'
import { getUserAiSettings } from '../ai-user-settings'
import { checkQuota } from '../quotas/engine'
import { publishWorkoutSummaryToIntervals } from './workout-summary-publish'
import { queueWorkoutInsightEmail } from '../workout-insight-email'
import { createUserNotification } from '../notifications'
import { thresholdDetectionService } from './thresholdDetectionService'
import { pbDetectionService } from './pbDetectionService'
import { isWorkoutEligibleForAutomaticInsights } from '../automatic-workout-insights'
import { buildWorkoutAnalysisFactsV2 } from '../workout-analysis-facts'
import {
  analysisSchema,
  buildWorkoutAnalysisData,
  buildWorkoutAnalysisPrompt,
  clampAnalysisScore,
  type StructuredAnalysis
} from './workout-analysis-prompt'
import { registerTaskHandler } from '../task-registry'

// NOTE: the payload/prompt builders now live in ./workout-analysis-prompt so this
// service and the Trigger.dev task (trigger/analyze-workout.ts) cannot drift apart
// again (CW-392). The response schema, the StructuredAnalysis type and the score
// clamp moved there too (CW-403) -- the two schema copies had drifted onto different
// score scales and different section-status enums, and this file was handing Gemini
// an enum the UI colour mappers do not understand.
//
// None of them are re-exported from here: everything under server/utils is Nitro
// auto-imported, and re-exporting would register the same symbol twice and trigger
// "Duplicated imports" warnings. Import them from
// server/utils/services/workout-analysis-prompt instead.

const logger = console

export function convertWorkoutAnalysisToMarkdown(analysis: any): string {
  let markdown = `# ${analysis.title}\n\n`

  if (analysis.date) {
    markdown += `Date: ${analysis.date}\n\n`
  }

  if (analysis.executive_summary) {
    markdown += `## Executive Summary\n${analysis.executive_summary}\n\n`
  }

  if (analysis.sections) {
    for (const section of analysis.sections) {
      markdown += `## ${section.title}\n`
      markdown += `**Status**: ${section.status_label || section.status}\n`
      if (section.analysis_points && section.analysis_points.length > 0) {
        for (const point of section.analysis_points) {
          markdown += `- ${point}\n`
        }
      }
      markdown += '\n'
    }
  }

  if (analysis.recommendations && analysis.recommendations.length > 0) {
    markdown += `## Recommendations\n`
    for (const rec of analysis.recommendations) {
      markdown += `### ${rec.title}\n`
      markdown += `${rec.description}\n\n`
    }
  }

  return markdown
}

export async function runWorkoutAnalysis(payload: {
  workoutId: string
  source?: 'AUTOMATIC' | 'MANUAL'
}) {
  const { workoutId, source = 'MANUAL' } = payload

  logger.log('Starting workout analysis', { workoutId, source })

  try {
    const workoutRecord = await prisma.workout.findUnique({
      where: { id: workoutId },
      include: {
        exercises: {
          include: {
            exercise: true,
            sets: {
              orderBy: { order: 'asc' }
            }
          },
          orderBy: { order: 'asc' }
        },
        plannedWorkout: true
      }
    })

    if (!workoutRecord) {
      throw new Error('Workout not found')
    }

    const workout = await attachStreamToWorkout(workoutRecord)
    const timezone = await getUserTimezone(workout.userId)
    const today = getUserLocalDate(timezone)
    const todayLocalDate = formatUserDate(new Date(), timezone, 'yyyy-MM-dd')
    const workoutLocalDate = formatUserDate(workout.date, timezone, 'yyyy-MM-dd')

    const [user, emailPrefs, recentJourneyEvents] = await Promise.all([
      prisma.user.findUnique({
        where: { id: workout.userId },
        select: {
          dob: true,
          sex: true,
          weight: true,
          weightUnits: true,
          height: true,
          heightUnits: true,
          language: true,
          temperatureUnits: true,
          distanceUnits: true,
          aiAutoAnalyzeWorkouts: true
        }
      }),
      prisma.emailPreference.findUnique({
        where: { userId_channel: { userId: workout.userId, channel: 'EMAIL' } }
      }),
      prisma.athleteJourneyEvent.findMany({
        where: {
          userId: workout.userId,
          timestamp: {
            gte: new Date(workout.date.getTime() - 14 * 24 * 60 * 60 * 1000),
            lte: new Date(workout.date.getTime() + 24 * 60 * 60 * 1000)
          }
        },
        orderBy: { timestamp: 'desc' },
        take: 5,
        select: {
          timestamp: true,
          category: true,
          severity: true,
          description: true
        }
      })
    ])

    if (workoutLocalDate > todayLocalDate) {
      await workoutRepository.updateStatus(workoutId, 'NOT_STARTED')
      return { success: true, skipped: true, reason: 'FUTURE_DATE' }
    }

    if (source === 'AUTOMATIC' && !user?.aiAutoAnalyzeWorkouts) {
      return { success: true, skipped: true, reason: 'AUTO_ANALYZE_DISABLED' }
    }

    if (source === 'AUTOMATIC' && !isWorkoutEligibleForAutomaticInsights(workout.type)) {
      await workoutRepository.updateStatus(workoutId, 'SKIPPED_UNSUPPORTED_TYPE')
      return { success: true, skipped: true, reason: 'UNSUPPORTED_TYPE' }
    }

    const hasData =
      (workout.durationSec || 0) > 0 ||
      (workout.distanceMeters || 0) > 0 ||
      (workout.averageWatts || 0) > 0 ||
      (workout.averageHr || 0) > 0 ||
      (Array.isArray(workout.streams?.watts) && workout.streams.watts.length > 0) ||
      (Array.isArray(workout.streams?.heartrate) && workout.streams.heartrate.length > 0) ||
      (workout.exercises && workout.exercises.length > 0)

    if (!hasData) {
      await workoutRepository.updateStatus(workoutId, 'SKIPPED_EMPTY')
      return { success: true, skipped: true, reason: 'EMPTY_SESSION' }
    }

    try {
      await checkQuota(workout.userId, 'workout_analysis')
    } catch (quotaError: any) {
      if (quotaError.statusCode === 429) {
        await workoutRepository.updateStatus(workoutId, 'QUOTA_EXCEEDED')
        return { success: false, reason: 'QUOTA_EXCEEDED' }
      }
      throw quotaError
    }

    await workoutRepository.updateStatus(workoutId, 'PROCESSING')

    const aiSettings = await getUserAiSettings(workout.userId)
    const userAge = calculateAge(user?.dob)

    const sportSettings = await sportSettingsRepository.getForActivityType(
      workout.userId,
      workout.type || ''
    )

    // Plan + sport settings so the payload's interval segmentation is arbitrated
    // against the same athlete references as the v2 facts below (CW-391).
    const workoutData = buildWorkoutAnalysisData(workout, {
      plannedWorkout: workout.plannedWorkout,
      sportSettings
    })
    const analysisFactsV2 = buildWorkoutAnalysisFactsV2({
      workout,
      sportSettings,
      plannedWorkout: workout.plannedWorkout,
      userProfile: {
        weight: user?.weight || null,
        weightUnits: user?.weightUnits || null,
        language: user?.language || null
      }
    })

    const prompt = buildWorkoutAnalysisPrompt(
      workoutData,
      timezone,
      aiSettings.aiPersona,
      sportSettings,
      {
        age: userAge,
        sex: user?.sex || null,
        weight: user?.weight || null,
        weightUnits: user?.weightUnits || null,
        height: user?.height || null,
        heightUnits: user?.heightUnits || null,
        language: user?.language || null,
        temperatureUnits: user?.temperatureUnits || null,
        distanceUnits: user?.distanceUnits || null
      },
      aiSettings.aiContext,
      workout.plannedWorkout,
      analysisFactsV2,
      {
        symptoms: recentJourneyEvents.map((event) => ({
          timestamp: event.timestamp,
          category: event.category,
          severity: event.severity,
          description: event.description
        }))
      }
    )

    const structuredAnalysis = await generateStructuredAnalysis<StructuredAnalysis>(
      prompt,
      analysisSchema,
      aiSettings.aiModelPreference,
      {
        userId: workout.userId,
        operation: 'workout_analysis',
        entityType: 'Workout',
        entityId: workout.id
      }
    )

    const markdownAnalysis = convertWorkoutAnalysisToMarkdown(structuredAnalysis)

    await workoutRepository.update(workoutId, {
      aiAnalysis: markdownAnalysis,
      aiAnalysisJson: structuredAnalysis as any,
      aiAnalysisStatus: 'COMPLETED',
      aiAnalyzedAt: new Date(),
      overallScore: clampAnalysisScore(structuredAnalysis.scores?.overall),
      technicalScore: clampAnalysisScore(structuredAnalysis.scores?.technical),
      effortScore: clampAnalysisScore(structuredAnalysis.scores?.effort),
      pacingScore: clampAnalysisScore(structuredAnalysis.scores?.pacing),
      executionScore: clampAnalysisScore(structuredAnalysis.scores?.execution),
      overallQualityExplanation: structuredAnalysis.scores?.overall_explanation,
      technicalExecutionExplanation: structuredAnalysis.scores?.technical_explanation,
      effortManagementExplanation: structuredAnalysis.scores?.effort_explanation,
      pacingStrategyExplanation: structuredAnalysis.scores?.pacing_explanation,
      executionConsistencyExplanation: structuredAnalysis.scores?.execution_explanation
    })

    try {
      await thresholdDetectionService.detectThresholdIncreases(workoutId)
    } catch {
      // ignore error
    }

    try {
      await pbDetectionService.detectPBs(workoutId)
    } catch {
      // ignore error
    }

    if (source === 'AUTOMATIC') {
      try {
        await createUserNotification(workout.userId, {
          title: 'Workout Analysis Ready',
          message: `Your workout "${workout.title || 'Untitled workout'}" has a new AI analysis.`,
          icon: 'i-heroicons-chart-bar-square',
          link: `/activities/${workoutId}`
        })
      } catch {
        // ignore notification error
      }
    }

    try {
      await publishWorkoutSummaryToIntervals(workoutId, workout.userId)
    } catch {
      // ignore publishing error
    }

    if (
      source === 'AUTOMATIC' &&
      emailPrefs &&
      emailPrefs.workoutAnalysis &&
      !emailPrefs.globalUnsubscribe
    ) {
      try {
        const planAdherence = await prisma.planAdherence.findUnique({
          where: { workoutId },
          select: { overallScore: true, summary: true, analysisStatus: true }
        })

        const recommendationHighlights = (structuredAnalysis.recommendations || [])
          .slice(0, 3)
          .map((rec) => {
            if (rec.title && rec.description) return `${rec.title}: ${rec.description}`
            return rec.title || rec.description
          })
          .filter((value): value is string => Boolean(value))

        const adherenceSummary =
          planAdherence?.analysisStatus === 'COMPLETED'
            ? planAdherence.summary || undefined
            : undefined
        const adherenceScore =
          planAdherence?.analysisStatus === 'COMPLETED'
            ? planAdherence.overallScore || undefined
            : undefined

        await queueWorkoutInsightEmail({
          workoutId,
          triggerType: 'on-analysis-ready',
          overallScore: structuredAnalysis.scores?.overall,
          analysisSummary: structuredAnalysis.executive_summary,
          recommendationHighlights,
          adherenceSummary,
          adherenceScore
        })
      } catch {
        // ignore email queuing error
      }
    }

    return {
      success: true,
      workoutId,
      analysisLength: markdownAnalysis.length,
      sectionsCount: structuredAnalysis.sections?.length || 0
    }
  } catch (error) {
    logger.error('Error generating workout analysis', { error })
    await workoutRepository.updateStatus(workoutId, 'FAILED')
    throw error
  }
}

// Automatically register task handler for Redis worker execution
registerTaskHandler('analyze-workout', runWorkoutAnalysis)
