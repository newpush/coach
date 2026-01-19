import { logger, task } from '@trigger.dev/sdk/v3'
import { generateCoachAnalysis, generateStructuredAnalysis } from '../server/utils/gemini'
import { prisma } from '../server/utils/db'
import { workoutRepository } from '../server/utils/repositories/workoutRepository'
import { sportSettingsRepository } from '../server/utils/repositories/sportSettingsRepository'
import { userAnalysisQueue } from './queues'
import { getUserTimezone, formatUserDate, calculateAge } from '../server/utils/date'
import { getUserAiSettings } from '../server/utils/ai-settings'

// TypeScript interface for the structured analysis
interface StructuredAnalysis {
  type: string
  title: string
  date?: string
  executive_summary: string
  sections?: Array<{
    title: string
    status: string
    status_label?: string
    analysis_points: string[]
  }>
  recommendations?: Array<{
    title: string
    description: string
    priority?: string
  }>
  strengths?: string[]
  weaknesses?: string[]
  scores?: {
    overall: number
    overall_explanation: string
    technical: number
    technical_explanation: string
    effort: number
    effort_explanation: string
    pacing: number
    pacing_explanation: string
    execution: number
    execution_explanation: string
  }
  metrics_summary?: {
    avg_power?: number
    ftp?: number
    intensity?: number
    duration_minutes?: number
    tss?: number
  }
}

// Flexible analysis schema that works for workouts, reports, planning, etc.
const analysisSchema = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      description: 'Type of analysis: workout, weekly_report, planning, etc.',
      enum: ['workout', 'weekly_report', 'planning', 'comparison']
    },
    title: {
      type: 'string',
      description: 'Title of the analysis'
    },
    date: {
      type: 'string',
      description: 'Date or date range of the analysis'
    },
    executive_summary: {
      type: 'string',
      description: '2-3 sentence high-level summary of key findings'
    },
    sections: {
      type: 'array',
      description: 'Analysis sections with status and points',
      items: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Section title (e.g., Pacing Strategy, Power Application)'
          },
          status: {
            type: 'string',
            description: 'Overall assessment',
            enum: ['excellent', 'good', 'moderate', 'needs_improvement', 'poor']
          },
          status_label: {
            type: 'string',
            description: 'Display label for status'
          },
          analysis_points: {
            type: 'array',
            description: 'Detailed analysis points for this section',
            items: {
              type: 'string'
            }
          }
        },
        required: ['title', 'status', 'analysis_points']
      }
    },
    recommendations: {
      type: 'array',
      description: 'Actionable recommendations',
      items: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Recommendation title'
          },
          description: {
            type: 'string',
            description: 'Detailed recommendation'
          },
          priority: {
            type: 'string',
            description: 'Priority level',
            enum: ['high', 'medium', 'low']
          }
        },
        required: ['title', 'description']
      }
    },
    strengths: {
      type: 'array',
      description: 'Key strengths identified',
      items: {
        type: 'string'
      }
    },
    weaknesses: {
      type: 'array',
      description: 'Areas needing improvement',
      items: {
        type: 'string'
      }
    },
    scores: {
      type: 'object',
      description:
        'Performance scores on 1-10 scale for tracking over time, with detailed explanations',
      properties: {
        overall: {
          type: 'number',
          description: 'Overall workout quality (1-10)',
          minimum: 1,
          maximum: 10
        },
        overall_explanation: {
          type: 'string',
          description:
            'Detailed explanation of overall quality: key factors contributing to score, what went well, what could improve, and 2-3 specific actionable improvements'
        },
        technical: {
          type: 'number',
          description: 'Technical execution score - form, technique, efficiency (1-10)',
          minimum: 1,
          maximum: 10
        },
        technical_explanation: {
          type: 'string',
          description:
            'Technical analysis: power application smoothness, cadence consistency, form observations, and specific technique improvements needed'
        },
        effort: {
          type: 'number',
          description: 'Effort appropriateness relative to plan and goals (1-10)',
          minimum: 1,
          maximum: 10
        },
        effort_explanation: {
          type: 'string',
          description:
            'Effort management analysis: whether intensity matched goals, HR/power relationship, and recommendations for effort control'
        },
        pacing: {
          type: 'number',
          description: 'Pacing strategy and execution quality (1-10)',
          minimum: 1,
          maximum: 10
        },
        pacing_explanation: {
          type: 'string',
          description:
            'Pacing strategy analysis: consistency throughout workout, whether pacing was appropriate, and specific pacing improvements'
        },
        execution: {
          type: 'number',
          description: 'How well the workout plan was executed (1-10)',
          minimum: 1,
          maximum: 10
        },
        execution_explanation: {
          type: 'string',
          description:
            'Execution quality analysis: adherence to workout structure, target achievement, and recommendations for better execution'
        }
      },
      required: [
        'overall',
        'overall_explanation',
        'technical',
        'technical_explanation',
        'effort',
        'effort_explanation',
        'pacing',
        'pacing_explanation',
        'execution',
        'execution_explanation'
      ]
    },
    metrics_summary: {
      type: 'object',
      description: 'Key metrics at a glance',
      properties: {
        avg_power: { type: 'number' },
        ftp: { type: 'number' },
        intensity: { type: 'number' },
        duration_minutes: { type: 'number' },
        tss: { type: 'number' }
      }
    }
  },
  required: ['type', 'title', 'executive_summary', 'sections', 'scores']
}

