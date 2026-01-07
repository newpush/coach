import { logger, task } from '@trigger.dev/sdk/v3'
import {
  generateStructuredAnalysis,
  buildWorkoutSummary,
  buildMetricsSummary
} from '../server/utils/gemini'
import { prisma } from '../server/utils/db'
import { workoutRepository } from '../server/utils/repositories/workoutRepository'
import { nutritionRepository } from '../server/utils/repositories/nutritionRepository'
import { wellnessRepository } from '../server/utils/repositories/wellnessRepository'
import { userReportsQueue } from './queues'
import { getUserTimezone, formatUserDate } from '../server/utils/date'

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
            description: 'Section title'
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
              'Detailed analysis points for this section. Each point should be 1-2 sentences maximum as a separate array item.',
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
      description: 'Performance scores on 1-10 scale',
      properties: {
        overall: {
          type: 'number',
          description: 'Overall period assessment (1-10)',
          minimum: 1,
          maximum: 10
        },
        overall_explanation: {
          type: 'string',
          description: 'Detailed explanation of overall assessment'
        },
        training_load: {
          type: 'number',
          description: 'Training load management quality (1-10)',
          minimum: 1,
          maximum: 10
        },
        training_load_explanation: {
          type: 'string',
          description: 'Training load analysis and recommendations'
        },
        recovery: {
          type: 'number',
          description: 'Recovery adequacy score (1-10)',
          minimum: 1,
          maximum: 10
        },
        recovery_explanation: {
          type: 'string',
          description: 'Recovery analysis and optimization strategies'
        },
        progress: {
          type: 'number',
          description: 'Progress and adaptation score (1-10)',
          minimum: 1,
          maximum: 10
        },
        progress_explanation: {
          type: 'string',
          description: 'Progress assessment and recommendations'
        },
        consistency: {
          type: 'number',
          description: 'Training consistency score (1-10)',
          minimum: 1,
          maximum: 10
        },
        consistency_explanation: {
          type: 'string',
          description: 'Consistency analysis and improvement strategies'
        }
      }
    },
    metrics_summary: {
      type: 'object',
      description: 'Key metrics across the period',
      properties: {
        total_duration_minutes: { type: 'number' },
        total_tss: { type: 'number' },
        avg_power: { type: 'number' },
        avg_heart_rate: { type: 'number' },
        total_distance_km: { type: 'number' },
        total_calories: { type: 'number' },
        avg_protein_g: { type: 'number' },
        avg_carbs_g: { type: 'number' },
        avg_fat_g: { type: 'number' }
      }
    }
  },
  required: ['type', 'title', 'executive_summary', 'sections']
}

function buildNutritionSummary(nutritionDays: any[], timezone: string): string {
  if (nutritionDays.length === 0) return 'No nutrition data available'

  return nutritionDays
    .map((day) => {
      const date = formatUserDate(day.date, timezone)
      return `${date}: ${Math.round(day.calories || 0)} cal | P: ${Math.round(day.proteinG || 0)}g | C: ${Math.round(day.carbsG || 0)}g | F: ${Math.round(day.fatG || 0)}g`
    })
    .join('\n')
}

