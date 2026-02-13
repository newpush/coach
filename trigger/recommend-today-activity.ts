import './init'
import { logger, task } from '@trigger.dev/sdk/v3'
import { generateStructuredAnalysis, buildWorkoutSummary } from '../server/utils/gemini'
import { prisma } from '../server/utils/db'
import { workoutRepository } from '../server/utils/repositories/workoutRepository'
import { wellnessRepository } from '../server/utils/repositories/wellnessRepository'
import { activityRecommendationRepository } from '../server/utils/repositories/activityRecommendationRepository'
import { recommendationRepository } from '../server/utils/repositories/recommendationRepository'
import { sportSettingsRepository } from '../server/utils/repositories/sportSettingsRepository'
import { availabilityRepository } from '../server/utils/repositories/availabilityRepository'
import { formatUserDate, getUserLocalDate, formatDateUTC, calculateAge } from '../server/utils/date'
import { calculateProjectedPMC, getCurrentFitnessSummary } from '../server/utils/training-stress'
import { analyzeWellness } from '../server/utils/services/wellness-analysis'
import { getCheckinHistoryContext } from '../server/utils/services/checkin-service'
import { getUserAiSettings } from '../server/utils/ai-user-settings'
import { metabolicService } from '../server/utils/services/metabolicService'
import { generateAthleteProfileTask } from './generate-athlete-profile'
import { userReportsQueue } from './queues'
import {
  getMoodLabel,
  getStressLabel,
  getFatigueLabel,
  getSorenessLabel,
  getMotivationLabel,
  getHydrationLabel,
  getInjuryLabel
} from '../server/utils/wellness'