export const analyzeWorkoutTask = task({
  id: 'analyze-workout',
  maxDuration: 300, // 5 minutes for AI processing
  queue: userAnalysisQueue,
  run: async (payload: { workoutId: string }) => {
    const { workoutId } = payload

    logger.log('Starting workout analysis', { workoutId })

    // Update workout status to PROCESSING
    await workoutRepository.updateStatus(workoutId, 'PROCESSING')

    try {
      // Fetch the workout - passing 'unknown' as userId because we don't have it yet,
      // but findUnique by ID will work if we use getById without userId check or raw prisma
      // Actually, standard getById requires userId.
      // Let's use prisma directly here or update repository to allow system-level fetch
      // But standard repo pattern suggests always using repo.
      // I'll assume we can use prisma here for the initial fetch since we don't have userId in payload
      // OR better, update payload to include userId?
      // existing code uses prisma.workout.findUnique({ where: { id: workoutId } })

      const workout = await prisma.workout.findUnique({
        where: { id: workoutId },
        include: {
          exercises: {
            include: {
              exercise: true,
              sets: {
                orderBy: {
                  order: 'asc'
                }
              }
            },
            orderBy: {
              order: 'asc'
            }
          },
          plannedWorkout: true
        }
      })

      if (!workout) {
        throw new Error('Workout not found')
      }

      logger.log('Workout data fetched', {
        workoutId,
        title: workout.title,
        date: workout.date,
        plannedWorkoutId: workout.plannedWorkoutId
      })

      const timezone = await getUserTimezone(workout.userId)
      const aiSettings = await getUserAiSettings(workout.userId)

      const user = await prisma.user.findUnique({
        where: { id: workout.userId },
        select: { dob: true, sex: true, weight: true }
      })
      const userAge = calculateAge(user?.dob)

      // Fetch Sport Specific Settings
      const sportSettings = await sportSettingsRepository.getForActivityType(
        workout.userId,
        workout.type || ''
      )

      logger.log('Using AI settings', {
        model: aiSettings.aiModelPreference,
        persona: aiSettings.aiPersona
      })

      // Build comprehensive workout data for analysis
      const workoutData = buildWorkoutAnalysisData(workout)

      // Generate the prompt
      const prompt = buildWorkoutAnalysisPrompt(
        workoutData,
        timezone,
        aiSettings.aiPersona,
        sportSettings,
        { age: userAge, sex: user?.sex || null, weight: user?.weight || null },
        workout.plannedWorkout
      )

      logger.log(`Generating structured analysis with Gemini (${aiSettings.aiModelPreference})`)

      // Generate structured JSON analysis
      const structuredAnalysis = await generateStructuredAnalysis<StructuredAnalysis>(
        prompt,
        analysisSchema,
        aiSettings.aiModelPreference,
        {
          userId: workout.userId,
          operation: 'workout_analysis',
          entityType: 'Workout',
          entityId: workout.id
        }
      )

      // Also generate markdown for fallback/export
      const markdownAnalysis = convertStructuredToMarkdown(structuredAnalysis)

      logger.log('Analysis generated successfully', {
        sections: structuredAnalysis.sections?.length || 0,
        recommendations: structuredAnalysis.recommendations?.length || 0,
        scores: structuredAnalysis.scores
      })

      // Save both formats to the database, including scores and explanations
      await workoutRepository.update(workoutId, {
        aiAnalysis: markdownAnalysis,
        aiAnalysisJson: structuredAnalysis as any,
        aiAnalysisStatus: 'COMPLETED',
        aiAnalyzedAt: new Date(),
        // Store scores for easy querying and tracking
        overallScore: structuredAnalysis.scores?.overall,
        technicalScore: structuredAnalysis.scores?.technical,
        effortScore: structuredAnalysis.scores?.effort,
        pacingScore: structuredAnalysis.scores?.pacing,
        executionScore: structuredAnalysis.scores?.execution,
        // Store explanations for user guidance
        overallQualityExplanation: structuredAnalysis.scores?.overall_explanation,
        technicalExecutionExplanation: structuredAnalysis.scores?.technical_explanation,
        effortManagementExplanation: structuredAnalysis.scores?.effort_explanation,
        pacingStrategyExplanation: structuredAnalysis.scores?.pacing_explanation,
        executionConsistencyExplanation: structuredAnalysis.scores?.execution_explanation
      })

      logger.log('Analysis saved to database')

      return {
        success: true,
        workoutId,
        analysisLength: markdownAnalysis.length,
        sectionsCount: structuredAnalysis.sections?.length || 0
      }
    } catch (error) {
      logger.error('Error generating workout analysis', { error })

      await workoutRepository.updateStatus(workoutId, 'FAILED')

      throw error
    }
  }
})

