import { generateCoachAnalysis, generateStructuredAnalysis } from '../gemini'
import { prisma } from '../db'
import { attachStreamToWorkout } from '../repositories/workoutStreamRepository'
import { workoutRepository } from '../repositories/workoutRepository'
import { sportSettingsRepository } from '../repositories/sportSettingsRepository'
import { getUserTimezone, formatUserDate, calculateAge, getUserLocalDate } from '../date'
import { getUserAiSettings } from '../ai-user-settings'
import { checkQuota } from '../quotas/engine'
import { publishWorkoutSummaryToIntervals } from './workout-summary-publish'
import { queueWorkoutInsightEmail } from '../workout-insight-email'
import { createUserNotification } from '../notifications'
import { thresholdDetectionService } from './thresholdDetectionService'
import { pbDetectionService } from './pbDetectionService'
import { KG_TO_LBS } from '../number'
import {
  formatPromptWeight,
  formatPromptHeight,
  formatPromptDistance,
  formatPromptElevation,
  formatPromptTemperature,
  formatPromptPace
} from '../ai-prompt-format'
import { isWorkoutEligibleForAutomaticInsights } from '../automatic-workout-insights'
import {
  buildAnalysisRequestMetricRules,
  buildMetricPriorityPromptBlock,
  resolveMetricPriorityContext,
  shouldCondenseHeartRateSection
} from '../../../trigger/utils/workout-metric-priority'
import { formatStructuredPlanForPrompt } from '../../../trigger/utils/planned-workout-targets'
import {
  buildWorkoutAnalysisFacts,
  buildWorkoutAnalysisFactsV2,
  type WorkoutAnalysisFacts,
  type WorkoutAnalysisFactsV2
} from '../workout-analysis-facts'
import { summarizePowerFromWatts } from '../power-metrics'
import { resolveProviderIntervalTypes } from '../interval-detection'
import type { JourneyEventCategory } from '@prisma/client'
import { registerTaskHandler } from '../task-registry'

const logger = console