function buildCustomPrompt(
  config: any,
  workouts: any[],
  nutrition: any[],
  metrics: any[],
  user: any,
  timezone: string
): string {
  const dataTypeLabel =
    config.dataType === 'workouts'
      ? 'Training'
      : config.dataType === 'nutrition'
        ? 'Nutrition'
        : 'Training & Nutrition'

  let timeframeDesc = ''
  if (config.timeframeType === 'days') {
    timeframeDesc = `last ${config.days} days`
  } else if (config.timeframeType === 'count') {
    const itemType = config.dataType === 'workouts' ? 'workouts' : 'nutrition days'
    timeframeDesc = `last ${config.count} ${itemType}`
  } else if (config.timeframeType === 'range') {
    timeframeDesc = `${formatUserDate(new Date(config.startDate), timezone)} to ${formatUserDate(new Date(config.endDate), timezone)}`
  }

  const focusAreaPrompts: Record<string, string> = {
    performance:
      'Focus heavily on performance trends, power metrics, pace improvements, and competitive readiness.',
    recovery:
      'Emphasize recovery patterns, fatigue management, training stress balance, and readiness optimization.',
    consistency:
      'Analyze training adherence, consistency patterns, missed sessions, and strategies to maintain regular training.',
    nutrition:
      'Deep dive into dietary patterns, macronutrient balance, calorie adequacy, meal timing, and nutrition quality.',
    general: 'Provide a comprehensive, balanced analysis covering all relevant aspects.'
  }

  let prompt = `You are an expert coach analyzing custom ${dataTypeLabel.toLowerCase()} data for ${timeframeDesc}.

USER PROFILE:
- FTP: ${user?.ftp || 'Unknown'} watts
- Weight: ${user?.weight || 'Unknown'} kg
- Max HR: ${user?.maxHr || 'Unknown'} bpm
- W/kg: ${user?.ftp && user?.weight ? (user.ftp / user.weight).toFixed(2) : 'Unknown'}
`

  if (config.dataType === 'workouts' || config.dataType === 'both') {
    prompt += `\nWORKOUTS${config.workoutTypes?.length > 0 ? ` (${config.workoutTypes.join(', ')})` : ''}:\n`
    prompt += buildWorkoutSummary(workouts) + '\n'
  }

  if (config.dataType === 'nutrition' || config.dataType === 'both') {
    prompt += `\nNUTRITION DATA:\n`
    prompt += buildNutritionSummary(nutrition, timezone) + '\n'
  }

  if (metrics.length > 0) {
    prompt += `\nDAILY METRICS (Recovery & Sleep):\n`
    prompt += buildMetricsSummary(metrics) + '\n'
  }

  prompt += `\nANALYSIS FOCUS: ${focusAreaPrompts[config.focusArea] || focusAreaPrompts.general}

Create a comprehensive analysis with:
- Relevant sections based on the data type and focus area (4-6 sections)
- Each section should have a status assessment and 3-5 specific analysis points
- ${config.dataType === 'both' ? 'Analyze the relationship between training and nutrition' : ''}
- Provide 3-5 prioritized, actionable recommendations

${
  config.dataType === 'workouts' || config.dataType === 'both'
    ? `
Include Performance Scores (1-10 scale):
- Overall, Training Load, Recovery, Progress, and Consistency scores
- Each score must include a detailed explanation
`
    : ''
}

Be specific with data and numbers. Provide supportive, actionable feedback.`

  return prompt
}

