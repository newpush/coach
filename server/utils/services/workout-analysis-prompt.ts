/**
 * Shared workout-analysis payload/prompt builders.
 *
 * This module is the single source of truth for the AI workout-analysis prompt.
 * Both entry points -- the Trigger.dev task (`trigger/analyze-workout.ts`) and the
 * Redis-worker service (`server/utils/services/workoutAnalysisService.ts`) -- import
 * from here. Historically each file carried its own copy of these builders, which
 * drifted apart (CW-392).
 */
import { formatUserDate } from '../date'
import {
  formatPromptWeight,
  formatPromptHeight,
  formatPromptDistance,
  formatPromptElevation,
  formatPromptTemperature,
  formatPromptPace
} from '../ai-prompt-format'
import { resolveProviderIntervalTypes } from '../interval-detection'
import {
  buildAnalysisRequestMetricRules,
  buildMetricPriorityPromptBlock,
  resolveMetricPriorityContext,
  shouldCondenseHeartRateSection
} from '../../../trigger/utils/workout-metric-priority'
import { formatStructuredPlanForPrompt } from '../../../trigger/utils/planned-workout-targets'
import type { WorkoutAnalysisFactsV2 } from '../workout-analysis-facts'
import { summarizePowerFromWatts } from '../power-metrics'
import type { JourneyEventCategory } from '@prisma/client'

export interface WorkoutAnalysisPromptUserProfile {
  age?: number | null
  sex?: string | null
  weight?: number | null
  weightUnits?: string | null
  height?: number | null
  heightUnits?: string | null
  language?: string | null
  temperatureUnits?: string | null
  distanceUnits?: string | null
}

export interface WorkoutAnalysisPromptRecentContext {
  symptoms?: Array<{
    timestamp: Date
    category: JourneyEventCategory | string
    severity: number
    description?: string | null
  }>
}

/**
 * Running exports sometimes report "per-foot" cadence (< 120). Convert those into
 * total steps per minute so the model never reads a 85 spm run as a form problem.
 */
export function normalizeRunningCadence(
  cadence: number | null | undefined,
  isRunningWorkout: boolean
): number | null | undefined {
  if (!cadence) return cadence
  return isRunningWorkout && cadence < 120 ? cadence * 2 : cadence
}

export function buildWorkoutAnalysisData(workout: any) {
  const workoutType = String(workout.type || '')
  const isRunningWorkout = workoutType.toLowerCase().includes('run')
  const normalizeCadence = (cadence: number | null | undefined) =>
    normalizeRunningCadence(cadence, isRunningWorkout)

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

  // Power metrics
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

  // Heart rate
  if (workout.averageHr) data.avg_hr = workout.averageHr
  if (workout.maxHr) data.max_hr = workout.maxHr

  // Cadence
  if (workout.averageCadence) {
    // For running-like workout types (Run, VirtualRun, TrailRun...), convert
    // "per-foot" cadence exports (<120) into total steps per minute.
    data.avg_cadence = normalizeCadence(workout.averageCadence)
  }
  if (workout.maxCadence) {
    data.max_cadence = normalizeCadence(workout.maxCadence)
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
  if (workout.lrBalance !== null && workout.lrBalance !== undefined)
    data.lr_balance = workout.lrBalance

  // Exercises (for Strength/Hevy workouts)
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

  // Extract intervals and pacing splits from rawJson if available
  if (workout.rawJson && typeof workout.rawJson === 'object') {
    const raw = workout.rawJson as any

    // Intervals.icu intervals
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
        // Prefer moving time for pace analysis (elapsed_time can include pauses/stops and distort run interval pace).
        duration_s: interval.moving_time ?? interval.elapsed_time,
        distance_m: interval.distance,
        avg_power: interval.average_watts,
        max_power: interval.max_watts,
        weighted_avg_power: interval.weighted_average_watts,
        intensity: interval.intensity,
        avg_hr: interval.average_heartrate,
        max_hr: interval.max_heartrate,
        avg_cadence: normalizeCadence(interval.average_cadence),
        max_cadence: normalizeCadence(interval.max_cadence),
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
export function getWorkoutTypeGuidance(
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
export function getAnalysisSectionsGuidance(
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

function getFactValueByPath(facts: any, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== 'object') return undefined
    return (acc as Record<string, unknown>)[key]
  }, facts)
}

function formatPromptFactValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2)
  if (Array.isArray(value)) return value.length > 0 ? value.join('; ') : null
  if (typeof value === 'string') return value.length > 0 ? value : null
  return String(value)
}

