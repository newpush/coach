import { logger, task } from '@trigger.dev/sdk/v3'
import { prisma } from '../server/utils/db'
import { workoutRepository } from '../server/utils/repositories/workoutRepository'
import { nutritionRepository } from '../server/utils/repositories/nutritionRepository'
import { generateStructuredAnalysis } from '../server/utils/gemini'
import {
  getUserTimezone,
  getStartOfDaysAgoUTC,
  getEndOfDayUTC,
  formatUserDate
} from '../server/utils/date'

interface TrendAnalysis {
  executive_summary: string
  sections: Array<{
    title: string
    status: string
    analysis_points: string[]
  }>
  recommendations: Array<{
    title: string
    description: string
    priority: string
  }>
}

const PERIODS = [7, 14, 30, 90] // Days to analyze
const NUTRITION_METRICS = ['overall', 'macroBalance', 'quality', 'adherence', 'hydration']
const WORKOUT_METRICS = ['overall', 'technical', 'effort', 'pacing', 'execution']

// Cache expiration: explanations are valid for 24 hours
const EXPIRATION_HOURS = 24

function getMetricDisplayName(type: string, metric: string): string {
  const nutritionNames: Record<string, string> = {
    overall: 'Overall Nutrition Quality',
    macroBalance: 'Macronutrient Balance',
    quality: 'Food Quality',
    adherence: 'Goal Adherence',
    hydration: 'Hydration Status'
  }

  const workoutNames: Record<string, string> = {
    overall: 'Overall Workout Performance',
    technical: 'Technical Execution',
    effort: 'Effort Management',
    pacing: 'Pacing Strategy',
    execution: 'Workout Execution'
  }

  return type === 'nutrition' ? nutritionNames[metric] : workoutNames[metric]
}

async function generateNutritionExplanation(
  userId: string,
  period: number,
  metric: string,
  summary: any,
  timezone: string
): Promise<TrendAnalysis> {
  // Fetch recent nutrition data for context
  const startDate = getStartOfDaysAgoUTC(timezone, period)

  const nutrition = await nutritionRepository.getForUser(userId, {
    startDate,
    limit: 10,
    orderBy: { date: 'desc' },
    select: {
      date: true,
      calories: true,
      protein: true,
      carbs: true,
      fat: true,
      waterMl: true
    }
  })

  const prompt = `Analyze these nutrition trends for an endurance athlete:

SUMMARY (Last ${period} days):
- Total Days: ${summary.total}
- Overall Score: ${summary.avgOverall?.toFixed(1)}/10
- Macro Balance: ${summary.avgMacroBalance?.toFixed(1)}/10
- Quality: ${summary.avgQuality?.toFixed(1)}/10
- Adherence: ${summary.avgAdherence?.toFixed(1)}/10
- Hydration: ${summary.avgHydration?.toFixed(1)}/10

RECENT DATA:
${nutrition
  .map((n) => {
    const totalMacros = (n.protein || 0) + (n.carbs || 0) + (n.fat || 0)
    const proteinPct = totalMacros > 0 ? (((n.protein || 0) / totalMacros) * 100).toFixed(0) : 0
    const carbsPct = totalMacros > 0 ? (((n.carbs || 0) / totalMacros) * 100).toFixed(0) : 0
    const fatPct = totalMacros > 0 ? (((n.fat || 0) / totalMacros) * 100).toFixed(0) : 0
    return `- ${formatUserDate(n.date, timezone)}: ${n.calories || 0}kcal (P:${proteinPct}% C:${carbsPct}% F:${fatPct}%) Water: ${n.waterMl ? (n.waterMl / 1000).toFixed(1) : 0}L`
  })
  .join('\n')}

Focus on "${getMetricDisplayName('nutrition', metric)}" and provide structured analysis with actionable nutrition improvements.`

  const schema = {
    type: 'object',
    properties: {
      executive_summary: {
        type: 'string',
        description: '2-3 sentence summary of current nutrition performance and key patterns'
      },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            status: {
              type: 'string',
              enum: ['excellent', 'good', 'moderate', 'needs_improvement']
            },
            analysis_points: {
              type: 'array',
              items: { type: 'string' }
            }
          },
          required: ['title', 'status', 'analysis_points']
        }
      },
      recommendations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            priority: {
              type: 'string',
              enum: ['high', 'medium', 'low']
            }
          },
          required: ['title', 'description', 'priority']
        }
      }
    },
    required: ['executive_summary', 'sections', 'recommendations']
  }

  return await generateStructuredAnalysis<TrendAnalysis>(prompt, schema, 'flash', {
    userId,
    operation: 'nutrition_score_explanation',
    entityType: 'ScoreTrendExplanation',
    entityId: undefined
  })
}

