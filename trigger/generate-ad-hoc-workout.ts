import './init'
import { logger, task, tasks } from '@trigger.dev/sdk/v3'
import { generateStructuredAnalysis, buildWorkoutSummary } from '../server/utils/gemini'
import { prisma } from '../server/utils/db'
import { workoutRepository } from '../server/utils/repositories/workoutRepository'
import { wellnessRepository } from '../server/utils/repositories/wellnessRepository'
import { sportSettingsRepository } from '../server/utils/repositories/sportSettingsRepository'
import { getUserTimezone, getStartOfDaysAgoUTC, formatUserDate } from '../server/utils/date'

const adHocWorkoutSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    type: { type: 'string', enum: ['Ride', 'Run'] }, // Simplified for now
    durationMinutes: { type: 'integer' },
    targetTss: { type: 'integer' },
    intensity: {
      type: 'string',
      enum: ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'VO2Max', 'Anaerobic']
    },
    objective: {
      type: 'string',
      description: 'Primary physiological objective for this session.'
    },
    executionCues: {
      type: 'array',
      items: { type: 'string' },
      description: '3 concise cues for how to execute the session well.'
    },
    reasoning: { type: 'string' }
  },
  required: [
    'title',
    'type',
    'durationMinutes',
    'targetTss',
    'intensity',
    'objective',
    'reasoning'
  ]
}

