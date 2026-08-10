import './init'
import { logger, task } from '@trigger.dev/sdk/v3'
import { generateStructuredAnalysis } from '../server/utils/gemini'
import { prisma } from '../server/utils/db'
import { attachStreamToWorkout } from '../server/utils/repositories/workoutStreamRepository'
import { workoutRepository } from '../server/utils/repositories/workoutRepository'
import { sportSettingsRepository } from '../server/utils/repositories/sportSettingsRepository'
import { userAnalysisQueue } from './queues'
import {
  getUserTimezone,
  formatUserDate,
  calculateAge,
  getUserLocalDate
} from '../server/utils/date'
import { getUserAiSettings } from '../server/utils/ai-user-settings'
import { checkQuota } from '../server/utils/quotas/engine'
import { publishWorkoutSummaryToIntervals } from '../server/utils/services/workout-summary-publish'
import { queueWorkoutInsightEmail } from '../server/utils/workout-insight-email'
import { createUserNotification } from '../server/utils/notifications'
import { thresholdDetectionService } from '../server/utils/services/thresholdDetectionService'
import { pbDetectionService } from '../server/utils/services/pbDetectionService'
import { isWorkoutEligibleForAutomaticInsights } from '../server/utils/automatic-workout-insights'
import { buildWorkoutAnalysisFactsV2 } from '../server/utils/workout-analysis-facts'
import {
  buildWorkoutAnalysisData,
  buildWorkoutAnalysisPrompt
} from '../server/utils/services/workout-analysis-prompt'

// The payload/prompt builders live in the shared module so this task and the
// Redis-worker service (server/utils/services/workoutAnalysisService.ts) cannot
// drift apart again (CW-392). Re-exported here for backwards compatibility with
// existing importers of this module.
export {
  buildAnalysisFactsPromptBlock,
  buildAnalysisGuardrailInstructions,
  buildWorkoutAnalysisData,
  buildWorkoutAnalysisPrompt,
  getAnalysisSectionsGuidance,
  getWorkoutTypeGuidance,
  normalizeRunningCadence
} from '../server/utils/services/workout-analysis-prompt'

// TypeScript interface for the structured analysis
interface StructuredAnalysis {
  type: string
  title: string
  date?: string
  executive_summary: string
  sections?: Array<{
    title: string
    status: string
    status_label?: string
    analysis_points: string[]
  }>
  recommendations?: Array<{
    title: string
    description: string
    priority?: string
  }>
  strengths?: string[]
  weaknesses?: string[]
  scores?: {
    overall: number
    overall_explanation: string
    technical: number
    technical_explanation: string
    effort: number
    effort_explanation: string
    pacing: number
    pacing_explanation: string
    execution: number
    execution_explanation: string
  }
  metrics_summary?: {
    avg_power?: number
    ftp?: number
    intensity?: number
    duration_minutes?: number
    tss?: number
  }
}