async function generateWorkoutExplanation(
  userId: string,
  period: number,
  metric: string,
  summary: any,
  timezone: string
): Promise<TrendAnalysis> {
  // Fetch recent workout data for context
  const startDate = getStartOfDaysAgoUTC(timezone, period)

  const workouts = await workoutRepository.getForUser(userId, {
    startDate,
    limit: 10,
    orderBy: { date: 'desc' },
    select: {
      date: true,
      title: true,
      type: true,
      durationSec: true,
      tss: true,
      averageWatts: true,
      averageHr: true,
      rpe: true,
      feel: true
    }
  })

  const prompt = `Analyze these workout trends for an endurance athlete:

SUMMARY (Last ${period} days):
- Total Workouts: ${summary.total}
- Overall Score: ${summary.avgOverall?.toFixed(1)}/10
- Technical: ${summary.avgTechnical?.toFixed(1)}/10
- Effort: ${summary.avgEffort?.toFixed(1)}/10
- Pacing: ${summary.avgPacing?.toFixed(1)}/10
- Execution: ${summary.avgExecution?.toFixed(1)}/10

RECENT WORKOUTS:
${workouts
  .map((w) => {
    return `- ${formatUserDate(w.date, timezone)}: ${w.title} (${w.type}) - ${Math.round(w.durationSec / 60)}min, TSS: ${w.tss?.toFixed(0) || 'N/A'}, Power: ${w.averageWatts || 'N/A'}W, HR: ${w.averageHr || 'N/A'}bpm, RPE: ${w.rpe || 'N/A'}, Feel: ${w.feel ? w.feel * 2 : 'N/A'}/10 (10=Strong, 2=Weak)`
  })
  .join('\n')}

Focus on "${getMetricDisplayName('workout', metric)}" and provide structured analysis with actionable training improvements.`

  const schema = {
    type: 'object',
    properties: {
      executive_summary: {
        type: 'string',
        description: '2-3 sentence summary of current workout performance and key patterns'
      },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            status: {
              type: 'string',
              enum: ['excellent', 'good', 'moderate', 'needs_improvement']
            },
            analysis_points: {
              type: 'array',
              items: { type: 'string' }
            }
          },
          required: ['title', 'status', 'analysis_points']
        }
      },
      recommendations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            priority: {
              type: 'string',
              enum: ['high', 'medium', 'low']
            }
          },
          required: ['title', 'description', 'priority']
        }
      }
    },
    required: ['executive_summary', 'sections', 'recommendations']
  }

  return await generateStructuredAnalysis<TrendAnalysis>(prompt, schema, 'flash', {
    userId,
    operation: 'workout_score_explanation',
    entityType: 'ScoreTrendExplanation',
    entityId: undefined
  })
}