export const generateAdHocWorkoutTask = task({
  id: 'generate-ad-hoc-workout',
  maxDuration: 300,
  run: async (payload: { userId: string; date: Date; preferences?: any }) => {
    const { userId, date, preferences } = payload

    const timezone = await getUserTimezone(userId)
    // Calculate today based on user's timezone date string forced to UTC midnight
    // This ensures it matches @db.Date columns (e.g. 2026-01-09T00:00:00Z) even if the real start of day is previous UTC day
    const dateObj = new Date(date)
    const dateStr = formatUserDate(dateObj, timezone, 'yyyy-MM-dd')
    const localTime = formatUserDate(dateObj, timezone, 'HH:mm')
    const today = new Date(`${dateStr}T00:00:00Z`)

    logger.log('Generating ad-hoc workout', {
      userId,
      date: today,
      preferences,
      timezone,
      localTime
    })

    // Fetch Data
    const [todayMetric, recentWorkouts, user, athleteProfile, activeGoals, sportSettings] =
      await Promise.all([
        wellnessRepository.getByDate(userId, today),
        workoutRepository.getForUser(userId, {
          startDate: getStartOfDaysAgoUTC(timezone, 7),
          limit: 10,
          orderBy: { date: 'desc' },
          includeDuplicates: false
        }),
        prisma.user.findUnique({
          where: { id: userId },
          select: { ftp: true, weight: true, maxHr: true, aiPersona: true }
        }),
        prisma.report.findFirst({
          where: { userId, type: 'ATHLETE_PROFILE', status: 'COMPLETED' },
          orderBy: { createdAt: 'desc' },
          select: { analysisJson: true }
        }),
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
        // Fetch settings for requested type or default to Ride
        sportSettingsRepository.getForActivityType(userId, preferences?.type || 'Ride')
      ])

    // Build Context
    let context = `Athlete: FTP ${user?.ftp || 250}W. Persona: ${user?.aiPersona || 'Supportive'}.`
    if (todayMetric) {
      context += `\nRecovery: ${todayMetric.recoveryScore || 'Unknown'}%. Sleep: ${todayMetric.sleepHours || 0}h.`
    }
    context += `\nRecent Workouts: ${recentWorkouts.length > 0 ? buildWorkoutSummary(recentWorkouts) : 'None'}.`

    if (sportSettings) {
      context += `\n\nDEFINED ZONES (Use these for intensity):`
      if (sportSettings.hrZones && Array.isArray(sportSettings.hrZones)) {
        context += '\nHeart Rate:\n'
        sportSettings.hrZones.forEach((z: any) => {
          context += `- ${z.name}: ${z.min}-${z.max} bpm\n`
        })
      }
      if (sportSettings.powerZones && Array.isArray(sportSettings.powerZones)) {
        context += '\nPower:\n'
        sportSettings.powerZones.forEach((z: any) => {
          context += `- ${z.name}: ${z.min}-${z.max} W\n`
        })
      }
    }

    if (athleteProfile?.analysisJson) {
      const p = athleteProfile.analysisJson as any
      context += `\nFocus: ${p.planning_context?.current_focus || 'General Fitness'}.`
    }

    if (activeGoals.length > 0) {
      context += `\n\nCURRENT GOALS:\n${activeGoals
        .map((g) => {
          const daysToTarget = g.targetDate
            ? Math.ceil((new Date(g.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : null
          let goalLine = `- ${g.title}`
          if (daysToTarget) goalLine += ` (${daysToTarget} days left)`
          return goalLine
        })
        .join('\n')}`
    }

    // Incorporate User Preferences
    let goalPrompt = 'Based on recovery and recent history, create the optimal workout.'
    if (preferences) {
      goalPrompt = `The user has requested a specific workout:
      - Type: ${preferences.type || 'Any'}
      - Duration: ${preferences.durationMinutes || 'Auto'} minutes
      - Intensity: ${preferences.intensity || 'Auto'}
      - Instructions: "${preferences.notes || 'None'}"
      
      Create a workout matching these constraints while optimizing for the athlete's context.`
    } else {
      goalPrompt += `
      - If recovery is low (<33%), prescribe Active Recovery or Rest (but since the user ASKED for a workout, give a very easy Recovery spin/jog).
      - If recovery is good, prescribe a workout that fits the current focus or maintains fitness.`
    }

    const prompt = `Design one high-quality workout prescription for this athlete for TODAY.
    
    LOCAL CONTEXT:
    - Date: ${dateStr}
    - Time: ${localTime}
    - Timezone: ${timezone}

    CONTEXT:
    ${context}
    
    GOAL:
    ${goalPrompt}
    
    COACHING RULES:
    - The workout must have one clear physiological objective (recovery, aerobic endurance, tempo, threshold, VO2, neuromuscular).
    - Match stimulus to readiness: lower risk and lower dose when recovery is poor.
    - Avoid prescribing maximal work if current recovery markers are low.
    - Keep the session realistic and executable in the requested time.
    - Prefer minimum effective dose over excessive load when uncertainty exists.
    - Use the athlete's defined zones/thresholds when setting intensity language.
    - Provide concise athlete-facing execution cues.
    
    OUTPUT:
    JSON with title, description, type (Ride/Run), durationMinutes, targetTss, intensity, objective, executionCues, and reasoning.`

    const suggestion = await generateStructuredAnalysis(prompt, adHocWorkoutSchema, 'flash', {
      userId,
      operation: 'generate_ad_hoc_workout',
      entityType: 'PlannedWorkout'
    })

    // Create Planned Workout
    const plannedWorkout = await prisma.plannedWorkout.create({
      data: {
        userId,
        date: today, // Correctly aligned to user's local day start (UTC)
        title: suggestion.title,
        description: `${suggestion.description}\n\nObjective: ${suggestion.objective}\n${
          Array.isArray(suggestion.executionCues) && suggestion.executionCues.length > 0
            ? `Execution Cues: ${suggestion.executionCues.join(' | ')}\n`
            : ''
        }\nReasoning: ${suggestion.reasoning}`,
        type: suggestion.type,
        durationSec: suggestion.durationMinutes * 60,
        tss: suggestion.targetTss,
        syncStatus: 'LOCAL_ONLY', // Mark as local initially
        externalId: `adhoc-${userId}-${Date.now()}`, // Generate unique external ID
        managedBy: 'COACH_WATTS'
      }
    })

    logger.log('Created planned workout', { id: plannedWorkout.id })

    // Trigger Structure Generation
    await tasks.trigger(
      'generate-structured-workout',
      {
        plannedWorkoutId: plannedWorkout.id
      },
      {
        concurrencyKey: userId,
        tags: [`user:${userId}`]
      }
    )

    return { success: true, plannedWorkoutId: plannedWorkout.id }
  }
})