function buildWorkoutAnalysisData(workout: any) {
  const data: any = {
    id: workout.id,
    date: workout.date,
    title: workout.title,
    description: workout.description,
    type: workout.type,
    duration_m: Math.round(workout.durationSec / 60),
    duration_s: workout.durationSec,
    distance_m: workout.distanceMeters,
    elevation_gain: workout.elevationGain
  }

  // Power metrics
  if (workout.averageWatts) data.avg_power = workout.averageWatts
  if (workout.maxWatts) data.max_power = workout.maxWatts
  if (workout.normalizedPower) data.normalized_power = workout.normalizedPower
  if (workout.weightedAvgWatts) data.weighted_avg_power = workout.weightedAvgWatts
  if (workout.ftp) data.ftp = workout.ftp

  // Heart rate
  if (workout.averageHr) data.avg_hr = workout.averageHr
  if (workout.maxHr) data.max_hr = workout.maxHr

  // Cadence
  if (workout.averageCadence) {
    // If running, ensure cadence is in steps per minute (SPM).
    // Most devices export running cadence as "steps per foot" or RPM (e.g. 80-90),
    // but runners expect total steps per minute (e.g. 160-180).
    // If we see a running cadence < 120, it's likely RPM and needs to be doubled.
    if (workout.type === 'Run' && workout.averageCadence < 120) {
      data.avg_cadence = workout.averageCadence * 2
    } else {
      data.avg_cadence = workout.averageCadence
    }
  }
  if (workout.maxCadence) {
    if (workout.type === 'Run' && workout.maxCadence < 120) {
      data.max_cadence = workout.maxCadence * 2
    } else {
      data.max_cadence = workout.maxCadence
    }
  }

  // Speed
  if (workout.averageSpeed) data.avg_speed_ms = workout.averageSpeed / 3.6 // km/h to m/s

  // Training metrics
  if (workout.tss) data.tss = workout.tss
  if (workout.trainingLoad) data.training_load = workout.trainingLoad
  if (workout.intensity) data.intensity = workout.intensity
  if (workout.kilojoules) data.kilojoules = workout.kilojoules

  // Performance metrics
  if (workout.variabilityIndex) data.variability_index = workout.variabilityIndex
  if (workout.powerHrRatio) data.power_hr_ratio = workout.powerHrRatio
  if (workout.efficiencyFactor) data.efficiency_factor = workout.efficiencyFactor
  if (workout.decoupling !== null && workout.decoupling !== undefined)
    data.decoupling = workout.decoupling
  if (workout.polarizationIndex) data.polarization_index = workout.polarizationIndex

  // Extended Advanced Metrics (Pass through for AI)
  if (workout.fatigueSensitivity) data.fatigue_sensitivity = workout.fatigueSensitivity
  if (workout.powerStability) data.power_stability = workout.powerStability
  if (workout.paceStability) data.pace_stability = workout.paceStability
  if (workout.recoveryTrend) data.recovery_trend = workout.recoveryTrend

  // Training status
  if (workout.ctl) data.ctl = workout.ctl
  if (workout.atl) data.atl = workout.atl

  // Subjective
  if (workout.rpe) data.rpe = workout.rpe
  if (workout.sessionRpe) data.session_rpe = workout.sessionRpe
  if (workout.feel) data.feel = workout.feel

  // Environment
  if (workout.avgTemp !== null && workout.avgTemp !== undefined) data.avg_temp = workout.avgTemp
  if (workout.trainer !== null && workout.trainer !== undefined) data.trainer = workout.trainer

  // L/R Balance
  if (workout.lrBalance) data.lr_balance = workout.lrBalance

  // Exercises (for Strength/Hevy workouts)
  // @ts-expect-error - exercises included in fetch above
  if (workout.exercises && workout.exercises.length > 0) {
    // @ts-expect-error - types might be out of sync
    data.exercises = workout.exercises.map((we: any) => ({
      name: we.exercise.title,
      type: we.exercise.type,
      muscle_group: we.exercise.primaryMuscle,
      notes: we.notes,
      sets: we.sets.map((s: any) => ({
        type: s.type,
        weight: s.weight,
        reps: s.reps,
        rpe: s.rpe,
        distance: s.distanceMeters,
        duration: s.durationSec
      }))
    }))
  }

  // Extract intervals and pacing splits from rawJson if available
  if (workout.rawJson && typeof workout.rawJson === 'object') {
    const raw = workout.rawJson as any

    // Intervals.icu intervals
    if (raw.icu_intervals && Array.isArray(raw.icu_intervals)) {
      data.intervals = raw.icu_intervals.slice(0, 10).map((interval: any) => ({
        type: interval.type,
        label: interval.label,
        duration_s: interval.elapsed_time,
        distance_m: interval.distance,
        avg_power: interval.average_watts,
        max_power: interval.max_watts,
        weighted_avg_power: interval.weighted_average_watts,
        intensity: interval.intensity,
        avg_hr: interval.average_heartrate,
        max_hr: interval.max_heartrate,
        avg_cadence: interval.average_cadence,
        max_cadence: interval.max_cadence,
        avg_speed_ms: interval.average_speed,
        decoupling: interval.decoupling,
        variability: interval.w5s_variability,
        elevation_gain: interval.total_elevation_gain,
        avg_gradient: interval.average_gradient
      }))
    }

    // Strava splits (lap pacing data)
    const splits = raw.splits_metric || raw.splits_standard
    if (splits && Array.isArray(splits) && splits.length > 0) {
      data.lap_splits = splits.map((split: any, index: number) => {
        const time = split.moving_time || split.elapsed_time
        const paceMinPerKm = split.distance > 0 ? time / 60 / (split.distance / 1000) : 0
        const paceMin = Math.floor(paceMinPerKm)
        const paceSec = Math.round((paceMinPerKm - paceMin) * 60)

        return {
          lap: index + 1,
          distance_m: split.distance,
          time_s: time,
          pace_min_per_km: `${paceMin}:${paceSec.toString().padStart(2, '0')}`,
          avg_speed_ms: split.average_speed,
          avg_hr: split.average_heartrate
        }
      })

      // Calculate pacing consistency
      const paces = data.lap_splits.map((s: any) => s.time_s / (s.distance_m / 1000))
      if (paces.length > 1) {
        const avgPace = paces.reduce((sum: number, p: number) => sum + p, 0) / paces.length
        const variance =
          paces.reduce((sum: number, p: number) => sum + Math.pow(p - avgPace, 2), 0) / paces.length
        data.pace_variability_seconds = Math.sqrt(variance)
      }
    }
  }

  return data
}
/**
 * Get workout type-specific guidance for the AI
 */