export function buildAnalysisFactsPromptBlock(analysisFacts?: WorkoutAnalysisFactsV2): string {
  if (!analysisFacts) return ''

  const promptDecisions = analysisFacts.confidence.debugMeta.promptDecisions || {}
  const groups: Array<{ title: string; items: Array<{ path: string; label: string }> }> = [
    {
      title: 'Guardrails',
      items: [
        { path: 'guardrails.analysisMode', label: 'Analysis Mode' },
        { path: 'guardrails.archetype.primaryArchetype', label: 'Primary Archetype' },
        { path: 'guardrails.archetype.executionEnvironment', label: 'Execution Environment' },
        { path: 'guardrails.archetype.primaryMetric', label: 'Primary Metric' },
        { path: 'guardrails.archetype.sessionSteadiness', label: 'Session Steadiness' },
        { path: 'guardrails.telemetry.hrUsable', label: 'HR Usable' },
        { path: 'guardrails.telemetry.hrArtifactSeverity', label: 'HR Artifact Severity' },
        { path: 'guardrails.telemetry.powerSourceType', label: 'Power Source Type' },
        { path: 'guardrails.telemetry.powerAbsoluteUsable', label: 'Power Absolute Usable' },
        { path: 'guardrails.telemetry.powerRelativeUsable', label: 'Power Relative Usable' },
        { path: 'guardrails.telemetry.paceUsable', label: 'Pace Usable' },
        { path: 'guardrails.telemetry.gpsConfidence', label: 'GPS Confidence' },
        { path: 'guardrails.telemetry.lrBalanceUsable', label: 'L/R Balance Usable' },
        { path: 'guardrails.telemetry.lrInterpretationMode', label: 'L/R Interpretation Mode' },
        { path: 'guardrails.erg.detected', label: 'ERG Detected' },
        { path: 'guardrails.erg.powerControlMode', label: 'Power Control Mode' },
        { path: 'guardrails.suppressions', label: 'Suppressions' }
      ]
    },
    {
      title: 'Adherence',
      items: [
        { path: 'adherence.planLinked', label: 'Plan Linked' },
        { path: 'adherence.adherenceAssessable', label: 'Adherence Assessable' },
        { path: 'adherence.adherenceReason', label: 'Adherence Reason' },
        { path: 'adherence.completionPct', label: 'Completion %' },
        { path: 'adherence.durationVsPlanPct', label: 'Duration vs Plan %' },
        { path: 'adherence.workIntervalHitRate', label: 'Work Interval Hit Rate' },
        { path: 'adherence.recoveryHitRate', label: 'Recovery Hit Rate' },
        { path: 'adherence.targetOvershootPct', label: 'Target Overshoot %' },
        { path: 'adherence.targetUndershootPct', label: 'Target Undershoot %' },
        { path: 'adherence.structureMatched', label: 'Structure Matched' },
        { path: 'adherence.executionClassification', label: 'Execution Classification' }
      ]
    },
    {
      title: 'Performance Signals',
      items: [
        {
          path: 'performanceSignals.applicability.lateSessionFade.applicable',
          label: 'Late Session Fade Applicable'
        },
        {
          path: 'performanceSignals.applicability.lateSessionFade.reason',
          label: 'Late Session Fade Applicability Reason'
        },
        {
          path: 'performanceSignals.applicability.executionStability.applicable',
          label: 'Execution Stability Applicable'
        },
        {
          path: 'performanceSignals.applicability.executionStability.reason',
          label: 'Execution Stability Applicability Reason'
        },
        {
          path: 'performanceSignals.applicability.repeatability.applicable',
          label: 'Repeatability Applicable'
        },
        {
          path: 'performanceSignals.applicability.repeatability.reason',
          label: 'Repeatability Applicability Reason'
        },
        {
          path: 'performanceSignals.applicability.cadenceDrift.applicable',
          label: 'Cadence Drift Applicable'
        },
        {
          path: 'performanceSignals.applicability.cadenceDrift.reason',
          label: 'Cadence Drift Applicability Reason'
        },
        {
          path: 'performanceSignals.applicability.pacingDrift.applicable',
          label: 'Pacing Drift Applicable'
        },
        {
          path: 'performanceSignals.applicability.pacingDrift.reason',
          label: 'Pacing Drift Applicability Reason'
        },
        { path: 'performanceSignals.decoupling.interpretable', label: 'Decoupling Interpretable' },
        { path: 'performanceSignals.decoupling.reason', label: 'Decoupling Reason' },
        { path: 'performanceSignals.decoupling.effective', label: 'Decoupling Effective' },
        { path: 'performanceSignals.decoupling.direction', label: 'Decoupling Direction' },
        { path: 'performanceSignals.durability.lateSessionFadePct', label: 'Late Session Fade %' },
        {
          path: 'performanceSignals.durability.firstVsLastIntervalDeltaPct',
          label: 'First vs Last Interval Delta %'
        },
        {
          path: 'performanceSignals.durability.recoveryTrendScore',
          label: 'Recovery Trend Score'
        },
        {
          path: 'performanceSignals.durability.executionStabilityScore',
          label: 'Execution Stability Score'
        },
        {
          path: 'performanceSignals.durability.repeatabilityScore',
          label: 'Repeatability Score'
        },
        { path: 'performanceSignals.zones.dominantPowerZone', label: 'Dominant Power Zone' },
        { path: 'performanceSignals.zones.dominantHrZone', label: 'Dominant HR Zone' },
        {
          path: 'performanceSignals.zones.timeAboveThresholdPct',
          label: 'Time Above Threshold %'
        },
        {
          path: 'performanceSignals.sportSpecific.cadenceDriftPct',
          label: 'Cadence Drift %'
        },
        {
          path: 'performanceSignals.sportSpecific.cadenceStabilityScore',
          label: 'Cadence Stability Score'
        },
        { path: 'performanceSignals.sportSpecific.torqueProfile', label: 'Torque Profile' },
        {
          path: 'performanceSignals.sportSpecific.pacingDriftPct',
          label: 'Pacing Drift %'
        }
      ]
    },
    {
      title: 'Confidence',
      items: [
        { path: 'confidence.overall', label: 'Overall Confidence' },
        { path: 'confidence.debugMeta.suppressedMetrics', label: 'Suppressed Metrics' }
      ]
    }
  ]

  const sections = groups
    .map((group) => {
      const lines = group.items
        .filter((item) => promptDecisions[item.path]?.include)
        .map((item) => {
          const rawValue = getFactValueByPath(analysisFacts, item.path)
          const formatted = formatPromptFactValue(rawValue)
          return formatted ? `- ${item.label}: ${formatted}` : null
        })
        .filter((line): line is string => Boolean(line))

      if (lines.length === 0) return null
      return `### ${group.title}\n${lines.join('\n')}`
    })
    .filter((section): section is string => Boolean(section))

  if (sections.length === 0) return ''

  return `
## Calculated Workout Facts v2

Use the following computed workout facts as the primary interpretation contract for this analysis.

${sections.join('\n\n')}

Rules for these facts:
- Treat these facts as authoritative guardrails and adherence summaries.
- Do not infer meaning from omitted facts.
- If a fact says a metric is suppressed, unusable, or not interpretable, do not analyze it.
- Prefer these facts over generic coaching heuristics when they conflict.
`
}

