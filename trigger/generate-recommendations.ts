import { logger, task } from '@trigger.dev/sdk/v3'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../server/utils/db'
import { generateStructuredAnalysis, buildWorkoutSummary } from '../server/utils/gemini'
import { getUserTimezone, getStartOfDaysAgoUTC } from '../server/utils/date'

interface RecommendationHistoryItem {
  date: string
  title: string
  description: string
  reason: string
}

interface RecommendationsResponse {
  new_recommendations: Array<{
    title: string
    description: string
    priority: 'high' | 'medium' | 'low'
    sourceType: 'nutrition' | 'workout'
    metric: string
    period: number
  }>
  updated_recommendations: Array<{
    id: string
    new_title: string
    new_description: string
    new_priority: 'high' | 'medium' | 'low'
    reason_for_update: string
  }>
  completed_recommendation_ids: string[]
  dismissed_recommendation_ids: string[]
}

export const generateRecommendationsTask = task({
  id: 'generate-recommendations',
  maxDuration: 300,
  run: async (payload: { userId: string }) => {
    // ... (previous setup code remains the same) ...
    const { userId } = payload

    logger.log('='.repeat(60))
    logger.log('🚀 GENERATING RECOMMENDATIONS')
    logger.log('='.repeat(60))
    logger.log(`User ID: ${userId}`)

    const timezone = await getUserTimezone(userId)

    // 1. Fetch User Profile
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        goals: {
          where: { status: 'ACTIVE' },
          select: {
            title: true,
            type: true,
            description: true,
            targetValue: true,
            metric: true,
            targetDate: true,
            events: {
              select: {
                title: true,
                date: true,
                distance: true,
                elevation: true,
                priority: true,
                type: true
              }
            }
          }
        }
      }
    })

    // 2. Fetch Recent Score Explanations (Trends)
    const trends = await prisma.scoreTrendExplanation.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() }
      },
      select: {
        type: true,
        metric: true,
        period: true,
        score: true,
        analysisData: true
      }
    })

    // 3. Fetch Recent Daily Analyses
    const startDate = getStartOfDaysAgoUTC(timezone, 7)

    const recentWorkouts = await prisma.workout.findMany({
      where: {
        userId,
        date: { gte: startDate },
        aiAnalysis: { not: null }
      },
      select: {
        date: true,
        title: true,
        type: true,
        durationSec: true,
        tss: true,
        averageWatts: true,
        averageHr: true,
        rpe: true,
        feel: true,
        description: true,
        aiAnalysis: true,
        aiAnalysisJson: true,
        overallScore: true
      },
      take: 5,
      orderBy: { date: 'desc' }
    })

    const recentNutrition = await prisma.nutrition.findMany({
      where: {
        userId,
        date: { gte: startDate },
        aiAnalysis: { not: null }
      },
      select: {
        date: true,
        aiAnalysis: true,
        overallScore: true
      },
      take: 5,
      orderBy: { date: 'desc' }
    })

    // 4. Fetch Active Recommendations
    const activeRecommendations = await prisma.recommendation.findMany({
      where: { userId, status: 'ACTIVE' },
      select: {
        id: true,
        title: true,
        description: true,
        priority: true,
        sourceType: true,
        metric: true,
        history: true,
        generatedAt: true
      }
    })

    // Format Contexts
    const goalsContext =
      user?.goals
        .map((g) => {
          let details = `- GOAL: "${g.title}" (${g.type})`
          if (g.description) details += `\n  Context: ${g.description}`
          if (g.targetValue && g.metric) details += `\n  Target: ${g.targetValue} ${g.metric}`
          if (g.targetDate)
            details += `\n  Target Date: ${g.targetDate.toISOString().split('T')[0]}`

          if (g.events && g.events.length > 0) {
            details += `\n  LINKED EVENTS:`
            g.events.forEach((e) => {
              details += `\n    * ${e.title} (${e.date.toISOString().split('T')[0]}) [Priority: ${e.priority || 'C'}]`
              if (e.distance) details += `, Dist: ${e.distance}km`
              if (e.elevation) details += `, Elev: ${e.elevation}m`
              if (e.type) details += `, Type: ${e.type}`
            })
          }
          return details
        })
        .join('\n') || 'General Fitness / Maintenance (No specific goals active)'

    const existingRecsContext =
      activeRecommendations.length > 0
        ? activeRecommendations
            .map(
              (r) =>
                `- ID: "${r.id}" | [${r.priority}] ${r.title} (Generated: ${r.generatedAt.toISOString().split('T')[0]})\n  Current: ${r.description}\n  Context: ${r.sourceType}/${r.metric}`
            )
            .join('\n')
        : 'None'

    // 5. Construct Prompt
    const prompt = `You are an expert endurance sports coach. Synthesize the following data to generate or refine high-impact, actionable recommendations for the athlete.

ATHLETE PROFILE:
- Name: ${user?.name || 'Athlete'}

ACTIVE GOALS & EVENTS:
${goalsContext}

EXISTING ACTIVE RECOMMENDATIONS (Reference these by ID to update):
${existingRecsContext}

RECENT TRENDS (Score Explanations):
${trends
  .map(
    (t) =>
      `- [${t.type.toUpperCase()} - ${t.metric} (${t.period}d)] Score: ${t.score?.toFixed(1)}/10. Summary: ${(t.analysisData as any).executive_summary}`
  )
  .join('\n')}

RECENT DAILY INSIGHTS (Last 7 Days):
Workouts:
${buildWorkoutSummary(recentWorkouts)}

Nutrition:
${recentNutrition.map((n) => `- ${n.date.toISOString().split('T')[0]}: Score: ${n.overallScore}`).join('\n')}

INSTRUCTIONS:
1. Review the EXISTING recommendations. Are they still relevant? Do they need to be updated based on new data?
   - **CRITICAL - UPDATE THRESHOLD**: DO NOT update a recommendation just to rephrase it.
   - **RECENT RECOMMENDATIONS**: If a recommendation is less than 3 days old, ONLY update it if there is a **SIGNIFICANT** change in the underlying data (e.g. a sudden drop in HRV, a missed key workout, a new injury flag).
   - If the advice is still valid but the athlete hasn't acted yet, **LEAVE IT ALONE**. Do not generate an update.
   - Only use 'updated_recommendations' if the *meaning* or *action* needs to change significantly.
   - If yes, use the 'updated_recommendations' array. Provide the ID and the new details.
   - If an existing recommendation has been addressed or is no longer relevant (e.g. issue fixed), mark it as **COMPLETED** or **DISMISSED**.
     - Use 'completed_recommendation_ids' for items successfully addressed.
     - Use 'dismissed_recommendation_ids' for items no longer relevant or incorrect.
2. Identify NEW critical areas for improvement based on Trends and Daily Insights.
   - If a new issue is detected, use the 'new_recommendations' array.
3. Formulate specific, actionable advice.
4. Assign priority (high/medium/low).

OUTPUT SCHEMA:
JSON object with 'new_recommendations', 'updated_recommendations', 'completed_recommendation_ids', and 'dismissed_recommendation_ids' arrays.`

    const schema = {
      type: 'object',
      properties: {
        new_recommendations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              priority: { type: 'string', enum: ['high', 'medium', 'low'] },
              sourceType: { type: 'string', enum: ['nutrition', 'workout'] },
              metric: { type: 'string' },
              period: { type: 'number' }
            },
            required: ['title', 'description', 'priority', 'sourceType', 'metric', 'period']
          }
        },
        updated_recommendations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              new_title: { type: 'string' },
              new_description: { type: 'string' },
              new_priority: { type: 'string', enum: ['high', 'medium', 'low'] },
              reason_for_update: { type: 'string' }
            },
            required: ['id', 'new_title', 'new_description', 'new_priority', 'reason_for_update']
          }
        },
        completed_recommendation_ids: {
          type: 'array',
          items: { type: 'string' }
        },
        dismissed_recommendation_ids: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: [
        'new_recommendations',
        'updated_recommendations',
        'completed_recommendation_ids',
        'dismissed_recommendation_ids'
      ]
    }

    let usageId: string | undefined
    const response = await generateStructuredAnalysis<RecommendationsResponse>(
      prompt,
      schema,
      'flash',
      {
        userId,
        operation: 'generate_recommendations',
        entityType: 'RecommendationBatch',
        onUsageLogged: (id) => {
          usageId = id
        }
      }
    )

    const {
      new_recommendations,
      updated_recommendations,
      completed_recommendation_ids,
      dismissed_recommendation_ids
    } = response

    // 6. Process New Recommendations
    if (new_recommendations && new_recommendations.length > 0) {
      const recsWithIds = new_recommendations.map((rec) => ({
        id: uuidv4(),
        userId,
        sourceType: rec.sourceType,
        metric: rec.metric,
        period: rec.period,
        title: rec.title,
        description: rec.description,
        priority: rec.priority,
        generatedAt: new Date(),
        llmUsageId: usageId,
        status: 'ACTIVE'
      }))

      await prisma.recommendation.createMany({
        data: recsWithIds
      })
      logger.log(`✅ Created ${recsWithIds.length} new recommendations`)
    }

    // 7. Process Updated Recommendations
    if (updated_recommendations && updated_recommendations.length > 0) {
      for (const update of updated_recommendations) {
        const existing = activeRecommendations.find((r) => r.id === update.id)
        if (!existing) continue

        // Create history entry
        const historyItem: RecommendationHistoryItem = {
          date: new Date().toISOString(),
          title: existing.title,
          description: existing.description,
          reason: update.reason_for_update
        }

        const currentHistory = (existing.history as any) || []
        const newHistory = [...currentHistory, historyItem]

        await prisma.recommendation.update({
          where: { id: update.id },
          data: {
            title: update.new_title,
            description: update.new_description,
            priority: update.new_priority,
            history: newHistory as any,
            generatedAt: new Date(),
            llmUsageId: usageId
          }
        })
      }
      logger.log(`🔄 Updated ${updated_recommendations.length} existing recommendations`)
    }

    // 8. Process Completed & Dismissed
    const completedIds = completed_recommendation_ids || []
    if (completedIds.length > 0) {
      await prisma.recommendation.updateMany({
        where: { id: { in: completedIds }, userId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date()
        }
      })
      logger.log(`✅ Marked ${completedIds.length} as COMPLETED`)
    }

    const dismissedIds = dismissed_recommendation_ids || []
    if (dismissedIds.length > 0) {
      await prisma.recommendation.updateMany({
        where: { id: { in: dismissedIds }, userId },
        data: {
          status: 'DISMISSED',
          completedAt: new Date()
        }
      })
      logger.log(`🚫 Marked ${dismissedIds.length} as DISMISSED`)
    }

    return {
      success: true,
      new: new_recommendations?.length || 0,
      updated: updated_recommendations?.length || 0,
      completed: completedIds.length,
      dismissed: dismissedIds.length,
      userId
    }
  }
})