function getWorkoutTypeGuidance(
  workoutType: string,
  isCardio: boolean,
  isStrength: boolean
): string {
  if (isStrength) {
    return `Focus your analysis on strength training aspects like volume, intensity, rest periods, and exercise selection. 
Metrics like cadence, power output, and aerobic efficiency are NOT RELEVANT for this workout type - DO NOT analyze them.
Instead, analyze heart rate in the context of training intensity zones for resistance training.`
  }

  if (isCardio) {
    if (workoutType.toLowerCase().includes('run')) {
      return `This is a running workout. Focus on running-specific metrics like pace, cadence (steps per minute), and heart rate zones.
Power metrics may not be available and that's normal for running workouts.`
    }
    if (workoutType.toLowerCase().includes('ride') || workoutType.toLowerCase().includes('bike')) {
      return `This is a cycling workout. Analyze power metrics, pacing, cadence (RPM), and pedaling efficiency where available.`
    }
    return `This is a cardio workout. Focus on pacing, effort distribution, and aerobic efficiency.
Analyze available metrics like heart rate, pace/speed, and any power data if present.`
  }

  return `Analyze this workout based on the available metrics. Focus on what's most relevant for this activity type.`
}

/**
 * Get workout type-specific analysis section guidance
 */
function getAnalysisSectionsGuidance(
  workoutType: string,
  isCardio: boolean,
  isStrength: boolean
): string {
  if (isStrength) {
    return `Provide a structured analysis with these sections:

1. **Executive Summary**: Write 2-3 friendly, encouraging sentences highlighting the most important findings. Keep it conversational and positive.

2. **Training Volume**: Analyze workout duration, estimated sets/reps if available from description, and overall training load
   - Assign status: excellent/good/moderate/needs_improvement/poor
   - Provide 3-5 separate, concise bullet points (each as a separate array item, not paragraphs)
   - Each point should be 1-2 sentences maximum

3. **Intensity Management**: Evaluate effort level based on heart rate zones and RPE if available
   - Assign status: excellent/good/moderate/needs_improvement/poor
   - Provide 3-5 separate, concise bullet points (each as a separate array item)
   - Each point should be 1-2 sentences maximum

4. **Recovery & Pacing**: Assess rest periods and workout structure based on duration and heart rate patterns
   - Assign status: excellent/good/moderate/needs_improvement/poor
   - Provide 3-5 separate, concise bullet points (each as a separate array item)
   - Each point should be 1-2 sentences maximum

5. **Workout Execution**: Evaluate overall session quality and adherence to training principles
   - Assign status: excellent/good/moderate/needs_improvement/poor
   - Provide 3-5 separate, concise bullet points (each as a separate array item)
   - Each point should be 1-2 sentences maximum`
  }

  if (isCardio && workoutType.toLowerCase().includes('run')) {
    return `Provide a structured analysis with these sections:

1. **Executive Summary**: Write 2-3 friendly, encouraging sentences highlighting the most important findings. Keep it conversational and positive.

2. **Pacing Strategy**: Analyze pace consistency, effort distribution, and pacing discipline
   - Assign status: excellent/good/moderate/needs_improvement/poor
   - Provide 3-5 separate, concise bullet points (each as a separate array item, not paragraphs)
   - Each point should be 1-2 sentences maximum

3. **Running Form**: Evaluate cadence patterns (steps per minute) and stride efficiency
   - Assign status: excellent/good/moderate/needs_improvement/poor
   - Provide 3-5 separate, concise bullet points (each as a separate array item)
   - Each point should be 1-2 sentences maximum

4. **Effort Management**: Assess heart rate zones and perceived exertion
   - Assign status: excellent/good/moderate/needs_improvement/poor
   - Provide 3-5 separate, concise bullet points (each as a separate array item)
   - Each point should be 1-2 sentences maximum

5. **Workout Execution**: Evaluate target achievement and interval quality if applicable
   - Assign status: excellent/good/moderate/needs_improvement/poor
   - Provide 3-5 separate, concise bullet points (each as a separate array item)
   - Each point should be 1-2 sentences maximum`
  }

  // Default to cycling/bike-focused sections
  return `Provide a structured analysis with these sections:

1. **Executive Summary**: Write 2-3 friendly, encouraging sentences highlighting the most important findings. Keep it conversational and positive.

2. **Pacing Strategy**: Analyze power variability (VI), surging behavior, and pacing discipline
   - Assign status: excellent/good/moderate/needs_improvement/poor
   - Provide 3-5 separate, concise bullet points (each as a separate array item, not paragraphs)
   - Each point should be 1-2 sentences maximum

3. **Pedaling Efficiency**: Evaluate cadence patterns, L/R balance, and technique
   - Assign status: excellent/good/moderate/needs_improvement/poor
   - Provide 3-5 separate, concise bullet points (each as a separate array item)
   - Each point should be 1-2 sentences maximum

4. **Power Application**: Assess consistency, fade patterns, and zone adherence
   - Assign status: excellent/good/moderate/needs_improvement/poor
   - Provide 3-5 separate, concise bullet points (each as a separate array item)
   - Each point should be 1-2 sentences maximum

5. **Workout Execution**: Evaluate target achievement and interval quality
   - Assign status: excellent/good/moderate/needs_improvement/poor
   - Provide 3-5 separate, concise bullet points (each as a separate array item)
   - Each point should be 1-2 sentences maximum

6. **Efficiency & Fatigue**: Analyze endurance fade, power stability, and heart rate recovery trends.
   - Assign status: excellent/good/moderate/needs_improvement/poor
   - Provide 2-4 separate, concise bullet points (each as a separate array item)
   - Each point should be 1-2 sentences maximum`
}

