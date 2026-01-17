import { logger, task } from '@trigger.dev/sdk/v3'
import { generateStructuredAnalysis } from '../server/utils/gemini'
import { prisma } from '../server/utils/db'
import { workoutRepository } from '../server/utils/repositories/workoutRepository'
import { wellnessRepository } from '../server/utils/repositories/wellnessRepository'
import { userReportsQueue } from './queues'
import {
  generateTrainingContext,
  formatTrainingContextForPrompt
} from '../server/utils/training-metrics'
import {
  getUserLocalDate,
  getUserTimezone,
  getStartOfDaysAgoUTC,
  getEndOfDayUTC,
  formatUserDate
} from '../server/utils/date'
import { getUserAiSettings } from '../server/utils/ai-settings'

const suggestionSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['proceed', 'modify', 'rest', 'reduce_intensity'],
      description: 'The recommended action'
    },
    reason: {
      type: 'string',
      description: 'Explanation for the recommendation'
    },
    confidence: {
      type: 'number',
      description: 'Confidence level from 0 to 1'
    },
    modification: {
      type: 'string',
      description: 'Specific workout modification if applicable'
    }
  },
  required: ['action', 'reason', 'confidence']
}

export const dailyCoachTask = task({
  id: 'daily-coach',
  queue: userReportsQueue,
  run: async (payload: { userId: string }) => {
    const { userId } = payload

    logger.log('Starting daily coach analysis', { userId })

    const timezone = await getUserTimezone(userId)
    const todayDateOnly = getUserLocalDate(timezone)
    const yesterdayStart = getStartOfDaysAgoUTC(timezone, 1)
    const yesterdayEnd = getEndOfDayUTC(timezone, yesterdayStart)
    const todayStart = getStartOfDaysAgoUTC(timezone, 0)
    const todayEnd = getEndOfDayUTC(timezone, todayStart)

    // Fetch data
    const [yesterdayWorkout, todayMetric, user, athleteProfile, activeGoals] = await Promise.all([
      workoutRepository
        .getForUser(userId, {
          startDate: yesterdayStart,
          endDate: yesterdayEnd,
          limit: 1,
          orderBy: { date: 'desc' },
          includeDuplicates: false
        })
        .then((workouts) => workouts[0]),
      wellnessRepository.getByDate(userId, todayDateOnly),
      prisma.user.findUnique({
        where: { id: userId },
        select: { ftp: true, weight: true, maxHr: true }
      }),

      // Latest athlete profile
      prisma.report.findFirst({
        where: {
          userId,
          type: 'ATHLETE_PROFILE',
          status: 'COMPLETED'
        },
        orderBy: { createdAt: 'desc' },
        select: { analysisJson: true, createdAt: true }
      }),

      // Active goals
      prisma.goal.findMany({
        where: {
          userId,
          status: 'ACTIVE'
        },
        orderBy: { priority: 'desc' },
        select: {
          title: true,
          type: true,
          description: true,
          targetDate: true,
          eventDate: true,
          priority: true
        }
      })
    ])

    logger.log('Data fetched', {
      hasYesterdayWorkout: !!yesterdayWorkout,
      hasTodayMetric: !!todayMetric,
      hasAthleteProfile: !!athleteProfile,
      activeGoals: activeGoals.length
    })

    // Generate comprehensive training context (Last 30 Days)
    const thirtyDaysAgo = getStartOfDaysAgoUTC(timezone, 30)
    const trainingContext = await generateTrainingContext(userId, thirtyDaysAgo, todayEnd, {
      includeZones: false, // Skip expensive zone calculation for daily check
      period: 'Last 30 Days',
      timezone // Pass timezone for correct day alignment in metrics
    })
    const formattedContext = formatTrainingContextForPrompt(trainingContext)

    // Build athlete profile context
    let athleteContext = ''
    if (athleteProfile?.analysisJson) {
      const profile = athleteProfile.analysisJson as any
      athleteContext = `
ATHLETE PROFILE (Generated ${formatUserDate(athleteProfile.createdAt, timezone)}):
${profile.executive_summary ? `Summary: ${profile.executive_summary}` : ''}

Current Fitness: ${profile.current_fitness?.status_label || 'Unknown'}
Recovery Profile: ${profile.recovery_profile?.recovery_pattern || 'Unknown'}
Recent Performance: ${profile.recent_performance?.trend || 'Unknown'}
Current Focus: ${profile.planning_context?.current_focus || 'General training'}
`
    } else {
      athleteContext = `
USER INFO:
- FTP: ${user?.ftp || 'Unknown'} watts
- Weight: ${user?.weight || 'Unknown'} kg
- Max HR: ${user?.maxHr || 'Unknown'} bpm
`
    }

    // Add goals context
    if (activeGoals.length > 0) {
      athleteContext += `
      
CURRENT GOALS:
${activeGoals
  .map((g) => {
    const daysToTarget = g.targetDate
      ? Math.ceil((new Date(g.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null
    const daysToEvent = g.eventDate
      ? Math.ceil((new Date(g.eventDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null

    let goalLine = `- [${g.priority}] ${g.title} (${g.type})`
    if (g.description) goalLine += ` - ${g.description}`
    if (daysToTarget) goalLine += ` | ${daysToTarget} days to target`
    if (daysToEvent) goalLine += ` | Event in ${daysToEvent} days`

    return goalLine
  })
  .join('\n')}
`
    }

    const aiSettings = await getUserAiSettings(userId)
    logger.log('Using AI settings', {
      model: aiSettings.aiModelPreference,
      persona: aiSettings.aiPersona
    })

    // Build prompt with comprehensive context
    const prompt = `You are a **${aiSettings.aiPersona}** cycling coach providing daily workout guidance.
Adapt your tone and style to match your persona.

${athleteContext}

${formattedContext}

YESTERDAY'S TRAINING:
${
  yesterdayWorkout
    ? `${yesterdayWorkout.title} - TSS: ${yesterdayWorkout.tss || 'N/A'}, Duration: ${Math.round(yesterdayWorkout.durationSec / 60)} min, Avg Power: ${yesterdayWorkout.averageWatts || 'N/A'}W`
    : 'Rest day or no data'
}

TODAY'S RECOVERY:
${
  todayMetric
    ? `- Recovery Score: ${todayMetric.recoveryScore ?? 'Unknown'}${todayMetric.recoveryScore !== null ? '%' : ''}
- HRV (rMSSD): ${todayMetric.hrv ?? 'Unknown'} ms
- HRV (SDNN): ${todayMetric.hrvSdnn ?? 'Unknown'} ms
- Resting HR: ${todayMetric.restingHr ?? 'Unknown'} bpm
- Sleep: ${todayMetric.sleepHours?.toFixed(1) ?? 'Unknown'} hours (Score: ${todayMetric.sleepScore ?? 'Unknown'}%)
${todayMetric.spO2 ? `- SpO2: ${todayMetric.spO2}%` : ''}`
    : 'No recovery data available'
}

DECISION LOGIC:
Use Training Stress Balance (TSB/Form) as primary indicator:
- TSB > 25: Detraining risk - need more training stimulus
- TSB 5 to 25: Peak form - good for race/event day
- TSB -10 to 5: Maintenance - steady training
- TSB -25 to -10: Building fitness - optimal training zone
- TSB -40 to -25: High fatigue - reduce intensity
- TSB < -40: Overreaching - rest required

Also consider:
- Recovery Score < 33% (or Poor proxy metrics): Recommend rest or very easy activity
- Recovery 33-50%: Reduce intensity significantly
- Recovery 50-67%: Proceed with caution, modify as needed
- Recovery 67-80%: Proceed as planned
- Recovery > 80%: Good day for high intensity
- Yesterday's TSS was ${yesterdayWorkout?.tss || 0}
- Multiple high-load days increase fatigue risk
- Low HRV combined with high HR indicates stress
- Poor sleep (<7h) reduces training capacity
${activeGoals.length > 0 ? `- Consider how today's recommendation impacts progress toward active goals` : ''}

CRITICAL: Base your recommendation on the comprehensive training load data above, especially TSB (Form), not just today's recovery metrics. If Recovery Score is "Unknown", rely on TSB, HRV trend, and Sleep.

Provide a structured recommendation for today's training${activeGoals.length > 0 ? ", considering the athlete's current goals and training load" : ''}.

CRITICAL INSTRUCTIONS:
1. PRIORITIZE the "Training Load & Form" metrics provided in the training context above for any fitness assessment.
2. IGNORE any conflicting TSB/CTL values found in the "ATHLETE PROFILE" section if they differ from the fresh metrics, as the profile may contain stale summaries.
3. Base your recommendation on the current TSB and recovery metrics.
4. Maintain your **${aiSettings.aiPersona}** persona throughout.`

    logger.log(`Generating suggestion with Gemini (${aiSettings.aiModelPreference})`)

    const suggestion = await generateStructuredAnalysis(
      prompt,
      suggestionSchema,
      aiSettings.aiModelPreference,
      {
        userId,
        operation: 'daily_coach_suggestion',
        entityType: 'Report',
        entityId: undefined
      }
    )

    logger.log('Suggestion generated', { suggestion })

    // Save suggestion as report
    const report = await prisma.report.create({
      data: {
        userId,
        type: 'DAILY_SUGGESTION',
        status: 'COMPLETED',
        dateRangeStart: todayDateOnly,
        dateRangeEnd: todayDateOnly,
        modelVersion: aiSettings.aiModelPreference,
        suggestions: suggestion as any
      }
    })

    logger.log('Suggestion saved', { reportId: report.id })

    return {
      success: true,
      reportId: report.id,
      userId,
      suggestion
    }
  }
})
