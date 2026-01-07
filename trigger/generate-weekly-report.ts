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
import { getUserTimezone, getStartOfDaysAgoUTC, getEndOfDayUTC } from '../server/utils/date'

// Analysis schema for structured JSON output
const analysisSchema = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      description: 'Type of analysis: workout, weekly_report, planning, comparison',
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
            description: 'Section title (e.g., Training Load Analysis, Recovery Trends)'
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
            description:
              'Detailed analysis points for this section. Each point should be 1-2 sentences maximum as a separate array item. Do NOT combine multiple points into paragraph blocks.',
            items: {
              type: 'string'
            }
          }
        },
        required: ['title', 'status', 'status_label', 'analysis_points']
      }
    },
    recommendations: {
      type: 'array',
      description: 'Actionable coaching recommendations',
      items: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Recommendation title'
          },
          priority: {
            type: 'string',
            description: 'Priority level',
            enum: ['high', 'medium', 'low']
          },
          description: {
            type: 'string',
            description: 'Detailed recommendation'
          }
        },
        required: ['title', 'priority', 'description']
      }
    },
    scores: {
      type: 'object',
      description:
        'Period performance scores on 1-10 scale for tracking over time, with detailed explanations',
      properties: {
        overall: {
          type: 'number',
          description: 'Overall period assessment (1-10)',
          minimum: 1,
          maximum: 10
        },
        overall_explanation: {
          type: 'string',
          description:
            'Detailed explanation of overall assessment: key highlights from the period, major achievements or concerns, and 2-3 specific actions for next period'
        },
        training_load: {
          type: 'number',
          description: 'Training load management quality (1-10)',
          minimum: 1,
          maximum: 10
        },
        training_load_explanation: {
          type: 'string',
          description:
            'Training load analysis: TSS trends, load appropriateness, fatigue vs fitness balance, and specific recommendations for load management'
        },
        recovery: {
          type: 'number',
          description: 'Recovery adequacy score (1-10)',
          minimum: 1,
          maximum: 10
        },
        recovery_explanation: {
          type: 'string',
          description:
            'Recovery analysis: HRV trends, sleep quality observations, recovery adequacy relative to training load, and specific recovery optimization strategies'
        },
        progress: {
          type: 'number',
          description: 'Progress and adaptation score (1-10)',
          minimum: 1,
          maximum: 10
        },
        progress_explanation: {
          type: 'string',
          description:
            'Progress assessment: performance trends, adaptation signals, whether training is effective, and recommendations for continued progress'
        },
        consistency: {
          type: 'number',
          description: 'Training consistency score (1-10)',
          minimum: 1,
          maximum: 10
        },
        consistency_explanation: {
          type: 'string',
          description:
            'Consistency analysis: adherence patterns, missed sessions analysis, consistency relative to plan, and strategies to improve adherence'
        }
      },
      required: [
        'overall',
        'overall_explanation',
        'training_load',
        'training_load_explanation',
        'recovery',
        'recovery_explanation',
        'progress',
        'progress_explanation',
        'consistency',
        'consistency_explanation'
      ]
    },
    metrics_summary: {
      type: 'object',
      description: 'Key metrics across the period',
      properties: {
        total_duration_minutes: { type: 'number' },
        total_tss: { type: 'number' },
        avg_power: { type: 'number' },
        avg_heart_rate: { type: 'number' },
        total_distance_km: { type: 'number' }
      }
    }
  },
  required: ['type', 'title', 'executive_summary', 'sections', 'scores']
}

export const generateWeeklyReportTask = task({
  id: 'generate-weekly-report',
  maxDuration: 300, // 5 minutes for AI processing
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
      const [workouts, metrics, user, activeGoals] = await Promise.all([
        workoutRepository.getForUser(userId, {
          startDate,
          endDate,
          orderBy: { date: 'asc' }
        }),
        wellnessRepository.getForUser(userId, {
          startDate,
          endDate,
          orderBy: { date: 'asc' }
        }),
        prisma.user.findUnique({
          where: { id: userId },
          select: { ftp: true, weight: true, maxHr: true }
        }),
        prisma.goal.findMany({
          where: {
            userId,
            status: 'ACTIVE'
          }
        })
      ])

      logger.log('Data fetched', {
        workoutsCount: workouts.length,
        metricsCount: metrics.length,
        activeGoals: activeGoals.length
      })

      if (workouts.length === 0) {
        throw new Error('No workout data available for analysis')
      }

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

      // Build prompt for structured analysis
      const prompt = `You are an expert cycling coach analyzing the previous week of training data (last 7 days).

USER PROFILE:
- FTP: ${user?.ftp || 'Unknown'} watts
- Weight: ${user?.weight || 'Unknown'} kg
- Max HR: ${user?.maxHr || 'Unknown'} bpm
- W/kg: ${user?.ftp && user?.weight ? (user.ftp / user.weight).toFixed(2) : 'Unknown'}

WORKOUTS (Last 7 days):
${buildWorkoutSummary(workouts)}

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

Be supportive and specific. Use actual data points and metrics. Scores should realistically reflect the period's quality.`

      logger.log('Generating structured report with Gemini')

      // Generate structured analysis
      const analysisJson = await generateStructuredAnalysis<any>(prompt, analysisSchema, 'flash', {
        userId,
        operation: 'weekly_report_generation',
        entityType: 'Report',
        entityId: reportId
      })

      logger.log('Structured report generated successfully')

      // Save report with JSON structure, scores, and link workouts
      await prisma.$transaction(async (tx) => {
        // Update the report with scores and explanations
        await tx.report.update({
          where: { id: reportId },
          data: {
            status: 'COMPLETED',
            analysisJson: analysisJson as any,
            modelVersion: 'gemini-2.0-flash-thinking-exp-1219',
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
