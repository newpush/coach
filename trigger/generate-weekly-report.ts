import './init'
import { logger, task } from '@trigger.dev/sdk/v3'
import {
  generateStructuredAnalysis,
  buildWorkoutSummary,
  buildMetricsSummary
} from '../server/utils/gemini'
import { prisma } from '../server/utils/db'
import { workoutRepository } from '../server/utils/repositories/workoutRepository'
import { wellnessRepository } from '../server/utils/repositories/wellnessRepository'
import { userReportsQueue } from './queues'
import {
  getUserTimezone,
  getStartOfDaysAgoUTC,
  getEndOfDayUTC,
  formatUserDate,
  calculateAge
} from '../server/utils/date'
import { getUserAiSettings } from '../server/utils/ai-user-settings'
import { filterGoalsForContext } from '../server/utils/goal-context'
import {
  formatPromptWeight,
  formatPromptHeight,
  formatPromptDistance
} from '../server/utils/ai-prompt-format'
import { bodyMetricResolver } from '../server/utils/services/bodyMetricResolver'
import {
  buildReportAnalysisSchema,
  REPORT_SCORE_SCALE_TEXT
} from '../server/utils/services/report-analysis-schema'

/**
 * Analysis schema for structured JSON output.
 *
 * Built from the shared report builder so the section-status vocabulary and the
 * score bounds come from `ANALYSIS_SECTION_STATUSES` / `ANALYSIS_SCORE_MIN|MAX`
 * rather than from a literal that can drift from the prompt below (CW-425).
 * Only this report's copy is declared here.
 */
export const weeklyReportAnalysisSchema = buildReportAnalysisSchema({
  sectionTitleDescription: 'Section title (e.g., Training Load Analysis, Recovery Trends)',
  forbidParagraphBlocks: true,
  scores: {
    description: `Period performance scores on ${REPORT_SCORE_SCALE_TEXT} for tracking over time, with detailed explanations`,
    required: true,
    explanations: {
      overall:
        'Detailed explanation of overall assessment: key highlights from the period, major achievements or concerns, and 2-3 specific actions for next period',
      training_load:
        'Training load analysis: TSS trends, load appropriateness, fatigue vs fitness balance, and specific recommendations for load management',
      recovery:
        'Recovery analysis: HRV trends, sleep quality observations, recovery adequacy relative to training load, and specific recovery optimization strategies',
      progress:
        'Progress assessment: performance trends, adaptation signals, whether training is effective, and recommendations for continued progress',
      consistency:
        'Consistency analysis: adherence patterns, missed sessions analysis, consistency relative to plan, and strategies to improve adherence'
    }
  },
  metricsSummaryDescription: 'Key metrics across the period'
})

