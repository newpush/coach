import { logger, task } from '@trigger.dev/sdk/v3'
import { generateStructuredAnalysis, buildWorkoutSummary } from '../server/utils/gemini'
import { prisma } from '../server/utils/db'
import { workoutRepository } from '../server/utils/repositories/workoutRepository'
import { wellnessRepository } from '../server/utils/repositories/wellnessRepository'
import { dailyCheckinRepository } from '../server/utils/repositories/dailyCheckinRepository'
import { formatUserDate, formatDateUTC, getUserLocalDate } from '../server/utils/date'
import { calculateProjectedPMC, getCurrentFitnessSummary } from '../server/utils/training-stress'
import { getUserAiSettings } from '../server/utils/ai-settings'

const checkinSchema = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          text: { type: 'string' },
          reasoning: { type: 'string' }
        },
        required: ['id', 'text', 'reasoning']
      }
    }
  },
  required: ['questions']
}

interface CheckinAnalysis {
  questions: Array<{
    id: string
    text: string
    reasoning: string
  }>
}

export const generateDailyCheckinTask = task({
  id: 'generate-daily-checkin',
  maxDuration: 300,
  run: async (payload: { userId: string; date: Date; checkinId: string }) => {
    const { userId, date, checkinId } = payload
    const today = new Date(date)

    logger.log('Generating daily check-in questions', { userId, date: today })

    const aiSettings = await getUserAiSettings(userId)
    logger.log('Using AI settings', {
      model: aiSettings.aiModelPreference,
      persona: aiSettings.aiPersona
    })

    // Fetch all required data
    const [
      plannedWorkout,
      todayMetric,
      recentWorkouts,
      user,
      athleteProfile,
      activeGoals,
      currentFitness,
      pastCheckins,
      futureWorkouts,
      currentPlan,
      upcomingEvents
    ] = await Promise.all([
      // Today's planned workout
      prisma.plannedWorkout.findFirst({
        where: { userId, date: today },
        orderBy: { createdAt: 'desc' }
      }),

      // Today's recovery metrics
      wellnessRepository.getByDate(userId, today),

      // Last 14 days of workouts (Increased from 7 for better context)
      workoutRepository.getForUser(userId, {
        startDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        orderBy: { date: 'desc' },
        includeDuplicates: false
      }),

      // User profile
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          ftp: true,
          weight: true,
          timezone: true,
          maxHr: true,
          lthr: true
        }
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
      }),

      // Current Fitness State
      getCurrentFitnessSummary(userId),

      // Past 7 days check-ins
      dailyCheckinRepository.getHistory(
        userId,
        new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000),
        new Date(today.getTime() - 1)
      ),

      // Future planned workouts (next 7 days)
      prisma.plannedWorkout.findMany({
        where: {
          userId,
          date: {
            gt: today,
            lte: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
          }
        },
        orderBy: { date: 'asc' },
        select: {
          date: true,
          title: true,
          type: true,
          tss: true,
          description: true
        }
      }),

      // Current active training plan
      prisma.weeklyTrainingPlan.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
          weekStartDate: {
            lte: today
          },
          weekEndDate: {
            gte: today
          }
        },
        select: {
          planJson: true
        }
      }),

      // Upcoming Events (next 14 days)
      prisma.event.findMany({
        where: {
          userId,
          date: {
            gte: today,
            lte: new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)
          }
        },
        orderBy: { date: 'asc' }
      })
    ])

    const userTimezone = user?.timezone || 'UTC'

    // Normalize today to represent the user's local calendar day at UTC midnight
    // This ensures PMC calculation aligns with database dates
    const todayNormalized = getUserLocalDate(userTimezone, today)

    // Calculate Projected PMC Trends
    const projectedMetrics = calculateProjectedPMC(
      todayNormalized,
      new Date(todayNormalized.getTime() + 7 * 24 * 60 * 60 * 1000),
      currentFitness.ctl,
      currentFitness.atl,
      futureWorkouts
    )

    // Build context strings
    let athleteContext = ''
    if (athleteProfile?.analysisJson) {
      const profile = athleteProfile.analysisJson as any
      athleteContext = `
ATHLETE PROFILE (Generated ${formatUserDate(athleteProfile.createdAt, userTimezone)}):
${profile.executive_summary ? `Summary: ${profile.executive_summary}` : ''}
Current Fitness: ${profile.current_fitness?.status_label || 'Unknown'}
Training Style: ${profile.training_characteristics?.training_style || 'Unknown'}
`
    } else {
      athleteContext = `
ATHLETE BASIC INFO:
- FTP: ${user?.ftp || 'Unknown'} watts
- Weight: ${user?.weight || 'Unknown'} kg
- Max HR: ${user?.maxHr || 'Unknown'} bpm
`
    }

    let goalsContext = ''
    if (activeGoals.length > 0) {
      goalsContext = `
CURRENT GOALS:
${activeGoals
  .map((g) => {
    const daysToTarget = g.targetDate
      ? Math.ceil((new Date(g.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null
    let line = `- [${g.priority}] ${g.title} (${g.type})`
    if (daysToTarget) line += ` | ${daysToTarget} days to target`
    return line
  })
  .join('\n')}
`
    }

    // Build plan context
    let planContext = ''
    if (currentPlan) {
      const plan = currentPlan.planJson as any
      planContext = `
CURRENT TRAINING PLAN:
- Weekly Focus: ${plan.weekSummary || 'Not specified'}
- Planned TSS: ${plan.totalTSS || 'Unknown'}
`
    }

    // Upcoming Events
    let eventsContext = ''
    if (upcomingEvents.length > 0) {
      eventsContext = `
UPCOMING EVENTS (Next 14 Days):
${upcomingEvents.map((e) => `- ${formatDateUTC(e.date, 'EEE MMM dd')}: ${e.title} (${e.priority || 'B'})`).join('\n')}
`
    }

    // Future Workouts
    let upcomingWorkoutsContext = ''
    if (futureWorkouts.length > 0) {
      upcomingWorkoutsContext = `
UPCOMING PLANNED WORKOUTS (Next 7 Days):
${futureWorkouts.map((w) => `- ${formatDateUTC(w.date, 'EEE dd')}: ${w.title} (TSS: ${w.tss || 'N/A'})`).join('\n')}
`
    }

    // Projected Trends
    let projectedMetricsContext = ''
    if (projectedMetrics.length > 0) {
      projectedMetricsContext = `
PROJECTED FITNESS TRENDS (Next 7 Days):
${projectedMetrics.map((m) => `- ${formatDateUTC(m.date, 'EEE dd')}: TSB=${Math.round(m.tsb)}`).join('\n')}
`
    }

    // Process past check-ins
    let historyContext = ''
    if (pastCheckins.length > 0) {
      historyContext = `
PAST CHECK-INS (Last 7 days):
${pastCheckins
  .map((c) => {
    const qs = c.questions as any[]
    const dateStr = formatUserDate(c.date, userTimezone, 'yyyy-MM-dd')
    let output =
      `Date: ${dateStr}\n` +
      qs.map((q) => `- Q: ${q.text} -> A: ${q.answer || 'No Answer'}`).join('\n')

    if (c.userNotes) {
      output += `\n- User Notes: "${c.userNotes}"`
    }
    return output
  })
  .join('\n\n')}
`
    }

    const prompt = `You are a **${aiSettings.aiPersona}** cycling coach conducting a daily check-in with your athlete.
Adopt your **${aiSettings.aiPersona}** persona in your tone and questioning style.

DATE: ${formatUserDate(today, userTimezone, 'yyyy-MM-dd')}

${athleteContext}
${goalsContext}
${planContext}

CURRENT STATUS:
- CTL: ${currentFitness.ctl.toFixed(1)}
- TSB: ${currentFitness.tsb.toFixed(1)} (${currentFitness.formStatus.status})

TODAY'S PLANNED WORKOUT:
${plannedWorkout ? `${plannedWorkout.title} (TSS: ${plannedWorkout.tss || 'N/A'})` : 'No workout planned'}

TODAY'S RECOVERY:
${todayMetric ? `Recovery: ${todayMetric.recoveryScore ?? 'N/A'}%, HRV: ${todayMetric.hrv ?? 'N/A'}ms, Sleep: ${todayMetric.sleepHours?.toFixed(1) ?? 'N/A'}h` : 'No recovery data'}

RECENT TRAINING (Last 14 Days):
${recentWorkouts.length > 0 ? buildWorkoutSummary(recentWorkouts.slice(0, 5), userTimezone) : 'None'}

${upcomingWorkoutsContext}
${eventsContext}
${projectedMetricsContext}

${historyContext}

TASK:
Generate a set of 3 to 5 YES/NO questions to assess the athlete's readiness, mental state, and potential issues (niggles, stress, motivation) that might not be captured by the hard data.

STRATEGY:
1. **Contextualize:** Use the upcoming events and workouts to ask relevant forward-looking questions (e.g., "Are you mentally ready for the big climb on Saturday?").
2. **Recover & Adapt:** If TSB is low or recent training was hard, ask about physical sensations (soreness, fatigue).
3. **Trend Spotting:** Use past check-in answers. If they reported soreness yesterday, follow up today ("Is your quad still bothering you?").
4. **Data Gaps:** Ask about things the data doesn't show (stress at work, nutrition quality, motivation).
5. **Avoid Redundancy:** Do NOT ask "Did you sleep well?" if the sleep score is 95%. Instead ask "Do you feel energized despite the short sleep?" if sleep was short but high quality, or skip it.

REQUIREMENTS:
1. Questions must be answerable with YES or NO.
2. Provide a brief reasoning for why you are asking this question.
3. Max 5 questions, Min 3.
4. Tone: Supportive, curious, professional. Match your **${aiSettings.aiPersona}** persona.

OUTPUT JSON FORMAT:
{
  "questions": [
    { "id": "q1", "text": "Are you feeling any residual soreness in your quads?", "reasoning": "You had a hard interval session yesterday." },
    ...
  ]
}
`

    logger.log(`Generating questions with Gemini (${aiSettings.aiModelPreference})`)

    let currentLlmUsageId: string | undefined

    const analysis = await generateStructuredAnalysis<CheckinAnalysis>(
      prompt,
      checkinSchema,
      aiSettings.aiModelPreference,
      {
        userId,
        operation: 'daily_checkin',
        entityType: 'DailyCheckin',
        entityId: checkinId,
        onUsageLogged: (usageId) => {
          currentLlmUsageId = usageId
        }
      }
    )

    // Save questions
    await dailyCheckinRepository.update(checkinId, {
      questions: analysis.questions,
      status: 'COMPLETED',
      modelVersion: aiSettings.aiModelPreference,
      llmUsageId: currentLlmUsageId
    })

    return {
      success: true,
      questions: analysis.questions
    }
  }
})