export function buildAnalysisGuardrailInstructions(
  workoutType: string,
  analysisFacts?: WorkoutAnalysisFactsV2
): string {
  const rules: string[] = [
    'Do not recommend purchasing new hardware or equipment from a single-workout analysis unless there is an explicit, repeated measurement limitation clearly stated in the facts.',
    'Do not use ATL, CTL, or TSB alone as proof of technique breakdown; they are context only.'
  ]

  const sessionSteadiness = analysisFacts?.guardrails.archetype.sessionSteadiness
  if (sessionSteadiness === 'intervalled' || sessionSteadiness === 'stochastic') {
    rules.push(
      'Do not criticize the athlete for lacking a constant pace or uniform effort when the session is classified as intervalled or stochastic.'
    )
    rules.push(
      'Treat explosive bursts, stop-and-go pacing, and recovery valleys as potentially intentional execution patterns rather than automatic pacing mistakes.'
    )
  }

  if (analysisFacts && !analysisFacts.performanceSignals.decoupling.interpretable) {
    rules.push(
      'Do not derive fatigue, technical breakdown, or pacing decline narratives from decoupling or drift when the facts mark those interpretations as suppressed.'
    )
  }

  if (workoutType.toLowerCase().includes('ski')) {
    rules.push(
      'For Nordic/cross-country skiing, avoid cycling-specific gear advice such as recommending a power meter unless the user explicitly asks about equipment.'
    )
  }

  if (analysisFacts?.confidence.overall === 'medium') {
    rules.push(
      'Keep recommendations conservative and avoid strong causal claims; prefer tentative wording such as "may", "might", or "suggests".'
    )
  }

  if (analysisFacts?.confidence.overall === 'low') {
    rules.push(
      'Do not make high-priority recommendations or strong diagnosis-style claims when overall confidence is low.'
    )
  }

  const inapplicableSignals = Object.entries(analysisFacts?.performanceSignals.applicability || {})
    .filter(([, value]: any) => value && value.applicable === false)
    .map(([key]) => key)

  if (inapplicableSignals.length > 0) {
    rules.push(
      `Do not base recommendations on inapplicable signals for this workout: ${inapplicableSignals.join(', ')}.`
    )
  }

  return rules.map((rule) => `- ${rule}`).join('\n')
}