export const generateWeeklyReportTask = task({
  id: 'generate-weekly-report',
  maxDuration: 600, // 10 minutes for AI processing
  queue: userReportsQueue,
  run: async (payload: { userId: string; reportId: string }) => {
    const { userId, reportId } = payload

    logger.log('Starting weekly report generation', { userId, reportId })

    // Update report status
    await prisma.report.update({
      where: { id: reportId },
      data: { status: 'PROCESSING' }
    })

    try {
      // Calculate date range (last 7 days / previous week) based on user timezone
      const timezone = await getUserTimezone(userId)
      const startDate = getStartOfDaysAgoUTC(timezone, 7)
      const endDate = getEndOfDayUTC(timezone, new Date()) // End of "today" in local time

      logger.log('Fetching data', { startDate, endDate, timezone })

      // Fetch data (excluding duplicate workouts)
      const [workouts, metrics, user, rawActiveGoals] = await Promise.all([
        workoutRepository.getForUser(userId, {
          startDate,
          endDate,
          orderBy: { date: 'asc' },
          includeDuplicates: false
        }),
        wellnessRepository.getForUser(userId, {
          startDate,
          endDate,
          orderBy: { date: 'asc' }
        }),
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            ftp: true,
            weight: true,
            weightUnits: true,
            weightSourceMode: true,
            height: true,
            heightUnits: true,
            maxHr: true,
            language: true,
            distanceUnits: true
          }
        }),
        prisma.goal.findMany({
          where: {
            userId,
            status: 'ACTIVE'
          }
        })
      ])
      const activeGoals = filterGoalsForContext(rawActiveGoals, timezone, endDate)

      logger.log('Data fetched', {
        workoutsCount: workouts.length,
        metricsCount: metrics.length,
        activeGoals: activeGoals.length
      })

      if (workouts.length === 0) {
        logger.warn('No workout data available for analysis', { userId, startDate })

        await prisma.report.update({
          where: { id: reportId },
          data: { status: 'FAILED' }
        })

        return {
          success: false,
          reason: 'No workout data available for analysis'
        }
      }

      const aiSettings = await getUserAiSettings(userId)
      logger.log('Using AI settings', {
        model: aiSettings.aiModelPreference,
        persona: aiSettings.aiPersona
      })

      // Build goals context
      let goalsContext = ''
      if (activeGoals.length > 0) {
        goalsContext = `

CURRENT GOALS (for context):
${activeGoals
  .map((g) => {
    const daysToTarget = g.targetDate
      ? Math.ceil((new Date(g.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null
    const daysToEvent = g.eventDate
      ? Math.ceil((new Date(g.eventDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null

    let goalInfo = `- [${g.priority}] ${g.title} (${g.type})`
    if (g.description) goalInfo += ` - ${g.description}`
    if (g.metric && g.targetValue) {
      goalInfo += ` | Target: ${g.metric} = ${g.targetValue}`
      if (g.currentValue) goalInfo += ` (Current: ${g.currentValue})`
    }
    if (daysToTarget) goalInfo += ` | ${daysToTarget} days to target`
    if (daysToEvent) goalInfo += ` | Event in ${daysToEvent} days`

    return goalInfo
  })
  .join('\n')}
`
      }

      const effectiveWeight = await bodyMetricResolver.resolveEffectiveWeight(userId, {
        weight: user?.weight,
        weightSourceMode: user?.weightSourceMode,
        weightUnits: user?.weightUnits
      })

      // Build prompt for structured analysis
      const prompt = `You are a **${aiSettings.aiPersona}** expert cycling coach analyzing the previous week of training data (last 7 days).
Adapt your analysis tone and style to match your persona.
Preferred Language: ${user?.language || 'English'} (CRITICAL: ALL analysis, summaries, and recommendations MUST be written in this language)

USER PROFILE:
- FTP: ${user?.ftp || 'Unknown'} watts
- Weight: ${formatPromptWeight(effectiveWeight.value, user?.weightUnits)}
- Height: ${formatPromptHeight(user?.height, user?.heightUnits)}
- Max HR: ${user?.maxHr || 'Unknown'} bpm
- W/kg: ${user?.ftp && effectiveWeight.value ? (user.ftp / effectiveWeight.value).toFixed(2) : 'Unknown'}

WORKOUTS (Last 7 days):
${buildWorkoutSummary(workouts, undefined, user?.distanceUnits)}

DAILY METRICS (Recovery & Sleep):
${metrics.length > 0 ? buildMetricsSummary(metrics) : 'No recovery data available'}
${goalsContext}

ANALYSIS INSTRUCTIONS:
Create a comprehensive weekly training analysis with these sections:

1. **Training Load Analysis**: Analyze TSS distribution, intensity balance (easy/moderate/hard), and training load trends
2. **Recovery Trends**: Evaluate HRV patterns, sleep quality, and recovery adequacy relative to training stress
3. **Power Progression**: Assess improvements or regressions in power metrics and performance indicators
4. **Fatigue & Form**: Analyze training stress balance (CTL/ATL), freshness, and readiness

For each section:
- Provide a status assessment (excellent/good/moderate/needs_improvement/poor)
- List 3-5 specific, data-driven analysis points (each as a separate bullet, 1-2 sentences max)
- Reference actual numbers and metrics from the data
${activeGoals.length > 0 ? '- Consider progress toward active goals where relevant' : ''}

Then provide 3-5 prioritized recommendations with specific actions${activeGoals.length > 0 ? ' (including goal-related recommendations if applicable)' : ''}.

Finally, provide **Performance Scores** (1-10 scale for tracking progress over time):
- **Overall**: Holistic assessment of the training period quality
- **Training Load**: How well was training load managed and distributed?
- **Recovery**: Were recovery and adaptation adequate for the training stress?
- **Progress**: Evidence of improvement and positive adaptation
- **Consistency**: Training consistency and adherence to plan

Scoring Guidelines:
- 9-10: Exceptional period, elite-level execution
- 7-8: Strong period with minor areas to improve
- 5-6: Adequate but room for improvement
- 3-4: Needs work, several issues to address
- 1-2: Poor period, significant problems

Maintain your **${aiSettings.aiPersona}** persona throughout. Be specific with numbers. Scores should realistically reflect the period's quality.`

      logger.log(`Generating structured report with Gemini (${aiSettings.aiModelPreference})`)

      // Generate structured analysis
      const analysisJson = await generateStructuredAnalysis<any>(
        prompt,
        weeklyReportAnalysisSchema,
        aiSettings.aiModelPreference,
        {
          userId,
          operation: 'weekly_report_generation',
          entityType: 'Report',
          entityId: reportId
        }
      )

      logger.log('Structured report generated successfully')

      // Save report with JSON structure, scores, and link workouts
      await prisma.$transaction(async (tx) => {
        // Update the report with scores and explanations
        await tx.report.update({
          where: { id: reportId },
          data: {
            status: 'COMPLETED',
            analysisJson: analysisJson as any,
            modelVersion: aiSettings.aiModelPreference,
            dateRangeStart: startDate,
            dateRangeEnd: endDate,
            // Store scores for easy querying and tracking
            overallScore: analysisJson.scores?.overall ?? null,
            trainingLoadScore: analysisJson.scores?.training_load ?? null,
            recoveryScore: analysisJson.scores?.recovery ?? null,
            progressScore: analysisJson.scores?.progress ?? null,
            consistencyScore: analysisJson.scores?.consistency ?? null,
            // Store explanations for user guidance
            trainingLoadExplanation: analysisJson.scores?.training_load_explanation ?? null,
            recoveryBalanceExplanation: analysisJson.scores?.recovery_explanation ?? null,
            progressTrendExplanation: analysisJson.scores?.progress_explanation ?? null,
            adaptationReadinessExplanation: analysisJson.scores?.consistency_explanation ?? null,
            injuryRiskExplanation: analysisJson.scores?.overall_explanation ?? null
          }
        })

        // Link the workouts to the report
        await tx.reportWorkout.createMany({
          data: workouts.map((workout) => ({
            reportId,
            workoutId: workout.id
          }))
        })
      })

      logger.log('Report saved to database with workout links', {
        workoutsLinked: workouts.length
      })

      return {
        success: true,
        reportId,
        userId
      }
    } catch (error) {
      logger.error('Error generating report', { error })

      await prisma.report.update({
        where: { id: reportId },
        data: {
          status: 'FAILED'
        }
      })

      throw error
    }
  }
})
