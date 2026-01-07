import { logger, task } from '@trigger.dev/sdk/v3'
import { generateStructuredAnalysis } from '../server/utils/gemini'
import { prisma } from '../server/utils/db'
import { workoutRepository } from '../server/utils/repositories/workoutRepository'
import { wellnessRepository } from '../server/utils/repositories/wellnessRepository'
import { userReportsQueue } from './queues'
import {
  getUserTimezone,
  getStartOfDaysAgoUTC,
  getEndOfDayUTC,
  formatUserDate
} from '../server/utils/date'

// Goal review schema for structured JSON output
const goalReviewSchema = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: ['goal_review'],
      description: 'Type of analysis'
    },
    generated_date: {
      type: 'string',
      description: 'Date review was generated'
    },
    overall_assessment: {
      type: 'object',
      description: "Overall assessment of the athlete's goal set",
      properties: {
        summary: {
          type: 'string',
          description: '2-3 sentence overall assessment'
        },
        goal_balance: {
          type: 'string',
          enum: ['well_balanced', 'needs_rebalancing', 'too_ambitious', 'too_conservative'],
          description: 'Balance of goal set'
        },
        alignment_with_profile: {
          type: 'string',
          enum: ['excellent', 'good', 'fair', 'poor'],
          description: 'How well goals align with athlete profile'
        },
        key_concerns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Main concerns about current goals'
        }
      },
      required: ['summary', 'goal_balance', 'alignment_with_profile']
    },
    goal_reviews: {
      type: 'array',
      description: 'Individual reviews for each goal',
      items: {
        type: 'object',
        properties: {
          goalId: {
            type: 'string',
            description: 'ID of the goal being reviewed'
          },
          title: {
            type: 'string',
            description: 'Goal title'
          },
          assessment: {
            type: 'string',
            enum: [
              'realistic',
              'slightly_ambitious',
              'too_ambitious',
              'too_conservative',
              'needs_adjustment'
            ],
            description: 'Assessment of this specific goal'
          },
          rationale: {
            type: 'string',
            description: 'Why this assessment was given (2-3 sentences)'
          },
          progress_analysis: {
            type: 'string',
            description: 'Analysis of current progress toward goal'
          },
          recommendations: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific recommendations for this goal'
          },
          suggested_adjustments: {
            type: 'object',
            description: 'Suggested changes to goal parameters',
            properties: {
              targetValue: {
                type: 'number',
                description: 'Suggested new target value'
              },
              targetDate: {
                type: 'string',
                description: 'Suggested new target date'
              },
              priority: {
                type: 'string',
                enum: ['HIGH', 'MEDIUM', 'LOW'],
                description: 'Suggested priority change'
              },
              reasoning: {
                type: 'string',
                description: 'Why these adjustments are recommended'
              }
            }
          },
          risks: {
            type: 'array',
            items: { type: 'string' },
            description: 'Potential risks with this goal'
          },
          support_needed: {
            type: 'array',
            items: { type: 'string' },
            description: 'What the athlete needs to achieve this goal'
          }
        },
        required: ['goalId', 'title', 'assessment', 'rationale']
      }
    },
    goal_conflicts: {
      type: 'array',
      description: 'Identified conflicts between goals',
      items: {
        type: 'object',
        properties: {
          goals: {
            type: 'array',
            items: { type: 'string' },
            description: 'Titles of conflicting goals'
          },
          conflict_type: {
            type: 'string',
            enum: [
              'direct_conflict',
              'resource_competition',
              'timeline_overlap',
              'recovery_concern'
            ],
            description: 'Type of conflict'
          },
          description: {
            type: 'string',
            description: 'Description of the conflict'
          },
          severity: {
            type: 'string',
            enum: ['critical', 'moderate', 'minor'],
            description: 'How serious this conflict is'
          },
          resolution_options: {
            type: 'array',
            items: { type: 'string' },
            description: 'Ways to resolve this conflict'
          }
        },
        required: ['goals', 'conflict_type', 'description', 'severity']
      }
    },
    missing_areas: {
      type: 'array',
      description: 'Important areas not covered by current goals',
      items: {
        type: 'object',
        properties: {
          area: {
            type: 'string',
            description: 'Area that needs attention'
          },
          importance: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
            description: 'How important this area is'
          },
          suggestion: {
            type: 'string',
            description: 'What goal could address this area'
          }
        },
        required: ['area', 'importance', 'suggestion']
      }
    },
    action_plan: {
      type: 'object',
      description: 'Recommended next steps',
      properties: {
        immediate_actions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Actions to take right away'
        },
        goals_to_adjust: {
          type: 'array',
          items: { type: 'string' },
          description: 'Which goals should be modified'
        },
        goals_to_pause: {
          type: 'array',
          items: { type: 'string' },
          description: 'Goals that should be paused or archived'
        },
        new_goals_to_consider: {
          type: 'array',
          items: { type: 'string' },
          description: 'New goals to add'
        }
      },
      required: ['immediate_actions']
    }
  },
  required: ['type', 'generated_date', 'overall_assessment', 'goal_reviews']
}

