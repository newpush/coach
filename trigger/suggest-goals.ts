import { logger, task } from '@trigger.dev/sdk/v3'
import { generateStructuredAnalysis } from '../server/utils/gemini'
import { prisma } from '../server/utils/db'
import { workoutRepository } from '../server/utils/repositories/workoutRepository'
import { wellnessRepository } from '../server/utils/repositories/wellnessRepository'
import { nutritionRepository } from '../server/utils/repositories/nutritionRepository'
import { userReportsQueue } from './queues'
import {
  getUserTimezone,
  getStartOfDaysAgoUTC,
  getEndOfDayUTC,
  formatUserDate
} from '../server/utils/date'

// Goal suggestions schema for structured JSON output
const goalSuggestionsSchema = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: ['goal_suggestions'],
      description: 'Type of analysis'
    },
    generated_date: {
      type: 'string',
      description: 'Date suggestions were generated'
    },
    executive_summary: {
      type: 'string',
      description: "2-3 sentence overview of the athlete's goal readiness and focus areas"
    },
    suggested_goals: {
      type: 'array',
      description: 'Array of suggested goals based on athlete profile',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['BODY_COMPOSITION', 'EVENT', 'PERFORMANCE', 'CONSISTENCY'],
            description: 'Goal type'
          },
          title: {
            type: 'string',
            description: 'Suggested goal title'
          },
          description: {
            type: 'string',
            description: 'Detailed goal description'
          },
          rationale: {
            type: 'string',
            description: 'Why this goal is recommended for this athlete (2-3 sentences)'
          },
          priority: {
            type: 'string',
            enum: ['HIGH', 'MEDIUM', 'LOW'],
            description: 'Recommended priority level'
          },
          metric: {
            type: 'string',
            description: "Metric to track (e.g., 'weight_kg', 'ftp_watts', 'weekly_hours')"
          },
          currentValue: {
            type: 'number',
            description: 'Current value of the metric'
          },
          targetValue: {
            type: 'number',
            description: 'Suggested target value'
          },
          targetDate: {
            type: 'string',
            description: 'Suggested target date (ISO 8601 format)'
          },
          timeframe_weeks: {
            type: 'number',
            description: 'Recommended timeframe in weeks'
          },
          difficulty: {
            type: 'string',
            enum: ['easy', 'moderate', 'challenging', 'very_challenging'],
            description: 'Expected difficulty level'
          },
          prerequisites: {
            type: 'array',
            items: { type: 'string' },
            description: 'What the athlete should do or achieve first'
          },
          success_indicators: {
            type: 'array',
            items: { type: 'string' },
            description: 'How to know if on track toward this goal'
          }
        },
        required: ['type', 'title', 'description', 'rationale', 'priority', 'difficulty']
      }
    },
    timing_considerations: {
      type: 'object',
      description: 'When to pursue these goals',
      properties: {
        immediate: {
          type: 'array',
          items: { type: 'string' },
          description: 'Goals to start immediately'
        },
        near_term: {
          type: 'array',
          items: { type: 'string' },
          description: 'Goals for next 1-2 months'
        },
        future: {
          type: 'array',
          items: { type: 'string' },
          description: 'Goals for 3+ months out'
        }
      }
    },
    goal_conflicts: {
      type: 'array',
      description: 'Potential conflicts between suggested goals',
      items: {
        type: 'object',
        properties: {
          goals: {
            type: 'array',
            items: { type: 'string' },
            description: 'Titles of conflicting goals'
          },
          conflict: {
            type: 'string',
            description: 'Description of the conflict'
          },
          resolution: {
            type: 'string',
            description: 'How to resolve or prioritize'
          }
        }
      }
    }
  },
  required: ['type', 'generated_date', 'executive_summary', 'suggested_goals']
}