async function calculateNutritionSummary(userId: string, period: number, timezone: string) {
  const startDate = getStartOfDaysAgoUTC(timezone, period)

  // Note: getForUser does not support complex filtering like 'overallScore: { not: null }' directly yet.
  // Using getForUser and filtering in memory or extending repository is preferred.
  // Given we are calculating summaries, we can fetch recent data and filter.
  // Or we can accept fetching all recent and filtering for valid scores.
  const allNutrition = await nutritionRepository.getForUser(userId, {
    startDate,
    select: {
      overallScore: true,
      macroBalanceScore: true,
      qualityScore: true,
      adherenceScore: true,
      hydrationScore: true
    }
  })

  const nutrition = allNutrition.filter((n: any) => n.overallScore != null)

  if (nutrition.length === 0) return null

  return {
    total: nutrition.length,
    avgOverall: nutrition.reduce((sum, n) => sum + (n.overallScore || 0), 0) / nutrition.length,
    avgMacroBalance:
      nutrition.reduce((sum, n) => sum + (n.macroBalanceScore || 0), 0) / nutrition.length,
    avgQuality: nutrition.reduce((sum, n) => sum + (n.qualityScore || 0), 0) / nutrition.length,
    avgAdherence: nutrition.reduce((sum, n) => sum + (n.adherenceScore || 0), 0) / nutrition.length,
    avgHydration: nutrition.reduce((sum, n) => sum + (n.hydrationScore || 0), 0) / nutrition.length
  }
}

async function calculateWorkoutSummary(userId: string, period: number, timezone: string) {
  const startDate = getStartOfDaysAgoUTC(timezone, period)

  // Similar logic for workouts
  const allWorkouts = await workoutRepository.getForUser(userId, {
    startDate,
    select: {
      overallScore: true,
      technicalScore: true,
      effortScore: true,
      pacingScore: true,
      executionScore: true
    }
  })

  const workouts = allWorkouts.filter((w: any) => w.overallScore != null)

  if (workouts.length === 0) return null

  return {
    total: workouts.length,
    avgOverall: workouts.reduce((sum, w) => sum + (w.overallScore || 0), 0) / workouts.length,
    avgTechnical: workouts.reduce((sum, w) => sum + (w.technicalScore || 0), 0) / workouts.length,
    avgEffort: workouts.reduce((sum, w) => sum + (w.effortScore || 0), 0) / workouts.length,
    avgPacing: workouts.reduce((sum, w) => sum + (w.pacingScore || 0), 0) / workouts.length,
    avgExecution: workouts.reduce((sum, w) => sum + (w.executionScore || 0), 0) / workouts.length
  }
}