export interface StructuredAnalysis {
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

export const analysisSchema = {
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
      description: 'Date of the analysis in ISO format'
    },
    executive_summary: {
      type: 'string',
      description: 'High-level summary of the workout or report'
    },
    sections: {
      type: 'array',
      description: 'Detailed analysis sections (e.g., Pacing, Heart Rate, Execution)',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          status: {
            type: 'string',
            enum: ['excellent', 'good', 'fair', 'needs_attention', 'info']
          },
          status_label: { type: 'string' },
          analysis_points: {
            type: 'array',
            items: { type: 'string' }
          }
        },
        required: ['title', 'status', 'analysis_points']
      }
    },
    recommendations: {
      type: 'array',
      description: 'Actionable recommendations for future training',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          priority: {
            type: 'string',
            enum: ['high', 'medium', 'low']
          }
        },
        required: ['title', 'description']
      }
    },
    strengths: {
      type: 'array',
      items: { type: 'string' },
      description: 'Key positive aspects of the workout'
    },
    weaknesses: {
      type: 'array',
      items: { type: 'string' },
      description: 'Areas for improvement'
    },
    scores: {
      type: 'object',
      description:
        'Quantitative scoring (0-100) for different aspects of the workout, each accompanied by a 1-sentence explanation.',
      properties: {
        overall: {
          type: 'integer',
          minimum: 0,
          maximum: 100,
          description: 'Overall workout quality score (0-100)'
        },
        overall_explanation: {
          type: 'string',
          description: '1-sentence explanation justifying the overall quality score.'
        },
        technical: {
          type: 'integer',
          minimum: 0,
          maximum: 100,
          description: 'Technical execution score (form, CADENCE, power accuracy) (0-100)'
        },
        technical_explanation: {
          type: 'string',
          description: '1-sentence explanation justifying the technical execution score.'
        },
        effort: {
          type: 'integer',
          minimum: 0,
          maximum: 100,
          description: 'Effort management score (intensity vs target, HR control) (0-100)'
        },
        effort_explanation: {
          type: 'string',
          description: '1-sentence explanation justifying the effort management score.'
        },
        pacing: {
          type: 'integer',
          minimum: 0,
          maximum: 100,
          description: 'Pacing strategy score (consistency, negative splits, drift) (0-100)'
        },
        pacing_explanation: {
          type: 'string',
          description: '1-sentence explanation justifying the pacing strategy score.'
        },
        execution: {
          type: 'integer',
          minimum: 0,
          maximum: 100,
          description: 'Interval & plan adherence score (followed target steps) (0-100)'
        },
        execution_explanation: {
          type: 'string',
          description: '1-sentence explanation justifying the execution adherence score.'
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
      description: 'Key metrics for quick reference',
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

export function buildWorkoutAnalysisData(workout: any) {
  const workoutType = String(workout.type || '')
  const isRunningWorkout = workoutType.toLowerCase().includes('run')
  const normalizeRunningCadence = (cadence: number | null | undefined) => {
    if (!cadence) return cadence
    return isRunningWorkout && cadence < 120 ? cadence * 2 : cadence
  }

  const data: any = {
    id: workout.id,
    date: workout.date,
    title: workout.title,
    description: workout.description,
    notes: workout.notes,
    type: workout.type,
    duration_m: Math.round(workout.durationSec / 60),
    duration_s: workout.durationSec,
    distance_m: workout.distanceMeters,
    elevation_gain: workout.elevationGain
  }
  const streamPowerSummary = summarizePowerFromWatts(workout.streams?.watts)
  const powerZoneTimes = Array.isArray(workout.streams?.powerZoneTimes)
    ? (workout.streams.powerZoneTimes as number[]).filter((value) => typeof value === 'number')
    : []

  if (workout.averageWatts) data.avg_power = workout.averageWatts
  else if (streamPowerSummary?.averageWatts) data.avg_power = streamPowerSummary.averageWatts
  if (workout.maxWatts) data.max_power = workout.maxWatts
  else if (streamPowerSummary?.maxWatts) data.max_power = streamPowerSummary.maxWatts
  if (workout.normalizedPower) data.normalized_power = workout.normalizedPower
  else if (streamPowerSummary?.normalizedPower)
    data.normalized_power = streamPowerSummary.normalizedPower
  if (workout.weightedAvgWatts) data.weighted_avg_power = workout.weightedAvgWatts
  if (workout.ftp) data.ftp = workout.ftp
  if (Array.isArray(workout.streams?.watts) && workout.streams.watts.length > 0) {
    data.has_power_stream = true
  }
  if (powerZoneTimes.length > 0 && powerZoneTimes.some((value) => value > 0)) {
    data.power_zone_times = powerZoneTimes
  }

  if (workout.averageHr) data.avg_hr = workout.averageHr
  if (workout.maxHr) data.max_hr = workout.maxHr

  if (workout.averageCadence) {
    data.avg_cadence = normalizeRunningCadence(workout.averageCadence)
  }
  if (workout.maxCadence) {
    data.max_cadence = normalizeRunningCadence(workout.maxCadence)
  }

  if (workout.averageSpeed) data.avg_speed_ms = workout.averageSpeed / 3.6

  if (workout.tss) data.tss = workout.tss
  if (workout.trainingLoad) data.training_load = workout.trainingLoad
  if (workout.intensity) data.intensity = workout.intensity
  if (workout.kilojoules) data.kilojoules = workout.kilojoules

  if (workout.variabilityIndex) data.variability_index = workout.variabilityIndex
  if (workout.powerHrRatio) data.power_hr_ratio = workout.powerHrRatio
  if (workout.efficiencyFactor) data.efficiency_factor = workout.efficiencyFactor
  if (workout.decoupling !== null && workout.decoupling !== undefined)
    data.decoupling = workout.decoupling
  if (workout.polarizationIndex) data.polarization_index = workout.polarizationIndex

  if (workout.fatigueSensitivity) data.fatigue_sensitivity = workout.fatigueSensitivity
  if (workout.powerStability) data.power_stability = workout.powerStability
  if (workout.paceStability) data.pace_stability = workout.paceStability
  if (workout.recoveryTrend) data.recovery_trend = workout.recoveryTrend

  if (workout.ctl) data.ctl = workout.ctl
  if (workout.atl) data.atl = workout.atl

  if (workout.rpe) data.rpe = workout.rpe
  if (workout.sessionRpe) data.session_rpe = workout.sessionRpe
  if (workout.feel) data.feel = workout.feel

  if (workout.avgTemp !== null && workout.avgTemp !== undefined) data.avg_temp = workout.avgTemp
  if (workout.trainer !== null && workout.trainer !== undefined) data.trainer = workout.trainer

  if (workout.lrBalance !== null && workout.lrBalance !== undefined)
    data.lr_balance = workout.lrBalance

  if (workout.exercises && workout.exercises.length > 0) {
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

  if (workout.rawJson && typeof workout.rawJson === 'object') {
    const raw = workout.rawJson as any

    const rawIntervals = Array.isArray(raw.icu_intervals)
      ? raw.icu_intervals
      : Array.isArray(raw.intervals)
        ? raw.intervals
        : null
    if (rawIntervals) {
      // Provider lap labels are unreliable (Intervals.icu marks nearly every
      // lap WORK); re-derive them so the model does not read recovery jogs as
      // work reps.
      const resolvedTypes = resolveProviderIntervalTypes(
        rawIntervals.map((interval: any) => ({
          type: interval.type,
          intensity: Number(interval.intensity),
          avgPower: Number(interval.average_watts),
          avgSpeed: Number(interval.average_speed)
        }))
      )
      data.intervals = rawIntervals.map((interval: any, index: number) => ({
        type: resolvedTypes[index],
        label: interval.label,
        duration_s: interval.moving_time ?? interval.elapsed_time,
        distance_m: interval.distance,
        avg_power: interval.average_watts,
        max_power: interval.max_watts,
        weighted_avg_power: interval.weighted_average_watts,
        intensity: interval.intensity,
        avg_hr: interval.average_heartrate,
        max_hr: interval.max_heartrate,
        avg_cadence: normalizeRunningCadence(interval.average_cadence),
        max_cadence: normalizeRunningCadence(interval.max_cadence),
        avg_speed_ms: interval.average_speed,
        decoupling: interval.decoupling,
        variability: interval.w5s_variability,
        elevation_gain: interval.total_elevation_gain,
        avg_gradient: interval.average_gradient
      }))
    }

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
Power and cadence metrics may not be relevant depending on the specific activity.`
  }

  return `Focus your analysis on overall effort, volume, and progress relative to athlete goals.`
}

function getAnalysisSectionsGuidance(
  workoutType: string,
  isCardio: boolean,
  isStrength: boolean
): string {
  if (isStrength) {
    return `
Provide analysis across the following key areas (create logical section titles):
1. **Executive Summary**: Overview of strength session goals, overall quality score, key takeaways
2. **Volume & Load Analysis**: Total tonnage, working sets count, rest interval management
3. **Intensity & Effort**: RPE, weight progression across sets, proximity to failure (RIR)
4. **Exercise Selection & Muscle Groups**: Primary muscle targeted, exercise variety, movement balance
5. **Recovery & Readiness Impact**: Heart rate response during rest, session strain`
  }

  return `
Provide analysis across the following key areas (create logical section titles):
1. **Executive Summary**: High-level recap of the workout performance and overall score
2. **Pacing & Intensity Distribution**: How well intensity was controlled relative to planned targets or optimal pacing
3. **Aerobic & Metabolic Response**: Heart rate zones, decoupling/cardiac drift, efficiency factor (EF)
4. **Biomechanical Execution**: Cadence consistency, power stability, smooth energy output
5. **Training Load & Fatigue Context**: TSS, CTL/ATL impact, recovery status`
}

function getFactValueByPath(facts: any, path: string): unknown {
  if (!facts) return undefined
  return path
    .split('.')
    .reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), facts)
}

function formatPromptFactValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function buildAnalysisFactsPromptBlock(analysisFacts?: WorkoutAnalysisFactsV2): string {
  if (!analysisFacts) return ''

  const formatRule = (label: string, path: string, template: string) => {
    const rawVal = getFactValueByPath(analysisFacts, path)
    const formattedVal = formatPromptFactValue(rawVal)
    if (formattedVal === null) return null
    return `- ${label}: ${template.replace('{value}', formattedVal)}`
  }

  const lines = [
    'FACT-BASED COMPUTED DERIVATIONS (MUST OVERRIDE INFERENCE):',
    formatRule('Session Steadiness', 'steadiness.classification', '{value}'),
    formatRule(
      'Decoupling Guardrail',
      'decouplingGuardrail.applicable',
      'Pacing Drift Applicable: {value}'
    ),
    formatRule(
      'Decoupling Applicability Reason',
      'decouplingGuardrail.reason',
      'Pacing Drift Applicability Reason: {value}'
    ),
    formatRule(
      'Heart Rate Drift Guardrail',
      'hrDriftGuardrail.applicable',
      'HR Drift Applicable: {value}'
    ),
    formatRule(
      'Heart Rate Drift Reason',
      'hrDriftGuardrail.reason',
      'HR Drift Applicability Reason: {value}'
    )
  ].filter((line): line is string => line !== null)

  return lines.join('\n')
}

function buildAnalysisGuardrailInstructions(
  workoutType: string,
  analysisFacts?: WorkoutAnalysisFactsV2
): string {
  const instructions: string[] = []
  const typeLower = workoutType?.toLowerCase() || ''
  const isSki =
    typeLower.includes('nordic') || typeLower.includes('ski') || typeLower.includes('xcski')

  if (analysisFacts?.guardrails.archetype.sessionSteadiness === 'stochastic' || isSki) {
    instructions.push(
      '- Session Steadiness: stochastic. Do not criticize the athlete for lacking a constant pace or uniform effort.'
    )
  }

  if (isSki) {
    instructions.push(
      '- Nordic/Skiing Context: Pace fluctuates with terrain and snow conditions; avoid cycling-specific gear advice such as recommending a power meter.'
    )
  }

  if (analysisFacts?.performanceSignals.applicability.pacingDrift.applicable === false) {
    instructions.push(
      `- Decoupling Guardrail: ${analysisFacts.performanceSignals.applicability.pacingDrift.reason || 'Not applicable for this session type'}`
    )
  }

  instructions.push('- Keep recommendations conservative and avoid strong causal claims.')

  if (instructions.length === 0) return ''

  return `\nCRITICAL ANALYSIS GUARDRAILS:\n${instructions.join('\n')}`
}

function formatMetric(val: number | null | undefined, decimals = 1, unit = ''): string {
  if (val === null || val === undefined) return 'N/A'
  return `${val.toFixed(decimals)}${unit}`
}

export function buildWorkoutAnalysisPrompt(
  workoutData: any,
  timezone: string,
  persona: string = 'Supportive',
  sportSettings?: any,
  userProfile?: {
    age?: number | null
    sex?: string | null
    weight?: number | null
    weightUnits?: string | null
    height?: number | null
    heightUnits?: string | null
    language?: string | null
    temperatureUnits?: string | null
    distanceUnits?: string | null
  },
  userContext?: string | null,
  plannedWorkout?: any,
  analysisFactsV1?: WorkoutAnalysisFacts,
  analysisFactsV2?: WorkoutAnalysisFactsV2,
  journeyContext?: {
    symptoms?: Array<{
      timestamp: Date
      category: JourneyEventCategory
      severity: number
      description: string | null
    }>
  }
): string {
  const workoutType = workoutData.type || 'Workout'
  const isStrength = ['weighttraining', 'strength', 'workout'].includes(workoutType.toLowerCase())
  const isCardio = ['run', 'ride', 'virtualride', 'nordicski', 'swim', 'rowing'].some((t) =>
    workoutType.toLowerCase().includes(t)
  )
  const coachType = isStrength
    ? 'Strength & Resistance Training Specialist'
    : 'Endurance Performance Coach'

  const metricPriorityContext = resolveMetricPriorityContext(
    sportSettings?.loadPreference,
    workoutData
  )

  let prompt = `You are Coach Watts, an expert AI endurance & strength coach.
Provide a high-quality, structured analysis for this workout.

ATHLETE & SESSION CONTEXT:
- Persona: ${persona}
- User Timezone: ${timezone}
- Date: ${workoutData.date ? formatUserDate(workoutData.date, timezone, "EEEE, MMMM d, yyyy 'at' h:mm a") : 'Unknown Date'}
- Title: ${workoutData.title || 'Untitled Workout'}
- Activity Type: ${workoutType}
- Duration: ${workoutData.duration_m || 0} minutes (${workoutData.duration_s || 0} seconds)
`

  if (workoutData.distance_m) {
    prompt += `- Distance: ${formatPromptDistance(workoutData.distance_m, userProfile?.distanceUnits)}\n`
  }
  if (workoutData.avg_hr) {
    prompt += `- Average HR: ${workoutData.avg_hr} bpm (Max: ${workoutData.max_hr || 'N/A'} bpm)\n`
  }
  if (workoutData.avg_power) {
    prompt += `- Average Power: ${workoutData.avg_power} W (NP: ${workoutData.normalized_power || 'N/A'} W)\n`
  }
  if (workoutData.tss) {
    prompt += `- TSS: ${workoutData.tss}\n`
  }
  if (workoutData.intensity) {
    prompt += `- Intensity Factor: ${workoutData.intensity}\n`
  }

  prompt += `
${getWorkoutTypeGuidance(workoutType, isCardio, isStrength)}

${getAnalysisSectionsGuidance(workoutType, isCardio, isStrength)}

${buildAnalysisFactsPromptBlock(analysisFactsV2)}

${buildAnalysisGuardrailInstructions(workoutType, analysisFactsV2)}

${buildMetricPriorityPromptBlock(metricPriorityContext)}

Format your analysis according to the requested schema. Provide clear, objective scores (0-100) with single-sentence justifications for overall, technical, effort, pacing, and execution adherence.`

  return prompt
}

export function convertWorkoutAnalysisToMarkdown(analysis: any): string {
  let markdown = `# ${analysis.title}\n\n`

  if (analysis.date) {
    markdown += `Date: ${analysis.date}\n\n`
  }

  if (analysis.executive_summary) {
    markdown += `## Executive Summary\n${analysis.executive_summary}\n\n`
  }

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

  if (analysis.recommendations && analysis.recommendations.length > 0) {
    markdown += `## Recommendations\n`
    for (const rec of analysis.recommendations) {
      markdown += `### ${rec.title}\n`
      markdown += `${rec.description}\n\n`
    }
  }

  return markdown
}

export async function runWorkoutAnalysis(payload: {
  workoutId: string
  source?: 'AUTOMATIC' | 'MANUAL'
}) {
  const { workoutId, source = 'MANUAL' } = payload

  logger.log('Starting workout analysis', { workoutId, source })

  try {
    const workoutRecord = await prisma.workout.findUnique({
      where: { id: workoutId },
      include: {
        exercises: {
          include: {
            exercise: true,
            sets: {
              orderBy: { order: 'asc' }
            }
          },
          orderBy: { order: 'asc' }
        },
        plannedWorkout: true
      }
    })

    if (!workoutRecord) {
      throw new Error('Workout not found')
    }

    const workout = await attachStreamToWorkout(workoutRecord)
    const timezone = await getUserTimezone(workout.userId)
    const today = getUserLocalDate(timezone)
    const todayLocalDate = formatUserDate(new Date(), timezone, 'yyyy-MM-dd')
    const workoutLocalDate = formatUserDate(workout.date, timezone, 'yyyy-MM-dd')

    const [user, emailPrefs, recentJourneyEvents] = await Promise.all([
      prisma.user.findUnique({
        where: { id: workout.userId },
        select: {
          dob: true,
          sex: true,
          weight: true,
          weightUnits: true,
          height: true,
          heightUnits: true,
          language: true,
          temperatureUnits: true,
          aiAutoAnalyzeWorkouts: true
        }
      }),
      prisma.emailPreference.findUnique({
        where: { userId_channel: { userId: workout.userId, channel: 'EMAIL' } }
      }),
      prisma.athleteJourneyEvent.findMany({
        where: {
          userId: workout.userId,
          timestamp: {
            gte: new Date(workout.date.getTime() - 14 * 24 * 60 * 60 * 1000),
            lte: new Date(workout.date.getTime() + 24 * 60 * 60 * 1000)
          }
        },
        orderBy: { timestamp: 'desc' },
        take: 5,
        select: {
          timestamp: true,
          category: true,
          severity: true,
          description: true
        }
      })
    ])

    if (workoutLocalDate > todayLocalDate) {
      await workoutRepository.updateStatus(workoutId, 'NOT_STARTED')
      return { success: true, skipped: true, reason: 'FUTURE_DATE' }
    }

    if (source === 'AUTOMATIC' && !user?.aiAutoAnalyzeWorkouts) {
      return { success: true, skipped: true, reason: 'AUTO_ANALYZE_DISABLED' }
    }

    if (source === 'AUTOMATIC' && !isWorkoutEligibleForAutomaticInsights(workout.type)) {
      await workoutRepository.updateStatus(workoutId, 'SKIPPED_UNSUPPORTED_TYPE')
      return { success: true, skipped: true, reason: 'UNSUPPORTED_TYPE' }
    }

    const hasData =
      (workout.durationSec || 0) > 0 ||
      (workout.distanceMeters || 0) > 0 ||
      (workout.averageWatts || 0) > 0 ||
      (workout.averageHr || 0) > 0 ||
      (Array.isArray(workout.streams?.watts) && workout.streams.watts.length > 0) ||
      (Array.isArray(workout.streams?.heartrate) && workout.streams.heartrate.length > 0) ||
      (workout.exercises && workout.exercises.length > 0)

    if (!hasData) {
      await workoutRepository.updateStatus(workoutId, 'SKIPPED_EMPTY')
      return { success: true, skipped: true, reason: 'EMPTY_SESSION' }
    }

    try {
      await checkQuota(workout.userId, 'workout_analysis')
    } catch (quotaError: any) {
      if (quotaError.statusCode === 429) {
        await workoutRepository.updateStatus(workoutId, 'QUOTA_EXCEEDED')
        return { success: false, reason: 'QUOTA_EXCEEDED' }
      }
      throw quotaError
    }

    await workoutRepository.updateStatus(workoutId, 'PROCESSING')

    const aiSettings = await getUserAiSettings(workout.userId)
    const userAge = calculateAge(user?.dob)

    const sportSettings = await sportSettingsRepository.getForActivityType(
      workout.userId,
      workout.type || ''
    )

    const workoutData = buildWorkoutAnalysisData(workout)
    const analysisFacts = buildWorkoutAnalysisFacts({
      workout,
      sportSettings,
      plannedWorkout: workout.plannedWorkout,
      userProfile: {
        weight: user?.weight || null,
        weightUnits: user?.weightUnits || null,
        language: user?.language || null
      }
    })
    const analysisFactsV2 = buildWorkoutAnalysisFactsV2({
      workout,
      sportSettings,
      plannedWorkout: workout.plannedWorkout,
      userProfile: {
        weight: user?.weight || null,
        weightUnits: user?.weightUnits || null,
        language: user?.language || null
      }
    })

    const prompt = buildWorkoutAnalysisPrompt(
      workoutData,
      timezone,
      aiSettings.aiPersona,
      sportSettings,
      {
        age: userAge,
        sex: user?.sex || null,
        weight: user?.weight || null,
        weightUnits: user?.weightUnits || null,
        height: user?.height || null,
        heightUnits: user?.heightUnits || null,
        language: user?.language || null,
        temperatureUnits: user?.temperatureUnits || null
      },
      aiSettings.aiContext,
      workout.plannedWorkout,
      analysisFacts,
      analysisFactsV2,
      {
        symptoms: recentJourneyEvents.map((event) => ({
          timestamp: event.timestamp,
          category: event.category,
          severity: event.severity,
          description: event.description
        }))
      }
    )

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

    const markdownAnalysis = convertWorkoutAnalysisToMarkdown(structuredAnalysis)

    const clampScore = (val?: number | null) => {
      if (typeof val !== 'number' || isNaN(val)) return null
      const num = val > 10 ? val / 10 : val
      return Math.min(10, Math.max(1, Math.round(num)))
    }

    await workoutRepository.update(workoutId, {
      aiAnalysis: markdownAnalysis,
      aiAnalysisJson: structuredAnalysis as any,
      aiAnalysisStatus: 'COMPLETED',
      aiAnalyzedAt: new Date(),
      overallScore: clampScore(structuredAnalysis.scores?.overall),
      technicalScore: clampScore(structuredAnalysis.scores?.technical),
      effortScore: clampScore(structuredAnalysis.scores?.effort),
      pacingScore: clampScore(structuredAnalysis.scores?.pacing),
      executionScore: clampScore(structuredAnalysis.scores?.execution),
      overallQualityExplanation: structuredAnalysis.scores?.overall_explanation,
      technicalExecutionExplanation: structuredAnalysis.scores?.technical_explanation,
      effortManagementExplanation: structuredAnalysis.scores?.effort_explanation,
      pacingStrategyExplanation: structuredAnalysis.scores?.pacing_explanation,
      executionConsistencyExplanation: structuredAnalysis.scores?.execution_explanation
    })

    try {
      await thresholdDetectionService.detectThresholdIncreases(workoutId)
    } catch {
      // ignore error
    }

    try {
      await pbDetectionService.detectPBs(workoutId)
    } catch {
      // ignore error
    }

    if (source === 'AUTOMATIC') {
      try {
        await createUserNotification(workout.userId, {
          title: 'Workout Analysis Ready',
          message: `Your workout "${workout.title || 'Untitled workout'}" has a new AI analysis.`,
          icon: 'i-heroicons-chart-bar-square',
          link: `/activities/${workoutId}`
        })
      } catch {
        // ignore notification error
      }
    }

    try {
      await publishWorkoutSummaryToIntervals(workoutId, workout.userId)
    } catch {
      // ignore publishing error
    }

    if (
      source === 'AUTOMATIC' &&
      emailPrefs &&
      emailPrefs.workoutAnalysis &&
      !emailPrefs.globalUnsubscribe
    ) {
      try {
        const planAdherence = await prisma.planAdherence.findUnique({
          where: { workoutId },
          select: { overallScore: true, summary: true, analysisStatus: true }
        })

        const recommendationHighlights = (structuredAnalysis.recommendations || [])
          .slice(0, 3)
          .map((rec) => {
            if (rec.title && rec.description) return `${rec.title}: ${rec.description}`
            return rec.title || rec.description
          })
          .filter((value): value is string => Boolean(value))

        const adherenceSummary =
          planAdherence?.analysisStatus === 'COMPLETED'
            ? planAdherence.summary || undefined
            : undefined
        const adherenceScore =
          planAdherence?.analysisStatus === 'COMPLETED'
            ? planAdherence.overallScore || undefined
            : undefined

        await queueWorkoutInsightEmail({
          workoutId,
          triggerType: 'on-analysis-ready',
          overallScore: structuredAnalysis.scores?.overall,
          analysisSummary: structuredAnalysis.executive_summary,
          recommendationHighlights,
          adherenceSummary,
          adherenceScore
        })
      } catch {
        // ignore email queuing error
      }
    }

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

// Automatically register task handler for Redis worker execution
registerTaskHandler('analyze-workout', runWorkoutAnalysis)