export function buildWorkoutAnalysisPrompt(
  workoutData: any,

  timezone: string,

  persona: string = 'Supportive',

  sportSettings?: any,

  userProfile?: WorkoutAnalysisPromptUserProfile,

  aiContext?: string | null,

  plannedWorkout?: any,

  analysisFactsV2?: WorkoutAnalysisFactsV2,

  recentContext?: WorkoutAnalysisPromptRecentContext
): string {
  const formatMetric = (value: any, decimals = 1) => {
    return value !== undefined && value !== null ? Number(value).toFixed(decimals) : 'N/A'
  }

  const dateStr = formatUserDate(workoutData.date, timezone, 'yyyy-MM-dd')

  // Determine the workout type for context-aware analysis

  const workoutType = workoutData.type || 'Unknown'

  const isCardio = [
    'Ride',
    'Run',
    'Swim',
    'VirtualRide',
    'VirtualRun',
    'Ski',
    'NordicSki',
    'Row'
  ].some((t) => workoutType.toLowerCase().includes(t.toLowerCase()))

  const isStrength = ['Gym', 'WeightTraining', 'Strength', 'CrossFit'].some((t) =>
    workoutType.toLowerCase().includes(t.toLowerCase())
  )
  const isCadenceRelevant = ['run', 'ride', 'bike', 'cycle'].some((t) =>
    workoutType.toLowerCase().includes(t)
  )
  const metricPriorityContext = resolveMetricPriorityContext(
    sportSettings?.loadPreference,
    workoutData
  )
  const condensedHrSection = shouldCondenseHeartRateSection(metricPriorityContext)

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

    if (sportSettings.loadPreference) {
      zoneDefinitions += `- **Preferred Load Metric**: ${sportSettings.loadPreference}\n`
      zoneDefinitions += `- **Metric Priority Order**: ${metricPriorityContext.priority.join(' > ')}\n`
    }

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
Preferred Language: ${userProfile?.language || 'English'} (CRITICAL: ALL analysis, summaries, and text responses MUST be written in this language)



ATHLETE CONTEXT:

- Age: ${userProfile?.age || 'Unknown'}

- Sex: ${userProfile?.sex || 'Unknown'}

- Height: ${formatPromptHeight(userProfile?.height, userProfile?.heightUnits)}

${userProfile?.weight ? `- Weight: ${formatPromptWeight(userProfile.weight, userProfile.weightUnits)}` : ''}

${aiContext ? `\n## Global Athlete Context / About Me / Special Instructions\n${aiContext}\n` : ''}

${
  recentContext?.symptoms?.length
    ? `\n## Recent Symptoms & Recovery Context\n${recentContext.symptoms
        .map((event) => {
          const details = [
            `${formatUserDate(event.timestamp, timezone, 'yyyy-MM-dd')}`,
            `${String(event.category).toLowerCase()}`,
            `severity ${event.severity}/10`
          ]
          if (event.description) details.push(event.description)
          return `- ${details.join(' | ')}`
        })
        .join('\n')}
\nUse this symptom context when interpreting RPE, heart rate, and perceived difficulty. Do not frame illness-related elevation in RPE as poor execution unless the workout facts clearly support that conclusion.\n`
    : ''
}

${buildAnalysisFactsPromptBlock(analysisFactsV2)}



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

`

    // Extract detailed structured plan if available (from numeric target fields, not step title text)
    const formattedPlan = formatStructuredPlanForPrompt(plannedWorkout.structuredWorkout, {
      ftp: workoutData.ftp || sportSettings?.ftp || null
    })
    if (formattedPlan !== 'N/A') {
      prompt += `### Structured Plan (Target Intervals)\n`
      prompt += `${formattedPlan
        .split('\n')
        .map((line) => `- ${line}`)
        .join('\n')}\n`
      prompt += `\nUse this detailed plan structure to precisely evaluate if the athlete hit the specific interval targets (Power/Duration) listed above. Use these numeric targets as source of truth; step names can contain stale labels and must never override the structured values.\n`
    }

    prompt += `

When analyzing "Execution" and "Effort", specifically reference how well the athlete stuck to this plan. Did they go too hard? Too easy? Did they match the duration?

`
  }

  // Add zone definitions to context

  prompt += zoneDefinitions
  prompt += buildMetricPriorityPromptBlock(metricPriorityContext)

  if (workoutData.distance_m) {
    prompt += `- **Distance**: ${formatPromptDistance(workoutData.distance_m, userProfile?.distanceUnits)}\n`
  }

  if (workoutData.elevation_gain) {
    prompt += `- **Elevation Gain**: ${formatPromptElevation(workoutData.elevation_gain, userProfile?.distanceUnits)}\n`
  }

  if (
    metricPriorityContext.primaryMetric === 'PACE' &&
    metricPriorityContext.availability.hasPace
  ) {
    prompt += '\n## Pace & Speed (Primary Metric)\n'
    const avgPaceSecPerKm =
      workoutData.distance_m && workoutData.duration_s
        ? workoutData.duration_s / (workoutData.distance_m / 1000)
        : null
    if (avgPaceSecPerKm) {
      prompt += `- Average Pace: ${formatPromptPace(avgPaceSecPerKm, userProfile?.distanceUnits)}\n`
    }
    if (workoutData.avg_speed_ms) {
      prompt += `- Average Speed: ${formatMetric(workoutData.avg_speed_ms, 2)} m/s\n`
    }
    if (workoutData.pace_variability_seconds) {
      prompt += `- Pace Variability: ${formatMetric(workoutData.pace_variability_seconds, 1)}s SD\n`
    }
    if (workoutData.pace_stability) {
      prompt += `- Pace Stability (CoV): ${formatMetric(workoutData.pace_stability.overallCoV, 1)}%\n`
    }
    if (workoutData.lap_splits?.length) {
      prompt += `- Lap Splits Available: ${workoutData.lap_splits.length}\n`
    }
  }

  // Only include power metrics for cardio workouts where they're relevant
  if (isCardio) {
    prompt += '\n## Power Metrics\n'
    if (
      workoutData.avg_power ||
      workoutData.max_power ||
      workoutData.normalized_power ||
      workoutData.weighted_avg_power ||
      workoutData.has_power_stream ||
      (Array.isArray(workoutData.power_zone_times) &&
        workoutData.power_zone_times.some((value: number) => value > 0))
    ) {
      if (workoutData.avg_power) prompt += `- Average Power: ${workoutData.avg_power}W\n`
      if (workoutData.max_power) prompt += `- Max Power: ${workoutData.max_power}W\n`
      if (workoutData.normalized_power)
        prompt += `- Normalized Power: ${workoutData.normalized_power}W\n`
      if (workoutData.weighted_avg_power)
        prompt += `- Weighted Avg Power: ${workoutData.weighted_avg_power}W\n`
      if (workoutData.ftp) prompt += `- FTP at time: ${workoutData.ftp}W\n`
      if (workoutData.intensity)
        prompt += `- Intensity Factor: ${formatMetric(workoutData.intensity, 3)}\n`
      if (workoutData.has_power_stream) prompt += '- Power Stream Samples: Available\n'
      if (
        Array.isArray(workoutData.power_zone_times) &&
        workoutData.power_zone_times.some((value: number) => value > 0)
      ) {
        prompt += '- Power Zone Distribution: Available from stream metadata\n'
      }
      if (
        !workoutData.avg_power &&
        !workoutData.max_power &&
        !workoutData.normalized_power &&
        !workoutData.weighted_avg_power &&
        (workoutData.has_power_stream ||
          (Array.isArray(workoutData.power_zone_times) &&
            workoutData.power_zone_times.some((value: number) => value > 0)))
      ) {
        prompt +=
          '- Note: Stored workout summary omitted power rollups, but power telemetry is present and should be treated as available primary evidence.\n'
      }
    } else {
      prompt += `- Average Power: N/A\n`
      prompt += `- Normalized Power: N/A\n`
      prompt += `- Note: Power data appears to be missing from the global summary.\n`
    }
  }

  // Heart rate is relevant for all workout types
  if (workoutData.avg_hr || workoutData.max_hr || workoutData.avg_cadence || isCardio) {
    prompt += condensedHrSection ? '\n## Heart Rate (Secondary Corroboration)' : '\n## Heart Rate'
    // Cadence label is only for cadence-relevant workouts
    if (isCadenceRelevant) {
      prompt += ' & Cadence'
    }
    prompt += '\n'

    if (workoutData.avg_hr) prompt += `- Average HR: ${workoutData.avg_hr} bpm\n`
    else if (isCardio) prompt += `- Average HR: N/A\n`

    if (workoutData.max_hr) prompt += `- Max HR: ${workoutData.max_hr} bpm\n`

    // Cadence is only relevant for cycling/running-like workouts
    if (isCadenceRelevant && !condensedHrSection) {
      if (workoutData.avg_cadence)
        prompt += `- Average Cadence: ${workoutData.avg_cadence} ${workoutType.toLowerCase().includes('run') ? 'spm' : 'rpm'}\n`
      else prompt += `- Average Cadence: N/A\n`

      if (workoutData.max_cadence)
        prompt += `- Max Cadence: ${workoutData.max_cadence} ${workoutType.toLowerCase().includes('run') ? 'spm' : 'rpm'}\n`
    }
  }

  // Performance indicators are primarily relevant for cardio workouts
  if (
    isCardio &&
    (workoutData.variability_index ||
      workoutData.efficiency_factor ||
      analysisFactsV2?.performanceSignals.decoupling.interpretable ||
      analysisFactsV2?.performanceSignals.decoupling.reason ||
      workoutData.power_hr_ratio ||
      (workoutData.lr_balance !== undefined && workoutData.lr_balance !== null))
  ) {
    prompt += '\n## Performance Indicators\n'
    if (workoutData.variability_index) {
      prompt += `- Variability Index (VI): ${formatMetric(workoutData.variability_index, 3)}\n`
    }
    if (workoutData.efficiency_factor) {
      prompt += `- Efficiency Factor (EF): ${formatMetric(workoutData.efficiency_factor, 2)} (Watts/HR - higher is better)\n`
    }
    if (analysisFactsV2?.performanceSignals.decoupling.interpretable) {
      if (analysisFactsV2.performanceSignals.decoupling.effective !== null) {
        prompt += `- Decoupling: ${formatMetric(analysisFactsV2.performanceSignals.decoupling.effective, 1)}%\n`
      }
    } else if (analysisFactsV2?.performanceSignals.decoupling.reason) {
      prompt += `- Decoupling Guardrail: ${analysisFactsV2.performanceSignals.decoupling.reason}\n`
    }
    if (workoutData.power_hr_ratio) {
      prompt += `- Power/HR Ratio: ${formatMetric(workoutData.power_hr_ratio, 2)}\n`
    }
    if (workoutData.lr_balance !== undefined && workoutData.lr_balance !== null) {
      const rightPct = workoutData.lr_balance
      const leftPct = 100 - rightPct
      const dominantSide = leftPct > rightPct ? 'Left' : rightPct > leftPct ? 'Right' : 'Neither'
      prompt += `- L/R Balance (Left%/Right%): ${formatMetric(leftPct, 1)}/${formatMetric(rightPct, 1)}\n`
      prompt += `  - Interpretation: first value is LEFT leg share, second is RIGHT leg share\n`
      prompt += `  - Dominant side in this workout: ${dominantSide}\n`
    }

    if (workoutData.fatigue_sensitivity) {
      prompt += `- Fatigue Sensitivity (Endurance Fade): ${formatMetric(workoutData.fatigue_sensitivity.decay, 1)}%\n`
    }

    if (workoutData.power_stability) {
      prompt += `- Power Stability (CoV): ${formatMetric(workoutData.power_stability.overallCoV, 1)}%\n`
    } else if (workoutData.pace_stability) {
      prompt += `- Pace Stability (CoV): ${formatMetric(workoutData.pace_stability.overallCoV, 1)}%\n`
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
      prompt += `- Avg Temperature: ${formatPromptTemperature(workoutData.avg_temp, userProfile?.temperatureUnits)}\n`
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
          prompt += `${formatPromptWeight(s.weight, userProfile?.weightUnits)} x ${s.reps}`
          metricAdded = true
        } else if (s.reps) {
          prompt += `${s.reps} reps`
          metricAdded = true
        }

        if (s.distance) {
          if (metricAdded) prompt += `, `
          // Strength-exercise set distances (sled push, farmer's carry, etc.) are short
          // distances, so use the same meters<->feet conversion as elevation rather than
          // km/mi (which would round to an unreadable "0.02 mi").
          prompt += formatPromptElevation(s.distance, userProfile?.distanceUnits)
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
      prompt += `${formatPromptDistance(split.distance_m, userProfile?.distanceUnits)} in ${Math.floor(split.time_s / 60)}:${(split.time_s % 60).toString().padStart(2, '0')} `

      const paceSecondsPerKm =
        split.distance_m > 0 ? split.time_s / (split.distance_m / 1000) : null
      prompt += `(${formatPromptPace(paceSecondsPerKm, userProfile?.distanceUnits)} pace)`
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
      prompt += `- First half avg: ${formatPromptPace(firstHalfAvgPace, userProfile?.distanceUnits)}\n`
      prompt += `- Second half avg: ${formatPromptPace(secondHalfAvgPace, userProfile?.distanceUnits)}\n`
      prompt += `- Difference: ${Math.abs(splitDiff).toFixed(1)}s ${splitDiff > 0 ? 'slower' : 'faster'} in second half\n`
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

  if (workoutData.notes) {
    prompt += `\n## Athlete Notes\n${workoutData.notes}\n`
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
- Scores should be realistic and track progress over time - don't inflate scores
- Follow these guardrails strictly:
${buildAnalysisGuardrailInstructions(workoutType, analysisFactsV2)}
${buildAnalysisRequestMetricRules(metricPriorityContext)
  .map((rule) => `- ${rule}`)
  .join('\n')}`

  return prompt
}