// Flexible analysis schema that works for workouts, reports, planning, etc.
export const analysisSchema = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      description: 'Type of analysis: workout, weekly_report, planning, etc.',
      enum: ['workout', 'weekly_report', 'planning', 'comparison']
    },
    title: {
      type: 'string',
      description: 'Title of the analysis'
    },
    date: {
      type: 'string',
      description: 'Date or date range of the analysis'
    },
    executive_summary: {
      type: 'string',
      description: '2-3 sentence high-level summary of key findings'
    },
    sections: {
      type: 'array',
      description: 'Analysis sections with status and points',
      items: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Section title (e.g., Pacing Strategy, Power Application)'
          },
          status: {
            type: 'string',
            description: 'Overall assessment',
            enum: ['excellent', 'good', 'moderate', 'needs_improvement', 'poor']
          },
          status_label: {
            type: 'string',
            description: 'Display label for status'
          },
          analysis_points: {
            type: 'array',
            description: 'Detailed analysis points for this section',
            items: {
              type: 'string'
            }
          }
        },
        required: ['title', 'status', 'analysis_points']
      }
    },
    recommendations: {
      type: 'array',
      description: 'Actionable recommendations',
      items: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Recommendation title'
          },
          description: {
            type: 'string',
            description: 'Detailed recommendation'
          },
          priority: {
            type: 'string',
            description: 'Priority level',
            enum: ['high', 'medium', 'low']
          }
        },
        required: ['title', 'description']
      }
    },
    strengths: {
      type: 'array',
      description: 'Key strengths identified',
      items: {
        type: 'string'
      }
    },
    weaknesses: {
      type: 'array',
      description: 'Areas needing improvement',
      items: {
        type: 'string'
      }
    },
    scores: {
      type: 'object',
      description:
        'Performance scores on 1-10 scale for tracking over time, with detailed explanations',
      properties: {
        overall: {
          type: 'number',
          description: 'Overall workout quality (1-10)',
          minimum: 1,
          maximum: 10
        },
        overall_explanation: {
          type: 'string',
          description:
            'Detailed explanation of overall quality: key factors contributing to score, what went well, what could improve, and 2-3 specific actionable improvements'
        },
        technical: {
          type: 'number',
          description: 'Technical execution score - form, technique, efficiency (1-10)',
          minimum: 1,
          maximum: 10
        },
        technical_explanation: {
          type: 'string',
          description:
            'Technical analysis: power application smoothness, cadence consistency, form observations, and specific technique improvements needed'
        },
        effort: {
          type: 'number',
          description: 'Effort appropriateness relative to plan and goals (1-10)',
          minimum: 1,
          maximum: 10
        },
        effort_explanation: {
          type: 'string',
          description:
            'Effort management analysis: whether intensity matched goals, HR/power relationship, and recommendations for effort control'
        },
        pacing: {
          type: 'number',
          description: 'Pacing strategy and execution quality (1-10)',
          minimum: 1,
          maximum: 10
        },
        pacing_explanation: {
          type: 'string',
          description:
            'Pacing strategy analysis: consistency throughout workout, whether pacing was appropriate, and specific pacing improvements'
        },
        execution: {
          type: 'number',
          description: 'How well the workout plan was executed (1-10)',
          minimum: 1,
          maximum: 10
        },
        execution_explanation: {
          type: 'string',
          description:
            'Execution quality analysis: adherence to workout structure, target achievement, and recommendations for better execution'
        }
      },
      required: [
        'overall',
        'overall_explanation',
        'technical',
        'technical_explanation',
        'effort',
        'effort_explanation',
        'pacing',
        'pacing_explanation',
        'execution',
        'execution_explanation'
      ]
    },
    metrics_summary: {
      type: 'object',
      description: 'Key metrics at a glance',
      properties: {
        avg_power: { type: 'number' },
        ftp: { type: 'number' },
        intensity: { type: 'number' },
        duration_minutes: { type: 'number' },
        tss: { type: 'number' }
      }
    }
  },
  required: ['type', 'title', 'executive_summary', 'sections', 'scores']
}