interface RecommendationAnalysis {
  recommendation: 'proceed' | 'modify' | 'reduce_intensity' | 'rest'
  confidence: number
  reasoning: string
  planned_workout?: {
    original_title: string
    original_tss: number
    original_duration_min: number
  }
  suggested_modifications?: {
    action: string
    new_title: string
    new_tss: number
    new_duration_min: number
    zone_adjustments: string
    description: string
  }
  recovery_analysis?: {
    hrv_status: string
    sleep_quality: string
    fatigue_level: string
    readiness_score: number
  }
  meal_recommendation?: {
    item: string
    carbs: number
    absorptionType: 'RAPID' | 'FAST' | 'BALANCED' | 'DENSE' | 'HYPER_LOAD'
    timing: string
    reasoning: string
  }
  key_factors?: string[]
}

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
        new_type: { type: 'string', enum: ['Ride', 'Run', 'Gym', 'Swim', 'Rest'] },
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
    meal_recommendation: {
      type: 'object',
      properties: {
        item: { type: 'string' },
        carbs: { type: 'number' },
        absorptionType: {
          type: 'string',
          enum: ['RAPID', 'FAST', 'BALANCED', 'DENSE', 'HYPER_LOAD']
        },
        timing: { type: 'string' },
        reasoning: { type: 'string' }
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
  queue: userReportsQueue,
  run: async (payload: {
    userId: string
    date: Date
    recommendationId?: string
    userFeedback?: string
  }) => {
    const { userId, date: payloadDate, recommendationId, userFeedback } = payload

    logger.log("Starting today's activity recommendation", { userId, payloadDate })

    const aiSettings = await getUserAiSettings(userId)

    // 1. Fetch User Profile & Timezone FIRST to establish "Today" correctly
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        ftp: true,
        weight: true,
        maxHr: true,
        timezone: true,
        lthr: true,
        dob: true,
        sex: true
      }
    })

    const userTimezone = user?.timezone || 'UTC'
    const userAge = calculateAge(user?.dob)

    logger.log('Proceeding with recommendation using latest available context.')

    // 3. Calculate Effective Today based on User's Timezone
    // This fixes issues where server time (UTC) might be ahead/behind user's local "Today"
    const effectiveDate = getUserLocalDate(userTimezone)
    const payloadDateObj = new Date(payloadDate)

    logger.log('Timezone Context', {
      userTimezone,
      effectiveDate: effectiveDate.toISOString(),
      payloadDate: payloadDateObj.toISOString()
    })

    // 3. Update Recommendation Date if needed
    // If the payload date (likely server UTC) differs from user's local date, sync them.
    if (recommendationId && effectiveDate.getTime() !== payloadDateObj.getTime()) {
      logger.log('Date mismatch detected. Updating recommendation date to match user local date.', {
        oldDate: payloadDateObj,
        newDate: effectiveDate
      })
      await prisma.activityRecommendation.update({
        where: { id: recommendationId },
        data: { date: effectiveDate }
      })
    }

    // Use effectiveDate for all subsequent queries
    const today = effectiveDate

    // Fetch remaining data
    const [
      plannedWorkouts,
      todayMetric,
      recentWorkouts,
      athleteProfile,
      activeGoals,
      futureWorkouts,
      currentPlan,
      upcomingEvents,
      currentFitness,
      focusedRecommendations,
      sportSettings,
      todayAvailability,
      weeklyAvailability,
      mealTargetContext
    ] = await Promise.all([
      // Today's planned workouts (Fetch ALL to handle multi-session days)
      prisma.plannedWorkout.findMany({
        where: {
          userId,
          date: today,
          completed: {
            not: true
          },
          completedWorkouts: {
            none: {}
          }
        },
        orderBy: { tss: 'desc' } // Prioritize hardest workout
      }),

      // Today's recovery metrics from Wellness table (WHOOP, Intervals.icu, etc.)
      wellnessRepository.getByDate(userId, today),

      // Last 7 days of workouts for context
      workoutRepository.getForUser(userId, {
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        orderBy: { date: 'desc' },
        includeDuplicates: false,
        include: {
          streams: {
            select: {
              hrZoneTimes: true,
              powerZoneTimes: true
            }
          },
          plannedWorkout: true
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
          completed: {
            not: true
          },
          completedWorkouts: {
            none: {}
          },
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
      getCurrentFitnessSummary(userId),

      // Pinned/Focused recommendations
      recommendationRepository.list(userId, { isPinned: true, status: 'ACTIVE' }),

      // Sport Settings (New centralized system)
      sportSettingsRepository.getByUserId(userId),

      // Today's Training Availability
      availabilityRepository.getForDay(userId, today.getDay()),

      // Full weekly training availability (for forward-looking guidance)
      availabilityRepository.getFullSchedule(userId),

      // Canonical metabolic meal target context (same engine as nutrition charts)
      metabolicService.getMealTargetContext(userId, today, new Date())
    ])

    // Identify primary workout for linking (DB only allows 1:1) and logic fallback
    const primaryPlannedWorkout = plannedWorkouts[0] || null

    // Build today's availability summary
    const availabilityContext = todayAvailability
      ? `\nTODAY'S TRAINING AVAILABILITY:\n${availabilityRepository.formatForPrompt(todayAvailability)}\n`
      : ''
    const weeklyAvailabilityContext =
      weeklyAvailability.length > 0
        ? `\nWEEKLY TRAINING AVAILABILITY:\n${availabilityRepository.formatForPrompt(weeklyAvailability)}\n`
        : ''

    // --- CHECK FOR AND RUN WELLNESS ANALYSIS IF MISSING ---
    // If we have a wellness record (todayMetric) but no AI analysis, run it now.
    // This ensures we always have the AI context for the recommendation.
    let enrichedTodayMetric = todayMetric

    if (
      todayMetric &&
      (!todayMetric.aiAnalysisJson || todayMetric.aiAnalysisStatus !== 'COMPLETED')
    ) {
      logger.log('Wellness analysis missing for today, running inline...', {
        wellnessId: todayMetric.id
      })
      try {
        const result = await analyzeWellness(todayMetric.id, userId)
        if (result.success && result.analysis) {
          // Update our local object so the prompt gets the new data
          enrichedTodayMetric = {
            ...todayMetric,
            aiAnalysisJson: result.analysis as any,
            aiAnalysisStatus: 'COMPLETED'
          }
          logger.log('Inline wellness analysis completed successfully')
        }
      } catch (err) {
        logger.error('Failed to run inline wellness analysis', { err })
        // We continue without the analysis rather than failing the whole recommendation
      }
    }

    logger.log('Data fetched', {
      plannedWorkoutsCount: plannedWorkouts.length,
      hasTodayMetric: !!enrichedTodayMetric,
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
    const now = new Date()
    const localTime = now.toLocaleTimeString('en-US', {
      timeZone: userTimezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })

    // Use target date string for the prompt to ensure alignment with "Today"
    // Since 'today' is now strictly User Local Date @ UTC Midnight,
    // toISOString().split('T')[0] will give the correct YYYY-MM-DD
    const targetDateStr = today.toISOString().split('T')[0]

    // Format for display (Friday, January 10, 2026)
    // We construct it based on the effective today
    const targetDateObj = new Date(targetDateStr + 'T12:00:00') // Noon Local
    const localDate = formatUserDate(targetDateObj, userTimezone, 'EEEE, MMMM d, yyyy')

    // Split workouts into "Today's" and "Past"
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
ATHLETE PROFILE (Generated ${formatUserDate(athleteProfile.createdAt, userTimezone)}):
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
- Age: ${userAge || 'Unknown'}
- Sex: ${user?.sex || 'Unknown'}
- FTP: ${user?.ftp || 'Unknown'} watts
- Weight: ${user?.weight || 'Unknown'} kg
- Max HR: ${user?.maxHr || 'Unknown'} bpm
Note: No structured athlete profile available yet. Generate one for better recommendations.
`
    }

    // Add Sport Specific Profiles to context
    if (sportSettings.length > 0) {
      athleteContext += `\nSPORT SPECIFIC SETTINGS:\n`
      for (const s of sportSettings) {
        const types = s.isDefault ? 'Fallback/Generic' : s.types.join(', ')
        athleteContext += `- **${s.name || (s.isDefault ? 'Default' : 'Profile')}** (${types}): FTP=${s.ftp || 'N/A'}W, LTHR=${s.lthr || 'N/A'}bpm, MaxHR=${s.maxHr || 'N/A'}bpm\n`
      }
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
      `- ${formatDateUTC(e.date, 'EEE MMM dd')}: ${e.title} (${e.type || 'Event'}) - Priority: ${e.priority || 'B'}`
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
  .map((w) => `- ${formatDateUTC(w.date, 'EEE dd')}: ${w.title} (TSS: ${w.tss || 'N/A'})`)
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
      `- ${formatDateUTC(m.date, 'EEE dd')}: CTL=${Math.round(m.ctl)}, TSB=${Math.round(m.tsb)}`
  )
  .join('\n')}
`
    }

    // Build zone definitions based on today's activity type
    let zoneDefinitions = ''
    let activeProfile = sportSettings.find((s) => s.isDefault)
    if (primaryPlannedWorkout?.type) {
      const match = sportSettings.find(
        (s) => !s.isDefault && s.types.includes(primaryPlannedWorkout.type!)
      )
      if (match) activeProfile = match
    }

    if (activeProfile) {
      zoneDefinitions += `**Applicable Zones for ${primaryPlannedWorkout?.type || 'Today'} (Profile: ${activeProfile.name}):**\n`

      if (activeProfile.hrZones && Array.isArray(activeProfile.hrZones)) {
        zoneDefinitions += '*Heart Rate Zones:*\n'
        activeProfile.hrZones.forEach((z: any) => {
          zoneDefinitions += `- ${z.name}: ${z.min}-${z.max} bpm\n`
        })
      }

      if (activeProfile.powerZones && Array.isArray(activeProfile.powerZones)) {
        zoneDefinitions += '*Power Zones:*\n'
        activeProfile.powerZones.forEach((z: any) => {
          zoneDefinitions += `- ${z.name}: ${z.min}-${z.max} Watts\n`
        })
      }

      if (activeProfile.lthr) {
        zoneDefinitions += `\n**Reference LTHR:** ${activeProfile.lthr} bpm\n`
      }
      if (activeProfile.ftp) {
        zoneDefinitions += `**Reference FTP:** ${activeProfile.ftp} Watts\n`
      }
    }

    // Build Wellness Analysis Context
    let wellnessAnalysisContext = ''
    if (enrichedTodayMetric?.aiAnalysisJson) {
      const analysis = enrichedTodayMetric.aiAnalysisJson as any
      wellnessAnalysisContext = `
TODAY'S WELLNESS ANALYSIS (AI Generated):
- Status: ${analysis.status ? analysis.status.toUpperCase() : 'Unknown'}
- Summary: ${analysis.executive_summary || 'N/A'}
${analysis.recommendations ? 'Recommendations:\n' + analysis.recommendations.map((r: any) => `  * ${r.title}: ${r.description} (${r.priority})`).join('\n') : ''}
`
    }

    // Build canonical metabolic meal-target context
    const mealTargetContextText = mealTargetContext
      ? `
CANONICAL METABOLIC MEAL TARGET CONTEXT (Use this as nutrition source of truth):
- Tank Now: ${mealTargetContext.currentTank.percentage}% (State ${mealTargetContext.currentTank.state})
- Tank Advice: ${mealTargetContext.currentTank.advice}
${
  mealTargetContext.nextFuelingWindow
    ? `- Next/Active Window: ${mealTargetContext.nextFuelingWindow.type} | ${mealTargetContext.nextFuelingWindow.targetCarbs}g target, ${mealTargetContext.nextFuelingWindow.actualCarbs}g logged, ${mealTargetContext.nextFuelingWindow.unmetCarbs}g remaining`
    : '- Next/Active Window: none'
}
${
  mealTargetContext.suggestedIntakeNow
    ? `- Suggested Intake Now: ${mealTargetContext.suggestedIntakeNow.carbs}g (${mealTargetContext.suggestedIntakeNow.absorptionType}) - ${mealTargetContext.suggestedIntakeNow.timing}`
    : '- Suggested Intake Now: none needed'
}
`
      : ''

    // Build focused recommendations context
    let focusedRecsContext = ''
    if (focusedRecommendations && focusedRecommendations.length > 0) {
      focusedRecsContext = `
CURRENT FOCUS AREAS (Pinned Recommendations):
${focusedRecommendations.map((r) => `- [${r.priority.toUpperCase()}] ${r.title}: ${r.description}`).join('\n')}
`
    }

    // Build Daily Check-in Summary
    const checkinHistory = await getCheckinHistoryContext(
      userId,
      new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000),
      today,
      userTimezone
    )

    const checkinsSummary = checkinHistory
      ? `\nDAILY CHECK-INS (Subjective Feedback - Last 7 Days):\n${checkinHistory}`
      : ''

    if (checkinHistory) {
      logger.log('Check-ins Summary for Prompt', { checkinHistory })
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
    const prompt = `You are a **${aiSettings.aiPersona}** expert cycling coach analyzing today's training for your athlete.
Adapt your analysis tone and recommendation style to match your **${aiSettings.aiPersona}** persona.

CURRENT CONTEXT:
- Date: ${localDate}
- Time: ${localTime}
- Timezone: ${userTimezone}

${currentStatusContext}

${athleteContext}
${planContext}
${availabilityContext}
${weeklyAvailabilityContext}
${focusedRecsContext}

TODAY'S PLANNED WORKOUT(S):
${
  plannedWorkouts.length > 0
    ? plannedWorkouts
        .map(
          (pw, i) => `
WORKOUT ${i + 1}${i === 0 ? ' (Primary)' : ''}:
- Title: ${pw.title}
- Duration: ${pw.durationSec ? Math.round(pw.durationSec / 60) : 'Unknown'} minutes
- TSS: ${pw.tss || 'Unknown'}
- Type: ${pw.type || 'Unknown'}
- Description: ${pw.description || 'None'}
`
        )
        .join('\n')
    : 'No workout planned for today'
}

${upcomingContext}
${eventsContext}
${metricsContext}

TODAY'S RECOVERY METRICS:
${
  enrichedTodayMetric
    ? `
- Recovery Score: ${enrichedTodayMetric.recoveryScore ?? 'Unknown'}${enrichedTodayMetric.recoveryScore !== null ? '%' : ''}
- HRV (rMSSD): ${enrichedTodayMetric.hrv ?? 'Unknown'} ms
- HRV (SDNN): ${enrichedTodayMetric.hrvSdnn ?? 'Unknown'} ms
- Resting HR: ${enrichedTodayMetric.restingHr ?? 'Unknown'} bpm
- Sleep: ${enrichedTodayMetric.sleepHours?.toFixed(1) ?? 'Unknown'} hours (Score: ${enrichedTodayMetric.sleepScore ?? 'Unknown'}%)
${enrichedTodayMetric.spO2 ? `- SpO2: ${enrichedTodayMetric.spO2}%` : ''}
- Subjective:
  * Stress: ${enrichedTodayMetric.stress ? enrichedTodayMetric.stress + '/10' : 'N/A'} (${getStressLabel(enrichedTodayMetric.stress)})
  * Fatigue: ${enrichedTodayMetric.fatigue ? enrichedTodayMetric.fatigue + '/10' : 'N/A'} (${getFatigueLabel(enrichedTodayMetric.fatigue)})
  * Soreness: ${enrichedTodayMetric.soreness ? enrichedTodayMetric.soreness + '/10' : 'N/A'} (${getSorenessLabel(enrichedTodayMetric.soreness)})
  * Mood: ${enrichedTodayMetric.mood ? enrichedTodayMetric.mood + '/10' : 'N/A'} (${getMoodLabel(enrichedTodayMetric.mood)})
  * Motivation: ${enrichedTodayMetric.motivation ? enrichedTodayMetric.motivation + '/10' : 'N/A'} (${getMotivationLabel(enrichedTodayMetric.motivation)})
  * Hydration: ${enrichedTodayMetric.hydration ?? 'N/A'} (${getHydrationLabel(enrichedTodayMetric.hydration)})
  * Injury: ${enrichedTodayMetric.injury ?? 'None'} (${getInjuryLabel(enrichedTodayMetric.injury)})
`
    : 'No recovery data available'
}

${wellnessAnalysisContext}
${mealTargetContextText}

${checkinsSummary}

TODAY'S COMPLETED TRAINING:
${todaysWorkouts.length > 0 ? buildWorkoutSummary(todaysWorkouts, userTimezone) : 'None so far'}

RECENT TRAINING (Last 7 days):
${pastWorkouts.length > 0 ? buildWorkoutSummary(pastWorkouts, userTimezone) : 'No recent workouts'}

${
  userFeedback
    ? `USER FEEDBACK / OBJECTION:
"${userFeedback}"
IMPORTANT: The user has explicitly provided this feedback. You MUST take it into account and adjust your recommendation accordingly. If they say they are tired, recommend rest or easy. If they want to push, allow it if safety permits.`
    : ''
}

CRITICAL INSTRUCTIONS:
1. ALWAYS use the user's specific zones defined below for the relevant activity type.
2. PRIORITIZE the "CURRENT ATHLETE STATUS (Source of Truth)" metrics above for any fitness assessment.
3. IGNORE any conflicting TSB/CTL values found in the "ATHLETE PROFILE" section if they differ from the Source of Truth, as they may be stale summaries.
4. Refer to the "PROJECTED FITNESS TRENDS" for future state, but base your primary decision on the current TSB and recovery metrics.
5. RESPECT TRAINING AVAILABILITY: do not recommend sessions outside declared availability windows unless user feedback explicitly asks to override.

${zoneDefinitions}

When suggesting modifications (e.g. "Ride in Zone 2"), target ONLY the user's defined Z2 range for this specific sport. Never use generic percentages - always reference the provided zones first.

TASK:
Analyze whether the athlete should proceed with today's planned workout or modify it based on their current recovery state, recent training load, AND FUTURE PLANS. 

**IMPORTANT**: Pay close attention to the "AI Analysis Insights" in the RECENT TRAINING section. If recent workouts highlight persistent technical weaknesses, fatigue-related pacing issues, or specific improvement recommendations, incorporate those insights into today's guidance.

**PLANNED REST DAYS**: If the today's planned workout type is "Rest", your DEFAULT recommendation should be to **proceed with the rest day** (Rest). Only suggest modifying to a light activity if the athlete is exceptionally fresh (TSB > 10 and high recovery score) or if they specifically asked for a workout in their feedback. Recovery is a vital part of the training process.

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

**NUTRITION & RECOVERY SENSOR (Hunger Sensor)**:
- If Sleep Score < 60% OR HRV Balance is "Low", explicitly recommend: "Consider 30-40g of slow-digesting protein (like Casein or Cottage Cheese) before bed tonight to aid overnight repair."
- If Training Load > 100 TSS yesterday, recommend "Ensure you hit your carb targets to refill glycogen stores."

**MEAL RECOMMENDATION LOGIC**:
When the user has a workout today, provide a \`meal_recommendation\` based on:
1. **Canonical Meal Target Context Above**: This is the primary source of truth.
2. **The Time Gap**: Time between NOW and the next workout.
3. **The Tank Level**: Current "Live Energy" availability.
4. **Unmet Window Carbs**: Prefer closing remaining carbs in the next/active window.
3. **The Match**:
   - **Gap < 30m + Low Tank**: Recommend **RAPID** profile (Gel/Exogenous glucose).
   - **Gap 30-60m**: Recommend **FAST** profile (Fruit/White bread).
   - **Gap 60-120m**: Recommend **BALANCED** profile (Oats/Pasta).
   - **Recovery/Daily Base**: Recommend **DENSE** profile (Mixed meal with protein/fat).
   - **Pre-State 3 Night Before**: Recommend **HYPER_LOAD** (Large pasta meal).

If "Suggested Intake Now" is present in canonical context, keep your meal recommendation close to that target (within +/-10g carbs) unless you provide explicit safety rationale.

Absorption Profile Matrix for your guidance:
- RAPID: Liquid/Gel, Start 5m, Peak 15m.
- FAST: Fruit/Bread, Start 10m, Peak 30m.
- BALANCED: Oats/Pasta, Start 30m, Peak 60m.
- DENSE: Protein/Fats/Fiber, Start 45m, Peak 120m.
- HYPER_LOAD: Large Meal, Start 60m, Peak 180m.

Include this advice in your reasoning.

Provide specific, actionable recommendations with clear reasoning.
Maintain your **${aiSettings.aiPersona}** persona throughout.`

    logger.log(`Generating recommendation with Gemini (${aiSettings.aiModelPreference})`)

    // Generate recommendation
    const analysis = await generateStructuredAnalysis<RecommendationAnalysis>(
      prompt,
      recommendationSchema,
      aiSettings.aiModelPreference, // Use user preference
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
      recommendation = await activityRecommendationRepository.update(recommendationId, userId, {
        recommendation: analysis.recommendation,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        analysisJson: analysis as any,
        plannedWorkout: primaryPlannedWorkout?.id
          ? { connect: { id: primaryPlannedWorkout.id } }
          : undefined,
        status: 'COMPLETED',
        modelVersion: 'gemini-2.0-flash-exp'
      })
    } else {
      // Fallback: create new recommendation if no ID provided
      recommendation = await activityRecommendationRepository.create({
        user: { connect: { id: userId } },
        date: today,
        recommendation: analysis.recommendation,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        analysisJson: analysis as any,
        plannedWorkout: primaryPlannedWorkout?.id
          ? { connect: { id: primaryPlannedWorkout.id } }
          : undefined,
        status: 'COMPLETED',
        modelVersion: 'gemini-2.0-flash-exp'
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