export const suggestGoalsTask = task({
  id: 'suggest-goals',
  maxDuration: 300, // 5 minutes for AI processing
  queue: userReportsQueue,
  run: async (payload: { userId: string }) => {
    const { userId } = payload

    logger.log('Starting goal suggestions generation', { userId })

    try {
      const timezone = await getUserTimezone(userId)
      const now = new Date()
      const todayEnd = getEndOfDayUTC(timezone, now)
      const thirtyDaysAgo = getStartOfDaysAgoUTC(timezone, 30)
      const sevenDaysAgo = getStartOfDaysAgoUTC(timezone, 7)

      logger.log('Fetching athlete data for goal suggestions', {
        timezone,
        thirtyDaysAgo,
        todayEnd
      })

      // Fetch comprehensive athlete data
      const [
        user,
        recentWorkouts,
        recentWellness,
        recentNutrition,
        athleteProfile,
        existingGoals,
        recentReports
      ] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            ftp: true,
            weight: true,
            maxHr: true,
            dob: true,
            currentFitnessScore: true,
            recoveryCapacityScore: true,
            nutritionComplianceScore: true,
            trainingConsistencyScore: true,
            currentFitnessExplanation: true,
            recoveryCapacityExplanation: true,
            nutritionComplianceExplanation: true,
            trainingConsistencyExplanation: true,
            profileLastUpdated: true
          }
        }),
        workoutRepository.getForUser(userId, {
          startDate: thirtyDaysAgo,
          endDate: todayEnd,
          limit: 20,
          orderBy: { date: 'desc' },
          select: {
            date: true,
            title: true,
            type: true,
            durationSec: true,
            tss: true,
            averageWatts: true,
            averageSpeed: true
          }
        }),
        wellnessRepository.getForUser(userId, {
          startDate: thirtyDaysAgo,
          endDate: todayEnd,
          limit: 30,
          orderBy: { date: 'desc' },
          select: {
            date: true,
            recoveryScore: true,
            hrv: true,
            sleepHours: true
          }
        }),
        nutritionRepository.getForUser(userId, {
          startDate: sevenDaysAgo,
          endDate: todayEnd,
          limit: 7,
          orderBy: { date: 'desc' },
          select: {
            date: true,
            calories: true,
            protein: true,
            carbs: true,
            fat: true,
            caloriesGoal: true
          }
        }),
        prisma.report.findFirst({
          where: {
            userId,
            type: 'ATHLETE_PROFILE',
            status: 'COMPLETED'
          },
          orderBy: { createdAt: 'desc' },
          select: {
            analysisJson: true,
            createdAt: true
          }
        }),
        prisma.goal.findMany({
          where: {
            userId,
            status: 'ACTIVE'
          },
          select: {
            type: true,
            title: true,
            description: true,
            metric: true,
            currentValue: true,
            targetValue: true,
            targetDate: true,
            priority: true
          }
        }),
        prisma.report.findMany({
          where: {
            userId,
            status: 'COMPLETED',
            createdAt: { gte: thirtyDaysAgo }
          },
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: {
            type: true,
            analysisJson: true
          }
        })
      ])

      if (!user) {
        throw new Error('User not found')
      }

      logger.log('Data fetched', {
        workouts: recentWorkouts.length,
        wellness: recentWellness.length,
        existingGoals: existingGoals.length,
        hasProfile: !!athleteProfile
      })

      // Build context from data
      const totalTSS = recentWorkouts.reduce((sum, w) => sum + (w.tss || 0), 0)
      const avgWorkoutDuration =
        recentWorkouts.length > 0
          ? recentWorkouts.reduce((sum, w) => sum + w.durationSec, 0) / recentWorkouts.length / 60
          : 0
      const workoutTypes = [...new Set(recentWorkouts.map((w) => w.type))]

      const avgRecovery =
        recentWellness.length > 0
          ? recentWellness.reduce((sum, w) => sum + (w.recoveryScore || 50), 0) /
            recentWellness.length
          : null

      const existingGoalsSummary =
        existingGoals.length > 0
          ? existingGoals.map((g) => `${g.type}: ${g.title} (Priority: ${g.priority})`).join('\n')
          : 'No active goals'

      // Extract key insights from athlete profile if available
      let profileInsights = ''
      if (athleteProfile) {
        const profile = athleteProfile.analysisJson as any
        profileInsights = `
ATHLETE PROFILE INSIGHTS (from ${formatUserDate(athleteProfile.createdAt, timezone)}):
Executive Summary: ${profile?.executive_summary || 'N/A'}
Current Fitness: ${profile?.current_fitness?.status_label || 'N/A'}
Training Style: ${profile?.training_characteristics?.training_style || 'N/A'}
Strengths: ${profile?.training_characteristics?.strengths?.join(', ') || 'N/A'}
Areas for Development: ${profile?.training_characteristics?.areas_for_development?.join(', ') || 'N/A'}
Planning Context: ${profile?.planning_context?.current_focus || 'N/A'}`
      }

      // Build comprehensive prompt
      const prompt = `You are an expert endurance sports coach analyzing an athlete's data to suggest personalized, achievable goals.

USER PROFILE:
- FTP: ${user.ftp || 'Unknown'} watts
- Weight: ${user.weight || 'Unknown'} kg
- W/kg: ${user.ftp && user.weight ? (user.ftp / user.weight).toFixed(2) : 'Unknown'}
- Max HR: ${user.maxHr || 'Unknown'} bpm

ATHLETE PROFILE SCORES (1-10 scale):
- Current Fitness: ${user.currentFitnessScore || 'N/A'}/10 - ${user.currentFitnessExplanation || 'Not available'}
- Recovery Capacity: ${user.recoveryCapacityScore || 'N/A'}/10 - ${user.recoveryCapacityExplanation || 'Not available'}
- Nutrition Compliance: ${user.nutritionComplianceScore || 'N/A'}/10 - ${user.nutritionComplianceExplanation || 'Not available'}
- Training Consistency: ${user.trainingConsistencyScore || 'N/A'}/10 - ${user.trainingConsistencyExplanation || 'Not available'}

${profileInsights}

RECENT TRAINING (Last 30 days):
- Total workouts: ${recentWorkouts.length}
- Total TSS: ${totalTSS.toFixed(0)}
- Average workout duration: ${avgWorkoutDuration.toFixed(0)} minutes
- Workout types: ${workoutTypes.join(', ')}

RECOVERY TRENDS:
- Average Recovery Score: ${avgRecovery ? avgRecovery.toFixed(0) + '%' : 'N/A'}
- Recent HRV trend: ${recentWellness
        .slice(0, 7)
        .map((w) => w.hrv || 'N/A')
        .join(', ')}

EXISTING ACTIVE GOALS:
${existingGoalsSummary}

INSTRUCTIONS:
Based on this athlete's current state, training patterns, and existing goals, suggest 3-5 new achievable goals that would benefit their development. Consider:

1. **Gap Analysis**: What's missing from their current goals? What areas need attention?
2. **Current State**: Their fitness scores, training consistency, recovery capacity
3. **Realistic Targets**: Based on their current metrics and training volume
4. **Complementary Goals**: Goals that work together, not conflict
5. **Time Horizons**: Mix of short-term (4-8 weeks), medium-term (8-16 weeks), and long-term (16+ weeks) goals

For each suggested goal, provide:
- Clear, specific title and description
- Strong rationale explaining WHY this goal makes sense for THIS athlete RIGHT NOW
- Realistic target values and dates
- Prerequisites and success indicators
- Difficulty assessment

Goal Types:
- **BODY_COMPOSITION**: Weight, body fat percentage
- **EVENT**: Preparing for a specific race or event
- **PERFORMANCE**: FTP, VO2 max, pace improvements
- **CONSISTENCY**: Training frequency, volume, adherence

Be specific with metrics and targets. For example:
- Instead of "Improve FTP", suggest "Increase FTP from ${user.ftp || 250}W to ${user.ftp ? Math.round(user.ftp * 1.05) : 265}W over 12 weeks"
- Instead of "Lose weight", suggest "Reduce weight from ${user.weight || 75}kg to ${user.weight ? (user.weight - 3).toFixed(1) : 72}kg over 8 weeks"

Identify any potential goal conflicts and provide resolution strategies.`

      logger.log('Generating goal suggestions with Gemini')

      // Generate structured suggestions
      const suggestionsJson = await generateStructuredAnalysis(
        prompt,
        goalSuggestionsSchema,
        'flash',
        {
          userId,
          operation: 'goal_suggestions',
          entityType: 'GoalSuggestions',
          entityId: userId
        }
      )

      logger.log('Goal suggestions generated successfully', {
        suggestedGoals: suggestionsJson.suggested_goals?.length || 0
      })

      return {
        success: true,
        userId,
        suggestions: suggestionsJson
      }
    } catch (error) {
      logger.error('Error generating goal suggestions', { error })
      throw error
    }
  }
})