export const generateScoreExplanationsTask = task({
  id: 'generate-score-explanations',
  maxDuration: 600, // 10 minutes for generating all explanations
  run: async (payload: { userId: string }) => {
    const { userId } = payload

    logger.log('='.repeat(60))
    logger.log('🎯 GENERATING SCORE EXPLANATIONS')
    logger.log('='.repeat(60))
    logger.log(`User ID: ${userId}`)
    logger.log('')

    const timezone = await getUserTimezone(userId)

    const results = {
      generated: 0,
      skipped: 0,
      failed: 0,
      details: [] as any[]
    }

    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + EXPIRATION_HOURS)

    // Generate nutrition explanations
    logger.log('📊 Generating Nutrition Explanations...')
    for (const period of PERIODS) {
      const summary = await calculateNutritionSummary(userId, period, timezone)

      if (!summary) {
        logger.log(`  ⏭️  Skipping ${period}d - no nutrition data`)
        results.skipped += NUTRITION_METRICS.length
        continue
      }

      for (const metric of NUTRITION_METRICS) {
        try {
          const score = summary[
            `avg${metric.charAt(0).toUpperCase() + metric.slice(1)}` as keyof typeof summary
          ] as number

          // Check if explanation already exists and is still valid
          const existing = await prisma.scoreTrendExplanation.findUnique({
            where: {
              userId_type_period_metric: {
                userId,
                type: 'nutrition',
                period,
                metric
              }
            }
          })

          if (existing && existing.expiresAt > new Date()) {
            logger.log(
              `  ⏭️  ${period}d ${metric} - cached (expires ${existing.expiresAt.toISOString()})`
            )
            results.skipped++
            continue
          }

          logger.log(`  🔄 ${period}d ${metric}...`)
          const analysis = await generateNutritionExplanation(
            userId,
            period,
            metric,
            summary,
            timezone
          )

          await prisma.scoreTrendExplanation.upsert({
            where: {
              userId_type_period_metric: {
                userId,
                type: 'nutrition',
                period,
                metric
              }
            },
            create: {
              userId,
              type: 'nutrition',
              period,
              metric,
              score,
              analysisData: analysis as any,
              expiresAt
            },
            update: {
              score,
              analysisData: analysis as any,
              generatedAt: new Date(),
              expiresAt
            }
          })

          results.generated++
          results.details.push({
            type: 'nutrition',
            period,
            metric,
            status: 'success'
          })

          logger.log(`  ✅ ${period}d ${metric} - generated`)
        } catch (error) {
          logger.error(`  ❌ ${period}d ${metric} - failed:`, error)
          results.failed++
          results.details.push({
            type: 'nutrition',
            period,
            metric,
            status: 'failed',
            error: String(error)
          })
        }
      }
    }

    // Generate workout explanations
    logger.log('')
    logger.log('💪 Generating Workout Explanations...')
    for (const period of PERIODS) {
      const summary = await calculateWorkoutSummary(userId, period, timezone)

      if (!summary) {
        logger.log(`  ⏭️  Skipping ${period}d - no workout data`)
        results.skipped += WORKOUT_METRICS.length
        continue
      }

      for (const metric of WORKOUT_METRICS) {
        try {
          const score = summary[
            `avg${metric.charAt(0).toUpperCase() + metric.slice(1)}` as keyof typeof summary
          ] as number

          // Check if explanation already exists and is still valid
          const existing = await prisma.scoreTrendExplanation.findUnique({
            where: {
              userId_type_period_metric: {
                userId,
                type: 'workout',
                period,
                metric
              }
            }
          })

          if (existing && existing.expiresAt > new Date()) {
            logger.log(
              `  ⏭️  ${period}d ${metric} - cached (expires ${existing.expiresAt.toISOString()})`
            )
            results.skipped++
            continue
          }

          logger.log(`  🔄 ${period}d ${metric}...`)
          const analysis = await generateWorkoutExplanation(
            userId,
            period,
            metric,
            summary,
            timezone
          )

          await prisma.scoreTrendExplanation.upsert({
            where: {
              userId_type_period_metric: {
                userId,
                type: 'workout',
                period,
                metric
              }
            },
            create: {
              userId,
              type: 'workout',
              period,
              metric,
              score,
              analysisData: analysis as any,
              expiresAt
            },
            update: {
              score,
              analysisData: analysis as any,
              generatedAt: new Date(),
              expiresAt
            }
          })

          results.generated++
          results.details.push({
            type: 'workout',
            period,
            metric,
            status: 'success'
          })

          logger.log(`  ✅ ${period}d ${metric} - generated`)
        } catch (error) {
          logger.error(`  ❌ ${period}d ${metric} - failed:`, error)
          results.failed++
          results.details.push({
            type: 'workout',
            period,
            metric,
            status: 'failed',
            error: String(error)
          })
        }
      }
    }

    logger.log('')
    logger.log('='.repeat(60))
    logger.log('📊 GENERATION COMPLETE')
    logger.log('='.repeat(60))
    logger.log(`✅ Generated: ${results.generated}`)
    logger.log(`⏭️  Skipped (cached): ${results.skipped}`)
    logger.log(`❌ Failed: ${results.failed}`)
    logger.log(`📊 Total: ${results.generated + results.skipped + results.failed}`)
    logger.log('='.repeat(60))

    return {
      success: results.failed === 0,
      ...results,
      userId
    }
  }
})
