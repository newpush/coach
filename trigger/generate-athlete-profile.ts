import { logger, task } from '@trigger.dev/sdk/v3'
import { generateStructuredAnalysis, buildWorkoutSummary } from '../server/utils/gemini'
import { prisma } from '../server/utils/db'
import { workoutRepository } from '../server/utils/repositories/workoutRepository'
import { wellnessRepository } from '../server/utils/repositories/wellnessRepository'
import { nutritionRepository } from '../server/utils/repositories/nutritionRepository'
import { userReportsQueue } from './queues'
import {
  generateTrainingContext,
  formatTrainingContextForPrompt
} from '../server/utils/training-metrics'
import {
  getUserTimezone,
  getStartOfDaysAgoUTC,
  getEndOfDayUTC,
  formatUserDate,
  getUserLocalDate
} from '../server/utils/date'
import { getCheckinHistoryContext } from '../server/utils/services/checkin-service'
import { getUserAiSettings } from '../server/utils/ai-settings'
import { recommendTodayActivityTask } from './recommend-today-activity'

// Athlete Profile schema for structured JSON output
const athleteProfileSchema = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: ['athlete_profile'],
      description: 'Type of report'
    },
    title: {
      type: 'string',
      description: 'Profile title'
    },
    generated_date: {
      type: 'string',
      description: 'Date profile was generated'
    },
    executive_summary: {
      type: 'string',
      description: "2-3 sentence overview of the athlete's current status"
    },
    current_fitness: {
      type: 'object',
      description: 'Current fitness assessment',
      properties: {
        status: {
          type: 'string',
          enum: ['excellent', 'good', 'moderate', 'developing', 'recovering'],
          description: 'Overall fitness status'
        },
        status_label: {
          type: 'string',
          description: 'Display label for status'
        },
        key_points: {
          type: 'array',
          items: { type: 'string' },
          description: 'Key fitness indicators (each as separate item, 1-2 sentences)'
        }
      },
      required: ['status', 'status_label', 'key_points']
    },
    training_characteristics: {
      type: 'object',
      description: 'How the athlete trains',
      properties: {
        training_style: {
          type: 'string',
          description: 'Training approach description'
        },
        strengths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Key strengths in training'
        },
        areas_for_development: {
          type: 'array',
          items: { type: 'string' },
          description: 'Areas that need attention'
        }
      },
      required: ['training_style', 'strengths', 'areas_for_development']
    },
    recovery_profile: {
      type: 'object',
      description: 'Recovery patterns and trends',
      properties: {
        recovery_pattern: {
          type: 'string',
          description: 'Overall recovery trend'
        },
        hrv_trend: {
          type: 'string',
          description: 'HRV trend analysis'
        },
        sleep_quality: {
          type: 'string',
          description: 'Sleep quality assessment'
        },
        key_observations: {
          type: 'array',
          items: { type: 'string' },
          description: 'Important recovery observations'
        }
      },
      required: ['recovery_pattern', 'key_observations']
    },
    nutrition_profile: {
      type: 'object',
      description: 'Nutrition patterns and adequacy',
      properties: {
        nutrition_pattern: {
          type: 'string',
          description: 'Overall nutrition trend and consistency'
        },
        caloric_balance: {
          type: 'string',
          description: 'Assessment of caloric intake relative to training demands'
        },
        macro_distribution: {
          type: 'string',
          description: 'Protein/carbs/fat balance assessment'
        },
        key_observations: {
          type: 'array',
          items: { type: 'string' },
          description: 'Important nutrition observations'
        }
      },
      required: ['nutrition_pattern', 'key_observations']
    },
    recent_performance: {
      type: 'object',
      description: 'Recent performance analysis from workout AI analysis',
      properties: {
        trend: {
          type: 'string',
          enum: ['improving', 'stable', 'declining', 'variable'],
          description: 'Performance trend'
        },
        notable_workouts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string' },
              title: { type: 'string' },
              key_insight: { type: 'string' }
            }
          },
          description: 'Highlighted workouts with insights'
        },
        patterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Performance patterns observed'
        }
      },
      required: ['trend', 'patterns']
    },
    recommendations_summary: {
      type: 'object',
      description: 'Summary from recent coaching recommendations',
      properties: {
        recurring_themes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Common themes from recent recommendations'
        },
        action_items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              priority: { type: 'string', enum: ['high', 'medium', 'low'] },
              action: { type: 'string' }
            }
          },
          description: 'Prioritized action items'
        }
      },
      required: ['recurring_themes', 'action_items']
    },
    planning_context: {
      type: 'object',
      description: 'Context for workout planning',
      properties: {
        current_focus: {
          type: 'string',
          description: 'What should be the focus right now'
        },
        limitations: {
          type: 'array',
          items: { type: 'string' },
          description: 'Current limitations or constraints'
        },
        opportunities: {
          type: 'array',
          items: { type: 'string' },
          description: 'Training opportunities'
        }
      },
      required: ['current_focus']
    },
    athlete_scores: {
      type: 'object',
      description:
        'Overall athlete profile scores on 1-10 scale for tracking development, with detailed explanations',
      properties: {
        current_fitness: {
          type: 'number',
          description: 'Current overall fitness level (1-10)',
          minimum: 1,
          maximum: 10
        },
        current_fitness_explanation: {
          type: 'string',
          description: 'Brief summary of current fitness level'
        },
        current_fitness_explanation_json: {
          type: 'object',
          description: 'Structured explanation of current fitness',
          properties: {
            executive_summary: { type: 'string', description: '2-3 sentence overview' },
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
                  analysis_points: { type: 'array', items: { type: 'string' } }
                }
              }
            },
            recommendations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  priority: { type: 'string', enum: ['high', 'medium', 'low'] }
                }
              }
            }
          },
          required: ['executive_summary', 'sections', 'recommendations']
        },
        recovery_capacity: {
          type: 'number',
          description: 'Ability to recover from training stress (1-10)',
          minimum: 1,
          maximum: 10
        },
        recovery_capacity_explanation: {
          type: 'string',
          description: 'Brief summary of recovery capacity'
        },
        recovery_capacity_explanation_json: {
          type: 'object',
          description: 'Structured explanation of recovery capacity',
          properties: {
            executive_summary: { type: 'string', description: '2-3 sentence overview' },
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
                  analysis_points: { type: 'array', items: { type: 'string' } }
                }
              }
            },
            recommendations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  priority: { type: 'string', enum: ['high', 'medium', 'low'] }
                }
              }
            }
          },
          required: ['executive_summary', 'sections', 'recommendations']
        },
        nutrition_compliance: {
          type: 'number',
          description: 'Nutrition adherence and quality (1-10)',
          minimum: 1,
          maximum: 10
        },
        nutrition_compliance_explanation: {
          type: 'string',
          description:
            "Detailed explanation of nutrition quality: calorie adherence patterns, macro balance, meal timing, and specific improvements needed (e.g., 'Increase protein to 2g/kg', 'Improve pre-workout carb intake')"
        },
        training_consistency: {
          type: 'number',
          description: 'Training consistency and adherence (1-10)',
          minimum: 1,
          maximum: 10
        },
        training_consistency_explanation: {
          type: 'string',
          description:
            "Detailed explanation of training consistency: weekly adherence patterns, missed sessions analysis, and strategies for improvement (e.g., 'Set specific training times', 'Prepare gear night before')"
        },
        hr_power_alignment: {
          type: 'number',
          description: 'How well do power and HR zones match? (1-10)',
          minimum: 1,
          maximum: 10
        },
        hr_power_alignment_explanation: {
          type: 'string',
          description:
            "Detailed explanation of HR/Power alignment: analysis of decoupling, HR drift in different activities, and zone correlation (e.g., 'Significant decoupling on long rides', 'MTB power surges not reflected in HR')"
        }
      },
      required: [
        'current_fitness',
        'current_fitness_explanation',
        'recovery_capacity',
        'recovery_capacity_explanation',
        'nutrition_compliance',
        'nutrition_compliance_explanation',
        'training_consistency',
        'training_consistency_explanation',
        'hr_power_alignment',
        'hr_power_alignment_explanation'
      ]
    }
  },
  required: [
    'type',
    'title',
    'generated_date',
    'executive_summary',
    'current_fitness',
    'training_characteristics',
    'recent_performance',
    'planning_context',
    'athlete_scores'
  ]
}