function buildWorkoutAnalysisPrompt(
  workoutData: any,

  timezone: string,

  persona: string = 'Supportive',

  sportSettings?: any,

  userProfile?: { age: number | null; sex: string | null; weight: number | null },

  plannedWorkout?: any
): string {
  const formatMetric = (value: any, decimals = 1) => {
    return value !== undefined && value !== null ? Number(value).toFixed(decimals) : 'N/A'
  }

  const dateStr = formatUserDate(workoutData.date, timezone, 'yyyy-MM-dd')

  // Determine the workout type for context-aware analysis

  const workoutType = workoutData.type || 'Unknown'

  const isCardio = ['Ride', 'Run', 'Swim', 'VirtualRide', 'VirtualRun'].some((t) =>
    workoutType.toLowerCase().includes(t.toLowerCase())
  )

  const isStrength = ['Gym', 'WeightTraining', 'Strength', 'CrossFit'].some((t) =>
    workoutType.toLowerCase().includes(t.toLowerCase())
  )

  // Set appropriate coach persona and focus based on workout type

  let coachType = 'fitness coach'

  if (isCardio && workoutType.toLowerCase().includes('ride')) {
    coachType = 'cycling coach'
  } else if (isCardio && workoutType.toLowerCase().includes('run')) {
    coachType = 'running coach'
  } else if (isStrength) {
    coachType = 'strength and conditioning coach'
  }

  let zoneDefinitions = ''

  if (sportSettings) {
    zoneDefinitions += `\n## Defined Training Zones (Reference)\n`

    if (sportSettings.ftp) zoneDefinitions += `- **FTP**: ${sportSettings.ftp} W\n`

    if (sportSettings.lthr) zoneDefinitions += `- **LTHR**: ${sportSettings.lthr} bpm\n`

    if (sportSettings.hrZones && Array.isArray(sportSettings.hrZones)) {
      zoneDefinitions += '- **Heart Rate Zones**:\n'

      sportSettings.hrZones.forEach((z: any) => {
        zoneDefinitions += `  - ${z.name}: ${z.min}-${z.max} bpm\n`
      })
    }

    if (sportSettings.powerZones && Array.isArray(sportSettings.powerZones)) {
      zoneDefinitions += '- **Power Zones**:\n'

      sportSettings.powerZones.forEach((z: any) => {
        zoneDefinitions += `  - ${z.name}: ${z.min}-${z.max} W\n`
      })
    }
  }

  let prompt = `You are an expert ${coachType} analyzing a workout.

Your persona is: **${persona}**. Adapt your tone and feedback style accordingly.



ATHLETE CONTEXT:

- Age: ${userProfile?.age || 'Unknown'}

- Sex: ${userProfile?.sex || 'Unknown'}

${userProfile?.weight ? `- Weight: ${userProfile.weight} kg` : ''}



**IMPORTANT - Workout Type Context**: This is a **${workoutType}** workout. ${getWorkoutTypeGuidance(workoutType, isCardio, isStrength)}



## Workout Details

- **Date**: ${dateStr}

- **Title**: ${workoutData.title}

- **Type**: ${workoutType}

- **Duration**: ${workoutData.duration_m} minutes (${workoutData.duration_s}s)

`

  // Add Planned Workout Context

  if (plannedWorkout) {
    prompt += `

## Planned Workout Context (Adherence Check)

This workout was linked to a planned training session. Compare the actual execution against these targets:

- **Planned Title**: ${plannedWorkout.title}

- **Planned Description**: ${plannedWorkout.description || 'N/A'}

- **Planned Duration**: ${plannedWorkout.durationSec ? Math.round(plannedWorkout.durationSec / 60) + ' min' : 'N/A'}

- **Planned TSS**: ${plannedWorkout.tss || 'N/A'}

- **Planned Intensity**: ${plannedWorkout.workIntensity ? (plannedWorkout.workIntensity * 100).toFixed(0) + '%' : 'N/A'}



When analyzing "Execution" and "Effort", specifically reference how well the athlete stuck to this plan. Did they go too hard? Too easy? Did they match the duration?

`
  }

  // Add zone definitions to context

  prompt += zoneDefinitions

  if (workoutData.distance_m) {
    prompt += `- **Distance**: ${(workoutData.distance_m / 1000).toFixed(2)} km\n`
  }

  if (workoutData.elevation_gain) {
    prompt += `- **Elevation Gain**: ${workoutData.elevation_gain}m\n`
  }

  // Only include power metrics for cardio workouts where they're relevant
  if (
    isCardio &&
    (workoutData.avg_power || workoutData.max_power || workoutData.normalized_power)
  ) {
    prompt += '\n## Power Metrics\n'
    if (workoutData.avg_power) prompt += `- Average Power: ${workoutData.avg_power}W\n`
    if (workoutData.max_power) prompt += `- Max Power: ${workoutData.max_power}W\n`
    if (workoutData.normalized_power)
      prompt += `- Normalized Power: ${workoutData.normalized_power}W\n`
    if (workoutData.weighted_avg_power)
      prompt += `- Weighted Avg Power: ${workoutData.weighted_avg_power}W\n`
    if (workoutData.ftp) prompt += `- FTP at time: ${workoutData.ftp}W\n`
    if (workoutData.intensity)
      prompt += `- Intensity Factor: ${formatMetric(workoutData.intensity, 3)}\n`
  }

  // Heart rate is relevant for all workout types
  if (workoutData.avg_hr || workoutData.max_hr || workoutData.avg_cadence) {
    prompt += '\n## Heart Rate'
    // Only include cadence label for cardio workouts
    if (isCardio && workoutData.avg_cadence) {
      prompt += ' & Cadence'
    }
    prompt += '\n'

    if (workoutData.avg_hr) prompt += `- Average HR: ${workoutData.avg_hr} bpm\n`
    if (workoutData.max_hr) prompt += `- Max HR: ${workoutData.max_hr} bpm\n`

    // Cadence is only relevant for cardio (cycling/running)
    if (isCardio) {
      if (workoutData.avg_cadence)
        prompt += `- Average Cadence: ${workoutData.avg_cadence} ${workoutType.toLowerCase().includes('run') ? 'spm' : 'rpm'}\n`
      if (workoutData.max_cadence)
        prompt += `- Max Cadence: ${workoutData.max_cadence} ${workoutType.toLowerCase().includes('run') ? 'spm' : 'rpm'}\n`
    }
  }

  // Performance indicators are primarily relevant for cardio workouts
  if (
    isCardio &&
    (workoutData.variability_index ||
      workoutData.efficiency_factor ||
      workoutData.decoupling !== undefined ||
      workoutData.power_hr_ratio ||
      workoutData.lr_balance)
  ) {
    prompt += '\n## Performance Indicators\n'
    if (workoutData.variability_index) {
      prompt += `- Variability Index (VI): ${formatMetric(workoutData.variability_index, 3)}\n`
      prompt += `  - 1.00-1.05 = Excellent pacing, 1.05-1.10 = Good, >1.10 = Poor pacing\n`
    }
    if (workoutData.efficiency_factor) {
      prompt += `- Efficiency Factor (EF): ${formatMetric(workoutData.efficiency_factor, 2)} (Watts/HR - higher is better)\n`
    }
    if (workoutData.decoupling !== undefined && workoutData.decoupling !== null) {
      prompt += `- Decoupling: ${formatMetric(workoutData.decoupling, 1)}%\n`
      prompt += `  - <5% = Excellent aerobic efficiency (negative values also good), 5-10% = Good, >10% = Needs aerobic work\n`
    }
    if (workoutData.power_hr_ratio) {
      prompt += `- Power/HR Ratio: ${formatMetric(workoutData.power_hr_ratio, 2)}\n`
    }
    if (workoutData.lr_balance) {
      prompt += `- L/R Balance: ${formatMetric(workoutData.lr_balance, 1)}%\n`
      prompt += `  - 48-52% = Acceptable, 50/50 = Ideal, >53% = Significant imbalance\n`
    }

    if (workoutData.fatigue_sensitivity) {
      prompt += `- Fatigue Sensitivity (Endurance Fade): ${formatMetric(workoutData.fatigue_sensitivity.decay, 1)}%\n`
      prompt += `  - <5% = Excellent endurance, 5-10% = Good, >10% = Significant late-stage fatigue\n`
    }

    if (workoutData.power_stability) {
      prompt += `- Power Stability (CoV): ${formatMetric(workoutData.power_stability.overallCoV, 1)}%\n`
      prompt += `  - Lower is better. <5% = Highly stable delivery, >10% = Erratic power application\n`
    } else if (workoutData.pace_stability) {
      prompt += `- Pace Stability (CoV): ${formatMetric(workoutData.pace_stability.overallCoV, 1)}%\n`
      prompt += `  - Lower is better. <5% = Consistent pacing, >10% = Variable speed delivery\n`
    }

    if (workoutData.recovery_trend && workoutData.recovery_trend.length > 0) {
      const avgDrop =
        workoutData.recovery_trend.reduce((sum: number, r: any) => sum + (r.drop60s || 0), 0) /
        workoutData.recovery_trend.length
      prompt += `- Average HR Recovery (60s): ${formatMetric(avgDrop, 0)} bpm\n`
    }
  }

  prompt += '\n## Training Load\n'
  if (workoutData.tss) prompt += `- TSS: ${formatMetric(workoutData.tss, 0)}\n`
  if (workoutData.training_load)
    prompt += `- Training Load: ${formatMetric(workoutData.training_load, 1)}\n`
  if (workoutData.kilojoules)
    prompt += `- Kilojoules: ${formatMetric(workoutData.kilojoules, 1)} kJ\n`

  if (workoutData.ctl || workoutData.atl) {
    prompt += '\n## Fitness Status\n'
    if (workoutData.ctl) prompt += `- CTL (Fitness): ${formatMetric(workoutData.ctl, 1)}\n`
    if (workoutData.atl) prompt += `- ATL (Fatigue): ${formatMetric(workoutData.atl, 1)}\n`
    if (workoutData.ctl && workoutData.atl) {
      const tsb = workoutData.ctl - workoutData.atl
      prompt += `- TSB (Form): ${formatMetric(tsb, 1)}\n`
    }
  }

  if (workoutData.rpe || workoutData.feel) {
    prompt += '\n## Subjective Metrics\n'
    if (workoutData.rpe) prompt += `- RPE: ${workoutData.rpe}/10\n`
    // Feel is stored as 1-5, scale to 1-10 for AI
    // 1 (Weak) -> 2/10, 5 (Strong) -> 10/10
    if (workoutData.feel) prompt += `- Feel: ${workoutData.feel * 2}/10 (10=Strong, 2=Weak)\n`
  }

  if (workoutData.trainer !== undefined || workoutData.avg_temp !== undefined) {
    prompt += '\n## Environment\n'
    if (workoutData.trainer !== undefined)
      prompt += `- Indoor Trainer: ${workoutData.trainer ? 'Yes' : 'No'}\n`
    if (workoutData.avg_temp !== undefined)
      prompt += `- Avg Temperature: ${formatMetric(workoutData.avg_temp, 1)}°C\n`
  }

  // Add Strength Exercises if available
  if (workoutData.exercises && workoutData.exercises.length > 0) {
    prompt += '\n## Strength Exercises\n'
    workoutData.exercises.forEach((ex: any, i: number) => {
      prompt += `### ${i + 1}. ${ex.name} (${ex.muscle_group || 'General'})\n`
      if (ex.notes) prompt += `Notes: ${ex.notes}\n`
      ex.sets.forEach((s: any, j: number) => {
        prompt += `- Set ${j + 1}: `
        if (s.type !== 'NORMAL') prompt += `[${s.type}] `

        let metricAdded = false
        if (s.weight) {
          prompt += `${s.weight}kg x ${s.reps}`
          metricAdded = true
        } else if (s.reps) {
          prompt += `${s.reps} reps`
          metricAdded = true
        }

        if (s.distance) {
          if (metricAdded) prompt += `, `
          prompt += `${s.distance}m`
          metricAdded = true
        }

        if (s.duration) {
          if (metricAdded) prompt += `, `
          prompt += `${s.duration}s`
        }

        if (s.rpe) prompt += ` @ RPE ${s.rpe}`
        prompt += '\n'
      })
      prompt += '\n'
    })
  }

  // Add lap splits pacing analysis if available
  if (workoutData.lap_splits && workoutData.lap_splits.length > 0) {
    prompt += '\n## Lap Pacing Analysis\n'
    prompt += `Split-by-split pacing data showing consistency and strategy:\n\n`

    workoutData.lap_splits.forEach((split: any) => {
      prompt += `**Lap ${split.lap}**: `
      prompt += `${(split.distance_m / 1000).toFixed(2)}km in ${Math.floor(split.time_s / 60)}:${(split.time_s % 60).toString().padStart(2, '0')} `
      prompt += `(${split.pace_min_per_km}/km pace)`
      if (split.avg_hr) prompt += `, HR ${Math.round(split.avg_hr)} bpm`
      if (split.avg_speed_ms) prompt += `, ${formatMetric(split.avg_speed_ms, 2)} m/s`
      prompt += '\n'
    })

    if (workoutData.pace_variability_seconds) {
      prompt += `\n**Pace Consistency**: ${formatMetric(workoutData.pace_variability_seconds, 1)} seconds standard deviation\n`
      prompt += `- Lower is better (more consistent pacing)\n`
      prompt += `- <10s = Excellent consistency, 10-20s = Good, >20s = Variable pacing\n`
    }

    // Add first/second half comparison
    if (workoutData.lap_splits.length >= 2) {
      const halfwayIndex = Math.floor(workoutData.lap_splits.length / 2)
      const firstHalf = workoutData.lap_splits.slice(0, halfwayIndex)
      const secondHalf = workoutData.lap_splits.slice(halfwayIndex)

      const firstHalfAvgPace =
        firstHalf.reduce((sum: number, s: any) => sum + s.time_s / (s.distance_m / 1000), 0) /
        firstHalf.length
      const secondHalfAvgPace =
        secondHalf.reduce((sum: number, s: any) => sum + s.time_s / (s.distance_m / 1000), 0) /
        secondHalf.length

      const splitDiff = secondHalfAvgPace - firstHalfAvgPace
      const splitType =
        splitDiff > 10
          ? 'Positive Split (slowed down)'
          : splitDiff < -10
            ? 'Negative Split (sped up)'
            : 'Even Split'

      prompt += `\n**Split Strategy**: ${splitType}\n`
      prompt += `- First half avg: ${formatMetric(firstHalfAvgPace, 1)}s/km\n`
      prompt += `- Second half avg: ${formatMetric(secondHalfAvgPace, 1)}s/km\n`
      prompt += `- Difference: ${formatMetric(Math.abs(splitDiff), 1)}s/km ${splitDiff > 0 ? 'slower' : 'faster'} in second half\n`
    }

    prompt += '\n'
  }

  // Add interval analysis if available
  if (workoutData.intervals && workoutData.intervals.length > 0) {
    prompt += '\n## Interval Breakdown\n'
    workoutData.intervals.forEach((interval: any, index: number) => {
      prompt += `\n### Interval ${index + 1}: ${interval.label || interval.type || 'Unnamed'}\n`
      if (interval.duration_s)
        prompt += `- Duration: ${Math.round(interval.duration_s / 60)}m ${interval.duration_s % 60}s\n`
      if (interval.avg_power) prompt += `- Avg Power: ${interval.avg_power}W\n`
      if (interval.intensity) prompt += `- Intensity: ${formatMetric(interval.intensity, 2)}\n`
      if (interval.avg_hr) prompt += `- Avg HR: ${interval.avg_hr} bpm\n`
      if (interval.avg_cadence) prompt += `- Avg Cadence: ${interval.avg_cadence} rpm\n`
      if (interval.variability)
        prompt += `- Power Variability: ${formatMetric(interval.variability, 2)}\n`
    })
  }

  if (workoutData.description) {
    prompt += `\n## Workout Description\n${workoutData.description}\n`
  }

  // Add zone distribution if available
  if (workoutData.zone_distribution) {
    const zoneType = workoutData.zone_distribution.type === 'hr' ? 'Heart Rate' : 'Power'
    prompt += `\n## ${zoneType} Zone Distribution\n`
    prompt += `Time spent in each training zone:\n\n`

    for (const zone of workoutData.zone_distribution.zones) {
      if (zone.time_seconds > 0) {
        prompt += `**${zone.name}**: ${zone.time_minutes} minutes (${zone.percentage}% of workout)\n`
      }
    }

    prompt += `\nUse this distribution to assess training stimulus and whether the athlete worked in the intended zones for this workout type.\n`
  }

  prompt += `

## Analysis Request

You are a **${persona}** ${coachType} analyzing this workout. Adopt this persona fully in your analysis.

${getAnalysisSectionsGuidance(workoutType, isCardio, isStrength)}

6. **Recommendations**: Provide 2-4 specific, actionable recommendations with:
   - Clear, friendly title
   - Description (2-3 sentences) consistent with your persona
   - Priority level (high/medium/low)

7. **Strengths & Weaknesses**:
   - List 2-4 key strengths (short phrases or single sentences)
   - List 2-4 areas for improvement (short phrases or single sentences)

8. **Performance Scores** (1-10 scale for tracking progress over time):
   - **Overall**: Holistic assessment of workout quality (consider all factors)
   - **Technical**: Form, technique, efficiency (e.g., cadence, power smoothness, L/R balance)
   - **Effort**: Was the effort level appropriate for the workout goals? (RPE vs planned intensity)
   - **Pacing**: How well was pacing managed? (variability, surge control, discipline)
   - **Execution**: How well was the workout plan/structure executed? (interval targets, rest periods)
   
   Scoring Guidelines:
   - 9-10: Exceptional, elite-level performance
   - 7-8: Strong, solid execution with minor areas to improve
   - 5-6: Adequate, met basic requirements but room for improvement
   - 3-4: Needs work, several areas requiring attention
   - 1-2: Poor execution, significant issues to address

IMPORTANT:
- Each analysis_point must be a separate, concise item in the array
- Maintain your **${persona}** persona throughout
- Be specific with numbers
- Focus on actionable advice
- Tailor your analysis to the workout type (${workoutType}) - ignore metrics that don't apply
- Scores should be realistic and track progress over time - don't inflate scores`

  return prompt
}

