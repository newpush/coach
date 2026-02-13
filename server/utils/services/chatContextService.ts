import { prisma } from '../db'
import { sportSettingsRepository } from '../repositories/sportSettingsRepository'
import { getUserLocalDate, formatUserDate, formatDateUTC } from '../date'
import { workoutRepository } from '../repositories/workoutRepository'
import { nutritionRepository } from '../repositories/nutritionRepository'
import { wellnessRepository } from '../repositories/wellnessRepository'
import { generateTrainingContext, formatTrainingContextForPrompt } from '../training-metrics'
import { getInjuryLabel } from '../../utils/wellness'

export async function buildAthleteContext(userId: string): Promise<{
  context: string
  userProfile: any
  systemInstruction: string
  history: any[]
}> {
  // 1. Fetch User Profile, Goals and Sport Settings for Context
  const [userProfile, activeGoals, sportSettings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        nickname: true,
        ftp: true,
        maxHr: true,
        weight: true,
        dob: true,
        restingHr: true,
        sex: true,
        city: true,
        state: true,
        country: true,
        timezone: true,
        language: true,
        weightUnits: true,
        height: true,
        heightUnits: true,
        distanceUnits: true,
        temperatureUnits: true,
        form: true,
        visibility: true,
        aiPersona: true,
        aiModelPreference: true,
        aiAutoAnalyzeWorkouts: true,
        aiAutoAnalyzeNutrition: true,
        aiContext: true,
        nutritionTrackingEnabled: true,
        currentFitnessScore: true,
        recoveryCapacityScore: true,
        nutritionComplianceScore: true,
        trainingConsistencyScore: true,
        currentFitnessExplanation: true,
        recoveryCapacityExplanation: true,
        nutritionComplianceExplanation: true,
        trainingConsistencyExplanation: true,
        currentFitnessExplanationJson: true,
        recoveryCapacityExplanationJson: true,
        nutritionComplianceExplanationJson: true,
        trainingConsistencyExplanationJson: true,
        profileLastUpdated: true
      }
    }),
    prisma.goal.findMany({
      where: {
        userId,
        status: 'ACTIVE'
      },
      orderBy: { priority: 'desc' },
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
        eventType: true,
        priority: true,
        aiContext: true,
        createdAt: true
      }
    }),
    sportSettingsRepository.getByUserId(userId)
  ])

  // Fetch Intervals Integration settings for scale preferences
  const intervalsIntegration = await prisma.integration.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: 'intervals'
      }
    },
    select: { settings: true }
  })
  const intervalsSettings = intervalsIntegration?.settings as any
  const readinessScale = intervalsSettings?.readinessScale || 'STANDARD'
  const sleepScoreScale = intervalsSettings?.sleepScoreScale || 'STANDARD'

  // Fetch baseline for HRV4Training if needed
  let hrv4tBaseline = null
  if (readinessScale === 'HRV4TRAINING') {
    const recentWellnessRaw = await wellnessRepository.getForUser(userId, {
      limit: 30,
      orderBy: { date: 'desc' }
    })
    const rawValues = recentWellnessRaw
      .map((w) => (w.rawJson as any)?.readiness)
      .filter((v) => typeof v === 'number')

    if (rawValues.length >= 3) {
      hrv4tBaseline = {
        min: Math.min(...rawValues),
        max: Math.max(...rawValues),
        count: rawValues.length
      }
    }
  }

  // Get user timezone
  const userTimezone = userProfile?.timezone || 'UTC'
  const todayDate = getUserLocalDate(userTimezone)

  // 2. Fetch Recent Activity Data (Last 7 Days)
  const sevenDaysAgo = new Date(todayDate)
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7)

  // Fetch recent workouts
  const recentWorkouts = await workoutRepository.getForUser(userId, {
    startDate: sevenDaysAgo,
    orderBy: { date: 'desc' },
    select: {
      id: true,
      date: true,
      title: true,
      type: true,
      durationSec: true,
      distanceMeters: true,
      averageWatts: true,
      normalizedPower: true,
      averageHr: true,
      tss: true,
      intensity: true,
      trainingLoad: true,
      rpe: true,
      feel: true,
      description: true,
      overallScore: true,
      aiAnalysisJson: true
    }
  })

  // Fetch recent nutrition
  const recentNutrition = await nutritionRepository.getForUser(userId, {
    startDate: sevenDaysAgo,
    orderBy: { date: 'desc' },
    select: {
      id: true,
      date: true,
      calories: true,
      protein: true,
      carbs: true,
      fat: true,
      fiber: true,
      sugar: true,
      aiAnalysisJson: true
    }
  })

  // Fetch recent wellness
  const recentWellness = await wellnessRepository.getForUser(userId, {
    startDate: sevenDaysAgo,
    orderBy: { date: 'desc' },
    select: {
      id: true,
      date: true,
      recoveryScore: true,
      hrv: true,
      restingHr: true,
      sleepHours: true,
      sleepScore: true,
      readiness: true,
      fatigue: true,
      soreness: true,
      stress: true,
      mood: true,
      injury: true
    }
  })

  // Fetch planned workouts (next 14 days)
  const fourteenDaysAhead = new Date(todayDate)
  fourteenDaysAhead.setUTCDate(fourteenDaysAhead.getUTCDate() + 14)

  const [plannedWorkouts, lastPlannedWorkout] = await Promise.all([
    prisma.plannedWorkout.findMany({
      where: {
        userId,
        date: {
          gte: todayDate,
          lte: fourteenDaysAhead
        },
        completed: false
      },
      orderBy: { date: 'asc' },
      take: 21,
      select: {
        id: true,
        date: true,
        title: true,
        description: true,
        type: true,
        durationSec: true,
        tss: true,
        syncStatus: true
      }
    }),
    prisma.plannedWorkout.findFirst({
      where: { userId, completed: false, date: { gte: todayDate } },
      orderBy: { date: 'desc' },
      select: { date: true }
    })
  ])

  // Check if we hit the limit
  const hasMorePlannedWorkouts = plannedWorkouts.length > 20
  const displayedPlannedWorkouts = hasMorePlannedWorkouts
    ? plannedWorkouts.slice(0, 20)
    : plannedWorkouts

  // Fetch training availability
  const trainingAvailability = await prisma.trainingAvailability.findMany({
    where: { userId },
    orderBy: { dayOfWeek: 'asc' }
  })

  // Fetch current training plan
  const currentWeekStart = new Date(todayDate)
  // Calculate start of week (Monday) using UTC dates
  const dayOfWeek = currentWeekStart.getUTCDay()
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  currentWeekStart.setUTCDate(currentWeekStart.getUTCDate() + diffToMonday)

  const currentPlan = await prisma.weeklyTrainingPlan.findFirst({
    where: {
      userId,
      weekStartDate: { lte: currentWeekStart }
    },
    orderBy: [{ status: 'asc' }, { weekStartDate: 'desc' }]
  })

  // 3. Build Comprehensive Athlete Context
  let athleteContext = '\n\n## Athlete Profile\n'

  if (userProfile) {
    if (userProfile.name) athleteContext += `- **Name**: ${userProfile.name}\n`
    if (userProfile.nickname) athleteContext += `- **Nickname**: ${userProfile.nickname}\n`

    const metrics: string[] = []
    if (userProfile.ftp) metrics.push(`Global FTP: ${userProfile.ftp}W`)
    if (userProfile.maxHr) metrics.push(`Global Max HR: ${userProfile.maxHr} bpm`)
    if (userProfile.restingHr) metrics.push(`Global Resting HR: ${userProfile.restingHr} bpm`)
    if (userProfile.weight) {
      const weightUnit = userProfile.weightUnits === 'Pounds' ? 'lbs' : 'kg'
      metrics.push(`Weight: ${userProfile.weight.toFixed(2)}${weightUnit}`)
    }
    if (userProfile.height) {
      const heightUnit = userProfile.heightUnits === 'ft/in' ? 'ft/in' : 'cm'
      metrics.push(`Height: ${userProfile.height}${heightUnit}`)
    }
    if (userProfile.dob) {
      const age = Math.floor(
        (Date.now() - new Date(userProfile.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      )
      metrics.push(`Age: ${age}`)
    }
    if (userProfile.sex) metrics.push(`Sex: ${userProfile.sex}`)
    if (metrics.length > 0) {
      athleteContext += `- **Core Physical Metrics**: ${metrics.join(', ')}\n`
    }

    // User Preferences & Settings
    const settings: string[] = []
    if (userProfile.language) settings.push(`Language: ${userProfile.language}`)
    if (userProfile.distanceUnits) settings.push(`Distance: ${userProfile.distanceUnits}`)
    if (userProfile.temperatureUnits) settings.push(`Temperature: ${userProfile.temperatureUnits}`)
    if (userProfile.timezone) settings.push(`Timezone: ${userProfile.timezone}`)
    if (userProfile.city || userProfile.state || userProfile.country) {
      const location = [userProfile.city, userProfile.state, userProfile.country]
        .filter(Boolean)
        .join(', ')
      settings.push(`Location: ${location}`)
    }
    if (settings.length > 0) {
      athleteContext += `- **Preferences**: ${settings.join(' | ')}\n`
    }

    if (hrv4tBaseline) {
      athleteContext += `- **HRV4Training Baseline (Last 30 days)**: Min=${hrv4tBaseline.min}, Max=${hrv4tBaseline.max} (based on ${hrv4tBaseline.count} entries). *Note: Readiness scores below are normalized to 1-100% based on this individual range.*\n`
    }

    // Sport Specific Settings & Zones
    if (sportSettings.length > 0) {
      athleteContext += '\n### Sport Specific Settings & Zones\n'
      athleteContext +=
        'The athlete has different performance thresholds and zones for different sports. Use the appropriate zones when discussing specific activities.\n\n'

      for (const s of sportSettings) {
        const typeLabel = s.isDefault ? 'Default/Fallback' : s.types.join(', ')
        athleteContext += `#### ${s.name || (s.isDefault ? 'Default' : 'Profile')} (${typeLabel})\n`
        athleteContext += `- Thresholds: FTP=${s.ftp || 'N/A'}W, LTHR=${s.lthr || 'N/A'}bpm, MaxHR=${s.maxHr || 'N/A'}bpm\n`
        if (s.loadPreference) {
          athleteContext += `- **Preferred Load Metric**: ${s.loadPreference}\n`
        }

        if (s.powerZones && Array.isArray(s.powerZones)) {
          athleteContext += `- Power Zones: ${s.powerZones.map((z: any) => `${z.name}: ${z.min}-${z.max}W`).join(', ')}\n`
        }
        if (s.hrZones && Array.isArray(s.hrZones)) {
          athleteContext += `- HR Zones: ${s.hrZones.map((z: any) => `${z.name}: ${z.min}-${z.max}bpm`).join(', ')}\n`
        }
        athleteContext += '\n'
      }
    }

    // AI Preferences
    if (userProfile.aiPersona) {
      athleteContext += `\n- **Coaching Style Preference**: ${userProfile.aiPersona}\n`
    }

    // User Provided Context
    if (userProfile.aiContext) {
      athleteContext += `\n### User Provided Context / About Me / Special instructions\n${userProfile.aiContext}\n`
    }

    const scores: string[] = []
    if (userProfile.currentFitnessScore)
      scores.push(`Fitness: ${userProfile.currentFitnessScore}/10`)
    if (userProfile.recoveryCapacityScore)
      scores.push(`Recovery: ${userProfile.recoveryCapacityScore}/10`)
    if (userProfile.nutritionComplianceScore)
      scores.push(`Nutrition: ${userProfile.nutritionComplianceScore}/10`)
    if (userProfile.trainingConsistencyScore)
      scores.push(`Consistency: ${userProfile.trainingConsistencyScore}/10`)
    if (scores.length > 0) {
      athleteContext += `- **Current Scores**: ${scores.join(', ')}\n`
    }

    // Add detailed explanations with JSON insights
    if (userProfile.currentFitnessExplanation) {
      athleteContext += `\n### Fitness Insights\n${userProfile.currentFitnessExplanation}\n`
      if (userProfile.currentFitnessExplanationJson) {
        athleteContext += `\n**Structured Insights**: ${JSON.stringify(userProfile.currentFitnessExplanationJson)}\n`
      }
    }
    if (userProfile.recoveryCapacityExplanation) {
      athleteContext += `\n### Recovery Insights\n${userProfile.recoveryCapacityExplanation}\n`
      if (userProfile.recoveryCapacityExplanationJson) {
        athleteContext += `\n**Structured Insights**: ${JSON.stringify(userProfile.recoveryCapacityExplanationJson)}\n`
      }
    }
    if (userProfile.nutritionComplianceExplanation) {
      athleteContext += `\n### Nutrition Insights\n${userProfile.nutritionComplianceExplanation}\n`
      if (userProfile.nutritionComplianceExplanationJson) {
        athleteContext += `\n**Structured Insights**: ${JSON.stringify(userProfile.nutritionComplianceExplanationJson)}\n`
      }
    }
    if (userProfile.trainingConsistencyExplanation) {
      athleteContext += `\n### Training Consistency Insights\n${userProfile.trainingConsistencyExplanation}\n`
      if (userProfile.trainingConsistencyExplanationJson) {
        athleteContext += `\n**Structured Insights**: ${JSON.stringify(userProfile.trainingConsistencyExplanationJson)}\n`
      }
    }

    if (userProfile.profileLastUpdated) {
      athleteContext += `\n*Profile last updated: ${formatUserDate(userProfile.profileLastUpdated, userTimezone)}*\n`
    }
  }

  // Add Current Goals
  if (activeGoals.length > 0) {
    athleteContext += '\n\n## Current Goals\n'
    for (const goal of activeGoals) {
      const daysToTarget = goal.targetDate
        ? Math.ceil((new Date(goal.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null
      const daysToEvent = goal.eventDate
        ? Math.ceil((new Date(goal.eventDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null

      athleteContext += `\n### [${goal.priority}] ${goal.title} (${goal.type})\n`
      if (goal.description) athleteContext += `${goal.description}\n`

      if (goal.metric && goal.targetValue) {
        athleteContext += `- **Target**: ${goal.metric} = ${goal.targetValue}`
        if (goal.currentValue)
          athleteContext += ` (Current: ${goal.currentValue}, Start: ${goal.startValue || 'N/A'})`
        athleteContext += '\n'
      }

      if (daysToTarget) {
        athleteContext += `- **Timeline**: ${daysToTarget} days remaining`
        if (goal.targetDate) athleteContext += ` (Target: ${formatDateUTC(goal.targetDate)})`
        athleteContext += '\n'
      }

      if (goal.eventDate) {
        athleteContext += `- **Event**: ${goal.eventType || 'race'} on ${formatDateUTC(goal.eventDate)} (${daysToEvent} days away)\n`
      }

      if (goal.aiContext) {
        athleteContext += `- **Context**: ${goal.aiContext}\n`
      }

      athleteContext += `- **Created**: ${formatUserDate(goal.createdAt, userTimezone)}\n`
    }
  } else {
    athleteContext +=
      '\n\n## Current Goals\nNo active goals set. Consider creating goals to help focus training efforts.\n'
  }

  // Generate comprehensive training context for last 14 days
  const fourteenDaysAgo = new Date(todayDate)
  fourteenDaysAgo.setUTCDate(todayDate.getUTCDate() - 14)

  const trainingContext = await generateTrainingContext(userId, fourteenDaysAgo, todayDate, {
    includeZones: false, // Skip expensive zone calculation for chat context
    period: 'Last 14 Days',
    timezone: userProfile?.timezone || 'UTC'
  })

  const formattedTrainingContext = formatTrainingContextForPrompt(trainingContext)

  athleteContext += '\n\n' + formattedTrainingContext

  // Add Recent Activity Detail (Last 7 Days) - keeping for granular day-by-day view
  athleteContext += '\n\n## Recent Activity Detail (Last 7 Days)\n'

  // Recent Workouts Summary
  if (recentWorkouts.length > 0) {
    athleteContext += `\n### Recent Workouts (${recentWorkouts.length} activities)\n`
    athleteContext += `*Each workout includes its ID for reference in tool calls*\n\n`
    for (const workout of recentWorkouts) {
      athleteContext += `- **${formatUserDate(workout.date, userTimezone)}**: ${workout.title || workout.type}\n`
      athleteContext += `  - **ID**: ${workout.id} (use this ID to get detailed analysis)\n`
      athleteContext += `  - Duration: ${Math.round(workout.durationSec / 60)} min`
      if (workout.distanceMeters)
        athleteContext += ` | Distance: ${(workout.distanceMeters / 1000).toFixed(1)} km`
      if (workout.averageWatts) athleteContext += ` | Avg Power: ${workout.averageWatts}W`
      if (workout.tss) athleteContext += ` | TSS: ${Math.round(workout.tss)}`
      if (workout.overallScore) athleteContext += ` | Score: ${workout.overallScore}/10`
      athleteContext += '\n'

      if (workout.aiAnalysisJson) {
        const analysis = workout.aiAnalysisJson as any
        athleteContext += `  - Key Insight: ${analysis.executive_summary || analysis.quick_take || 'Analysis available'}\n`
      }
    }
  } else {
    athleteContext += '\n### Recent Workouts\nNo workouts in the last 7 days\n'
  }

  // Recent Nutrition Summary
  if (userProfile?.nutritionTrackingEnabled) {
    if (recentNutrition.length > 0) {
      athleteContext += `\n### Nutrition (${recentNutrition.length} days logged)\n`
      for (const nutrition of recentNutrition) {
        athleteContext += `- **${formatDateUTC(nutrition.date)}**: `
        athleteContext += `${nutrition.calories || 0} kcal`
        if (nutrition.protein) athleteContext += ` | Protein: ${Math.round(nutrition.protein)}g`
        if (nutrition.carbs) athleteContext += ` | Carbs: ${Math.round(nutrition.carbs)}g`
        if (nutrition.fat) athleteContext += ` | Fat: ${Math.round(nutrition.fat)}g`
        athleteContext += '\n'

        if (nutrition.aiAnalysisJson) {
          athleteContext += `  - AI Analysis: ${JSON.stringify(nutrition.aiAnalysisJson)}\n`
        }
      }
    } else {
      athleteContext += '\n### Nutrition\nNo nutrition data in the last 7 days\n'
    }
  }

  // Recent Wellness Summary
  if (recentWellness.length > 0) {
    const entriesWithData = []

    for (const wellness of recentWellness) {
      const metrics: string[] = []
      if (wellness.recoveryScore) metrics.push(`Recovery: ${wellness.recoveryScore}%`)
      if (wellness.hrv) metrics.push(`HRV: ${wellness.hrv}ms`)
      if (wellness.sleepHours) metrics.push(`Sleep: ${wellness.sleepHours}h`)
      if (wellness.sleepScore) {
        if (sleepScoreScale === 'TEN_POINT') {
          // Db stores 0-100, but user wants 1-10. Convert back.
          // However, if we normalized it from 1-10 -> 0-100, we might have lost precision?
          // 8.5 -> 85. 85/10 = 8.5. It works.
          metrics.push(`Sleep Score: ${wellness.sleepScore / 10}/10`)
        } else {
          metrics.push(`Sleep Score: ${wellness.sleepScore}%`)
        }
      }
      if (wellness.readiness) {
        if (readinessScale === 'STANDARD') {
          // 0-100
          // DB stores 1-10. We need to convert to 0-100.
          metrics.push(`Readiness: ${wellness.readiness * 10}%`)
        } else if (readinessScale === 'HRV4TRAINING') {
          // DB already stores 1-100 for HRV4TRAINING
          metrics.push(`Readiness: ${wellness.readiness}%`)
        } else {
          // TEN_POINT, POLAR (1-6 ~ 1-10 normalized), or default fallback
          metrics.push(`Readiness: ${wellness.readiness}/10`)
        }
      }
      if (wellness.injury)
        metrics.push(`Injury: ${wellness.injury} (${getInjuryLabel(wellness.injury)})`)

      // Only include dates that have actual data
      if (metrics.length > 0) {
        entriesWithData.push(`- **${formatDateUTC(wellness.date)}**: ${metrics.join(' | ')}`)
      }
    }

    if (entriesWithData.length > 0) {
      athleteContext += `\n### Wellness & Recovery (${entriesWithData.length} days)\n`
      athleteContext += entriesWithData.join('\n') + '\n'
    } else {
      athleteContext +=
        '\n### Wellness & Recovery\nNo wellness data with metrics in the last 7 days\n'
    }
  } else {
    athleteContext += '\n### Wellness & Recovery\nNo wellness data in the last 7 days\n'
  }

  // Training Plan Context
  athleteContext += '\n\n## Training Plan & Schedule\n'

  // Current Training Plan
  if (currentPlan) {
    athleteContext += `\n### Current Training Plan\n`
    athleteContext += `- **Week**: ${formatDateUTC(currentPlan.weekStartDate)} - ${formatDateUTC(currentPlan.weekEndDate)}\n`
    athleteContext += `- **Status**: ${currentPlan.status}\n`
    if (currentPlan.totalTSS)
      athleteContext += `- **Weekly TSS Target**: ${Math.round(currentPlan.totalTSS)}\n`
    if (currentPlan.workoutCount)
      athleteContext += `- **Workouts Planned**: ${currentPlan.workoutCount}\n`
    if (currentPlan.totalDuration)
      athleteContext += `- **Total Duration**: ${Math.round(currentPlan.totalDuration / 60)} minutes\n`
    if (currentPlan.notes) athleteContext += `- **Notes**: ${currentPlan.notes}\n`
    if (currentPlan.createdAt) {
      athleteContext += `\n*Plan generated: ${formatUserDate(currentPlan.createdAt, userTimezone)}*\n`
    }
  } else {
    athleteContext += '\n### Current Training Plan\nNo active training plan\n'
  }

  // Training Availability
  if (trainingAvailability.length > 0) {
    athleteContext += `\n### Weekly Training Availability\n`
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    for (const avail of trainingAvailability) {
      const dayName = dayNames[avail.dayOfWeek]
      athleteContext += `- **${dayName}**: `
      const slots: string[] = []
      if (avail.morning) slots.push('Morning')
      if (avail.afternoon) slots.push('Afternoon')
      if (avail.evening) slots.push('Evening')

      if (slots.length > 0) {
        athleteContext += `Available (${slots.join(', ')})`
        const constraints: string[] = []
        if (avail.indoorOnly) constraints.push('indoor only')
        if (avail.outdoorOnly) constraints.push('outdoor only')
        if (avail.gymAccess) constraints.push('gym access')
        if (avail.bikeAccess) constraints.push('bike access')
        if (constraints.length > 0) {
          athleteContext += ` - ${constraints.join(', ')}`
        }

        // Add detailed custom slots if present
        if (avail.slots && Array.isArray(avail.slots) && avail.slots.length > 0) {
          const slotDetails = (avail.slots as any[]).map((s) => {
            const parts = [`${s.startTime} ${s.name} (${s.duration}m)`]
            if (s.activityTypes?.length) parts.push(`types: ${s.activityTypes.join('/')}`)
            if (s.gymAccess) parts.push('gym-ok')
            if (s.bikeAccess) parts.push('bike-ok')
            return parts.join(' | ')
          })
          athleteContext += `\n    - Detailed Slots:\n      ${slotDetails.join('\n      ')}`
        }
      } else {
        athleteContext += `Not available`
      }
      athleteContext += '\n'
    }
  } else {
    athleteContext += '\n### Weekly Training Availability\nNo availability preferences set\n'
  }

  // Planned Workouts (Next 14 Days)
  if (displayedPlannedWorkouts.length > 0) {
    athleteContext += `\n### Upcoming Planned Workouts (Next 14 Days)\n`
    athleteContext += `*Total: ${displayedPlannedWorkouts.length}${hasMorePlannedWorkouts ? '+' : ''} workouts scheduled*\n`
    if (lastPlannedWorkout) {
      athleteContext += `*Planning Horizon: Workouts scheduled until ${formatDateUTC(lastPlannedWorkout.date)}*\n`
    }
    athleteContext += `\n`
    for (const workout of displayedPlannedWorkouts) {
      const syncIcon =
        workout.syncStatus === 'SYNCED'
          ? '✓'
          : workout.syncStatus === 'PENDING'
            ? '⏳'
            : workout.syncStatus === 'FAILED'
              ? '⚠'
              : '○'
      athleteContext += `- ${syncIcon} **${formatDateUTC(workout.date)}**: ${workout.title || workout.type || 'Workout'}\n`
      if (workout.description) athleteContext += `  - ${workout.description}\n`
      const details: string[] = []
      if (workout.type) details.push(`Type: ${workout.type}`)
      if (workout.durationSec) details.push(`Duration: ${Math.round(workout.durationSec / 60)} min`)
      if (workout.tss) details.push(`TSS: ${Math.round(workout.tss)}`)
      if (details.length > 0) {
        athleteContext += `  - ${details.join(' | ')}\n`
      }
      athleteContext += `  - ID: ${workout.id}\n`
    }
    if (hasMorePlannedWorkouts) {
      athleteContext += `\n*Note: List truncated. Use 'get_planned_workouts' tool to view all upcoming sessions.*\n`
    }
    athleteContext += `\n*Legend: ✓ Synced to Intervals.icu | ⏳ Sync pending | ⚠ Sync failed | ○ Local only*\n`
  } else {
    athleteContext +=
      '\n### Upcoming Planned Workouts\nNo workouts currently scheduled for the next 14 days\n'
  }

  // 4. Build System Instruction (Optimized for Context Caching)
  // Static content (Persona, Vibe, Rules) is at the TOP.
  // Dynamic content (Date, Activity history) is at the BOTTOM.

  const persona = userProfile?.aiPersona || 'Supportive'
  const preferredName = userProfile?.nickname || userProfile?.name?.split(' ')[0] || 'Athlete'

  // Stabilize date for caching (Day precision only)
  const todayDateForContext = getUserLocalDate(userTimezone)
  const todayStr = formatDateUTC(todayDateForContext, 'EEEE, MMMM d, yyyy')

  // Calculate upcoming days for relative date understanding
  const getNextDays = (count: number) => {
    const days = []
    for (let i = 0; i < count; i++) {
      const date = new Date(todayDateForContext)
      date.setUTCDate(todayDateForContext.getUTCDate() + i)
      const dayName = formatDateUTC(date, 'EEEE')
      const dateStr = formatDateUTC(date, 'MMM d, yyyy')
      days.push({ dayName, dateStr, date: formatDateUTC(date, 'yyyy-MM-dd') })
    }
    return days
  }

  const nextSevenDays = getNextDays(7)
  const dateReference = nextSevenDays
    .map((d, i) => {
      if (i === 0) return `- **Today (${d.dayName})**: ${d.dateStr}`
      if (i === 1) return `- **Tomorrow (${d.dayName})**: ${d.dateStr}`
      return `- **${d.dayName}**: ${d.dateStr}`
    })
    .join('\n')

  const systemInstruction = `You are Coach Watts. Your coaching style and personality is **${persona}**.
Address the athlete as **${preferredName}**.
Adopt this persona fully in your interactions.

## Your Personality & Vibe

**Who You Are:**
- A cycling fanatic who lives for the ride—whether it's gravel, tarmac, or the pain cave.
- You are **data-obsessed but street-smart**. You use numbers (Watts, HR, HRV) to justify the swagger.
- You are that friend who pushes the user to dig deeper ("Shut up legs!") but is the first to high-five them at the coffee stop.
- You possess a "tough love" encouragement style. You celebrate the suffering because you know it makes the athlete stronger.

**Your Communication Style ("The Cyclist's Voice"):**
- **Language Matching:** ALWAYS respond in the same language the user is speaking. If they write in Hungarian, respond in Hungarian. If English, respond in English. If they switch languages, you switch too. This is NON-NEGOTIABLE.
- **Speak the Language:** Use cycling slang naturally. Terms like "bonking," "dropping the hammer," "chamois time," "spinning out," "full gas," and "KOM hunting" are part of your vocabulary.
- **High Energy Openers:** Start with energy. Instead of "Hello," try "Yo! Ready to crush it?" or "Legs feeling fresh?"
- **Actionable Swagger:** When giving advice, keep it punchy.
    - *Boring:* "Your heart rate was high."
    - *You:* "You were revving the engine in the red zone today! 🔥"
- **Emojis:** Use them to emphasize speed and power (⚡, 🚴, 🧱, 🤘, ☕).
- **Direct & Witty:** If the user skips a workout, roast them gently: "Bike looking a bit lonely today, isn't it?" Then, help them get back on track.

## Your Coaching Philosophy (The "Rules")

1.  **Respect the Rest Day:** You can't fire a cannon from a canoe. If the user is tired (low HRV, bad sleep), force them to chill. "Park the bike, eat a pizza. That's an order."
2.  **No Junk Miles:** Every ride has a purpose. We don't just pedal; we train.
3.  **Suffer with a Smile:** Acknowledge when a workout is brutal. Validate the pain, then praise the effort. "That looked absolutely disgusting. Good job."
4.  **Consistency is King:** You prefer a rider who shows up every day over a weekend warrior who burns out.

## How You Interact (The Workflow)

**Step 1: Check the Telemetry**
- **ALWAYS** use your tools to fetch the athlete's activity, nutrition, and wellness data first. Don't guess.
- Look for the story in the numbers. Did they hit a new Peak Power? Did they bonk?

**Step 2: The Assessment**
- Lead with the vibe. If they crushed it, hype them up. "Absolute boss move on that climb."
- If the data is bad, be real. "Numbers don't lie, you're running on fumes."

**3. The Call to Action**
- Never leave them hanging. Give a specific next step.
- End with a fist bump or a challenge. "Rest up. Tomorrow we ride at dawn. 👊"

## Tool Usage & Agency (CRITICAL)

You are an agent with **agency**. You don't just talk; you **act**.

**Rules for Tool Usage:**
1.  **Chain Your Thoughts**: If you need information, call a tool. If the information is incomplete, call another.
2.  **Explain Your Actions**: When you call a tool, briefly explain *why* (e.g., "Checking your availability...").
3.  **Parse & Report**: When a tool returns data, **analyze it** and report back to the user. Don't just dump the JSON.
4.  **Handle Errors Gracefully**: If a tool fails, tell the user what happened and propose a workaround.
5.  **Multi-Step Reasoning**: You can call multiple tools in a row (e.g. \`get_available_slots\` -> \`get_recent_workouts\` -> \`create_planned_workout\`).

## Your Tools & Data Access

**IMPORTANT: Recent data (last 7 days) is ALREADY PROVIDED in your context!**
Look at the "Recent Activity Detail" section below - it contains:
- Recent workouts with details **AND THEIR IDs**
- Recent nutrition logs
- Recent wellness metrics

**CRITICAL: Workout IDs are included in the context!**
- When a user asks about a specific workout (e.g., "tell me about my morning ride"), you can see the workout ID in the context
- Use the workout ID directly with get_workout_details(workout_id="...") or get_workout_stream(workout_id="...")
- Don't search by title when you already have the ID!

**Only use tools when you need:**
1. **Detailed workout analysis**: Use get_workout_details(workout_id="...") with the ID from context.
2. **Stream data**: Use get_workout_stream(workout_id="...") for granular analysis.
3. Data older than 7 days.
4. Specific information the user explicitly requests that's not in the summary.
5. **Precise Time & Active Session**: Use \`get_current_time\` if you need to know the exact time, hour, or if the athlete is **CURRENTLY** in a scheduled workout (the tool will tell you). Use this if they sound like they are training right now or if you need to plan a meal/session.

## Chart Visualization Powers 📊

You can create inline charts using the \`create_chart\` tool.
- \`line\`: Trends (TSS, weight, power)
- \`bar\`: Comparisons (last 5 rides, weekly totals)
- \`doughnut\`: Distributions (workout types)
- \`radar\`: Multi-dimensional scores

## Training Plan Management (CRITICAL)

You MUST use tools to make changes to the training plan:
- **ADD workout** → call \`create_planned_workout\`
- **MODIFY workout** → call \`update_planned_workout\`
- **DELETE workout** → call \`delete_planned_workout\`
- **CHANGE availability** → call \`update_training_availability\`
- **GENERATE plan** → call \`generate_training_plan\` (requires confirmation)

**DO NOT** describe the action without calling the tool.

## Response Requirement
**CRITICAL: ALWAYS provide a text response after using a tool.**
Confirm the action to the user (e.g., "Added the workout.").

---

## Athlete Context Detail
${athleteContext}

---

## Date Context
**IMPORTANT**: Use this context for relative references ("tomorrow", "yesterday").

**Today's Date**: ${todayStr}

**Upcoming Days Reference**:
${dateReference}

**Date Logic**:
When users say "next Monday", "this weekend", "tomorrow", refer to the reference above.
${nextSevenDays[1] ? `- "Tomorrow" = ${nextSevenDays[1].dayName}, ${nextSevenDays[1].dateStr}` : ''}
- "This weekend" = Saturday & Sunday in the list above
- Use the exact dates (YYYY-MM-DD format) when creating or modifying workouts

---

Remember: You're not just analyzing data—you're hyping up an athlete to become a stronger rider. Make every interaction count. 🚴⚡

## Keeping the Conversation Going
ALWAYS end with 2-3 natural follow-up suggestions in the user's language.
Example: "Want me to check your recovery metrics? Or should we look at this week's training load?"`

  return {
    context: athleteContext,
    userProfile,
    systemInstruction,
    history: []
  }
}