export const analyzeWorkoutTask = task({
  id: 'analyze-workout',
  maxDuration: 300, // 5 minutes for AI processing
  queue: userAnalysisQueue,
  run: async (payload: { workoutId: string; source?: 'AUTOMATIC' | 'MANUAL' }) => {
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
                orderBy: {
                  order: 'asc'
                }
              }
            },
            orderBy: {
              order: 'asc'
            }
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

      // Fetch user and email preferences
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

      // 1. Skip only if workout is on a future local calendar day.
      // Be forgiving with time components to avoid timezone false positives.
      if (workoutLocalDate > todayLocalDate) {
        logger.log('Skipping workout analysis for future date', {
          workoutId,
          date: workout.date,
          today,
          workoutLocalDate,
          todayLocalDate,
          timezone
        })
        await workoutRepository.updateStatus(workoutId, 'NOT_STARTED')
        return { success: true, skipped: true, reason: 'FUTURE_DATE' }
      }

      // Logic Check: If AUTOMATIC, ensure aiAutoAnalyzeWorkouts is enabled
      if (source === 'AUTOMATIC' && !user?.aiAutoAnalyzeWorkouts) {
        logger.log('EXIT: Auto-analyze workouts disabled for user.')
        return { success: true, skipped: true, reason: 'AUTO_ANALYZE_DISABLED' }
      }

      if (source === 'AUTOMATIC' && !isWorkoutEligibleForAutomaticInsights(workout.type)) {
        logger.log('Skipping automatic workout analysis for unsupported type', {
          workoutId,
          type: workout.type
        })
        await workoutRepository.updateStatus(workoutId, 'SKIPPED_UNSUPPORTED_TYPE')
        return { success: true, skipped: true, reason: 'UNSUPPORTED_TYPE' }
      }

      // 2. Check for data presence (duration, distance, watts, HR, or exercises)
      const hasData =
        (workout.durationSec || 0) > 0 ||
        (workout.distanceMeters || 0) > 0 ||
        (workout.averageWatts || 0) > 0 ||
        (workout.averageHr || 0) > 0 ||
        (Array.isArray(workout.streams?.watts) && workout.streams.watts.length > 0) ||
        (Array.isArray(workout.streams?.heartrate) && workout.streams.heartrate.length > 0) ||
        (workout.exercises && workout.exercises.length > 0)

      if (!hasData) {
        logger.log('Skipping workout analysis for empty session', {
          workoutId,
          date: workout.date
        })
        await workoutRepository.updateStatus(workoutId, 'SKIPPED_EMPTY')
        return { success: true, skipped: true, reason: 'EMPTY_SESSION' }
      }

      // Check Quota
      try {
        await checkQuota(workout.userId, 'workout_analysis')
      } catch (quotaError: any) {
        if (quotaError.statusCode === 429) {
          logger.warn('Workout analysis quota exceeded', { userId: workout.userId, workoutId })
          await workoutRepository.updateStatus(workoutId, 'QUOTA_EXCEEDED')
          return { success: false, reason: 'QUOTA_EXCEEDED' }
        }
        throw quotaError
      }

      // Update workout status to PROCESSING
      await workoutRepository.updateStatus(workoutId, 'PROCESSING')

      logger.log('Workout data fetched', {
        workoutId,
        title: workout.title,
        date: workout.date,
        plannedWorkoutId: workout.plannedWorkoutId
      })

      const aiSettings = await getUserAiSettings(workout.userId)
      const userAge = calculateAge(user?.dob)

      // Fetch Sport Specific Settings
      const sportSettings = await sportSettingsRepository.getForActivityType(
        workout.userId,
        workout.type || ''
      )

      logger.log('Using AI settings', {
        model: aiSettings.aiModelPreference,
        persona: aiSettings.aiPersona
      })

      // Build comprehensive workout data for analysis
      const workoutData = buildWorkoutAnalysisData(workout)
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

      // Generate the prompt
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

      logger.log(`Generating structured analysis with Gemini (${aiSettings.aiModelPreference})`)

      // Generate structured JSON analysis
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

      // Also generate markdown for fallback/export
      const markdownAnalysis = convertStructuredToMarkdown(structuredAnalysis)

      logger.log('Analysis generated successfully', {
        sections: structuredAnalysis.sections?.length || 0,
        recommendations: structuredAnalysis.recommendations?.length || 0,
        scores: structuredAnalysis.scores
      })

      // Clamp 1-10 (and normalize 0-100 style values) so DB check constraints hold.
      const clampScore = (val?: number | null) => {
        if (typeof val !== 'number' || Number.isNaN(val)) return null
        const num = val > 10 ? val / 10 : val
        return Math.min(10, Math.max(1, Math.round(num)))
      }

      // Save both formats to the database, including scores and explanations
      await workoutRepository.update(workoutId, {
        aiAnalysis: markdownAnalysis,
        aiAnalysisJson: structuredAnalysis as any,
        aiAnalysisStatus: 'COMPLETED',
        aiAnalyzedAt: new Date(),
        // Store scores for easy querying and tracking
        overallScore: clampScore(structuredAnalysis.scores?.overall),
        technicalScore: clampScore(structuredAnalysis.scores?.technical),
        effortScore: clampScore(structuredAnalysis.scores?.effort),
        pacingScore: clampScore(structuredAnalysis.scores?.pacing),
        executionScore: clampScore(structuredAnalysis.scores?.execution),
        // Store explanations for user guidance
        overallQualityExplanation: structuredAnalysis.scores?.overall_explanation,
        technicalExecutionExplanation: structuredAnalysis.scores?.technical_explanation,
        effortManagementExplanation: structuredAnalysis.scores?.effort_explanation,
        pacingStrategyExplanation: structuredAnalysis.scores?.pacing_explanation,
        executionConsistencyExplanation: structuredAnalysis.scores?.execution_explanation
      })

      logger.log('Analysis saved to database')

      // NEW: Detect threshold increases
      try {
        await thresholdDetectionService.detectThresholdIncreases(workoutId)
      } catch (thresholdError) {
        logger.warn('Threshold detection failed', { workoutId, error: thresholdError })
      }

      // NEW: Detect Personal Bests
      try {
        await pbDetectionService.detectPBs(workoutId)
      } catch (pbError) {
        logger.warn('PB detection failed', { workoutId, error: pbError })
      }

      if (source === 'AUTOMATIC') {
        try {
          await createUserNotification(workout.userId, {
            title: 'Workout Analysis Ready',
            message: `Your workout "${workout.title || 'Untitled workout'}" has a new AI analysis.`,
            icon: 'i-heroicons-chart-bar-square',
            link: `/activities/${workoutId}`
          })
        } catch (notificationError) {
          logger.warn('Failed to create workout analysis notification', {
            workoutId,
            userId: workout.userId,
            error: notificationError
          })
        }
      }

      try {
        const publishResult = await publishWorkoutSummaryToIntervals(workoutId, workout.userId)
        if (publishResult.published) {
          logger.log('Published AI summary to Intervals.icu notes', { workoutId })
        } else {
          logger.log('Skipped auto-publishing AI summary', {
            workoutId,
            reason: publishResult.reason
          })
        }
      } catch (publishError) {
        logger.warn('Auto-publish to Intervals.icu notes failed', {
          workoutId,
          error: publishError
        })
      }

      // Trigger enriched workout insight email after AI analysis.
      if (
        source === 'AUTOMATIC' &&
        emailPrefs &&
        emailPrefs.workoutAnalysis &&
        !emailPrefs.globalUnsubscribe
      ) {
        logger.log('Triggering enriched workout insight email')
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

          const emailResult = await queueWorkoutInsightEmail({
            workoutId,
            triggerType: 'on-analysis-ready',
            overallScore: structuredAnalysis.scores?.overall,
            analysisSummary: structuredAnalysis.executive_summary,
            recommendationHighlights,
            adherenceSummary,
            adherenceScore
          })
          logger.log('Workout insight email decision (analysis-ready)', {
            workoutId,
            emailResult
          })
        } catch (emailError) {
          logger.warn('Failed to trigger workout analysis email', { workoutId, error: emailError })
        }
      } else {
        logger.log('Skipping email trigger: source or preferences disallow analysis-ready email.', {
          source,
          userId: workout.userId,
          hasEmailPreferenceRow: Boolean(emailPrefs),
          globalUnsubscribe: Boolean(emailPrefs?.globalUnsubscribe),
          workoutAnalysisEnabled: emailPrefs?.workoutAnalysis ?? null
        })
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
})

// Convert structured analysis to markdown for fallback/export
export function convertStructuredToMarkdown(analysis: any): string {
  let markdown = `# ${analysis.title}\n\n`

  if (analysis.date) {
    markdown += `Date: ${analysis.date}\n\n`
  }

  markdown += `## Executive Summary\n${analysis.executive_summary}\n\n`

  // Sections
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

  // Recommendations
  if (analysis.recommendations && analysis.recommendations.length > 0) {
    markdown += `## Recommendations\n`
    for (const rec of analysis.recommendations) {
      markdown += `### ${rec.title}\n`
      markdown += `${rec.description}\n\n`
    }
  }

  // Strengths & Weaknesses
  if (analysis.strengths || analysis.weaknesses) {
    markdown += `## Strengths & Weaknesses\n`

    if (analysis.strengths && analysis.strengths.length > 0) {
      markdown += `### Strengths\n`
      for (const strength of analysis.strengths) {
        markdown += `- ${strength}\n`
      }
      markdown += '\n'
    }

    if (analysis.weaknesses && analysis.weaknesses.length > 0) {
      markdown += `### Weaknesses\n`
      for (const weakness of analysis.weaknesses) {
        markdown += `- ${weakness}\n`
      }
    }
  }

  return markdown
}