// Convert structured analysis to markdown for fallback/export
function convertStructuredToMarkdown(analysis: any): string {
  let markdown = `# ${analysis.title}\n\n`

  if (analysis.date) {
    markdown += `Date: ${analysis.date}\n\n`
  }

  markdown += `## Executive Summary\n${analysis.executive_summary}\n\n`

  // Sections
  if (analysis.sections) {
    for (const section of analysis.sections) {
      markdown += `## ${section.title}\n`
      markdown += `**Status**: ${section.status_label || section.status}\n`
      if (section.analysis_points && section.analysis_points.length > 0) {
        for (const point of section.analysis_points) {
          markdown += `- ${point}\n`
        }
      }
      markdown += '\n'
    }
  }

  // Recommendations
  if (analysis.recommendations && analysis.recommendations.length > 0) {
    markdown += `## Recommendations\n`
    for (const rec of analysis.recommendations) {
      markdown += `### ${rec.title}\n`
      markdown += `${rec.description}\n\n`
    }
  }

  // Strengths & Weaknesses
  if (analysis.strengths || analysis.weaknesses) {
    markdown += `## Strengths & Weaknesses\n`

    if (analysis.strengths && analysis.strengths.length > 0) {
      markdown += `### Strengths\n`
      for (const strength of analysis.strengths) {
        markdown += `- ${strength}\n`
      }
      markdown += '\n'
    }

    if (analysis.weaknesses && analysis.weaknesses.length > 0) {
      markdown += `### Weaknesses\n`
      for (const weakness of analysis.weaknesses) {
        markdown += `- ${weakness}\n`
      }
    }
  }

  return markdown
}
