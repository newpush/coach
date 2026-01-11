import { logger, task } from '@trigger.dev/sdk/v3'
import { generateStructuredAnalysis, buildWorkoutSummary } from '../server/utils/gemini'
import { prisma } from '../server/utils/db'
import { workoutRepository } from '../server/utils/repositories/workoutRepository'
import { wellnessRepository } from '../server/utils/repositories/wellnessRepository'
import { formatUserDate } from '../server/utils/date'
import { calculateProjectedPMC, getCurrentFitnessSummary } from '../server/utils/training-stress'

const recommendationSchema = {
  type: 'object',
  properties: {
    recommendation: {
      type: 'string',
      enum: ['proceed', 'modify', 'reduce_intensity', 'rest']
    },
    confidence: { type: 'number' },
    reasoning: { type: 'string' },
    planned_workout: {
      type: 'object',
      properties: {
        original_title: { type: 'string' },
        original_tss: { type: 'number' },
        original_duration_min: { type: 'number' }
      }
    },
    suggested_modifications: {
      type: 'object',
      properties: {
        action: { type: 'string' },
        new_title: { type: 'string' },
        new_tss: { type: 'number' },
        new_duration_min: { type: 'number' },
        zone_adjustments: { type: 'string' },
        description: { type: 'string' }
      }
    },
    recovery_analysis: {
      type: 'object',
      properties: {
        hrv_status: { type: 'string' },
        sleep_quality: { type: 'string' },
        fatigue_level: { type: 'string' },
        readiness_score: { type: 'number' }
      }
    },
    key_factors: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: ['recommendation', 'confidence', 'reasoning']
}

export const recommendTodayActivityTask = task({
  id: 'recommend-today-activity',
  maxDuration: 300,
  run: async (payload: {
    userId: string
    date: Date
    recommendationId?: string
    userFeedback?: string
  }) => {
    const { userId, date, recommendationId, userFeedback } = payload

    // Set date to start of day
    const today = new Date(date)
    // today.setHours(0, 0, 0, 0); // Removed to prevent timezone shifting. Input is already UTC midnight.

    logger.log("Starting today's activity recommendation", { userId, date: today })

    // Fetch all required data
    const [
      plannedWorkout,
      todayMetric,
      recentWorkouts,
      user,
      athleteProfile,
      activeGoals,
      futureWorkouts,
      currentPlan,
      upcomingEvents,
      currentFitness
    ] = await Promise.all([
      // Today's planned workout
      prisma.plannedWorkout.findFirst({
        where: { userId, date: today },
        orderBy: { createdAt: 'desc' }
      }),

      // Today's recovery metrics from Wellness table (WHOOP, Intervals.icu, etc.)
      wellnessRepository.getByDate(userId, today),

      // Last 7 days of workouts for context
      workoutRepository.getForUser(userId, {
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        orderBy: { date: 'desc' },
        includeDuplicates: false
      }),

      // User profile
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          ftp: true,
          weight: true,
          maxHr: true,
          timezone: true,
          lthr: true,
          hrZones: true,
          powerZones: true
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

      // Future planned workouts (next 14 days)
      prisma.plannedWorkout.findMany({
        where: {
          userId,
          date: {
            gt: today,
            lte: new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)
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
      }),

      // Current Fitness State
      getCurrentFitnessSummary(userId)
    ])

    logger.log('Data fetched', {
      hasPlannedWorkout: !!plannedWorkout,
      hasTodayMetric: !!todayMetric,
      recentWorkoutsCount: recentWorkouts.length,
      hasAthleteProfile: !!athleteProfile,
      activeGoalsCount: activeGoals.length,
      futureWorkoutsCount: futureWorkouts.length,
      upcomingEventsCount: upcomingEvents.length,
      currentFitness
    })

    // Calculate Projected PMC Trends
    const projectedMetrics = calculateProjectedPMC(
      today,
      new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000),
      currentFitness.ctl,
      currentFitness.atl,
      futureWorkouts
    )

    // Calculate local time context
    const userTimezone = user?.timezone || 'UTC'
    const now = new Date()
    const localTime = now.toLocaleTimeString('en-US', {
      timeZone: userTimezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })

    // Use target date string for the prompt to ensure alignment with "Today"
    // If today is UTC midnight (from DB or payload), formatUserDate might shift it to previous day in EST
    // But since 'today' comes from payload/DB date which is MEANT to be "Start of Day User TZ",
    // we should trust the input date DATE part if it was passed as string,
    // OR if we are processing "Today", we want the User's Current Date.

    // However, if the system is designed where 'date' payload is UTC Midnight representing the day,
    // then 'formatUserDate' WILL shift it.
    // We want the literal date string "YYYY-MM-DD" that matches the user's intent.
    // If today is 2026-01-10T00:00:00Z, we want "2026-01-10".
    const targetDateStr = today.toISOString().split('T')[0] // Force UTC Date string (Naive)

    // Format for display (Friday, January 10, 2026)
    // We manually construct it to avoid timezone shift
    const targetDateObj = new Date(targetDateStr + 'T12:00:00') // Noon Local
    const localDate = targetDateObj.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })

    // Split workouts into "Today's" and "Past"
    // Use the same naive split for comparison to match DB @db.Date behavior
    const todaysWorkouts = recentWorkouts.filter(
      (w) => formatUserDate(w.date, userTimezone, 'yyyy-MM-dd') === targetDateStr
    )
    const pastWorkouts = recentWorkouts.filter(
      (w) => formatUserDate(w.date, userTimezone, 'yyyy-MM-dd') !== targetDateStr
    )

    // Build athlete profile context
    let athleteContext = ''
    if (athleteProfile?.analysisJson) {
      const profile = athleteProfile.analysisJson as any
      athleteContext = `
ATHLETE PROFILE (Generated ${new Date(athleteProfile.createdAt).toLocaleDateString()}):
${profile.executive_summary ? `Summary: ${profile.executive_summary}` : ''}

Current Fitness: ${profile.current_fitness?.status_label || 'Unknown'}
${profile.current_fitness?.key_points ? profile.current_fitness.key_points.map((p: string) => `- ${p}`).join('\n') : ''}

Training Characteristics:
${profile.training_characteristics?.training_style || 'No data'}
Strengths: ${profile.training_characteristics?.strengths?.join(', ') || 'None listed'}
Areas for Development: ${profile.training_characteristics?.areas_for_development?.join(', ') || 'None listed'}

Recovery Profile: ${profile.recovery_profile?.recovery_pattern || 'Unknown'}
${profile.recovery_profile?.key_observations ? profile.recovery_profile.key_observations.map((o: string) => `- ${o}`).join('\n') : ''}

Recent Performance Trend: ${profile.recent_performance?.trend || 'Unknown'}

Planning Context:
${profile.planning_context?.current_focus ? `Current Focus: ${profile.planning_context.current_focus}` : ''}
${profile.planning_context?.limitations?.length ? `Limitations: ${profile.planning_context.limitations.join(', ')}` : ''}
${profile.planning_context?.opportunities?.length ? `Opportunities: ${profile.planning_context.opportunities.join(', ')}` : ''}
`
    } else {
      athleteContext = `
ATHLETE BASIC INFO:
- FTP: ${user?.ftp || 'Unknown'} watts
- Weight: ${user?.weight || 'Unknown'} kg
- Max HR: ${user?.maxHr || 'Unknown'} bpm
Note: No structured athlete profile available yet. Generate one for better recommendations.
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

    // Build upcoming events summary
    let eventsContext = ''
    if (upcomingEvents.length > 0) {
      eventsContext = `
UPCOMING EVENTS (Next 14 Days):
${upcomingEvents
  .map(
    (e) =>
      `- ${formatUserDate(e.date, userTimezone, 'EEE MMM dd')}: ${e.title} (${e.type || 'Event'}) - Priority: ${e.priority || 'B'}`
  )
  .join('\n')}
`
    }

    // Build upcoming workouts summary (Next 14 Days)
    let upcomingContext = ''
    if (futureWorkouts.length > 0) {
      upcomingContext = `
UPCOMING PLANNED WORKOUTS (Next 14 Days):
${futureWorkouts
  .map(
    (w) =>
      `- ${formatUserDate(w.date, userTimezone, 'EEE dd')}: ${w.title} (TSS: ${w.tss || 'N/A'})`
  )
  .join('\n')}
`
    }

    // Build Projected Metrics Context
    let metricsContext = ''
    if (projectedMetrics.length > 0) {
      metricsContext = `
PROJECTED FITNESS TRENDS (Next 14 Days based on plan):
${projectedMetrics
  .map(
    (m) =>
      `- ${formatUserDate(m.date, userTimezone, 'EEE dd')}: CTL=${Math.round(m.ctl)}, TSB=${Math.round(m.tsb)}`
  )
  .join('\n')}
`
    }

    // Build zone definitions
    let zoneDefinitions = ''
    if (user?.hrZones && Array.isArray(user.hrZones)) {
      zoneDefinitions += '**User HR Zones:**\n'
      user.hrZones.forEach((z: any) => {
        zoneDefinitions += `- ${z.name}: ${z.min}-${z.max} bpm\n`
      })
    }
    // Also explicitly list Z2 if lthr is present
    if (user?.lthr) {
      zoneDefinitions += `\n**Reference LTHR:** ${user.lthr} bpm\n`
      zoneDefinitions += `**Zone 2 (LTHR-based):** ${Math.round(user.lthr * 0.8)}-${Math.round(user.lthr * 0.9)} bpm (80-90% LTHR)\n`
    }

    // Build current fitness context
    const currentStatusContext = `
CURRENT ATHLETE STATUS (Source of Truth):
- Chronic Training Load (CTL/Fitness): ${currentFitness.ctl.toFixed(1)}
- Acute Training Load (ATL/Fatigue): ${currentFitness.atl.toFixed(1)}
- Training Stress Balance (TSB/Form): ${currentFitness.tsb.toFixed(1)} (${currentFitness.formStatus.status})
- Status Description: ${currentFitness.formStatus.description}
- Metrics Last Updated: ${currentFitness.lastUpdated ? formatUserDate(currentFitness.lastUpdated, userTimezone, 'MMM dd, HH:mm') : 'Unknown'}
`

    // Build comprehensive prompt
    const prompt = `You are an expert cycling coach analyzing today's training for your athlete.

CURRENT CONTEXT:
- Date: ${localDate}
- Time: ${localTime}
- Timezone: ${userTimezone}

${currentStatusContext}

${athleteContext}
${planContext}

TODAY'S PLANNED WORKOUT:
${
  plannedWorkout
    ? `
- Title: ${plannedWorkout.title}
- Duration: ${plannedWorkout.durationSec ? Math.round(plannedWorkout.durationSec / 60) : 'Unknown'} minutes
- TSS: ${plannedWorkout.tss || 'Unknown'}
- Type: ${plannedWorkout.type || 'Unknown'}
- Description: ${plannedWorkout.description || 'None'}
`
    : 'No workout planned for today'
}

${upcomingContext}
${eventsContext}
${metricsContext}

TODAY'S RECOVERY METRICS:
${
  todayMetric
    ? `
- Recovery Score: ${todayMetric.recoveryScore ?? 'Unknown'}${todayMetric.recoveryScore !== null ? '%' : ''}
- HRV: ${todayMetric.hrv ?? 'Unknown'} ms
- Resting HR: ${todayMetric.restingHr ?? 'Unknown'} bpm
- Sleep: ${todayMetric.sleepHours?.toFixed(1) ?? 'Unknown'} hours (Score: ${todayMetric.sleepScore ?? 'Unknown'}%)
${todayMetric.spO2 ? `- SpO2: ${todayMetric.spO2}%` : ''}
`
    : 'No recovery data available'
}

TODAY'S COMPLETED TRAINING:
${todaysWorkouts.length > 0 ? buildWorkoutSummary(todaysWorkouts) : 'None so far'}

RECENT TRAINING (Last 7 days):
${pastWorkouts.length > 0 ? buildWorkoutSummary(pastWorkouts) : 'No recent workouts'}

${
  userFeedback
    ? `USER FEEDBACK / OBJECTION:
"${userFeedback}"
IMPORTANT: The user has explicitly provided this feedback. You MUST take it into account and adjust your recommendation accordingly. If they say they are tired, recommend rest or easy. If they want to push, allow it if safety permits.`
    : ''
}

CRITICAL INSTRUCTIONS:
1. ALWAYS use the user's custom zones defined below.
2. PRIORITIZE the "CURRENT ATHLETE STATUS (Source of Truth)" metrics above for any fitness assessment.
3. IGNORE any conflicting TSB/CTL values found in the "ATHLETE PROFILE" section if they differ from the Source of Truth, as they may be stale summaries.
4. Refer to the "PROJECTED FITNESS TRENDS" for future state, but base your primary decision on the current TSB and recovery metrics.

${zoneDefinitions}

When suggesting modifications (e.g. "Ride in Zone 2"), target ONLY the user's defined Z2 range. Never use generic percentages - always reference the user's custom zones first.

TASK:
Analyze whether the athlete should proceed with today's planned workout or modify it based on their current recovery state, recent training load, AND FUTURE PLANS. 

**IMPORTANT**: Pay close attention to the "AI Analysis Insights" in the RECENT TRAINING section. If recent workouts highlight persistent technical weaknesses, fatigue-related pacing issues, or specific improvement recommendations, incorporate those insights into today's guidance.

DECISION CRITERIA:
1. **Recovery Status**:
   - Recovery < 33%: Strong recommendation for rest or active recovery (Zone 1).
   - Recovery 33-50%: Reduce intensity (cap at Zone 2/3).
   - Recovery 50-67%: Modify if workout is hard (Threshold+).
   - Recovery 67-80%: Proceed as planned.
   - Recovery > 80%: Good day for intensity.

2. **Future Load & Events (PROACTIVE LOAD MANAGEMENT)**:
   - Check the **Upcoming Events** list. If an 'A' or 'B' priority event is within 48-72 hours, ensure freshness (TSB > -10). Recommend tapering/easy rides if fatigue is high.
   - Review **Projected Fitness Trends**. If TSB is projected to drop below -30 (High Risk) in the next few days, consider reducing load TODAY to prevent overreaching, unless it is a planned "Overload Block".
   - If a massive workout (TSS > 150) is planned tomorrow, consider saving matches today.

**If Recovery Score is "Unknown"**: Infer recovery status from Sleep (quality/duration), HRV trends, and Resting HR.

- **Late in the day**: If it is late (e.g. > 20:00) and workout not done, suggest Rest or Short version.
- **Completed Training**: If user already trained today, recommend REST or mark as complete.

Provide specific, actionable recommendations with clear reasoning.`

    logger.log('Generating recommendation with Gemini Flash')

    // Generate recommendation
    const analysis = await generateStructuredAnalysis(
      prompt,
      recommendationSchema,
      'flash', // Use flash model for faster recommendations
      {
        userId,
        operation: 'activity_recommendation',
        entityType: 'ActivityRecommendation',
        entityId: recommendationId
      }
    )

    logger.log('Analysis generated', { recommendation: analysis.recommendation })

    // Update or create the recommendation
    let recommendation
    if (recommendationId) {
      // Update the existing pending recommendation
      recommendation = await prisma.activityRecommendation.update({
        where: { id: recommendationId },
        data: {
          recommendation: analysis.recommendation,
          confidence: analysis.confidence,
          reasoning: analysis.reasoning,
          analysisJson: analysis as any,
          plannedWorkoutId: plannedWorkout?.id,
          status: 'COMPLETED',
          modelVersion: 'gemini-2.0-flash-exp'
        }
      })
    } else {
      // Fallback: create new recommendation if no ID provided
      recommendation = await prisma.activityRecommendation.create({
        data: {
          userId,
          date: today,
          recommendation: analysis.recommendation,
          confidence: analysis.confidence,
          reasoning: analysis.reasoning,
          analysisJson: analysis as any,
          plannedWorkoutId: plannedWorkout?.id,
          status: 'COMPLETED',
          modelVersion: 'gemini-2.0-flash-exp'
        }
      })
    }

    logger.log('Recommendation saved', {
      recommendationId: recommendation.id,
      decision: analysis.recommendation
    })

    return {
      success: true,
      recommendationId: recommendation.id,
      recommendation: analysis.recommendation
    }
  }
})