export const generateCustomReportTask = task({
  id: 'generate-custom-report',
  maxDuration: 300, // 5 minutes for AI processing
  queue: userReportsQueue,
  run: async (payload: { userId: string; reportId: string; config: any }) => {
    const { userId, reportId, config } = payload

    logger.log('Starting custom report generation', { userId, reportId, config })

    // Update report status
    await prisma.report.update({
      where: { id: reportId },
      data: { status: 'PROCESSING' }
    })

    try {
      const timezone = await getUserTimezone(userId)

      // Fetch user profile
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { ftp: true, weight: true, maxHr: true }
      })

      // Determine date range from the report
      const report = await prisma.report.findUnique({
        where: { id: reportId },
        select: { dateRangeStart: true, dateRangeEnd: true }
      })

      if (!report) {
        throw new Error('Report not found')
      }

      const startDate = report.dateRangeStart
      const endDate = report.dateRangeEnd

      logger.log('Fetching data', { startDate, endDate, dataType: config.dataType })

      // Fetch data based on config
      let workouts: any[] = []
      let nutrition: any[] = []
      let metrics: any[] = []

      if (config.dataType === 'workouts' || config.dataType === 'both') {
        // TODO: Repository doesn't support complex filtering by 'type' or dynamic 'take' based on config nicely in one call yet
        // We will stick to using the repository's standard getForUser and filter in memory if volume is low,
        // OR extend repository. Given report generation is a heavy task, fetching a bit more data is acceptable,
        // but for 'take' we can use limit.
        // However, filtering by type is not supported.
        // Let's use the repository for standard constraints and filter manually, or if we want to be strict,
        // we should add filtering capabilities to the repository.
        // For now, I'll use getForUser and filter by type in memory if needed, assuming dataset isn't massive.

        const options: any = {
          startDate,
          endDate,
          orderBy: { date: 'desc' }
        }

        if (config.timeframeType === 'count' && config.count) {
          options.limit = config.count
        }

        const allWorkouts = await workoutRepository.getForUser(userId, options)

        if (config.workoutTypes && config.workoutTypes.length > 0) {
          workouts = allWorkouts.filter((w) => config.workoutTypes.includes(w.type))
        } else {
          workouts = allWorkouts
        }
      }

      if (config.dataType === 'nutrition' || config.dataType === 'both') {
        const options: any = {
          startDate,
          endDate,
          orderBy: { date: 'desc' }
        }

        if (config.timeframeType === 'count' && config.count) {
          options.limit = config.count
        }

        nutrition = await nutritionRepository.getForUser(userId, options)
      }

      // Always fetch metrics for recovery context
      metrics = await wellnessRepository.getForUser(userId, {
        startDate,
        endDate,
        orderBy: { date: 'desc' }
      })

      logger.log('Data fetched', {
        workoutsCount: workouts.length,
        nutritionCount: nutrition.length,
        metricsCount: metrics.length
      })

      if (workouts.length === 0 && nutrition.length === 0) {
        throw new Error('No data available for analysis')
      }

      // Build custom prompt based on config
      const prompt = buildCustomPrompt(config, workouts, nutrition, metrics, user, timezone)

      logger.log('Generating structured report with Gemini')

      // Generate structured analysis
      const analysisJson = await generateStructuredAnalysis<any>(prompt, analysisSchema, 'flash', {
        userId,
        operation: 'custom_report_generation',
        entityType: 'Report',
        entityId: reportId
      })

      logger.log('Structured report generated successfully')

      // Save report with JSON structure and link data
      await prisma.$transaction(async (tx) => {
        // Update the report
        await tx.report.update({
          where: { id: reportId },
          data: {
            status: 'COMPLETED',
            analysisJson: analysisJson as any,
            modelVersion: 'gemini-2.0-flash-thinking-exp-1219',
            // Store scores if available
            overallScore: analysisJson.scores?.overall ?? null,
            trainingLoadScore: analysisJson.scores?.training_load ?? null,
            recoveryScore: analysisJson.scores?.recovery ?? null,
            progressScore: analysisJson.scores?.progress ?? null,
            consistencyScore: analysisJson.scores?.consistency ?? null,
            // Store explanations
            trainingLoadExplanation: analysisJson.scores?.training_load_explanation ?? null,
            recoveryBalanceExplanation: analysisJson.scores?.recovery_explanation ?? null,
            progressTrendExplanation: analysisJson.scores?.progress_explanation ?? null,
            adaptationReadinessExplanation: analysisJson.scores?.consistency_explanation ?? null,
            injuryRiskExplanation: analysisJson.scores?.overall_explanation ?? null
          }
        })

        // Link workouts to the report
        if (workouts.length > 0) {
          await tx.reportWorkout.createMany({
            data: workouts.map((workout) => ({
              reportId,
              workoutId: workout.id
            }))
          })
        }

        // Link nutrition to the report
        if (nutrition.length > 0) {
          await tx.reportNutrition.createMany({
            data: nutrition.map((nutritionDay) => ({
              reportId,
              nutritionId: nutritionDay.id
            }))
          })
        }
      })

      logger.log('Custom report saved to database', {
        workoutsLinked: workouts.length,
        nutritionLinked: nutrition.length
      })

      return {
        success: true,
        reportId,
        userId,
        dataAnalyzed: {
          workouts: workouts.length,
          nutrition: nutrition.length,
          metrics: metrics.length
        }
      }
    } catch (error) {
      logger.error('Error generating custom report', { error })

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