export const generateAthleteProfileTask = task({
  id: 'generate-athlete-profile',
  maxDuration: 300, // 5 minutes for AI processing
  queue: userReportsQueue,
  run: async (payload: { userId: string; reportId: string; triggerRecommendation?: boolean }) => {
    const { userId, reportId, triggerRecommendation } = payload

    logger.log('Starting athlete profile generation', { userId, reportId, triggerRecommendation })

    // Update report status
    await prisma.report.update({
      where: { id: reportId },
      data: { status: 'PROCESSING' }
    })

    try {
      const aiSettings = await getUserAiSettings(userId)
      const timezone = await getUserTimezone(userId)
      const now = new Date() // Current system time for "now" queries if needed, but better to use range end
      const todayEnd = getEndOfDayUTC(timezone, now)
      const thirtyDaysAgo = getStartOfDaysAgoUTC(timezone, 30)
      const sevenDaysAgo = getStartOfDaysAgoUTC(timezone, 7)

      logger.log('Fetching comprehensive athlete data', { timezone, thirtyDaysAgo, todayEnd })

      // Fetch all relevant data
      const [
        user,
        recentWorkouts,
        recentWellness,
        recentNutrition,
        recentReports,
        recentRecommendations,
        activeGoals,
        currentPlan
      ] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            ftp: true,
            weight: true,
            maxHr: true,
            dob: true,
            lthr: true,
            hrZones: true
          }
        }),
        workoutRepository.getForUser(userId, {
          startDate: thirtyDaysAgo,
          endDate: todayEnd,
          limit: 20,
          orderBy: { date: 'desc' },
          includeDuplicates: false,
          select: {
            id: true,
            date: true,
            title: true,
            type: true,
            durationSec: true,
            tss: true,
            averageWatts: true,
            aiAnalysisJson: true
          }
        }),
        wellnessRepository.getForUser(userId, {
          startDate: thirtyDaysAgo,
          endDate: todayEnd,
          limit: 30,
          orderBy: { date: 'desc' }
        }),
        nutritionRepository.getForUser(userId, {
          startDate: sevenDaysAgo,
          endDate: todayEnd,
          limit: 14,
          orderBy: { date: 'desc' },
          select: {
            id: true,
            date: true,
            calories: true,
            protein: true,
            carbs: true,
            fat: true,
            fiber: true,
            caloriesGoal: true,
            proteinGoal: true,
            carbsGoal: true,
            fatGoal: true
          }
        }),
        prisma.report.findMany({
          where: {
            userId,
            status: 'COMPLETED',
            createdAt: { gte: thirtyDaysAgo }
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            type: true,
            createdAt: true,
            analysisJson: true,
            suggestions: true
          }
        }),
        prisma.activityRecommendation.findMany({
          where: {
            userId,
            status: 'COMPLETED',
            date: { gte: sevenDaysAgo }
          },
          orderBy: { date: 'desc' },
          take: 7,
          select: {
            date: true,
            recommendation: true,
            reasoning: true,
            analysisJson: true
          }
        }),
        // Fetch active goals
        prisma.goal.findMany({
          where: {
            userId,
            status: 'ACTIVE'
          }
        }),
        // Fetch current active plan
        prisma.weeklyTrainingPlan.findFirst({
          where: {
            userId,
            status: 'ACTIVE',
            weekStartDate: {
              lte: todayEnd
            },
            weekEndDate: {
              gte: thirtyDaysAgo // Ensure overlap
            }
          },
          orderBy: { weekStartDate: 'desc' },
          select: {
            totalTSS: true,
            planJson: true
          }
        })
      ])

      logger.log('Data fetched', {
        workoutsWithAI: recentWorkouts.length,
        wellnessRecords: recentWellness.length,
        reportsCount: recentReports.length,
        recommendationsCount: recentRecommendations.length,
        activeGoals: activeGoals.length
      })

      // Build HR Zone Definitions
      let hrZoneDefinitions = ''
      if (user?.lthr) {
        hrZoneDefinitions += `**User HR Zone Definitions (from profile/settings):**\n`
        hrZoneDefinitions += `- LTHR: ${user.lthr} bpm\n`
        if (user.hrZones && Array.isArray(user.hrZones)) {
          user.hrZones.forEach((z: any) => {
            hrZoneDefinitions += `- ${z.name}: ${z.min}-${z.max} bpm\n`
          })
        } else {
          // Fallback if no custom zones but LTHR exists
          hrZoneDefinitions += `- Z1 Recovery: <${Math.round(user.lthr * 0.81)} bpm (<81% LTHR)\n`
          hrZoneDefinitions += `- Z2 Aerobic: ${Math.round(user.lthr * 0.81)}-${Math.round(user.lthr * 0.9)} bpm (81-90% LTHR)\n`
          hrZoneDefinitions += `- Z3 Tempo: ${Math.round(user.lthr * 0.9)}-${Math.round(user.lthr * 0.94)} bpm (90-94% LTHR)\n`
          hrZoneDefinitions += `- Z4 Threshold: ${Math.round(user.lthr * 0.94)}-${Math.round(user.lthr * 1.0)} bpm (94-100% LTHR)\n`
          hrZoneDefinitions += `- Z5+ VO2 Max: >${Math.round(user.lthr * 1.0)} bpm (>100% LTHR)\n`
        }
      }

      // Build workout insights from AI analysis
      const workoutInsights = recentWorkouts
        .filter((w) => w.aiAnalysisJson)
        .map((w) => {
          const analysis = w.aiAnalysisJson as any
          return `${formatUserDate(w.date, timezone)}: ${w.title} - ${analysis.quick_take || analysis.executive_summary || 'Analysis available'}`
        })
        .slice(0, 10)
        .join('\n')

      // Build wellness summary
      const avgRecovery =
        recentWellness.length > 0
          ? recentWellness.reduce((sum, w) => sum + (w.recoveryScore || 50), 0) /
            recentWellness.length
          : null
      const avgHRV =
        recentWellness.length > 0
          ? recentWellness.filter((w) => w.hrv).reduce((sum, w) => sum + (w.hrv || 0), 0) /
            recentWellness.filter((w) => w.hrv).length
          : null
      const avgHRVSdnn =
        recentWellness.length > 0
          ? recentWellness.filter((w) => w.hrvSdnn).reduce((sum, w) => sum + (w.hrvSdnn || 0), 0) /
            recentWellness.filter((w) => w.hrvSdnn).length
          : null

      const wellnessSummary = `Average Recovery: ${avgRecovery ? avgRecovery.toFixed(0) + '%' : 'N/A'}
Average HRV (rMSSD): ${avgHRV ? avgHRV.toFixed(0) + ' ms' : 'N/A'}
Average HRV (SDNN): ${avgHRVSdnn ? avgHRVSdnn.toFixed(0) + ' ms' : 'N/A'}
Recent sleep: ${recentWellness
        .slice(0, 7)
        .map((w) => `${w.sleepHours?.toFixed(1) || 'N/A'}h`)
        .join(', ')}`

      // Build Wellness Analysis History
      const wellnessAnalyses = recentWellness
        .filter((w) => w.aiAnalysisJson)
        .map((w) => {
          const analysis = w.aiAnalysisJson as any
          const status = analysis.status ? `[${analysis.status.toUpperCase()}]` : ''
          const summary = analysis.executive_summary || 'Analysis available'
          return `${formatUserDate(w.date, timezone)}: ${status} ${summary}`
        })
        .slice(0, 10) // Limit to 10 most recent
        .join('\n')

      const wellnessAnalysisSummary =
        wellnessAnalyses.length > 0
          ? `\n\nWELLNESS ANALYSIS HISTORY (Recent insights):\n${wellnessAnalyses}`
          : ''

      // Build recent recommendations summary
      const recommendationsSummary = recentRecommendations
        .map(
          (r) =>
            `${formatUserDate(r.date, timezone)}: ${r.recommendation.toUpperCase()} - ${r.reasoning}`
        )
        .join('\n')

      // Build recent reports summary
      const reportsSummary = recentReports
        .map((r) => {
          const json = r.analysisJson as any
          return `${r.type}: ${json?.executive_summary || 'Analysis completed'}`
        })
        .join('\n\n')

      // Build goals summary
      const goalsSummary =
        activeGoals.length > 0
          ? activeGoals
              .map((g) => {
                const daysToTarget = g.targetDate
                  ? Math.ceil(
                      (new Date(g.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                    )
                  : null
                const daysToEvent = g.eventDate
                  ? Math.ceil(
                      (new Date(g.eventDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                    )
                  : null

                let goalInfo = `[${g.priority}] ${g.title} (${g.type})`
                if (g.description) goalInfo += `\n  Description: ${g.description}`
                if (g.metric && g.targetValue) {
                  goalInfo += `\n  Target: ${g.metric} = ${g.targetValue}`
                  if (g.currentValue)
                    goalInfo += ` (Current: ${g.currentValue}, Start: ${g.startValue || 'N/A'})`
                }
                if (daysToTarget) goalInfo += `\n  Timeline: ${daysToTarget} days remaining`
                if (g.eventDate)
                  goalInfo += `\n  Event: ${g.eventType || 'race'} on ${formatUserDate(g.eventDate, timezone)} (${daysToEvent} days)`
                if (g.aiContext) goalInfo += `\n  Context: ${g.aiContext}`

                return goalInfo
              })
              .join('\n\n')
          : 'No active goals set'

      // Build current plan summary
      let currentPlanSummary = 'No active weekly plan.'
      if (currentPlan) {
        const planData = currentPlan.planJson as any
        currentPlanSummary = `
Active Plan TSS Target: ${currentPlan.totalTSS || planData.totalTSS || 'N/A'}
Plan Summary: ${planData.weekSummary || 'N/A'}
`
      }

      // Build Daily Check-in Summary
      const checkinHistory = await getCheckinHistoryContext(
        userId,
        thirtyDaysAgo,
        now, // Use 'now' or 'todayEnd' as end date
        timezone
      )

      const checkinsSummary = checkinHistory
        ? `\nDAILY CHECK-INS (Subjective Feedback):\n${checkinHistory}`
        : 'No recent check-ins'

      if (checkinHistory) {
        logger.log('Check-ins Summary for Profile Prompt', { checkinHistory })
      }

      // Calculate training stats
      const totalTSS = recentWorkouts.reduce((sum, w) => sum + (w.tss || 0), 0)
      const avgWorkoutDuration =
        recentWorkouts.length > 0
          ? recentWorkouts.reduce((sum, w) => sum + w.durationSec, 0) / recentWorkouts.length / 60
          : 0

      // Generate comprehensive training context with advanced metrics
      logger.log('Generating comprehensive training context')
      const trainingContext = await generateTrainingContext(userId, thirtyDaysAgo, todayEnd, {
        includeZones: true,
        period: 'Last 30 Days',
        timezone
      })
      const formattedContext = formatTrainingContextForPrompt(trainingContext)

      logger.log('Training context generated', {
        workoutCount: trainingContext.summary.totalWorkouts,
        totalTSS: trainingContext.summary.totalTSS,
        currentCTL: trainingContext.loadTrend.currentCTL,
        currentTSB: trainingContext.loadTrend.currentTSB,
        hasZoneData: !!trainingContext.hrZoneDistribution,
        hasCurrentPlan: !!currentPlan
      })

      // Build comprehensive prompt
      const prompt = `You are a **${aiSettings.aiPersona}** expert coach creating a comprehensive Athlete Profile for training planning purposes.
Analyze all available data to create a complete picture of this athlete.
Adapt your analysis tone and insights to match your **${aiSettings.aiPersona}** persona.

USER PROFILE:
- FTP: ${user?.ftp || 'Unknown'} watts
- Weight: ${user?.weight || 'Unknown'} kg
- W/kg: ${user?.ftp && user?.weight ? (user.ftp / user.weight).toFixed(2) : 'Unknown'}
- Max HR: ${user?.maxHr || 'Unknown'} bpm

${formattedContext}

${hrZoneDefinitions}

WORKOUT INSIGHTS (from AI analysis):
${workoutInsights || 'No detailed workout analysis available'}

RECENT TRAINING DETAILS (Last 20 sessions):
${buildWorkoutSummary(recentWorkouts, timezone)}

RECOVERY METRICS:
${wellnessSummary}${wellnessAnalysisSummary}

DAILY CHECK-INS (Subjective Feedback):
${checkinsSummary}

RECENT COACHING RECOMMENDATIONS (Last 7 days):
${recommendationsSummary || 'No recent recommendations'}

RECENT REPORTS & ANALYSIS:
${reportsSummary || 'No recent reports'}

CURRENT TRAINING PLAN:
${currentPlanSummary}

CURRENT GOALS:
${goalsSummary}

INSTRUCTIONS:
Create a comprehensive athlete profile that synthesizes all this data. This profile will be used for:
1. Planning future workouts
2. Understanding the athlete's current capabilities and limitations
3. Identifying patterns and trends
4. Making informed coaching decisions

Focus on:
- Current fitness state (not historical achievements, but current capability)
- Training patterns and how the athlete responds to different stimuli
- Recovery patterns and how well they handle training load
- Recent performance trends from workout analysis
- Key themes from recent recommendations
- **Current goals and their feasibility** given the athlete's current state
- **Current Plan Adherence**: How well is the athlete following the current plan? Are they meeting TSS targets?
- **Dual Intensity View**: Compare/contrast power vs HR distributions. Flag discrepancies (e.g., "74% Endurance power but only 60% Z2 HR -> HR drift in MTB")
- **HR-Specific Patterns**: Analyze drift, recovery HR drops between intervals, run vs bike differences
- **Zone Feasibility**: Assess if distributions support goals (e.g., "0% Z4 HR time blocks FTP progress")

Finally, provide **Athlete Profile Scores** (1-10 scale for tracking long-term development):
- **Current Fitness**: Overall fitness level based on recent training, FTP, and performance
- **Recovery Capacity**: How well they recover from training stress (HRV rMSSD, sleep, subjective metrics)
- **Nutrition Compliance**: Overall nutrition quality and adherence (if nutrition data available)
- **Training Consistency**: Adherence to training plans and consistency over time
- **HR/Power Alignment**: How well do power and HR zones match? (Critical for mixed-sport athletes).
  - 9-10: Perfect correlation across modalities
  - 5-6: Moderate drift but usable
  - 1-2: Significant mismatch (e.g., MTB power surges without HR response)

Scoring Guidelines:
- 9-10: Elite level in this aspect
- 7-8: Strong, well-developed
- 5-6: Average, developing
- 3-4: Needs attention and improvement
- 1-2: Significant weakness requiring focus

Be specific, data-driven, and actionable. Reference actual metrics and patterns observed. Scores should reflect realistic assessment for long-term tracking.
Maintain your **${aiSettings.aiPersona}** persona throughout.`

      logger.log('Generating athlete profile with Gemini')

      // Generate structured profile
      const profileJson = await generateStructuredAnalysis<any>(
        prompt,
        athleteProfileSchema,
        aiSettings.aiModelPreference,
        {
          userId,
          operation: 'athlete_profile_generation',
          entityType: 'Report',
          entityId: reportId
        }
      )

      logger.log('Athlete profile generated successfully', {
        scores: profileJson.athlete_scores
      })

      // Save profile as a report and update user scores
      await prisma.$transaction(async (tx) => {
        // Update the report with profile data
        await tx.report.update({
          where: { id: reportId },
          data: {
            status: 'COMPLETED',
            type: 'ATHLETE_PROFILE',
            analysisJson: profileJson as any,
            modelVersion: aiSettings.aiModelPreference,
            dateRangeStart: thirtyDaysAgo,
            dateRangeEnd: now
          }
        })

        // Update user profile scores and explanations for easy access
        await tx.user.update({
          where: { id: userId },
          data: {
            currentFitnessScore: profileJson.athlete_scores?.current_fitness,
            recoveryCapacityScore: profileJson.athlete_scores?.recovery_capacity,
            nutritionComplianceScore: profileJson.athlete_scores?.nutrition_compliance,
            trainingConsistencyScore: profileJson.athlete_scores?.training_consistency,
            currentFitnessExplanation: profileJson.athlete_scores?.current_fitness_explanation,
            recoveryCapacityExplanation: profileJson.athlete_scores?.recovery_capacity_explanation,
            nutritionComplianceExplanation:
              profileJson.athlete_scores?.nutrition_compliance_explanation,
            trainingConsistencyExplanation:
              profileJson.athlete_scores?.training_consistency_explanation,
            hrPowerAlignmentScore: profileJson.athlete_scores?.hr_power_alignment,
            hrPowerAlignmentExplanation: profileJson.athlete_scores?.hr_power_alignment_explanation,
            currentFitnessExplanationJson: profileJson.athlete_scores
              ?.current_fitness_explanation_json as any,
            recoveryCapacityExplanationJson: profileJson.athlete_scores
              ?.recovery_capacity_explanation_json as any,
            nutritionComplianceExplanationJson: profileJson.athlete_scores
              ?.nutrition_compliance_explanation_json as any,
            trainingConsistencyExplanationJson: profileJson.athlete_scores
              ?.training_consistency_explanation_json as any,
            profileLastUpdated: now
          }
        })
      })

      logger.log('Athlete profile and user scores saved to database')

      // CHAIN: Trigger Today's Recommendation (Only if requested)
      if (triggerRecommendation) {
        logger.log("🔄 Chaining: Triggering Today's Activity Recommendation...")
        try {
          const timezone = await getUserTimezone(userId)
          const today = getUserLocalDate(timezone)

          // Create pending recommendation
          const recommendation = await prisma.activityRecommendation.create({
            data: {
              userId,
              date: today,
              recommendation: 'proceed', // placeholder
              confidence: 0,
              reasoning: 'Analysis queued after profile update...',
              status: 'PROCESSING'
            }
          })

          await recommendTodayActivityTask.trigger(
            {
              userId,
              date: today,
              recommendationId: recommendation.id
            },
            {
              concurrencyKey: userId
            }
          )
          logger.log('✅ Triggered recommend-today-activity')
        } catch (err) {
          logger.error('❌ Failed to chain recommend-today-activity', { err })
        }
      } else {
        logger.log('⏹️ Chaining skipped: triggerRecommendation not set')
      }

      return {
        success: true,
        reportId,
        userId
      }
    } catch (error) {
      logger.error('Error generating athlete profile', { error })

      await prisma.report.update({
        where: { id: reportId },
        data: { status: 'FAILED' }
      })

      throw error
    }
  }
})