export const reviewGoalsTask = task({
  id: 'review-goals',
  maxDuration: 300, // 5 minutes for AI processing
  queue: userReportsQueue,
  run: async (payload: { userId: string }) => {
    const { userId } = payload

    logger.log('Starting goals review', { userId })

    try {
      const timezone = await getUserTimezone(userId)
      const now = new Date()
      const todayEnd = getEndOfDayUTC(timezone, now)
      const thirtyDaysAgo = getStartOfDaysAgoUTC(timezone, 30)

      logger.log('Fetching athlete data and goals for review', {
        timezone,
        thirtyDaysAgo,
        todayEnd
      })

      // Fetch comprehensive data
      const [user, activeGoals, recentWorkouts, recentWellness, athleteProfile, recentReports] =
        await Promise.all([
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
              trainingConsistencyExplanation: true
            }
          }),
          prisma.goal.findMany({
            where: {
              userId,
              status: 'ACTIVE'
            },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              type: true,
              title: true,
              description: true,
              metric: true,
              currentValue: true,
              targetValue: true,
              startValue: true,
              targetDate: true,
              eventDate: true,
              priority: true,
              createdAt: true,
              aiContext: true
            }
          }),
          workoutRepository.getForUser(userId, {
            startDate: thirtyDaysAgo,
            endDate: todayEnd,
            limit: 20,
            orderBy: { date: 'desc' },
            select: {
              date: true,
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

      if (activeGoals.length === 0) {
        throw new Error('No active goals to review')
      }

      logger.log('Data fetched for review', {
        goalsToReview: activeGoals.length,
        workouts: recentWorkouts.length,
        hasProfile: !!athleteProfile
      })

      // Calculate training metrics
      const totalTSS = recentWorkouts.reduce((sum, w) => sum + (w.tss || 0), 0)
      const avgWorkoutDuration =
        recentWorkouts.length > 0
          ? recentWorkouts.reduce((sum, w) => sum + w.durationSec, 0) / recentWorkouts.length / 60
          : 0

      const avgRecovery =
        recentWellness.length > 0
          ? recentWellness.reduce((sum, w) => sum + (w.recoveryScore || 50), 0) /
            recentWellness.length
          : null

      // Format goals for review
      const goalsForReview = activeGoals
        .map((g) => {
          const daysToTarget = g.targetDate
            ? Math.ceil((new Date(g.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : null
          const daysActive = Math.ceil(
            (Date.now() - new Date(g.createdAt).getTime()) / (1000 * 60 * 60 * 24)
          )

          let progressPct = null
          if (g.startValue !== null && g.currentValue !== null && g.targetValue !== null) {
            const totalChange = g.targetValue - g.startValue
            const currentChange = g.currentValue - g.startValue
            progressPct = totalChange !== 0 ? Math.round((currentChange / totalChange) * 100) : 0
          }

          return `
Goal ID: ${g.id}
Title: ${g.title}
Type: ${g.type}
Description: ${g.description || 'N/A'}
Priority: ${g.priority}
Metric: ${g.metric || 'N/A'}
Start Value: ${g.startValue || 'N/A'}
Current Value: ${g.currentValue || 'N/A'}
Target Value: ${g.targetValue || 'N/A'}
Progress: ${progressPct !== null ? progressPct + '%' : 'N/A'}
Target Date: ${g.targetDate ? formatUserDate(g.targetDate, timezone) : 'N/A'}
Days to Target: ${daysToTarget !== null ? daysToTarget : 'N/A'}
Days Active: ${daysActive}
AI Context: ${g.aiContext || 'N/A'}`
        })
        .join('\n\n---\n\n')

      // Extract profile insights
      let profileInsights = ''
      if (athleteProfile) {
        const profile = athleteProfile.analysisJson as any
        profileInsights = `
ATHLETE PROFILE (from ${formatUserDate(athleteProfile.createdAt, timezone)}):
Executive Summary: ${profile?.executive_summary || 'N/A'}
Current Fitness: ${profile?.current_fitness?.status_label || 'N/A'}
Strengths: ${profile?.training_characteristics?.strengths?.join(', ') || 'N/A'}
Areas for Development: ${profile?.training_characteristics?.areas_for_development?.join(', ') || 'N/A'}
Current Focus: ${profile?.planning_context?.current_focus || 'N/A'}
Limitations: ${profile?.planning_context?.limitations?.join(', ') || 'N/A'}`
      }

      // Build comprehensive prompt
      const prompt = `You are an expert endurance sports coach reviewing an athlete's current goals for rationality and achievability.

USER PROFILE:
- FTP: ${user.ftp || 'Unknown'} watts
- Weight: ${user.weight || 'Unknown'} kg
- W/kg: ${user.ftp && user.weight ? (user.ftp / user.weight).toFixed(2) : 'Unknown'}
- Max HR: ${user.maxHr || 'Unknown'} bpm

ATHLETE PROFILE SCORES (1-10 scale):
- Current Fitness: ${user.currentFitnessScore || 'N/A'}/10
- Recovery Capacity: ${user.recoveryCapacityScore || 'N/A'}/10
- Nutrition Compliance: ${user.nutritionComplianceScore || 'N/A'}/10
- Training Consistency: ${user.trainingConsistencyScore || 'N/A'}/10

${profileInsights}

RECENT TRAINING (Last 30 days):
- Total workouts: ${recentWorkouts.length}
- Total TSS: ${totalTSS.toFixed(0)}
- Average workout duration: ${avgWorkoutDuration.toFixed(0)} minutes
- Average Recovery Score: ${avgRecovery ? avgRecovery.toFixed(0) + '%' : 'N/A'}

CURRENT ACTIVE GOALS TO REVIEW:
${goalsForReview}

INSTRUCTIONS:
Review each goal for:

1. **Realism**: Is the target achievable given current fitness, training volume, and timeframe?
2. **Alignment**: Does it align with the athlete's profile, strengths, and limitations?
3. **Progress**: Is current progress on track? If metrics are available, is progress rate appropriate?
4. **Conflicts**: Does it conflict with other goals or create unrealistic demands?
5. **Timing**: Is the timeframe appropriate? Too aggressive or too conservative?

For each goal, provide:
- Clear assessment (realistic, slightly ambitious, too ambitious, too conservative, needs adjustment)
- Specific rationale based on data
- Progress analysis if metrics available
- Concrete recommendations for improvement
- Any suggested adjustments to target, date, or priority
- Risks to watch for
- Support needed to succeed

Also identify:
- **Goal Conflicts**: Goals that compete for resources or contradict each other
- **Missing Areas**: Important areas not covered by current goals
- **Balance Issues**: Too many goals in one area, not enough in another

Provide an action plan with:
- Immediate actions
- Goals to adjust (and how)
- Goals to pause or archive
- New goals to consider

Be honest and constructive. The athlete wants real coaching advice, not cheerleading. Reference specific metrics and data points.`

      logger.log('Generating goal review with Gemini')

      // Generate structured review
      const reviewJson = await generateStructuredAnalysis(prompt, goalReviewSchema, 'flash', {
        userId,
        operation: 'goal_review',
        entityType: 'GoalReview',
        entityId: userId
      })

      logger.log('Goal review generated successfully', {
        goalsReviewed: reviewJson.goal_reviews?.length || 0,
        conflicts: reviewJson.goal_conflicts?.length || 0
      })

      return {
        success: true,
        userId,
        review: reviewJson
      }
    } catch (error) {
      logger.error('Error reviewing goals', { error })
      throw error
    }
  }
})
