import { calculateFatigueSensitivity, calculateStabilityMetrics } from './performance-metrics'
import { calculateRollingNormalizedPower } from './power-metrics'
import { toIntensityFactorFromTarget } from './structured-workout-persistence'
import {
  detectIntervals,
  normalizePlannedStepType,
  resolveHrWorkThreshold,
  resolveProviderIntervalTypes,
  PLANNED_WORK_INTENSITY_FACTOR,
  type Interval
} from './interval-detection'
import { parseLegacyLoadPreference, type MetricTarget } from './workout-target-policy'
import { formatPromptPace } from './ai-prompt-format'

type FactConfidence = 'low' | 'medium' | 'high'
type FactSeverity = 'low' | 'moderate' | 'high' | 'unknown'
type AnalysisMode = 'power' | 'pace' | 'rpe' | 'mixed'
type PowerSourceType = 'measured' | 'estimated' | 'unknown'
type DecouplingDirection = 'positive_drift' | 'stable' | 'efficiency_gain'
type LrSourceSemantics = 'true_left_right' | 'human_vs_motor' | 'unknown'
type LrInterpretationMode = 'normal' | 'corrected' | 'disabled'
type ErgSource = 'explicit' | 'inferred' | 'unknown'
type PowerControlMode = 'erg' | 'resistance' | 'free_ride' | 'unknown'
type HrArtifactSeverity = 'none' | 'low' | 'moderate' | 'high'
type PaceConfidence = FactConfidence | 'unknown'
type ExecutionClassification =
  | 'as_prescribed'
  | 'shortened'
  | 'intensity_reduced'
  | 'intensity_inflated'
  | 'unstructured_substitution'
  | 'not_assessable'
type PrimaryArchetype =
  | 'endurance'
  | 'tempo'
  | 'threshold'
  | 'vo2'
  | 'anaerobic'
  | 'sprint'
  | 'race'
  | 'recovery'
  | 'mixed'
  | 'strength'
  | 'unknown'
type ExecutionEnvironment =
  'indoor_erg' | 'indoor_resistance' | 'outdoor_free' | 'treadmill' | 'mixed' | 'unknown'
type PrimaryMetric = 'power' | 'pace' | 'hr' | 'subjective' | 'mixed'
type SessionSteadiness = 'steady' | 'rolling' | 'stochastic' | 'intervalled' | 'unknown'
type PromptDecision = {
  include: boolean
  reason: string
}

type MotionPattern = {
  stopGoLikely: boolean
  zeroSpeedRatio: number | null
  speedCoV: number | null
  speedSurgeRatio: number | null
  rationale: string[]
}

type SignalApplicability = {
  applicable: boolean
  reason: string | null
}

export interface WorkoutAnalysisFacts {
  subjective: {
    rpe: number | null
    sessionRpeLoad: number | null
    subjectiveObjectiveGap: FactSeverity
    musculoskeletalToll: FactSeverity
    impactProfile: 'low' | 'medium' | 'high'
  }
  telemetry: {
    analysisMode: AnalysisMode
    hrUsable: boolean
    hrZeroRatio: number | null
    hrMissingRatio: number | null
    hrArtifactFlag: boolean
    powerSourceType: PowerSourceType
    powerAbsoluteUsable: boolean
    powerRelativeUsable: boolean
    lrBalanceUsable: boolean
  }
  physiology: {
    normalHrLagExpected: boolean
    normalHrLagDetected: boolean
    steadyStateSegmentsAvailable: boolean
    warmupExcludedMinutes: number
    decouplingValid: boolean
    decouplingEffective: number | null
    decouplingDirection: DecouplingDirection | 'unknown'
    decouplingConfidence: FactConfidence
  }
  lrBalance: {
    sourceSemantics: LrSourceSemantics
    inversionSuspected: boolean
    correctedLeftPct: number | null
    correctedRightPct: number | null
    interpretationMode: LrInterpretationMode
    correctionReason: string | null
  }
  erg: {
    detected: boolean
    confidence: FactConfidence
    source: ErgSource
    powerControlMode: PowerControlMode
    reasons: string[]
  }
  debugMeta: {
    factVersion: string
    computedFrom: string[]
    unavailableInputs: string[]
    disabledInterpretations: string[]
    promptDecisions: Record<string, PromptDecision>
  }
}

export interface WorkoutAnalysisFactsV2 {
  guardrails: {
    analysisMode: AnalysisMode
    archetype: {
      primaryArchetype: PrimaryArchetype
      executionEnvironment: ExecutionEnvironment
      primaryMetric: PrimaryMetric
      sessionSteadiness: SessionSteadiness
      confidence: FactConfidence
      rationale: string[]
    }
    telemetry: {
      hrUsable: boolean
      hrArtifactSeverity: HrArtifactSeverity
      hrZeroRatio: number | null
      hrMissingRatio: number | null
      powerSourceType: PowerSourceType
      powerSourceConfidence: FactConfidence
      powerAbsoluteUsable: boolean
      powerRelativeUsable: boolean
      paceUsable: boolean
      gpsConfidence: PaceConfidence
      lrBalanceUsable: boolean
      lrInterpretationMode: LrInterpretationMode
    }
    erg: {
      detected: boolean
      confidence: FactConfidence
      source: ErgSource
      powerControlMode: PowerControlMode
      reasons: string[]
    }
    lrBalance: {
      sourceSemantics: LrSourceSemantics
      inversionSuspected: boolean
      correctedLeftPct: number | null
      correctedRightPct: number | null
      interpretationMode: LrInterpretationMode
      correctionReason: string | null
    }
    suppressions: string[]
  }
  adherence: {
    planLinked: boolean
    adherenceAssessable: boolean
    adherenceReason: string | null
    completionPct: number | null
    durationVsPlanPct: number | null
    workIntervalHitRate: number | null
    recoveryHitRate: number | null
    cadenceHitRate: number | null
    cadenceAssessable: boolean
    targetOvershootPct: number | null
    targetUndershootPct: number | null
    structureMatched: boolean
    executionClassification: ExecutionClassification
  }
  performanceSignals: {
    applicability: {
      lateSessionFade: SignalApplicability
      executionStability: SignalApplicability
      repeatability: SignalApplicability
      cadenceDrift: SignalApplicability
      pacingDrift: SignalApplicability
    }
    decoupling: {
      interpretable: boolean
      reason: string | null
      effective: number | null
      direction: DecouplingDirection | 'unknown'
      confidence: FactConfidence
    }
    durability: {
      lateSessionFadePct: number | null
      firstVsLastIntervalDeltaPct: number | null
      recoveryTrendScore: number | null
      executionStabilityScore: number | null
      repeatabilityScore: number | null
    }
    zones: {
      dominantPowerZone: string | null
      dominantHrZone: string | null
      timeAboveThresholdPct: number | null
    }
    sportSpecific: {
      cadenceDriftPct: number | null
      cadenceStabilityScore: number | null
      torqueProfile: 'low_cadence_force' | 'high_cadence_spin' | 'neutral' | 'unknown'
      pacingDriftPct: number | null
    }
  }
  confidence: {
    overall: FactConfidence
    guardrails: FactConfidence
    adherence: FactConfidence
    performanceSignals: FactConfidence
    debugMeta: {
      factVersion: string
      computedFrom: string[]
      unavailableInputs: string[]
      suppressedMetrics: string[]
      promptDecisions: Record<string, PromptDecision>
    }
  }
}

interface BuildWorkoutAnalysisFactsOptions {
  workout: any
  sportSettings?: any
  plannedWorkout?: any
  userProfile?: {
    weight?: number | null
    weightUnits?: string | null
    language?: string | null
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function round(value: number | null | undefined, decimals = 1): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function asNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (typeof entry === 'number') return entry
      if (typeof entry === 'string') {
        const parsed = Number(entry)
        return Number.isFinite(parsed) ? parsed : null
      }
      if (entry && typeof entry === 'object') {
        const candidate = (entry as any).value ?? (entry as any).y ?? (entry as any).v
        const parsed = Number(candidate)
        return Number.isFinite(parsed) ? parsed : null
      }
      return null
    })
    .filter((entry): entry is number => entry !== null)
}

function getWorkoutFamily(workoutType: string | null | undefined) {
  const lower = String(workoutType || '').toLowerCase()
  if (
    ['ride', 'virtualride', 'ebike', 'bike', 'cycling', 'cycle', 'gravel', 'mtb'].some((token) =>
      lower.includes(token)
    )
  ) {
    return 'ride'
  }
  if (['run', 'trailrun', 'virtualrun', 'treadmill'].some((token) => lower.includes(token))) {
    return 'run'
  }
  if (['gym', 'weighttraining', 'strength', 'crossfit'].some((token) => lower.includes(token))) {
    return 'strength'
  }
  if (['swim', 'ski', 'row'].some((token) => lower.includes(token))) {
    return 'nonimpact_cardio'
  }
  return 'other'
}

/* -------------------------------------------------------------------------- */
/* Cadence convention (CW-387)                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The canonical cadence convention for every AI prompt in this codebase:
 *
 * - running-family workouts are expressed in **steps per minute (`spm`)**;
 * - everything else (cycling and friends) is expressed in **revolutions per
 *   minute (`rpm`)** and is never scaled.
 *
 * Only the helpers below implement that convention, and `formatCadenceWithUnit`
 * is the only thing that ever prints a unit — so a value and its label cannot
 * drift apart the way they did before CW-387 (session line said `spm`, the
 * Interval Breakdown said `rpm` for the same doubled number, and the facts
 * interval rows said `rpm` for the *undoubled* number).
 */
export function isRunningCadenceFamily(workoutType: string | null | undefined): boolean {
  return getWorkoutFamily(workoutType) === 'run'
}

/**
 * Convert a stored cadence value into the canonical convention.
 *
 * Running exports arrive in two different shapes depending on the sync writer:
 *
 * - `server/utils/services/garminService.ts` reads Garmin's
 *   `averageRunCadenceInStepsPerMinute`, which is already both feet (~166);
 * - `strava.ts`, `intervals.ts`, `wahoo.ts` and `fit.ts` store the provider's
 *   `average_cadence` verbatim, and for runs those providers report *one leg*
 *   (~83).
 *
 * There is no provenance flag on the workout row that distinguishes the two, so
 * the magnitude heuristic below is what disambiguates them: a one-legged run
 * cadence lives in ~60-100, an already-doubled one in ~140-200. See the
 * threshold note on {@link CANONICAL_RUN_CADENCE_THRESHOLD}.
 *
 * Applying this twice is not harmful for realistic running cadences (the second
 * pass sees a value >= the threshold and leaves it alone), but callers should
 * still normalise exactly once, at the point where the workout row is turned
 * into prompt data.
 */
export function toCanonicalCadence(
  cadence: number | null | undefined,
  isRunningFamily: boolean
): number | null | undefined {
  if (!cadence) return cadence
  return isRunningFamily && cadence < CANONICAL_RUN_CADENCE_THRESHOLD ? cadence * 2 : cadence
}

/**
 * Below this, a running cadence is read as one-legged and doubled.
 *
 * Safety review (CW-387): the value has to sit above the fastest realistic
 * one-legged cadence (~110, i.e. a 220 spm sprint) and below the slowest
 * already-doubled running cadence a provider will emit. Steady running is
 * 150-190 spm and even a very slow shuffle is ~140 spm, so 120 clears both
 * sides for *running*. The residual (accepted) risk is a Garmin-sourced "Run"
 * that is mostly walking: walking is ~100-120 spm, so such a session can be
 * reported below the threshold in real spm and would then be doubled. That is
 * rare, only affects sessions whose primary activity is not running, and the
 * alternative -- trusting per-source provenance -- is not reliable either,
 * because Intervals.icu re-syncs Garmin activities and does not document which
 * convention it forwards. Revisit if a provenance flag ever lands on the
 * workout row.
 */
const CANONICAL_RUN_CADENCE_THRESHOLD = 120

/** `spm` for running-family workouts, `rpm` for everything else. */
export function resolveCadenceUnit(workoutType: string | null | undefined): 'spm' | 'rpm' {
  return isRunningCadenceFamily(workoutType) ? 'spm' : 'rpm'
}

/**
 * Render an already-canonical cadence together with the unit its workout family
 * uses. Always pair a value with its label through this helper rather than
 * concatenating a literal `rpm`/`spm`.
 */
export function formatCadenceWithUnit(
  canonicalCadence: number | null | undefined,
  workoutType: string | null | undefined,
  separator = ' '
): string {
  if (canonicalCadence === null || canonicalCadence === undefined) return 'N/A'
  if (!Number.isFinite(canonicalCadence)) return 'N/A'
  return `${Math.round(canonicalCadence)}${separator}${resolveCadenceUnit(workoutType)}`
}

function inferImpactProfile(
  family: ReturnType<typeof getWorkoutFamily>
): 'low' | 'medium' | 'high' {
  if (family === 'run') return 'high'
  if (family === 'strength') return 'medium'
  if (family === 'ride' || family === 'nonimpact_cardio') return 'low'
  return 'medium'
}

/**
 * Strava sets `device_watts: false` on rides whose watts it *estimated* from speed,
 * gradient and rider weight rather than read off a power meter. Those numbers can be
 * 10-30% off, so they must not earn absolute-power benchmarking rights.
 *
 * Returns `true` (real power meter), `false` (Strava-estimated) or `null` when the flag
 * is absent — `null` deliberately preserves today's behaviour for Intervals.icu rows,
 * FIT uploads and older Strava rows that predate the field.
 *
 * The lap-level fallback mirrors what `scripts/debug-workout-load.ts` already reads:
 * some activity payloads carry the flag only on the laps.
 */
function inferStravaDeviceWatts(workout: any): boolean | null {
  const raw = workout?.rawJson as any
  if (!raw || typeof raw !== 'object') return null
  if (typeof raw.device_watts === 'boolean') return raw.device_watts
  const lapDeviceWatts = Array.isArray(raw.laps) ? raw.laps[0]?.device_watts : undefined
  if (typeof lapDeviceWatts === 'boolean') return lapDeviceWatts
  return null
}

function inferPowerSourceType(
  workout: any,
  family: ReturnType<typeof getWorkoutFamily>
): PowerSourceType {
  const hasPower =
    Boolean(workout?.averageWatts) ||
    Boolean(workout?.normalizedPower) ||
    asNumberArray(workout?.streams?.watts).length > 0 ||
    asNumberArray(workout?.streams?.powerZoneTimes).some((value) => value > 0)
  if (!hasPower) return 'unknown'
  if (
    family === 'run' ||
    String(workout?.type || '')
      .toLowerCase()
      .includes('ski')
  )
    return 'estimated'
  if (family === 'ride') {
    // Only an explicit `false` downgrades the ride; absent/undefined stays 'measured'.
    return inferStravaDeviceWatts(workout) === false ? 'estimated' : 'measured'
  }
  return 'unknown'
}

/**
 * Physiological plausibility bounds and thresholds for heart-rate telemetry (CW-395).
 *
 * These are deliberately wide. A false "HR unusable" removes decoupling, HR zone times,
 * EF and durability from the analysis for an athlete whose data was fine, which is worse
 * than the over-trusting behaviour they replace — so every bound sits outside anything a
 * human cardiovascular system produces, and only sustained corruption degrades usability.
 */
/** Below any adult resting HR; a sub-30 bpm sample mid-activity is a sensor artifact. */
const HR_MIN_PLAUSIBLE_BPM = 30
/** Above the ~220-age ceiling for any adult; dry-electrode strap static reads 220-250. */
const HR_MAX_PLAUSIBLE_BPM = 230
/** No cardiovascular system ramps this fast; sustained >10 bpm/s is electrical noise. */
const HR_MAX_DELTA_BPM_PER_SEC = 10
/** Corruption at 2% of samples is worth flagging but not worth discarding the stream. */
const HR_CORRUPTION_FLAG_RATIO = 0.02
/** At 5% the artifacts are systemic, not isolated, and derived HR facts stop being safe. */
const HR_CORRUPTION_UNUSABLE_RATIO = 0.05

/**
 * A live reading inside CW-395's plausible band. Dropouts (zero / non-finite)
 * and out-of-band artifacts are neither: they are counted by their own ratios in
 * `getHrStats`, so nothing here judges them twice.
 */
function isPlausibleHrSample(value: number | undefined): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= HR_MIN_PLAUSIBLE_BPM &&
    value <= HR_MAX_PLAUSIBLE_BPM
  )
}

export function getHrStats(workout: any) {
  const hrStream = asNumberArray(workout?.streams?.heartrate)
  if (hrStream.length === 0) {
    return {
      zeroRatio: workout?.averageHr ? 0 : null,
      missingRatio: workout?.averageHr ? 0 : null,
      implausibleRatio: workout?.averageHr ? 0 : null,
      jumpRatio: workout?.averageHr ? 0 : null,
      artifactFlag: false,
      usable: Boolean(workout?.averageHr)
    }
  }

  const invalidCount = hrStream.filter((value) => !Number.isFinite(value) || value <= 0).length
  const zeroCount = hrStream.filter((value) => value === 0).length
  const validCount = hrStream.filter((value) => value > 0).length
  const zeroRatio = zeroCount / hrStream.length
  const missingRatio = invalidCount / hrStream.length

  // Dropouts (zero / non-finite) are already counted above; only live readings are judged
  // for plausibility so a gappy stream is not penalised twice for the same samples.
  const implausibleCount = hrStream.filter(
    (value) =>
      Number.isFinite(value) &&
      value > 0 &&
      (value < HR_MIN_PLAUSIBLE_BPM || value > HR_MAX_PLAUSIBLE_BPM)
  ).length
  const implausibleRatio = implausibleCount / hrStream.length

  // Rate of change is measured per *second*, not per sample: streams arrive at 1 Hz, 5 s
  // or 30 s cadence, and treating a legitimate 30 bpm rise across a 5 s gap as a 30 bpm/s
  // jump is exactly how a healthy interval session would get its HR wrongly suppressed.
  // Without a usable time stream we assume 1 Hz.
  //
  // A pair is only judged when both samples are live and already within the plausible
  // band. Dropouts are counted by zeroRatio and out-of-range spikes by implausibleRatio;
  // counting them here too would charge one defect to two ratios and push streams past
  // the degrade threshold on the strength of a single artifact. The two checks therefore
  // stay orthogonal: this one catches impossible movement between believable values.
  const isLivePlausible = isPlausibleHrSample
  const timeStream = asNumberArray(workout?.streams?.time)
  const hasAlignedTime = timeStream.length === hrStream.length
  let jumpCount = 0
  for (let index = 1; index < hrStream.length; index += 1) {
    const previous = hrStream[index - 1]
    const current = hrStream[index]
    if (!isLivePlausible(previous) || !isLivePlausible(current)) continue
    const currentTime = timeStream[index]
    const previousTime = timeStream[index - 1]
    const rawDelta =
      hasAlignedTime && typeof currentTime === 'number' && typeof previousTime === 'number'
        ? currentTime - previousTime
        : 1
    const seconds = Number.isFinite(rawDelta) && rawDelta > 0 ? rawDelta : 1
    if (Math.abs(current - previous) / seconds > HR_MAX_DELTA_BPM_PER_SEC) jumpCount += 1
  }
  const jumpRatio = jumpCount / hrStream.length

  const dropoutFlag = zeroRatio >= 0.05 || missingRatio >= 0.15
  const corruptionFlag =
    implausibleRatio >= HR_CORRUPTION_FLAG_RATIO || jumpRatio >= HR_CORRUPTION_FLAG_RATIO
  const corruptionDisqualifying =
    implausibleRatio >= HR_CORRUPTION_UNUSABLE_RATIO || jumpRatio >= HR_CORRUPTION_UNUSABLE_RATIO
  const artifactFlag = dropoutFlag || corruptionFlag
  // Note the asymmetry: dropouts disqualify at the flag threshold (unchanged behaviour),
  // but corruption only disqualifies at the higher threshold, so a handful of isolated
  // spikes surfaces as an artifact without deleting an otherwise good stream.
  const usable =
    validCount >= Math.max(60, hrStream.length * 0.75) && !dropoutFlag && !corruptionDisqualifying

  return {
    zeroRatio: round(zeroRatio, 3),
    missingRatio: round(missingRatio, 3),
    implausibleRatio: round(implausibleRatio, 3),
    jumpRatio: round(jumpRatio, 3),
    artifactFlag,
    usable
  }
}

/**
 * The highest heart-rate sample in `workout` that CW-395's plausibility rules
 * accept, or `null` when the stream carries none.
 *
 * `getHrStats` asks "is this stream trustworthy as a whole", and answers in
 * ratios. That is the wrong question for a peak, which is decided by a single
 * sample: one 240 bpm artifact in an hour of clean telemetry moves no ratio past
 * its threshold, so the stream stays `usable` while its raw `Math.max` is strap
 * static. The two are companions on the same two rules and the same constants —
 * no second plausibility standard is introduced here:
 *
 * 1. The sample sits inside the plausible band (`HR_MIN/MAX_PLAUSIBLE_BPM`).
 * 2. It is not an isolated spike. A sample the stream both jumps *to* and jumps
 *    away *from* faster than `HR_MAX_DELTA_BPM_PER_SEC` is electrical noise, not
 *    a heart rate. Both sides are required on purpose: the start of a hard
 *    interval arrives just as abruptly, but it is then *held*, so it departs
 *    within the rate limit and is kept. A sample that arrives implausibly at the
 *    very end of the stream has nothing to corroborate it and is dropped.
 *
 * Dropouts are skipped rather than compared against — a zero is a missing
 * sample, not a heart rate — and deltas are measured against real elapsed time
 * rather than sample index, both matching `getHrStats`.
 *
 * Read this for a value that will be shown to, or acted on by, an athlete (the
 * first max-HR nomination in `thresholdDetectionService`, CW-446). It is not a
 * substitute for `getHrStats`: a stream flagged unusable there should not be
 * nominating anything, whatever its cleanest sample says.
 */
export function getPlausibleHrPeak(workout: any): number | null {
  const hrStream = asNumberArray(workout?.streams?.heartrate)
  if (hrStream.length === 0) return null

  const timeStream = asNumberArray(workout?.streams?.time)
  const hasAlignedTime = timeStream.length === hrStream.length

  const live: { value: number; timeSec: number }[] = []
  for (let index = 0; index < hrStream.length; index += 1) {
    const value = hrStream[index]
    if (!isPlausibleHrSample(value)) continue
    const stamp = hasAlignedTime ? timeStream[index] : undefined
    live.push({
      value,
      timeSec: typeof stamp === 'number' && Number.isFinite(stamp) ? stamp : index
    })
  }
  if (live.length === 0) return null

  const exceedsRate = (
    from: { value: number; timeSec: number },
    to: { value: number; timeSec: number }
  ) => {
    const rawDelta = to.timeSec - from.timeSec
    const seconds = Number.isFinite(rawDelta) && rawDelta > 0 ? rawDelta : 1
    return Math.abs(to.value - from.value) / seconds > HR_MAX_DELTA_BPM_PER_SEC
  }

  let peak: number | null = null
  for (let index = 0; index < live.length; index += 1) {
    const sample = live[index]!
    const previous = live[index - 1]
    const next = live[index + 1]
    // The first live sample is the baseline: it has not jumped from anything.
    const arrivedImplausibly = previous ? exceedsRate(previous, sample) : false
    const departedImplausibly = next ? exceedsRate(sample, next) : true
    if (arrivedImplausibly && departedImplausibly) continue
    if (peak === null || sample.value > peak) peak = sample.value
  }

  return peak
}

function getAnalysisMode(params: {
  family: ReturnType<typeof getWorkoutFamily>
  powerSourceType: PowerSourceType
  hrUsable: boolean
  hasPace: boolean
  hasRpe: boolean
}) {
  if (params.family === 'run' && params.hasPace) return 'pace'
  if (params.powerSourceType === 'measured') return params.hrUsable ? 'mixed' : 'power'
  if (params.powerSourceType === 'estimated') return params.hasPace ? 'pace' : 'mixed'
  if (params.hrUsable) return 'mixed'
  if (params.hasRpe) return 'rpe'
  return 'mixed'
}

function deriveSubjectiveObjectiveGap(
  sessionRpeLoad: number | null,
  objectiveLoad: number | null
): FactSeverity {
  if (sessionRpeLoad === null || objectiveLoad === null || objectiveLoad <= 0) return 'unknown'
  const ratio = sessionRpeLoad / objectiveLoad
  if (ratio >= 1.6 || ratio <= 0.6) return 'high'
  if (ratio >= 1.3 || ratio <= 0.8) return 'moderate'
  return 'low'
}

function deriveMusculoskeletalToll(params: {
  impactProfile: 'low' | 'medium' | 'high'
  sessionRpeLoad: number | null
  objectiveLoad: number | null
}) {
  const { impactProfile, sessionRpeLoad, objectiveLoad } = params
  if (sessionRpeLoad === null) return 'unknown'
  const ratio = objectiveLoad && objectiveLoad > 0 ? sessionRpeLoad / objectiveLoad : null
  if (impactProfile === 'high') {
    if (sessionRpeLoad >= 300 || (ratio !== null && ratio >= 1.25)) return 'high'
    if (sessionRpeLoad >= 180 || (ratio !== null && ratio >= 0.95)) return 'moderate'
    return 'low'
  }
  if (impactProfile === 'medium') {
    if (sessionRpeLoad >= 360 || (ratio !== null && ratio >= 1.4)) return 'high'
    if (sessionRpeLoad >= 220 || (ratio !== null && ratio >= 1.05)) return 'moderate'
    return 'low'
  }
  if (sessionRpeLoad >= 420 || (ratio !== null && ratio >= 1.5)) return 'high'
  if (sessionRpeLoad >= 260 || (ratio !== null && ratio >= 1.15)) return 'moderate'
  return 'low'
}

function deriveDecoupling(
  workout: any,
  hrUsable: boolean,
  warmupExcludedMinutes: number,
  family?: ReturnType<typeof getWorkoutFamily>,
  motionPattern?: MotionPattern
) {
  const durationMinutes = Math.round((workout?.durationSec || 0) / 60)
  const fallback = round(workout?.decoupling, 1)
  if (family && family !== 'ride' && family !== 'run') {
    return {
      valid: false,
      effective: null,
      direction: 'unknown' as const,
      confidence: 'low' as FactConfidence,
      steadyStateSegmentsAvailable: false
    }
  }
  if (motionPattern?.stopGoLikely) {
    return {
      valid: false,
      effective: fallback,
      direction:
        fallback === null
          ? ('unknown' as const)
          : fallback < 0
            ? ('efficiency_gain' as const)
            : fallback > 3
              ? ('positive_drift' as const)
              : ('stable' as const),
      confidence: 'low' as FactConfidence,
      steadyStateSegmentsAvailable: false
    }
  }
  if (!hrUsable || durationMinutes < 40) {
    return {
      valid: false,
      effective: fallback,
      direction: 'unknown' as const,
      confidence: 'low' as FactConfidence,
      steadyStateSegmentsAvailable: false
    }
  }

  // Prefer the canonical stored metric when it exists so AI commentary stays
  // consistent with the workout record and UI surfaces that already expose it.
  if (fallback !== null) {
    return {
      valid: true,
      effective: fallback,
      direction:
        fallback < -3
          ? ('efficiency_gain' as const)
          : fallback > 3
            ? ('positive_drift' as const)
            : ('stable' as const),
      confidence: 'high' as FactConfidence,
      steadyStateSegmentsAvailable: durationMinutes >= 50
    }
  }

  const time = asNumberArray(workout?.streams?.time)
  const power = asNumberArray(workout?.streams?.watts)
  const paceProxy = asNumberArray(workout?.streams?.velocity)
  const hr = asNumberArray(workout?.streams?.heartrate)
  const usePower = power.length > 0
  const workload = usePower ? power : paceProxy

  if (time.length > 0 && workload.length === time.length && hr.length === time.length) {
    const startIndex = time.findIndex((value) => value >= warmupExcludedMinutes * 60)
    const effectiveStartIndex = startIndex >= 0 ? startIndex : 0
    const samples = time
      .map((_, index) => ({ hr: hr[index]!, work: workload[index]! }))
      .slice(effectiveStartIndex)
      .filter((sample) => sample.hr > 0 && sample.work > 0)

    if (samples.length >= 120) {
      const midpoint = Math.floor(samples.length / 2)
      const firstHalf = samples.slice(0, midpoint) as Array<{ hr: number; work: number }>
      const secondHalf = samples.slice(midpoint) as Array<{ hr: number; work: number }>
      const avgRatio = (segment: Array<{ hr: number; work: number }>) =>
        segment.reduce((sum, sample) => sum + sample.work / sample.hr, 0) / segment.length
      const firstRatio = avgRatio(firstHalf)
      const secondRatio = avgRatio(secondHalf)
      const effective = round(((firstRatio - secondRatio) / firstRatio) * 100, 1)
      const direction =
        effective === null
          ? ('unknown' as const)
          : effective < -3
            ? ('efficiency_gain' as const)
            : effective > 3
              ? ('positive_drift' as const)
              : ('stable' as const)
      return {
        valid: effective !== null,
        effective,
        direction,
        confidence: (durationMinutes >= 75 ? 'high' : 'medium') as FactConfidence,
        steadyStateSegmentsAvailable: true
      }
    }
  }

  if (fallback === null) {
    return {
      valid: false,
      effective: null,
      direction: 'unknown' as const,
      confidence: 'low' as FactConfidence,
      steadyStateSegmentsAvailable: false
    }
  }

  return {
    valid: true,
    effective: fallback,
    direction:
      fallback < -3
        ? ('efficiency_gain' as const)
        : fallback > 3
          ? ('positive_drift' as const)
          : ('stable' as const),
    confidence: 'low' as FactConfidence,
    steadyStateSegmentsAvailable: durationMinutes >= 50
  }
}

function detectNormalHrLag(
  workout: any,
  family: ReturnType<typeof getWorkoutFamily>,
  hrUsable: boolean
) {
  if (!hrUsable || (family !== 'ride' && family !== 'run')) return false
  const time = asNumberArray(workout?.streams?.time)
  const watts = asNumberArray(workout?.streams?.watts)
  const hr = asNumberArray(workout?.streams?.heartrate)

  if (time.length === 0 || watts.length !== time.length || hr.length !== time.length) return false

  for (let index = 10; index < time.length - 20; index++) {
    const prevPower = watts[index - 1]!
    const nextPower = watts[index]!
    const jump = nextPower - prevPower
    if (jump < 60) continue
    const baselineHr = hr[index - 1]!
    const immediateHr = hr[index]!
    const laterIndex = Math.min(time.length - 1, index + 10)
    const laterHr = hr[laterIndex]!
    if (baselineHr > 0 && immediateHr > 0 && laterHr > 0) {
      if (immediateHr - baselineHr <= 3 && laterHr - baselineHr >= 5) {
        return true
      }
    }
  }

  return false
}

function deriveLrBalance(workout: any) {
  const rawRightPct =
    workout?.lrBalance !== null && workout?.lrBalance !== undefined
      ? Number(workout.lrBalance)
      : null
  const unavailable = {
    sourceSemantics: 'unknown' as LrSourceSemantics,
    inversionSuspected: false,
    correctedLeftPct: null,
    correctedRightPct: null,
    interpretationMode: 'disabled' as LrInterpretationMode,
    correctionReason:
      rawRightPct === null ? 'No L/R balance data available.' : 'Unable to infer channel semantics.'
  }

  if (rawRightPct === null || !Number.isFinite(rawRightPct)) return unavailable

  const lower =
    `${workout?.deviceName || ''} ${workout?.title || ''} ${workout?.description || ''} ${workout?.source || ''}`.toLowerCase()
  const leftPct = 100 - rawRightPct
  const humanVsMotor = ['bulcan', 'bosch', 'cargo', 'e-bike', 'ebike'].some((token) =>
    lower.includes(token)
  )

  if (humanVsMotor) {
    const inversionSuspected = rawRightPct >= 60
    return {
      sourceSemantics: 'human_vs_motor' as LrSourceSemantics,
      inversionSuspected,
      correctedLeftPct: inversionSuspected ? round(rawRightPct, 1) : round(leftPct, 1),
      correctedRightPct: inversionSuspected ? round(leftPct, 1) : round(rawRightPct, 1),
      interpretationMode: inversionSuspected
        ? ('corrected' as LrInterpretationMode)
        : ('disabled' as LrInterpretationMode),
      correctionReason: inversionSuspected
        ? 'Cargo/e-bike semantics likely inverted. Swapped channels for inspection.'
        : 'Detected cargo/e-bike semantics; disabled biomechanical left/right interpretation.'
    }
  }

  return {
    sourceSemantics: 'true_left_right' as LrSourceSemantics,
    inversionSuspected: false,
    correctedLeftPct: round(leftPct, 1),
    correctedRightPct: round(rawRightPct, 1),
    interpretationMode: 'normal' as LrInterpretationMode,
    correctionReason: null
  }
}

function detectErg(workout: any, plannedWorkout: any) {
  const reasons: string[] = []
  const deviceContext = `${workout?.deviceName || ''} ${workout?.source || ''}`.toLowerCase()
  const hasExplicitHint =
    ['trainerroad', 'erg', 'wahoo systm', 'bkool'].some((token) => deviceContext.includes(token)) ||
    Boolean((workout?.rawJson as any)?.erg) ||
    Boolean((workout?.rawJson as any)?.erg_mode)

  if (hasExplicitHint) {
    reasons.push('Explicit trainer-control metadata detected.')
    return {
      detected: true,
      confidence: 'high' as FactConfidence,
      source: 'explicit' as ErgSource,
      powerControlMode: 'erg' as PowerControlMode,
      reasons
    }
  }

  const trainer = Boolean(workout?.trainer)
  const targetPower = asNumberArray(workout?.streams?.targetPower)
  const watts = asNumberArray(workout?.streams?.watts)
  const cadence = asNumberArray(workout?.streams?.cadence)
  const hasStructuredPlan = Boolean(plannedWorkout?.structuredWorkout)

  if (!trainer) {
    return {
      detected: false,
      confidence: 'low' as FactConfidence,
      source: 'unknown' as ErgSource,
      powerControlMode: 'unknown' as PowerControlMode,
      reasons: ['Indoor trainer flag not present.']
    }
  }

  if (targetPower.length > 30 && watts.length === targetPower.length) {
    const active = targetPower
      .map((target, index) => ({ target, actual: watts[index]! }))
      .filter((entry) => entry.target > 0 && entry.actual > 0)
    if (active.length >= 30) {
      const meanAbsPctError =
        active.reduce(
          (sum, entry) => sum + Math.abs(entry.actual! - entry.target) / entry.target,
          0
        ) / active.length
      const avgPower = active.reduce((sum, entry) => sum + entry.actual!, 0) / active.length
      const variance =
        active.reduce((sum, entry) => sum + Math.pow(entry.actual! - avgPower, 2), 0) /
        active.length
      const cov = avgPower > 0 ? Math.sqrt(variance) / avgPower : 1
      const cadenceSpread =
        cadence.length === watts.length ? Math.max(...cadence) - Math.min(...cadence) : 0

      if (meanAbsPctError <= 0.06 && cov <= 0.08) {
        reasons.push('Target power stream and actual power stay tightly locked.')
        if (cadenceSpread >= 8) {
          reasons.push('Cadence varied while power remained pinned to target.')
        }
        return {
          detected: true,
          confidence:
            meanAbsPctError <= 0.04 ? ('high' as FactConfidence) : ('medium' as FactConfidence),
          source: 'inferred' as ErgSource,
          powerControlMode: 'erg' as PowerControlMode,
          reasons
        }
      }
    }
  }

  if (trainer && hasStructuredPlan) {
    reasons.push('Indoor trainer with structured workout context detected.')
    return {
      detected: false,
      confidence: 'low' as FactConfidence,
      source: 'inferred' as ErgSource,
      powerControlMode: 'resistance' as PowerControlMode,
      reasons
    }
  }

  return {
    detected: false,
    confidence: 'low' as FactConfidence,
    source: 'unknown' as ErgSource,
    powerControlMode: trainer
      ? ('resistance' as PowerControlMode)
      : ('unknown' as PowerControlMode),
    reasons: ['No reliable ERG signature detected.']
  }
}

export function buildWorkoutAnalysisFacts({
  workout,
  sportSettings,
  plannedWorkout,
  userProfile
}: BuildWorkoutAnalysisFactsOptions): WorkoutAnalysisFacts {
  const computedFrom = ['workout.summary']
  const unavailableInputs: string[] = []
  const disabledInterpretations: string[] = []

  if (workout?.rawJson) computedFrom.push('workout.rawJson')
  else unavailableInputs.push('workout.rawJson')

  if (workout?.streams) computedFrom.push('workout.streams')
  else unavailableInputs.push('workout.streams')

  if (plannedWorkout) computedFrom.push('plannedWorkout')
  else unavailableInputs.push('plannedWorkout')

  if (sportSettings) computedFrom.push('sportSettings')
  else unavailableInputs.push('sportSettings')

  if (userProfile) computedFrom.push('userProfile')
  else unavailableInputs.push('userProfile')

  const family = getWorkoutFamily(workout?.type)
  const impactProfile = inferImpactProfile(family)
  const durationMinutes = Math.round((workout?.durationSec || 0) / 60)
  const rpe =
    workout?.rpe ??
    (workout?.sessionRpe && durationMinutes > 0
      ? Math.round(workout.sessionRpe / durationMinutes)
      : null) ??
    null
  const sessionRpeLoad = workout?.sessionRpe ?? (rpe ? rpe * durationMinutes : null)
  const objectiveLoad =
    workout?.trainingLoad ?? workout?.tss ?? (workout?.kilojoules ? workout.kilojoules / 4 : null)
  const subjectiveObjectiveGap = deriveSubjectiveObjectiveGap(sessionRpeLoad, objectiveLoad)
  const musculoskeletalToll = deriveMusculoskeletalToll({
    impactProfile,
    sessionRpeLoad,
    objectiveLoad
  })

  const hrStats = getHrStats(workout)
  if (!hrStats.usable) {
    disabledInterpretations.push(
      'Heart-rate-derived analysis disabled because HR telemetry is missing or artifact-prone.'
    )
  }

  const powerSourceType = inferPowerSourceType(workout, family)
  const powerAbsoluteUsable = powerSourceType === 'measured'
  const powerRelativeUsable =
    powerSourceType !== 'unknown' ||
    Boolean(workout?.averageWatts) ||
    Boolean(workout?.normalizedPower) ||
    asNumberArray(workout?.streams?.watts).length > 0 ||
    asNumberArray(workout?.streams?.powerZoneTimes).some((value) => value > 0)
  if (!powerAbsoluteUsable && powerRelativeUsable) {
    disabledInterpretations.push(
      'Absolute power benchmarking disabled because available power is estimated or uncertain.'
    )
  }

  const hasPace =
    Boolean(workout?.averageSpeed) || asNumberArray(workout?.streams?.velocity).length > 0
  const analysisMode = getAnalysisMode({
    family,
    powerSourceType,
    hrUsable: hrStats.usable,
    hasPace,
    hasRpe: Boolean(rpe)
  })
  const motionPattern = deriveMotionPattern(workout)

  const warmupExcludedMinutes = clamp(Number(sportSettings?.warmupTime || 10), 10, 15)
  const decoupling = deriveDecoupling(
    workout,
    hrStats.usable,
    warmupExcludedMinutes,
    family,
    motionPattern
  )
  if (!decoupling.valid) {
    disabledInterpretations.push(
      'Decoupling interpretation disabled because the workout lacks enough reliable steady-state HR/work data.'
    )
  }

  const normalHrLagExpected = family === 'ride' || family === 'run'
  const normalHrLagDetected = detectNormalHrLag(workout, family, hrStats.usable)

  const lrBalance = deriveLrBalance(workout)
  if (lrBalance.interpretationMode === 'disabled') {
    disabledInterpretations.push(
      lrBalance.correctionReason || 'L/R balance interpretation disabled.'
    )
  }
  if (lrBalance.interpretationMode === 'corrected') {
    disabledInterpretations.push('L/R balance channels were corrected before interpretation.')
  }

  const erg = detectErg(workout, plannedWorkout)
  if (erg.detected) {
    disabledInterpretations.push(
      'Pacing discipline should be interpreted with ERG trainer control in mind.'
    )
  }

  const facts: WorkoutAnalysisFacts = {
    subjective: {
      rpe: rpe ?? null,
      sessionRpeLoad: sessionRpeLoad ?? null,
      subjectiveObjectiveGap,
      musculoskeletalToll,
      impactProfile
    },
    telemetry: {
      analysisMode,
      hrUsable: hrStats.usable,
      hrZeroRatio: hrStats.zeroRatio,
      hrMissingRatio: hrStats.missingRatio,
      hrArtifactFlag: hrStats.artifactFlag,
      powerSourceType,
      powerAbsoluteUsable,
      powerRelativeUsable,
      lrBalanceUsable: lrBalance.interpretationMode !== 'disabled'
    },
    physiology: {
      normalHrLagExpected,
      normalHrLagDetected,
      steadyStateSegmentsAvailable: decoupling.steadyStateSegmentsAvailable,
      warmupExcludedMinutes,
      decouplingValid: decoupling.valid,
      decouplingEffective: decoupling.effective,
      decouplingDirection: decoupling.direction as DecouplingDirection | 'unknown',
      decouplingConfidence: decoupling.confidence as FactConfidence
    },
    lrBalance,
    erg,
    debugMeta: {
      factVersion: 'v1',
      computedFrom,
      unavailableInputs,
      disabledInterpretations,
      promptDecisions: {}
    }
  }

  facts.debugMeta.promptDecisions = buildPromptDecisions(facts)
  return facts
}

function buildPromptDecisions(facts: WorkoutAnalysisFacts): Record<string, PromptDecision> {
  const disabledInterpretationsText = facts.debugMeta.disabledInterpretations.join(' ')
  const decisions: Record<string, PromptDecision> = {}
  const set = (path: string, include: boolean, reason: string) => {
    decisions[path] = { include, reason }
  }

  set(
    'subjective.rpe',
    facts.subjective.rpe !== null,
    facts.subjective.rpe !== null
      ? 'Subjective effort is present and helps anchor athlete-reported load.'
      : 'No reported RPE is available for this workout.'
  )
  set(
    'subjective.sessionRpeLoad',
    facts.subjective.sessionRpeLoad !== null,
    facts.subjective.sessionRpeLoad !== null
      ? 'Total subjective session load is available and useful for prompt context.'
      : 'Session RPE load cannot be derived without RPE.'
  )
  set(
    'subjective.subjectiveObjectiveGap',
    facts.subjective.subjectiveObjectiveGap !== 'unknown',
    facts.subjective.subjectiveObjectiveGap !== 'unknown'
      ? 'Useful when subjective load can be compared against objective load.'
      : 'No meaningful subjective-objective comparison is available.'
  )
  set(
    'subjective.musculoskeletalToll',
    facts.subjective.musculoskeletalToll !== 'unknown',
    facts.subjective.musculoskeletalToll !== 'unknown'
      ? 'Adds non-cardiac session toll context for interpretation.'
      : 'No reliable musculoskeletal toll estimate is available.'
  )
  set(
    'subjective.impactProfile',
    true,
    'Sport impact profile is stable context and helps frame subjective load.'
  )

  set('telemetry.analysisMode', true, 'Primary analysis mode should always guide prompt emphasis.')
  set(
    'telemetry.hrUsable',
    true,
    facts.telemetry.hrUsable
      ? 'Prompt should know HR is safe to use.'
      : 'Prompt should know HR-derived reasoning must be suppressed.'
  )
  set(
    'telemetry.hrZeroRatio',
    facts.telemetry.hrZeroRatio !== null && !facts.telemetry.hrUsable,
    facts.telemetry.hrZeroRatio !== null && !facts.telemetry.hrUsable
      ? 'Zero-rate evidence explains why HR is being suppressed.'
      : 'Zero-rate summary adds little when HR is usable or no HR stream exists.'
  )
  set(
    'telemetry.hrMissingRatio',
    facts.telemetry.hrMissingRatio !== null && !facts.telemetry.hrUsable,
    facts.telemetry.hrMissingRatio !== null && !facts.telemetry.hrUsable
      ? 'Missing-rate evidence explains why HR is being suppressed.'
      : 'Missing-rate summary adds little when HR is usable or no HR stream exists.'
  )
  set(
    'telemetry.hrArtifactFlag',
    !facts.telemetry.hrUsable || facts.telemetry.hrArtifactFlag,
    !facts.telemetry.hrUsable || facts.telemetry.hrArtifactFlag
      ? 'Prompt should know HR artifacts were detected.'
      : 'Artifact flag adds no value when HR telemetry is clean.'
  )
  set(
    'telemetry.powerSourceType',
    facts.telemetry.powerSourceType !== 'unknown',
    facts.telemetry.powerSourceType !== 'unknown'
      ? 'Prompt should know whether power is measured or estimated.'
      : 'No trustworthy power provenance is available.'
  )
  set(
    'telemetry.powerAbsoluteUsable',
    facts.telemetry.powerSourceType !== 'unknown',
    facts.telemetry.powerSourceType !== 'unknown'
      ? 'Prompt should know whether absolute power comparisons are safe.'
      : 'No power source is available, so absolute-use status is not meaningful.'
  )
  set(
    'telemetry.powerRelativeUsable',
    facts.telemetry.powerSourceType !== 'unknown' || facts.telemetry.powerRelativeUsable,
    facts.telemetry.powerSourceType !== 'unknown' || facts.telemetry.powerRelativeUsable
      ? 'Prompt should know if power can still be used for relative comparison.'
      : 'No usable power context is available.'
  )
  set(
    'telemetry.lrBalanceUsable',
    true,
    facts.telemetry.lrBalanceUsable
      ? 'Prompt should know L/R balance can be interpreted.'
      : 'Prompt should know L/R balance must be ignored.'
  )

  set(
    'physiology.normalHrLagExpected',
    facts.telemetry.hrUsable && facts.physiology.normalHrLagExpected,
    facts.telemetry.hrUsable && facts.physiology.normalHrLagExpected
      ? 'Useful context to prevent false sensor-error interpretations.'
      : 'HR lag expectation is not meaningful without usable HR.'
  )
  set(
    'physiology.normalHrLagDetected',
    facts.telemetry.hrUsable && facts.physiology.normalHrLagDetected,
    facts.telemetry.hrUsable && facts.physiology.normalHrLagDetected
      ? 'Prompt should know the workout shows normal delayed HR kinetics.'
      : 'No detected HR lag signal needs to be explained.'
  )
  set(
    'physiology.steadyStateSegmentsAvailable',
    facts.physiology.steadyStateSegmentsAvailable,
    facts.physiology.steadyStateSegmentsAvailable
      ? 'Useful to support durability and decoupling interpretation.'
      : 'No steady-state segment support is available.'
  )
  set(
    'physiology.warmupExcludedMinutes',
    facts.physiology.decouplingValid,
    facts.physiology.decouplingValid
      ? 'Warm-up exclusion matters because decoupling is being considered.'
      : 'Warm-up exclusion adds no value when decoupling is ignored.'
  )
  set(
    'physiology.decouplingValid',
    true,
    facts.physiology.decouplingValid
      ? 'Prompt should know decoupling is safe to discuss.'
      : 'Prompt should know decoupling must be ignored.'
  )
  set(
    'physiology.decouplingEffective',
    facts.physiology.decouplingValid && facts.physiology.decouplingEffective !== null,
    facts.physiology.decouplingValid && facts.physiology.decouplingEffective !== null
      ? 'Effective decoupling adds actionable physiology context.'
      : 'No valid effective decoupling value is available.'
  )
  set(
    'physiology.decouplingDirection',
    facts.physiology.decouplingValid && facts.physiology.decouplingDirection !== 'unknown',
    facts.physiology.decouplingValid && facts.physiology.decouplingDirection !== 'unknown'
      ? 'Direction is useful when decoupling is valid.'
      : 'Direction is not meaningful without valid decoupling.'
  )
  set(
    'physiology.decouplingConfidence',
    facts.physiology.decouplingValid,
    facts.physiology.decouplingValid
      ? 'Confidence level helps the prompt calibrate how strongly to use decoupling.'
      : 'Confidence is not useful when decoupling is ignored.'
  )

  set(
    'lrBalance.sourceSemantics',
    facts.lrBalance.sourceSemantics !== 'unknown',
    facts.lrBalance.sourceSemantics !== 'unknown'
      ? 'Prompt should know what the balance channels likely represent.'
      : 'Unknown L/R semantics do not add useful prompt information.'
  )
  set(
    'lrBalance.inversionSuspected',
    facts.lrBalance.inversionSuspected,
    facts.lrBalance.inversionSuspected
      ? 'Prompt should know the channels may be inverted.'
      : 'No inversion signal was detected.'
  )
  set(
    'lrBalance.correctedLeftPct',
    facts.lrBalance.correctedLeftPct !== null && facts.telemetry.lrBalanceUsable,
    facts.lrBalance.correctedLeftPct !== null && facts.telemetry.lrBalanceUsable
      ? 'Corrected left percentage is usable for prompt interpretation.'
      : 'No meaningful corrected left percentage is available.'
  )
  set(
    'lrBalance.correctedRightPct',
    facts.lrBalance.correctedRightPct !== null && facts.telemetry.lrBalanceUsable,
    facts.lrBalance.correctedRightPct !== null && facts.telemetry.lrBalanceUsable
      ? 'Corrected right percentage is usable for prompt interpretation.'
      : 'No meaningful corrected right percentage is available.'
  )
  set(
    'lrBalance.interpretationMode',
    true,
    facts.lrBalance.interpretationMode === 'disabled'
      ? 'Prompt should know L/R balance is intentionally ignored.'
      : 'Prompt should know how L/R balance should be handled.'
  )
  set(
    'lrBalance.correctionReason',
    Boolean(facts.lrBalance.correctionReason),
    facts.lrBalance.correctionReason
      ? 'This explains why L/R balance was corrected or disabled.'
      : 'No correction explanation is available.'
  )

  set(
    'erg.detected',
    true,
    facts.erg.detected
      ? 'Prompt should know ERG was detected so pacing discipline is not overstated.'
      : 'Prompt should know no reliable ERG signature was found.'
  )
  set(
    'erg.confidence',
    facts.erg.source !== 'unknown' || facts.erg.detected,
    facts.erg.source !== 'unknown' || facts.erg.detected
      ? 'Confidence helps calibrate how strongly ERG inference should influence analysis.'
      : 'Confidence is not useful without a meaningful ERG signal.'
  )
  set(
    'erg.source',
    facts.erg.source !== 'unknown',
    facts.erg.source !== 'unknown'
      ? 'Prompt should know whether ERG came from explicit metadata or inference.'
      : 'ERG source is unknown and does not add useful context.'
  )
  set(
    'erg.powerControlMode',
    facts.erg.powerControlMode !== 'unknown',
    facts.erg.powerControlMode !== 'unknown'
      ? 'Prompt should know likely trainer control mode when available.'
      : 'No trainer control mode can be inferred.'
  )
  set(
    'erg.reasons',
    facts.erg.reasons.length > 0 && (facts.erg.detected || facts.erg.source !== 'unknown'),
    facts.erg.reasons.length > 0 && (facts.erg.detected || facts.erg.source !== 'unknown')
      ? 'Short reasons make the ERG decision auditable in the prompt.'
      : 'No meaningful ERG rationale needs to be included.'
  )

  set(
    'debugMeta.computedFrom',
    false,
    'Implementation/debug provenance should stay out of the AI prompt.'
  )
  set(
    'debugMeta.unavailableInputs',
    false,
    'Missing-input inventory is for debugging, not model context.'
  )
  set(
    'debugMeta.disabledInterpretations',
    disabledInterpretationsText.length > 0,
    disabledInterpretationsText.length > 0
      ? 'Prompt should receive the final interpretation suppressions, not all raw debug provenance.'
      : 'No disabled interpretations need to be communicated.'
  )

  return decisions
}

type FlattenedPlannedStep = {
  type: string
  durationSeconds: number
  metric: 'power' | 'pace' | 'heartRate' | 'rpe' | null
  targetValue: number | null
  targetUnits: string | null
  intensityFactor: number | null
  cadence: number | null
  ramp: boolean
  classification: 'work' | 'recovery'
}

type ActualInterval = {
  type: string
  durationSeconds: number
  avgPower: number | null
  avgHr: number | null
  avgSpeed: number | null
  avgCadence: number | null
  /**
   * Intensity factor — a fraction of threshold (~0.3–1.5), the same scale as
   * `FlattenedPlannedStep.intensityFactor`. Normalised in `mapIntervalsToActual`
   * (see `toIntervalIntensityFactor`); `null` when the source carries no
   * intensity signal at all, which is always the case for engine-detected
   * intervals.
   */
  intensity: number | null
  matchScore: number | null
  confidence: number | null
  ambiguityNote: string | null
  classification: 'work' | 'recovery'
  /**
   * Where this segment sits in the sample streams, inclusive on both ends.
   *
   * Both provider laps (`icu_intervals[].start_index`) and engine-detected
   * intervals (`interval-detection.ts`) carry these; they are `null` for any
   * source that does not, and every consumer must treat them as optional.
   * Without them a signal cannot be measured *inside* a rep — which is exactly
   * why rep-scoped execution stability reports itself as not applicable rather
   * than falling back to a session-wide number (CW-393).
   */
  startIndex: number | null
  endIndex: number | null
}

type AnalysisRefs = {
  ftp: number
  lthr: number
  maxHr: number
  thresholdPace: number
  hrZones?: any[]
  powerZones?: any[]
  paceZones?: any[]
}

type PlannedStepMetric = MetricTarget

export type ActualIntervalForAnalysis = ActualInterval

/**
 * Resolve the reference values (FTP / LTHR / max HR / threshold pace) used by
 * interval detection and source arbitration.
 *
 * Callers that already hold the athlete's sport settings (e.g.
 * `buildWorkoutAnalysisFactsV2`) should always pass `refs` — those are the
 * profile-level references. The fallback below only exists for the exported
 * helpers that are still called from scripts/tasks without sport settings.
 *
 * Note on `workout.maxHr`: that is the SESSION max HR recorded for this single
 * activity, not the athlete's profile max, so it is deliberately the last
 * resort — it is only used when no profile value is available at all.
 */
function resolveAnalysisRefs(workout: any, refs?: AnalysisRefs): AnalysisRefs {
  if (refs) return refs

  return {
    ftp: Number(workout?.sportSettings?.ftp || workout?.user?.ftp || workout?.ftp || 0),
    lthr: Number(workout?.sportSettings?.lthr || workout?.user?.lthr || 0),
    // Profile max HR first; session max HR (`workout.maxHr`) only as a last-resort fallback.
    maxHr: Number(workout?.sportSettings?.maxHr || workout?.user?.maxHr || workout?.maxHr || 0),
    thresholdPace: Number(workout?.sportSettings?.thresholdPace || 0),
    hrZones: workout?.sportSettings?.hrZones || [],
    powerZones: workout?.sportSettings?.powerZones || [],
    paceZones: workout?.sportSettings?.paceZones || []
  }
}

function getPromptFactValueByPath(value: unknown, path: string) {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== 'object') return undefined
    return (acc as Record<string, unknown>)[key]
  }, value)
}

function inferHrArtifactSeverity(stats: ReturnType<typeof getHrStats>): HrArtifactSeverity {
  const zeroRatio = stats.zeroRatio ?? 0
  const missingRatio = stats.missingRatio ?? 0
  const implausibleRatio = stats.implausibleRatio ?? 0
  const jumpRatio = stats.jumpRatio ?? 0
  // Dropouts and corruption are graded on separate ladders because their thresholds
  // differ: missing samples are tolerated up to 15%, whereas 5% of physiologically
  // impossible readings already means the sensor was misbehaving for the whole session.
  const dropoutRatio = Math.max(zeroRatio, missingRatio)
  const corruptionRatio = Math.max(implausibleRatio, jumpRatio)
  if (!stats.usable && corruptionRatio >= HR_CORRUPTION_UNUSABLE_RATIO) return 'high'
  if (!stats.usable && dropoutRatio >= 0.2) return 'high'
  if (!stats.usable && dropoutRatio >= 0.1) return 'moderate'
  if (stats.artifactFlag || dropoutRatio > 0 || corruptionRatio > 0) return 'low'
  return 'none'
}

function inferPaceConfidence(
  workout: any,
  family: ReturnType<typeof getWorkoutFamily>
): PaceConfidence {
  const velocity = asNumberArray(workout?.streams?.velocity)
  if (
    family !== 'run' &&
    !String(workout?.type || '')
      .toLowerCase()
      .includes('treadmill')
  ) {
    return velocity.length > 0 || workout?.averageSpeed ? 'medium' : 'unknown'
  }
  if (
    String(workout?.type || '')
      .toLowerCase()
      .includes('treadmill')
  )
    return 'high'
  if (velocity.length >= 120) return 'high'
  if (velocity.length > 0 || workout?.averageSpeed) return 'medium'
  return 'low'
}

function getStructuredSteps(structuredWorkout: any): any[] {
  if (Array.isArray(structuredWorkout)) return structuredWorkout
  if (
    structuredWorkout &&
    typeof structuredWorkout === 'object' &&
    Array.isArray(structuredWorkout.steps)
  ) {
    return structuredWorkout.steps
  }
  return []
}

function getTargetValue(target: any): number | null {
  if (!target || typeof target !== 'object') return null
  if (typeof target.value === 'number' && Number.isFinite(target.value)) return target.value
  if (
    target.range &&
    typeof target.range.start === 'number' &&
    typeof target.range.end === 'number' &&
    Number.isFinite(target.range.start) &&
    Number.isFinite(target.range.end)
  ) {
    return (target.range.start + target.range.end) / 2
  }
  return null
}

function hasPlannedMetricTarget(step: any, metric: PlannedStepMetric) {
  if (metric === 'rpe') return typeof step?.rpe === 'number'
  const target = step?.[metric]
  return Boolean(target && (typeof target.value === 'number' || target.range))
}

function normalizePlannedMetricOrder(
  metricOrder?: PlannedStepMetric[] | null
): PlannedStepMetric[] {
  const ordered: PlannedStepMetric[] = []
  for (const metric of metricOrder || parseLegacyLoadPreference(null)) {
    if (!ordered.includes(metric)) ordered.push(metric)
  }
  for (const metric of parseLegacyLoadPreference(null)) {
    if (!ordered.includes(metric)) ordered.push(metric)
  }
  return ordered
}

function resolvePlannedStepMetric(
  step: any,
  metricOrder?: PlannedStepMetric[] | null
): FlattenedPlannedStep['metric'] {
  const currentPrimary = String(step?.primaryTarget || '')
  if (
    (['power', 'heartRate', 'pace', 'rpe'] as string[]).includes(currentPrimary) &&
    hasPlannedMetricTarget(step, currentPrimary as PlannedStepMetric)
  ) {
    return currentPrimary as FlattenedPlannedStep['metric']
  }

  for (const metric of normalizePlannedMetricOrder(metricOrder)) {
    if (hasPlannedMetricTarget(step, metric)) return metric
  }

  return null
}

function flattenPlannedSteps(
  steps: any[],
  refs: AnalysisRefs,
  metricOrder?: PlannedStepMetric[] | null
): FlattenedPlannedStep[] {
  const flattened: FlattenedPlannedStep[] = []

  const visit = (nodes: any[]) => {
    for (const step of nodes || []) {
      if (!step || typeof step !== 'object') continue
      const reps = Math.max(1, Math.trunc(Number(step.reps || 1)) || 1)
      if (Array.isArray(step.steps) && step.steps.length > 0) {
        for (let rep = 0; rep < reps; rep++) visit(step.steps)
        continue
      }

      const durationSeconds =
        Number(
          step.durationSeconds || step.duration || step.duration_s || step.elapsed_time || 0
        ) || 0
      if (durationSeconds <= 0) continue

      const stepType = String(step.type || 'Interval')
      const stepName = String(step.name || '').toLowerCase()
      const normalizedType = stepType.toLowerCase()
      const recoveryTokens = [
        'rest',
        'recovery',
        'cooldown',
        'warmup',
        'recuperación',
        'enfriamiento'
      ]
      const metric = resolvePlannedStepMetric(step, metricOrder)
      const targetValue =
        metric === 'power'
          ? getTargetValue(step.power)
          : metric === 'pace'
            ? getTargetValue(step.pace)
            : metric === 'heartRate'
              ? getTargetValue(step.heartRate || step.hr)
              : metric === 'rpe'
                ? Number(step.rpe)
                : null
      let intensityFactor: number | null = null
      if (metric === 'power')
        intensityFactor = toIntensityFactorFromTarget(step.power, 'power', refs)
      else if (metric === 'pace')
        intensityFactor = toIntensityFactorFromTarget(step.pace, 'pace', refs)
      else if (metric === 'heartRate')
        intensityFactor = toIntensityFactorFromTarget(step.heartRate || step.hr, 'heartRate', refs)
      else if (metric === 'rpe' && typeof step.rpe === 'number')
        intensityFactor = clamp(step.rpe / 10, 0.3, 1.5)

      // Same rule as the shared `normalizePlannedStepType` (which was lifted
      // from here): a recovery label only sticks when the step's own numeric
      // target does not contradict it. Kept inline because this path needs the
      // work/recovery split rather than the four detection types, but the
      // threshold is the shared constant so the two cannot drift apart.
      const hasRecoveryLabel = recoveryTokens.some(
        (token) => normalizedType.includes(token) || stepName.includes(token)
      )
      const isWarmOrCool = normalizedType.includes('warm') || normalizedType.includes('cool')
      const isRecovery =
        isWarmOrCool ||
        (hasRecoveryLabel &&
          (intensityFactor === null ||
            !Number.isFinite(intensityFactor) ||
            intensityFactor < PLANNED_WORK_INTENSITY_FACTOR))

      flattened.push({
        type: stepType,
        durationSeconds,
        metric,
        targetValue,
        targetUnits:
          metric === 'power'
            ? String(step.power?.units || '')
                .trim()
                .toLowerCase() || null
            : metric === 'pace'
              ? String(step.pace?.units || '')
                  .trim()
                  .toLowerCase() || null
              : metric === 'heartRate'
                ? String((step.heartRate || step.hr)?.units || '')
                    .trim()
                    .toLowerCase() || null
                : null,
        intensityFactor,
        cadence:
          typeof step.cadence === 'number' && Number.isFinite(step.cadence) ? step.cadence : null,
        ramp: Boolean(
          step.ramp || normalizedType.includes('warm') || normalizedType.includes('cool')
        ),
        classification: isRecovery ? 'recovery' : 'work'
      })
    }
  }

  visit(steps)
  return flattened
}

function getRawIntervals(workout: any): any[] {
  const raw = workout?.rawJson as any
  if (Array.isArray(raw?.icu_intervals)) return raw.icu_intervals
  if (Array.isArray(raw?.intervals)) return raw.intervals
  return []
}

/**
 * Provider-synced laps come with unreliable type labels (Intervals.icu marks
 * nearly everything `WORK`), so re-derive them from the session's own intensity
 * profile before they reach adherence facts or the AI prompt.
 */
function mapProviderIntervalsToActual(intervals: any[]): ActualInterval[] {
  const resolvedTypes = resolveProviderIntervalTypes(
    intervals.map((interval) => ({
      type: interval?.type,
      intensity: Number(interval?.intensity),
      avgPower: Number(interval?.average_watts ?? interval?.avg_power),
      avgSpeed: Number(interval?.average_speed ?? interval?.avg_pace)
    }))
  )
  return mapIntervalsToActual(
    intervals.map((interval, index) => ({ ...interval, type: resolvedTypes[index] }))
  )
}

/**
 * Normalise a source interval's intensity onto ONE documented scale: an
 * intensity factor (fraction of threshold, ~0.3–1.5).
 *
 * Provider laps keep Intervals.icu's `icu_intervals[].intensity` verbatim off
 * `rawJson`, and that field is a PERCENTAGE of threshold (e.g. `101` for a lap
 * ridden at 101% of FTP). The planned side of adherence is an intensity factor
 * (`toIntensityFactorFromTarget`, and `rpe / 10` for RPE steps), so the two
 * only compare if the provider percentage is divided by 100 first.
 *
 * The `> 5` heuristic is the same one the activity-level sync already applies
 * (`normalizeIntensityValue` in `services/intervalsService.ts`): no lap sits at
 * 500% of threshold, and no lap is meaningfully described as 5% of it, so the
 * gap is unambiguous. Values already on the factor scale (older fixtures,
 * providers that hand us a ratio) pass through untouched.
 *
 * Engine-detected intervals (`detectIntervals`) carry no intensity field at
 * all, so they stay `null` — there is no second unit to reconcile.
 */
export function toIntervalIntensityFactor(value: unknown): number | null {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return numeric > 5 ? numeric / 100 : numeric
}

/** A stream offset, or `null` when the source carries no usable one. */
function toSampleIndex(value: unknown): number | null {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return null
  return Math.floor(numeric)
}

function mapIntervalsToActual(intervals: any[]): ActualInterval[] {
  return intervals
    .map((interval) => {
      const type = String(interval?.type || 'INTERVAL')
      const lower = type.toLowerCase()
      const classification =
        lower.includes('rest') ||
        lower.includes('recovery') ||
        lower.includes('warm') ||
        lower.includes('cool') ||
        lower.includes('recuperación') ||
        lower.includes('enfriamiento')
          ? ('recovery' as const)
          : ('work' as const)
      return {
        type,
        durationSeconds:
          Number(
            interval?.moving_time ??
              interval?.elapsed_time ??
              interval?.duration ??
              interval?.durationSeconds ??
              0
          ) || 0,
        avgPower: Number.isFinite(Number(interval?.average_watts ?? interval?.avg_power))
          ? Number(interval?.average_watts ?? interval?.avg_power)
          : null,
        avgHr: Number.isFinite(Number(interval?.average_heartrate ?? interval?.avg_heartrate))
          ? Number(interval?.average_heartrate ?? interval?.avg_heartrate)
          : null,
        avgSpeed: Number.isFinite(Number(interval?.average_speed ?? interval?.avg_pace))
          ? Number(interval?.average_speed ?? interval?.avg_pace)
          : null,
        avgCadence: Number.isFinite(Number(interval?.average_cadence ?? interval?.avg_cadence))
          ? Number(interval?.average_cadence ?? interval?.avg_cadence)
          : null,
        intensity: toIntervalIntensityFactor(interval?.intensity),
        matchScore: Number.isFinite(Number(interval?.match_score))
          ? Number(interval.match_score)
          : null,
        confidence: Number.isFinite(
          Number(interval?.detection_confidence ?? interval?.classification_confidence)
        )
          ? Number(interval?.detection_confidence ?? interval?.classification_confidence)
          : null,
        ambiguityNote:
          typeof interval?.ambiguity_note === 'string' ? String(interval.ambiguity_note) : null,
        classification,
        startIndex: toSampleIndex(interval?.start_index),
        endIndex: toSampleIndex(interval?.end_index)
      }
    })
    .filter((interval) => interval.durationSeconds > 0)
}

/**
 * Flatten a structured workout into the shape `detectIntervals` consumes.
 *
 * `refs` must be the athlete's resolved references (`resolveAnalysisRefs`), NOT
 * a zeroed placeholder: they are what turns an ABSOLUTE target (watts, bpm,
 * m/s) into an intensity factor, and that intensity factor is the sole input to
 * the RECOVERY -> WORK promotion below. With zeroed refs an absolute target
 * yields null or a clamped guess, so a plan whose "recovery" steps are actually
 * work-intensity was segmented as recovery and the resulting facts described the
 * wrong session shape (CW-402). Callers without references may still pass a
 * zeroed refs object: the promotion then simply cannot fire, which is the
 * pre-fix behaviour.
 *
 * This is also the ONLY place in the detection pipeline that classifies a step:
 * it is the last layer that can resolve an intensity factor, so it runs the
 * shared `normalizePlannedStepType` with the name AND that intensity factor and
 * emits a resolved type. `flattenPlannedStepsForDetection` downstream then
 * takes that type as the answer instead of re-deriving it from the free-text
 * name, which is what used to undo the promotion (CW-414).
 */
function toDetectionPlannedSteps(
  steps: any[],
  refs: AnalysisRefs
): Array<{
  name?: string
  durationSeconds?: number
  duration?: number
  type?: string
  power?: { value?: number; range?: { start: number; end: number } }
  heartRate?: { value?: number; range?: { start: number; end: number } }
  pace?: { value?: number; range?: { start: number; end: number } }
  cadence?: number
  ramp?: boolean
}> {
  const planned: Array<{
    name?: string
    durationSeconds?: number
    duration?: number
    type?: string
    power?: { value?: number; range?: { start: number; end: number } }
    heartRate?: { value?: number; range?: { start: number; end: number } }
    pace?: { value?: number; range?: { start: number; end: number } }
    cadence?: number
    ramp?: boolean
  }> = []

  const visit = (nodes: any[]) => {
    for (const step of nodes || []) {
      if (!step || typeof step !== 'object') continue
      if (Array.isArray(step.steps) && step.steps.length > 0) {
        const reps = Math.max(1, Math.trunc(Number(step.reps || 1)) || 1)
        for (let index = 0; index < reps; index++) visit(step.steps)
        continue
      }

      const metric = resolvePlannedStepMetric(step)
      const intensity =
        metric === 'power'
          ? toIntensityFactorFromTarget(step.power, 'power', refs)
          : metric === 'pace'
            ? toIntensityFactorFromTarget(step.pace, 'pace', refs)
            : metric === 'heartRate'
              ? toIntensityFactorFromTarget(step.heartRate || step.hr, 'heartRate', refs)
              : metric === 'rpe' && typeof step.rpe === 'number'
                ? clamp(step.rpe / 10, 0.3, 1.5)
                : null
      // One call, one rule: the recovery label (from the type or the name) is
      // honoured unless this step's own numeric target says otherwise. The
      // RECOVERY -> WORK promotion of CW-402 is the intensity veto inside
      // `normalizePlannedStepType`; the name demotion the adherence path has
      // always applied now happens here too, gated by the same intensity, so
      // both sides of the analysis classify a step identically (CW-414).
      const type = normalizePlannedStepType({
        type: step.type,
        name: step.name,
        intensityFactor: intensity
      })

      planned.push({
        name: step.name,
        durationSeconds:
          Number(step.durationSeconds || step.duration || step.duration_s || 0) || undefined,
        duration:
          Number(step.duration || step.durationSeconds || step.duration_s || 0) || undefined,
        type,
        power: step.power,
        heartRate: step.heartRate || step.hr,
        pace: step.pace,
        cadence:
          typeof step.cadence === 'number' && Number.isFinite(step.cadence)
            ? step.cadence
            : undefined,
        ramp: Boolean(step.ramp)
      })
    }
  }

  visit(steps)
  return planned
}

function resolveComparableTargetBounds(
  planned: FlattenedPlannedStep,
  refs: AnalysisRefs
): { start: number; end: number } | null {
  const zoneValue =
    planned.targetValue !== null && Number.isFinite(planned.targetValue)
      ? Math.max(1, Math.round(planned.targetValue))
      : null
  if (zoneValue === null) return null

  if (planned.metric === 'power' && planned.targetUnits?.includes('zone')) {
    const zone = refs.powerZones?.[zoneValue - 1]
    const min = Number(zone?.min)
    const max = Number(zone?.max)
    if (Number.isFinite(min) && Number.isFinite(max)) return { start: min, end: max }
  }

  if (planned.metric === 'heartRate' && planned.targetUnits?.includes('zone')) {
    const zone = refs.hrZones?.[zoneValue - 1]
    const min = Number(zone?.min)
    const max = Number(zone?.max)
    if (Number.isFinite(min) && Number.isFinite(max)) return { start: min, end: max }
  }

  if (planned.metric === 'pace' && planned.targetUnits?.includes('zone')) {
    const zone = refs.paceZones?.[zoneValue - 1]
    const min = Number(zone?.min)
    const max = Number(zone?.max)
    if (Number.isFinite(min) && Number.isFinite(max)) return { start: min, end: max }
  }

  return null
}

function resolveComparableTargetValue(
  planned: FlattenedPlannedStep,
  refs: AnalysisRefs
): number | null {
  if (planned.metric === 'power') {
    if (
      planned.intensityFactor !== null &&
      Number.isFinite(planned.intensityFactor) &&
      refs.ftp > 0
    ) {
      return planned.intensityFactor * refs.ftp
    }
    if (planned.targetValue !== null && Number.isFinite(planned.targetValue)) {
      if (planned.targetValue <= 2 && refs.ftp > 0) return planned.targetValue * refs.ftp
      return planned.targetValue
    }
    return null
  }

  if (planned.metric === 'heartRate') {
    if (
      planned.intensityFactor !== null &&
      Number.isFinite(planned.intensityFactor) &&
      (refs.lthr > 0 || refs.maxHr > 0)
    ) {
      const denom = refs.lthr > 0 ? refs.lthr : refs.maxHr
      return planned.intensityFactor * denom
    }
    return planned.targetValue
  }

  if (planned.metric === 'pace') {
    if (
      planned.intensityFactor !== null &&
      Number.isFinite(planned.intensityFactor) &&
      refs.thresholdPace > 0
    ) {
      return planned.intensityFactor * refs.thresholdPace
    }
    return planned.targetValue
  }

  if (planned.metric === 'rpe') return planned.intensityFactor
  return planned.targetValue
}

/**
 * The engine's segmentation of a workout, in the shape `detectIntervals` returns it.
 *
 * `metric` is the stream the segmentation was actually derived from, so a caller
 * can report provenance without re-deriving the choice (the endpoint's
 * `autoDetectionMetric`). It is `null` exactly when no stream qualified and
 * `intervals` is empty.
 */
export type DetectedIntervalCandidate = {
  metric: 'power' | 'pace' | 'heartrate' | null
  intervals: Interval[]
}

/**
 * Build the engine's detected-interval candidate for a workout — the ONE
 * implementation of that choice (CW-434).
 *
 * Before this existed, `server/api/workouts/[id]/intervals.get.ts` rebuilt the
 * candidate itself with a different rule (watts first regardless of sport, a raw
 * `type === 'Run' || 'Swim'` string match, and no stream-length check), while the
 * facts layer built its own. CW-430 then had the endpoint ask the facts layer
 * WHICH source wins — so the arbitration returned a verdict about one set of
 * intervals and the chart rendered another. Both sides now call this.
 *
 * Metric priority, and why:
 *
 * 1. **Pace for the run and non-impact-cardio families.** For runs this is the
 *    facts layer's long-standing rule and is deliberately canonical: CW-384 and
 *    CW-401 invested specifically in run pace-detection quality, and pace — not
 *    power — is what a run's structure is prescribed in. Swim/ski/row are in the
 *    same clause because velocity is their intensity metric too, and because the
 *    endpoint already segmented swims on pace; leaving them out would have
 *    dropped those charts to HR.
 * 2. **Power**, for everything with a usable watts stream (the ride population).
 * 3. **Heart rate**, as the last resort.
 *
 * Every branch requires `stream.length === time.length`. `detectIntervals` rejects
 * mismatched arrays anyway (returning `[]`), so a looser check does not rescue a
 * ragged file — it only makes the two sides disagree about which metric was
 * *attempted*, and hides the fact that nothing was detected behind a confident
 * `detectionMetric`. Falling through to the next metric is strictly better.
 *
 * Family resolution goes through `getWorkoutFamily`, so `VirtualRun`, `TrailRun`
 * and `Treadmill` are runs here exactly as they are everywhere else.
 *
 * Power is smoothed with rolling normalized power rather than the engine's default
 * centred SMA — that is what the chart endpoint has always used for power
 * segmentation, and it is the domain-correct smoothing for the metric.
 */
export function buildDetectedIntervalCandidate(
  workout: any,
  plannedWorkout?: any,
  refsInput?: AnalysisRefs
): DetectedIntervalCandidate {
  const refs = resolveAnalysisRefs(workout, refsInput)
  const time = asNumberArray(workout?.streams?.time)
  const power = asNumberArray(workout?.streams?.watts)
  const velocity = asNumberArray(workout?.streams?.velocity)
  const hr = asNumberArray(workout?.streams?.heartrate)
  const cadenceValues = asNumberArray(workout?.streams?.cadence)
  const cadence = cadenceValues.length > 0 ? cadenceValues : undefined
  const family = getWorkoutFamily(workout?.type)
  // The plan has to go through `toDetectionPlannedSteps` — that is what applies the
  // CW-402 RECOVERY -> WORK promotion for absolute targets and the `hr` / `duration_s`
  // key aliases. The endpoint used to hand `structuredWorkout.steps` to the engine raw
  // and silently missed all three (CW-435, folded into CW-434).
  const plannedSteps = toDetectionPlannedSteps(
    getStructuredSteps(
      plannedWorkout?.structuredWorkout || workout?.plannedWorkout?.structuredWorkout
    ),
    refs
  )

  // Pace leads for runs — the CW-434 decision — and for swims, which the intervals
  // endpoint has always segmented on velocity. Deliberately NOT the whole
  // `nonimpact_cardio` family: that also holds ski and row, which the endpoint left
  // on the power/HR order. Their speed is terrain- and condition-confounded much
  // like cycling, and moving them was not part of the decision this change records.
  // Widen only with evidence.
  const isSwim = String(workout?.type || '')
    .toLowerCase()
    .includes('swim')
  const paceFirstFamily = family === 'run' || isSwim

  if (
    time.length > 0 &&
    velocity.length === time.length &&
    velocity.length > 0 &&
    paceFirstFamily
  ) {
    // Threshold pace is stored in m/s (same convention as calculatePaceZones), so it can be
    // handed to the detection engine directly as the work/recovery reference.
    const thresholdPace = Number(refs.thresholdPace || 0) || undefined
    return {
      metric: 'pace',
      intervals: detectIntervals(
        time,
        velocity,
        'pace',
        thresholdPace,
        plannedSteps,
        undefined,
        cadence
      )
    }
  }

  if (time.length > 0 && power.length === time.length && power.length > 0) {
    return {
      metric: 'power',
      intervals: detectIntervals(
        time,
        power,
        'power',
        Number(refs.ftp || workout?.ftp || 0) || undefined,
        plannedSteps,
        calculateRollingNormalizedPower(power),
        cadence
      )
    }
  }

  if (time.length > 0 && hr.length === time.length && hr.length > 0) {
    // Profile-sourced reference, taken from the resolved analysis refs
    // (sportSettings, then the user record) rather than off the workout object,
    // which carries no user/sportSettings relation in the analysis path. This
    // workout's own max HR is only an explicit last-resort fallback — a bar
    // derived from it is self-referential and drifts session to session.
    const hrWorkThreshold = resolveHrWorkThreshold({
      lthr: refs.lthr,
      maxHr: refs.maxHr,
      sessionMaxHr: workout?.maxHr
    })
    return {
      metric: 'heartrate',
      intervals: detectIntervals(
        time,
        hr,
        'heartrate',
        hrWorkThreshold,
        plannedSteps,
        undefined,
        cadence,
        // Zone reference, kept separate from the work bar above (CW-400).
        { lthr: refs.lthr, maxHr: refs.maxHr }
      )
    }
  }

  return { metric: null, intervals: [] }
}

function buildDetectedIntervals(
  workout: any,
  plannedWorkout?: any,
  refsInput?: AnalysisRefs
): ActualInterval[] {
  // `start_index`/`end_index` survive the mapping so rep-scoped signals can look
  // inside a rep (CW-393).
  return mapIntervalsToActual(
    buildDetectedIntervalCandidate(workout, plannedWorkout, refsInput).intervals
  )
}

/**
 * One planned step and the actual segment it was executed as.
 *
 * `actual === null` means the alignment found no counterpart for this planned
 * step at all — the athlete's file contains no segment that belongs to it.
 * That is deliberately distinct from "there is a segment but it carries no
 * comparable measurement", which callers detect from the segment itself.
 */
export type PlannedActualPair = {
  planned: FlattenedPlannedStep
  /** Index into the planned step list that was passed in. */
  plannedIndex: number
  actual: ActualInterval | null
  /** Index into `PlannedActualAlignment.actualSegments`, not into the caller's raw list. */
  actualIndex: number | null
}

export type PlannedActualAlignment = {
  /** Exactly one entry per planned step, in plan order. */
  pairs: PlannedActualPair[]
  /**
   * Actual segments no planned step claimed: extra laps, mid-step lap presses,
   * an unplanned extra rep. Indices refer to `actualSegments`.
   */
  extraActual: Array<{ actual: ActualInterval; actualIndex: number }>
  /**
   * The actual list the alignment actually worked on: the caller's list minus
   * the stub segments dropped by `dropStubSegments`. Callers that need counts
   * or terminal-segment checks should use this rather than their raw input, so
   * a 3-second lap fragment cannot masquerade as a rep.
   */
  actualSegments: ActualInterval[]
  /** How many stub segments were dropped before pairing. */
  droppedStubs: number
}

/**
 * Longest a segment can be and still be treated as a lap-button artefact rather
 * than something the athlete executed.
 *
 * Provider files routinely end with a 1-6 second fragment (the athlete pressing
 * lap/stop, an auto-lap firing at the finish, a device split). Both reference
 * workouts on CW-386 end in one. Fifteen seconds is the shortest step that
 * appears in real prescriptions - 15s microbursts and strides are common, 10s
 * ones are not - so a segment shorter than that is far more likely to be an
 * artefact than a prescribed effort. The bar is lowered further when the plan
 * itself asks for something shorter, so a 10-second sprint session still
 * matches its own reps.
 */
const STUB_SEGMENT_MAX_SECONDS = 15

function dropStubSegments(
  actualIntervals: ActualInterval[],
  plannedSteps: FlattenedPlannedStep[]
): ActualInterval[] {
  const shortestPlanned = plannedSteps.reduce(
    (shortest, step) =>
      step.durationSeconds > 0 ? Math.min(shortest, step.durationSeconds) : shortest,
    Number.POSITIVE_INFINITY
  )
  const threshold = Math.min(STUB_SEGMENT_MAX_SECONDS, shortestPlanned)
  const kept = actualIntervals.filter((interval) => interval.durationSeconds >= threshold)
  // Never let the filter empty the list: a session made entirely of very short
  // segments is a segmentation problem, not a reason to report no execution.
  return kept.length > 0 ? kept : actualIntervals
}

/**
 * How well one planned step and one actual segment go together. Positive means
 * pairing them is better than leaving both unpaired.
 *
 * Classification dominates - a work rep must never be scored against a recovery
 * lap - and duration breaks the ties between candidate reps.
 */
function scorePlannedActualAffinity(planned: FlattenedPlannedStep, actual: ActualInterval): number {
  const classificationScore = planned.classification === actual.classification ? 1 : -1.5
  const longest = Math.max(planned.durationSeconds, actual.durationSeconds)
  const durationRatio =
    longest > 0 ? Math.min(planned.durationSeconds, actual.durationSeconds) / longest : 0
  // Centred on 0.5 so a same-classification pair with wildly different
  // durations is still worth making, while a cross-classification pair is not.
  return classificationScore + (durationRatio - 0.5)
}

/**
 * Cost of leaving a planned step or an actual segment unpaired. Two gaps
 * (-0.7) must be cheaper than forcing a work step onto a recovery lap (-1.0)
 * and dearer than any same-classification pairing (>= +0.1), which is what
 * keeps rep N against rep N when the actual list has extra or missing segments.
 */
const ALIGNMENT_GAP_PENALTY = -0.35

/**
 * Align a plan's steps to the segments the athlete actually executed.
 *
 * Pairing by array index breaks on the first structural mismatch: one extra
 * lap, one missing rep or one stub fragment shifts every later comparison, so
 * the athlete gets scored against the wrong step from that point on (CW-386).
 *
 * This is a Needleman-Wunsch global alignment over the two sequences, keyed on
 * classification plus duration, with a fixed gap penalty. It is O(n*m) in a
 * space where both sides are tens of entries, it preserves order (rep 3 can
 * never be matched before rep 2), and unlike a forward greedy scan it can pay
 * for a local mismatch to keep the rest of the sequence aligned.
 *
 * This is the one alignment used by adherence scoring and by source
 * arbitration; new consumers should call it rather than re-pairing by index.
 */
export function alignPlannedToActualIntervals(
  plannedSteps: FlattenedPlannedStep[],
  actualIntervals: ActualInterval[]
): PlannedActualAlignment {
  const actualSegments = dropStubSegments(actualIntervals, plannedSteps)
  const droppedStubs = actualIntervals.length - actualSegments.length

  const emptyResult = (): PlannedActualAlignment => ({
    pairs: plannedSteps.map((planned, plannedIndex) => ({
      planned,
      plannedIndex,
      actual: null,
      actualIndex: null
    })),
    extraActual: actualSegments.map((actual, actualIndex) => ({ actual, actualIndex })),
    actualSegments,
    droppedStubs
  })

  if (plannedSteps.length === 0 || actualSegments.length === 0) return emptyResult()

  const plannedCount = plannedSteps.length
  const actualCount = actualSegments.length

  // score[i][j] = best score for aligning the first i planned steps with the
  // first j actual segments.
  const score: number[][] = Array.from({ length: plannedCount + 1 }, () =>
    new Array<number>(actualCount + 1).fill(0)
  )
  for (let i = 1; i <= plannedCount; i++) score[i]![0] = i * ALIGNMENT_GAP_PENALTY
  for (let j = 1; j <= actualCount; j++) score[0]![j] = j * ALIGNMENT_GAP_PENALTY

  for (let i = 1; i <= plannedCount; i++) {
    for (let j = 1; j <= actualCount; j++) {
      const pairScore =
        score[i - 1]![j - 1]! +
        scorePlannedActualAffinity(plannedSteps[i - 1]!, actualSegments[j - 1]!)
      const skipPlanned = score[i - 1]![j]! + ALIGNMENT_GAP_PENALTY
      const skipActual = score[i]![j - 1]! + ALIGNMENT_GAP_PENALTY
      score[i]![j] = Math.max(pairScore, skipPlanned, skipActual)
    }
  }

  const pairs: PlannedActualPair[] = plannedSteps.map((planned, plannedIndex) => ({
    planned,
    plannedIndex,
    actual: null,
    actualIndex: null
  }))
  const claimedActual = new Array<boolean>(actualCount).fill(false)

  // Traceback. Where several alignments score identically - four interchangeable
  // reps against three executed ones, one planned warmup against two warmup laps
  // - the tie is broken in favour of putting the gaps at the END of the
  // sequence, which is why the gap branches are tested before the pairing one on
  // a walk backwards. An athlete who cuts a session short drops the last rep,
  // not the first, and an extra lap is far more often a trailing fragment than a
  // sign that rep 1 never happened.
  let i = plannedCount
  let j = actualCount
  while (i > 0 && j > 0) {
    const pairScore =
      score[i - 1]![j - 1]! +
      scorePlannedActualAffinity(plannedSteps[i - 1]!, actualSegments[j - 1]!)
    if (score[i]![j] === score[i - 1]![j]! + ALIGNMENT_GAP_PENALTY) {
      i--
    } else if (score[i]![j] === score[i]![j - 1]! + ALIGNMENT_GAP_PENALTY) {
      j--
    } else if (score[i]![j] === pairScore) {
      pairs[i - 1]!.actual = actualSegments[j - 1]!
      pairs[i - 1]!.actualIndex = j - 1
      claimedActual[j - 1] = true
      i--
      j--
    } else {
      // Unreachable: score[i][j] is the max of exactly these three moves.
      i--
      j--
    }
  }

  const extraActual = actualSegments
    .map((actual, actualIndex) => ({ actual, actualIndex }))
    .filter(({ actualIndex }) => !claimedActual[actualIndex])

  return { pairs, extraActual, actualSegments, droppedStubs }
}

function scoreIntervalStructure(
  actualIntervals: ActualInterval[],
  plannedSteps: FlattenedPlannedStep[],
  refs: AnalysisRefs
): number {
  if (actualIntervals.length === 0) return 0

  const alignment = alignPlannedToActualIntervals(plannedSteps, actualIntervals)
  let score = 0

  for (const pair of alignment.pairs) {
    const planned = pair.planned
    const actual = pair.actual
    // Unpaired planned steps are charged below, once, as a structure penalty.
    if (!actual) continue
    score += planned.classification === actual.classification ? 1.5 : -1

    const durationRatio =
      Math.min(planned.durationSeconds, actual.durationSeconds) /
      Math.max(planned.durationSeconds, actual.durationSeconds)
    score += durationRatio

    if (planned.metric === 'power' && actual.avgPower !== null && actual.avgPower > 0) {
      const bounds = resolveComparableTargetBounds(planned, refs)
      const target = resolveComparableTargetValue(planned, refs)
      if (bounds && actual.avgPower >= bounds.start && actual.avgPower <= bounds.end) {
        score += 0.8
      } else if (target !== null && target > 0) {
        const delta = Math.abs(actual.avgPower - target) / Math.max(1, target)
        score += Math.max(0, 1 - delta) * 0.8
      }
    }

    if (planned.metric === 'heartRate' && actual.avgHr !== null) {
      const bounds = resolveComparableTargetBounds(planned, refs)
      const target = resolveComparableTargetValue(planned, refs)
      if (bounds && actual.avgHr >= bounds.start && actual.avgHr <= bounds.end) {
        score += 0.6
      } else if (target !== null && target > 0) {
        const delta = Math.abs(actual.avgHr - target) / Math.max(1, target)
        score += Math.max(0, 1 - delta * 3) * 0.6
      }
    }

    if (planned.metric === 'pace' && actual.avgSpeed !== null) {
      const bounds = resolveComparableTargetBounds(planned, refs)
      const target = resolveComparableTargetValue(planned, refs)
      if (bounds && actual.avgSpeed >= bounds.start && actual.avgSpeed <= bounds.end) {
        score += 0.6
      } else if (target !== null && target > 0) {
        const delta = Math.abs(actual.avgSpeed - target) / Math.max(0.1, target)
        score += Math.max(0, 1 - delta * 4) * 0.6
      }
    }

    if (planned.cadence !== null && actual.avgCadence !== null) {
      const cadenceTolerance = planned.ramp ? 8 : 5
      score +=
        Math.max(0, 1 - Math.abs(actual.avgCadence - planned.cadence) / (cadenceTolerance * 2)) *
        0.8
    }

    if (actual.matchScore !== null) score += actual.matchScore * 0.6
    if (actual.confidence !== null) score += actual.confidence * 0.5
  }

  // Structure penalty, now counted from the alignment itself: every planned
  // step that found no counterpart and every actual segment nothing claimed.
  // Dropped stubs are deliberately not charged - they are device noise, not a
  // structural difference between the two candidate segmentations.
  const unpairedPlanned = alignment.pairs.filter((pair) => pair.actual === null).length
  score -= (unpairedPlanned + alignment.extraActual.length) * 0.8

  const comparableActual = alignment.actualSegments
  const plannedTerminalRecovery = plannedSteps.at(-2)?.classification === 'recovery'
  const actualTerminalRecovery = comparableActual.at(-2)?.classification === 'recovery'
  const actualEndsWithCooldown = comparableActual.at(-1)?.type === 'COOLDOWN'
  if (plannedTerminalRecovery && actualEndsWithCooldown && !actualTerminalRecovery) {
    score -= 2.25
  }

  return round(score, 2) || 0
}

function getPlannedHardRepeats(plannedSteps: FlattenedPlannedStep[], refs: AnalysisRefs) {
  return plannedSteps.filter((step) => {
    if (step.classification !== 'work') return false
    if (step.intensityFactor !== null) return step.intensityFactor >= 0.95
    if (step.metric === 'power' && step.targetValue !== null && refs.ftp > 0) {
      const watts = step.targetValue <= 2 ? step.targetValue * refs.ftp : step.targetValue
      return watts >= refs.ftp * 0.95
    }
    return false
  })
}

function getActualHardRepeats(actualIntervals: ActualInterval[], refs: AnalysisRefs) {
  return actualIntervals.filter((interval) => {
    if (interval.classification !== 'work') return false
    // `intensity` is an intensity factor, so 0.95 is 95% of threshold.
    if (interval.intensity !== null) return interval.intensity >= 0.95
    if (interval.avgPower !== null && refs.ftp > 0) return interval.avgPower >= refs.ftp * 0.95
    return false
  })
}

function scoreHardRepeatDurationAccuracy(
  actualIntervals: ActualInterval[],
  plannedSteps: FlattenedPlannedStep[],
  refs: AnalysisRefs
): number | null {
  const plannedHard = getPlannedHardRepeats(plannedSteps, refs)
  const actualHard = getActualHardRepeats(actualIntervals, refs)

  if (plannedHard.length < 2 || actualHard.length === 0) return null

  const pairs = Math.min(plannedHard.length, actualHard.length)
  if (pairs === 0) return null

  let score = 0
  for (let index = 0; index < pairs; index++) {
    const planned = plannedHard[index]!
    const actual = actualHard[index]!
    const durationRatio =
      Math.min(planned.durationSeconds, actual.durationSeconds) /
      Math.max(planned.durationSeconds, actual.durationSeconds)
    score += durationRatio * 3

    if (
      planned.metric === 'power' &&
      planned.targetValue !== null &&
      actual.avgPower !== null &&
      refs.ftp > 0
    ) {
      const targetPower =
        planned.targetValue <= 2 ? planned.targetValue * refs.ftp : planned.targetValue
      const delta = Math.abs(actual.avgPower - targetPower) / Math.max(1, targetPower)
      score += Math.max(0, 1 - delta * 2)
    }
  }

  score -= Math.abs(plannedHard.length - actualHard.length) * 0.5
  return round(score / pairs, 3)
}

function chooseActualIntervalsSource(
  rawActual: ActualInterval[],
  detectedActual: ActualInterval[],
  plannedSteps: FlattenedPlannedStep[],
  refs: AnalysisRefs
): 'raw' | 'detected' {
  const rawHardRepeatScore = scoreHardRepeatDurationAccuracy(rawActual, plannedSteps, refs)
  const detectedHardRepeatScore = scoreHardRepeatDurationAccuracy(
    detectedActual,
    plannedSteps,
    refs
  )

  if (rawHardRepeatScore !== null && detectedHardRepeatScore !== null) {
    const hardRepeatDelta = rawHardRepeatScore - detectedHardRepeatScore
    if (Math.abs(hardRepeatDelta) >= 0.08) {
      return hardRepeatDelta > 0 ? 'raw' : 'detected'
    }
  }

  const rawScore = scoreIntervalStructure(rawActual, plannedSteps, refs)
  const detectedScore = scoreIntervalStructure(detectedActual, plannedSteps, refs)

  return detectedScore >= rawScore ? 'detected' : 'raw'
}

function hasTerminalRecoveryPhase(workout: any, plannedWorkout: any, refs: AnalysisRefs): boolean {
  const plannedSteps = flattenPlannedSteps(
    getStructuredSteps(plannedWorkout?.structuredWorkout),
    refs
  )
  const lastPlannedStep = plannedSteps.at(-1)
  if (lastPlannedStep?.classification === 'recovery' && lastPlannedStep.durationSeconds >= 120) {
    return true
  }

  const lastActualInterval = extractActualIntervals(workout, plannedWorkout, refs).at(-1)
  return Boolean(
    lastActualInterval?.classification === 'recovery' &&
    (lastActualInterval.durationSeconds || 0) >= 120
  )
}

function extractActualIntervals(
  workout: any,
  plannedWorkout?: any,
  refsInput?: AnalysisRefs
): ActualInterval[] {
  const refs = resolveAnalysisRefs(workout, refsInput)
  const rawIntervals = getRawIntervals(workout)
  const rawActual = mapProviderIntervalsToActual(rawIntervals)
  const detectedActual = buildDetectedIntervals(workout, plannedWorkout, refs)

  if (rawActual.length === 0) return detectedActual
  if (detectedActual.length === 0) return rawActual

  const plannedSteps = flattenPlannedSteps(
    getStructuredSteps(
      plannedWorkout?.structuredWorkout || workout?.plannedWorkout?.structuredWorkout
    ),
    refs
  )

  if (plannedSteps.length === 0) return rawActual

  const source = chooseActualIntervalsSource(rawActual, detectedActual, plannedSteps, refs)
  return source === 'detected' ? detectedActual : rawActual
}

export function getPlannedWorkIntervalsForAnalysis(
  plannedWorkout: any,
  refs: AnalysisRefs
): FlattenedPlannedStep[] {
  const steps = getStructuredSteps(plannedWorkout?.structuredWorkout)
  return flattenPlannedSteps(steps, refs).filter((s) => s.classification === 'work')
}

export function getActualIntervalsForAnalysis(
  workout: any,
  plannedWorkout?: any,
  refs?: AnalysisRefs
): ActualIntervalForAnalysis[] {
  return extractActualIntervals(workout, plannedWorkout, refs)
}

export function getActualIntervalsSourceForAnalysis(
  workout: any,
  plannedWorkout?: any,
  refsInput?: AnalysisRefs
): 'raw' | 'detected' | 'none' {
  const refs = resolveAnalysisRefs(workout, refsInput)
  const rawIntervals = getRawIntervals(workout)
  const rawActual = mapProviderIntervalsToActual(rawIntervals)
  const detectedActual = buildDetectedIntervals(workout, plannedWorkout, refs)

  if (rawActual.length === 0) return detectedActual.length > 0 ? 'detected' : 'none'
  if (detectedActual.length === 0) return 'raw'

  const plannedSteps = flattenPlannedSteps(
    getStructuredSteps(
      plannedWorkout?.structuredWorkout || workout?.plannedWorkout?.structuredWorkout
    ),
    refs
  )

  if (plannedSteps.length === 0) return 'raw'

  return chooseActualIntervalsSource(rawActual, detectedActual, plannedSteps, refs)
}

/**
 * Render the detected/synced actual intervals as compact prompt rows.
 *
 * The workout-family context needed for cadence units and pace comes off the
 * `workout` row this function already receives, so the exported signature is
 * unchanged for `cli/debug/workout-facts.ts`, `scripts/dump-intervals.ts` and
 * `trigger/analyze-plan-adherence.ts` (CW-387).
 */
export function formatActualIntervalsForPrompt(
  workout: any,
  plannedWorkout?: any,
  refs?: AnalysisRefs
): string {
  const intervals = getActualIntervalsForAnalysis(workout, plannedWorkout, refs)
  if (intervals.length === 0) return 'N/A'

  const workoutType = workout?.type
  const family = getWorkoutFamily(workoutType)
  const isRunningFamily = family === 'run'
  // Pace is the leading metric for runs and useful for the other distance
  // sports; it is noise for indoor/strength work and for power-primary rides.
  const paceCapable = family !== 'ride' && family !== 'strength'

  return intervals
    .map((interval, idx) => {
      const minutes = Math.floor(interval.durationSeconds / 60)
      const seconds = interval.durationSeconds % 60
      const duration = `${minutes}m ${seconds}s`
      const avgPower = interval.avgPower != null ? `${Math.round(interval.avgPower)}W` : 'N/A'
      const avgHr = interval.avgHr != null ? `${Math.round(interval.avgHr)}bpm` : 'N/A'
      // Doubled here (once) so a run's legs read as steps per minute, matching
      // the unit label and the session-level cadence line.
      const avgCadence = formatCadenceWithUnit(
        toCanonicalCadence(interval.avgCadence, isRunningFamily),
        workoutType,
        ''
      )
      // `ActualInterval.avgSpeed` is m/s; 1000 / (m/s) is seconds per km.
      const avgPace = paceCapable
        ? ` | ${
            interval.avgSpeed != null && Number.isFinite(interval.avgSpeed) && interval.avgSpeed > 0
              ? formatPromptPace(1000 / interval.avgSpeed)
              : 'N/A'
          }`
        : ''
      const confidence =
        interval.confidence != null ? ` | conf ${(interval.confidence * 100).toFixed(0)}%` : ''
      const note = interval.ambiguityNote ? ` | note ${interval.ambiguityNote}` : ''
      return `Int ${idx + 1}: ${duration} | ${interval.type} | ${avgPower} | ${avgHr} | ${avgCadence}${avgPace}${confidence}${note}`
    })
    .join('\n      ')
}

function rateConfidence(score: number): FactConfidence {
  if (score >= 0.75) return 'high'
  if (score >= 0.4) return 'medium'
  return 'low'
}

/**
 * Median of the finite entries; `null` when there are none.
 *
 * `null` and `undefined` are dropped rather than coerced — `Number(null)` is a
 * perfectly finite `0`, which would drag a median of real intensity factors
 * toward zero every time a step carried no target.
 */
function medianOf(values: Array<number | null | undefined>): number | null {
  const finite = values
    .filter((value) => value !== null && value !== undefined)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)
  if (finite.length === 0) return null
  const middle = Math.floor(finite.length / 2)
  return finite.length % 2 === 1 ? finite[middle]! : (finite[middle - 1]! + finite[middle]!) / 2
}

/**
 * Whole-word race markers for the title/description.
 *
 * Substring matching used to be the rule here, which made `'event'` fire on
 * `prevention`, `eventually` and `events`, and `'race'` fire on `racecourse`
 * and `terrace` (CW-396). Word boundaries fix those, but they do not rescue a
 * bare `event`: `'Recovery spin after event'` is a whole-word match and still
 * is not a race. The bare token is therefore gone, and only phrasings that
 * actually frame the session as the event itself remain.
 */
const RACE_TITLE_PATTERN =
  /\b(?:races?|racing|criteriums?|triathlons?|marathons?|event day|goal event|target event|a[- ]event)\b/

function detectRaceContext(titleContext: string): boolean {
  return RACE_TITLE_PATTERN.test(titleContext)
}

function classifyArchetype(params: {
  workout: any
  family: ReturnType<typeof getWorkoutFamily>
  analysisMode: AnalysisMode
  erg: ReturnType<typeof detectErg>
  plannedWorkout: any
  powerSourceType: PowerSourceType
  hrUsable: boolean
  motionPattern: MotionPattern
  refs: AnalysisRefs
}): WorkoutAnalysisFactsV2['guardrails']['archetype'] {
  const {
    workout,
    family,
    analysisMode,
    erg,
    plannedWorkout,
    powerSourceType,
    hrUsable,
    motionPattern,
    refs
  } = params
  const rationale: string[] = []
  const titleContext = `${workout?.title || ''} ${workout?.description || ''}`.toLowerCase()
  const virtualContext =
    `${workout?.source || ''} ${workout?.type || ''} ${workout?.deviceName || ''} ${workout?.title || ''} ${workout?.description || ''}`.toLowerCase()
  const plannedSteps = flattenPlannedSteps(
    getStructuredSteps(plannedWorkout?.structuredWorkout),
    refs
  )
  const workSteps = plannedSteps.filter((step) => step.classification === 'work')
  const actualIntervals = extractActualIntervals(workout, plannedWorkout, refs)
  const actualWorkIntervals = actualIntervals.filter(
    (interval) => interval.classification === 'work'
  )
  const intervalCount = actualWorkIntervals.length
  const vi = Number(workout?.variabilityIndex || 0)
  const intensity = Number.isFinite(Number(workout?.intensity)) ? Number(workout.intensity) : null
  const isRace = detectRaceContext(titleContext)

  // Evidence for the "repeated reps" vo2 arm (CW-396). The arm used to fire on
  // `intervalCount >= 6` alone, which is a count with no reference to how hard
  // the reps were: six 6-minute tempo blocks came back as `vo2` and the session
  // was then judged against VO2max expectations it was never meant to meet.
  //
  // Planned targets are the better evidence when a plan exists (they state the
  // athlete's intent); measured rep intensity is the fallback. Both are on the
  // same fraction-of-threshold scale. The median, not the max, so a single
  // sprint lap inside an otherwise steady set does not carry the whole session.
  const plannedWorkIntensityFactor = medianOf(workSteps.map((step) => step.intensityFactor))
  const repIntensityFactor =
    plannedWorkIntensityFactor ??
    medianOf(actualWorkIntervals.map((interval) => interval.intensity))
  // Duration is a shape proxy, only consulted when there is no intensity signal
  // at all (engine-detected intervals never carry one). Reps this short are not
  // sustainable at tempo, so repeating six of them is VO2-shaped by itself.
  const medianWorkRepSeconds = medianOf(
    actualWorkIntervals.map((interval) => interval.durationSeconds || null)
  )
  const hasRepeatedReps = intervalCount >= 6
  const plannedVo2Target = workSteps.some((step) => (step.intensityFactor || 0) >= 1.15)
  const repeatedHardReps =
    hasRepeatedReps && repIntensityFactor !== null && repIntensityFactor >= 1.1
  const repeatedShortReps =
    hasRepeatedReps &&
    repIntensityFactor === null &&
    medianWorkRepSeconds !== null &&
    medianWorkRepSeconds <= 300

  let primaryArchetype: PrimaryArchetype
  if (family === 'strength') primaryArchetype = 'strength'
  else if (isRace) {
    primaryArchetype = 'race'
    rationale.push('Workout title or description indicates an event/race context.')
  } else if (plannedVo2Target || repeatedHardReps || repeatedShortReps) {
    primaryArchetype = 'vo2'
    // Say which evidence actually fired; the old unconditional "Repeated hard
    // work intervals detected." asserted a hardness nothing in the arm checked.
    if (plannedVo2Target)
      rationale.push('Planned work steps target supra-threshold intensity (IF >= 1.15).')
    else if (repeatedHardReps)
      rationale.push(
        `${intervalCount} work reps at a median intensity factor of ${repIntensityFactor!.toFixed(2)} indicate repeated hard efforts.`
      )
    else {
      const repLength =
        medianWorkRepSeconds! >= 60
          ? `${(medianWorkRepSeconds! / 60).toFixed(1)}min`
          : `${Math.round(medianWorkRepSeconds!)}s`
      rationale.push(
        `${intervalCount} work reps with a median length of ${repLength} and no recorded intensity; short repeated reps are treated as VO2-shaped.`
      )
    }
  } else if (workSteps.some((step) => (step.intensityFactor || 0) >= 1.03)) {
    primaryArchetype = 'threshold'
    rationale.push('Planned work steps cluster around threshold intensity.')
  } else if (workSteps.some((step) => (step.intensityFactor || 0) >= 0.88)) {
    primaryArchetype = 'tempo'
    rationale.push('Planned work steps indicate sustained sub-threshold work.')
  } else if (intensity !== null && intensity <= 0.7 && (workout?.durationSec || 0) >= 1800) {
    primaryArchetype = 'recovery'
    rationale.push('Low intensity with meaningful duration suggests a recovery session.')
  } else if (
    (intensity !== null && intensity <= 0.85) ||
    analysisMode === 'pace' ||
    ((family === 'ride' || family === 'run') &&
      (workout?.durationSec || 0) >= 1800 &&
      vi > 0 &&
      vi <= 1.06)
  ) {
    primaryArchetype = 'endurance'
    rationale.push('Intensity and signal mode align with aerobic endurance work.')
  } else {
    primaryArchetype = 'mixed'
    rationale.push('Workout contains mixed signals without a single dominant intent.')
  }

  if (motionPattern.stopGoLikely && family !== 'ride' && family !== 'run') {
    primaryArchetype = 'mixed'
    rationale.push('Stop-and-go motion pattern overrides steady aerobic archetype assumptions.')
  }

  let executionEnvironment: ExecutionEnvironment = 'unknown'
  if (
    String(workout?.type || '')
      .toLowerCase()
      .includes('treadmill')
  )
    executionEnvironment = 'treadmill'
  else if (erg.detected) executionEnvironment = 'indoor_erg'
  else if (
    [
      'zwift',
      'virtualride',
      'virtual run',
      'virtualrun',
      'trainerroad',
      'rouvy',
      'bkool',
      'wahoo systm'
    ].some((token) => virtualContext.includes(token))
  ) {
    executionEnvironment = 'indoor_resistance'
    rationale.push('Virtual platform context indicates an indoor trainer or treadmill session.')
  } else if (workout?.trainer) executionEnvironment = 'indoor_resistance'
  else if (family === 'ride' || family === 'run') executionEnvironment = 'outdoor_free'

  let primaryMetric: PrimaryMetric = 'mixed'
  if (powerSourceType === 'measured') primaryMetric = hrUsable ? 'mixed' : 'power'
  else if (family === 'run') primaryMetric = 'pace'
  else if (hrUsable) primaryMetric = 'hr'
  else if (workout?.rpe || workout?.sessionRpe) primaryMetric = 'subjective'

  let sessionSteadiness: SessionSteadiness
  if (intervalCount >= 3 || workSteps.length >= 3) sessionSteadiness = 'intervalled'
  else if (motionPattern.stopGoLikely) sessionSteadiness = 'stochastic'
  else if (vi >= 1.12) sessionSteadiness = 'stochastic'
  else if (vi >= 1.06) sessionSteadiness = 'rolling'
  else if (workout?.durationSec >= 1800) sessionSteadiness = 'steady'
  else sessionSteadiness = 'rolling'

  if (sessionSteadiness === 'intervalled')
    rationale.push('Multiple work intervals indicate intervalled execution.')
  else if (sessionSteadiness === 'stochastic')
    rationale.push(
      motionPattern.stopGoLikely
        ? 'Stop-and-go motion pattern suggests stochastic pacing.'
        : 'High variability suggests stochastic pacing.'
    )
  else if (sessionSteadiness === 'steady')
    rationale.push('Low variability suggests steady-state execution.')

  return {
    primaryArchetype,
    executionEnvironment,
    primaryMetric,
    sessionSteadiness,
    confidence: rateConfidence(
      [
        (primaryArchetype as string) !== 'unknown',
        (executionEnvironment as string) !== 'unknown',
        primaryMetric !== 'mixed' || analysisMode !== 'mixed',
        (sessionSteadiness as string) !== 'unknown'
      ].filter(Boolean).length / 4
    ),
    rationale
  }
}

function deriveDecouplingV2(params: {
  workout: any
  family: ReturnType<typeof getWorkoutFamily>
  hrUsable: boolean
  warmupExcludedMinutes: number
  archetype: WorkoutAnalysisFactsV2['guardrails']['archetype']
  motionPattern: MotionPattern
}): WorkoutAnalysisFactsV2['performanceSignals']['decoupling'] {
  const { workout, family, hrUsable, warmupExcludedMinutes, archetype, motionPattern } = params
  const base = deriveDecoupling(workout, hrUsable, warmupExcludedMinutes, family, motionPattern)

  if (family !== 'ride' && family !== 'run') {
    return {
      interpretable: false,
      reason:
        'Classic decoupling is only interpreted for ride/run modalities with stable workload semantics.',
      effective: null,
      direction: 'unknown' as const,
      confidence: 'low' as FactConfidence
    }
  }

  if (!hrUsable) {
    return {
      interpretable: false,
      reason: 'Heart-rate telemetry is not reliable enough for decoupling.',
      effective: base.effective,
      direction: 'unknown' as const,
      confidence: 'low' as FactConfidence
    }
  }

  if (!base.valid) {
    return {
      interpretable: false,
      reason: 'Not enough reliable post-warmup workload data for decoupling.',
      effective: base.effective,
      direction: 'unknown' as const,
      confidence: 'low' as FactConfidence
    }
  }

  if (motionPattern.stopGoLikely) {
    return {
      interpretable: false,
      reason: 'Stop-and-go motion pattern makes classic decoupling misleading for this workout.',
      effective: base.effective,
      direction: base.direction as DecouplingDirection | 'unknown',
      confidence: base.confidence as FactConfidence
    }
  }

  if (['intervalled', 'stochastic'].includes(archetype.sessionSteadiness)) {
    return {
      interpretable: false,
      reason: `Session steadiness is ${archetype.sessionSteadiness}, so classic decoupling would be misleading.`,
      effective: base.effective,
      direction: base.direction as DecouplingDirection | 'unknown',
      confidence: base.confidence as FactConfidence
    }
  }

  if (archetype.primaryArchetype === 'race') {
    return {
      interpretable: false,
      reason: 'Race-like sessions are too stochastic for classic decoupling.',
      effective: base.effective,
      direction: base.direction as DecouplingDirection | 'unknown',
      confidence: base.confidence as FactConfidence
    }
  }

  return {
    interpretable: true,
    reason: null,
    effective: base.effective,
    direction: base.direction as DecouplingDirection | 'unknown',
    confidence: base.confidence as FactConfidence
  }
}

function getZoneDominance(zoneTimes: unknown, prefix: 'Z' | 'HRZ') {
  const values = asNumberArray(zoneTimes)
  if (values.length === 0) return null
  const total = values.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return null
  let maxIndex = 0
  values.forEach((value, index) => {
    if (value > values[maxIndex]!) maxIndex = index
  })
  return `${prefix}${maxIndex + 1}`
}

function getTimeAboveThresholdPct(zoneTimes: unknown): number | null {
  const values = asNumberArray(zoneTimes)
  if (values.length < 4) return null
  const total = values.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return null
  const aboveThreshold = values.slice(3).reduce((sum, value) => sum + value, 0)
  return round((aboveThreshold / total) * 100, 1)
}

function computeZoneTimesFromSamples(samples: unknown, zones: any[] | null | undefined) {
  const values = asNumberArray(samples)
  if (values.length === 0 || !Array.isArray(zones) || zones.length === 0) return null

  const normalizedZones = zones
    .map((zone) => ({
      min: Number(zone?.min),
      max: Number(zone?.max)
    }))
    .filter((zone) => Number.isFinite(zone.min) && Number.isFinite(zone.max))

  if (normalizedZones.length === 0) return null

  const zoneTimes = new Array(normalizedZones.length).fill(0)

  for (const value of values) {
    const zoneIndex = normalizedZones.findIndex((zone, index) => {
      const isLast = index === normalizedZones.length - 1
      return value >= zone.min && (value <= zone.max || (isLast && value > zone.max))
    })
    if (zoneIndex >= 0) zoneTimes[zoneIndex] += 1
  }

  return zoneTimes.some((value) => value > 0) ? zoneTimes : null
}

function computeAverage(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function deriveMotionPattern(workout: any): MotionPattern {
  const speed = asNumberArray(workout?.streams?.velocity).filter((value) => Number.isFinite(value))
  if (speed.length < 120) {
    return {
      stopGoLikely: false,
      zeroSpeedRatio: null,
      speedCoV: null,
      speedSurgeRatio: null,
      rationale: []
    }
  }

  const moving = speed.filter((value) => value > 0.3)
  const zeroSpeedRatio = round(speed.filter((value) => value <= 0.3).length / speed.length, 3)
  const movingMean = computeAverage(moving)
  const variance =
    moving.length > 0 && movingMean
      ? moving.reduce((sum, value) => sum + Math.pow(value - movingMean, 2), 0) / moving.length
      : null
  const speedCoV =
    variance !== null && movingMean && movingMean > 0
      ? round(Math.sqrt(variance) / movingMean, 3)
      : null

  const movingSorted = [...moving].sort((a, b) => a - b)
  const percentile = (ratio: number) => {
    if (movingSorted.length === 0) return null
    const index = Math.min(
      movingSorted.length - 1,
      Math.max(0, Math.floor((movingSorted.length - 1) * ratio))
    )
    return movingSorted[index] ?? null
  }
  const p25 = percentile(0.25)
  const p90 = percentile(0.9)
  const speedSurgeRatio = p25 !== null && p90 !== null && p25 > 0 ? round(p90 / p25, 2) : null

  const rationale: string[] = []
  if ((zeroSpeedRatio ?? 0) >= 0.08) {
    rationale.push('Frequent near-zero speed samples indicate stop-and-go execution.')
  }
  if ((speedCoV ?? 0) >= 0.35) {
    rationale.push('Speed variability is too high for steady-state pacing interpretation.')
  }
  if ((speedSurgeRatio ?? 0) >= 2.4) {
    rationale.push('Large speed surges indicate intermittent explosive efforts.')
  }

  return {
    stopGoLikely: rationale.length > 0,
    zeroSpeedRatio,
    speedCoV,
    speedSurgeRatio,
    rationale
  }
}

/* -------------------------------------------------------------------------- */
/* Rep-scoped signal scope (CW-393)                                            */
/* -------------------------------------------------------------------------- */

/**
 * Durability and stability signals answer "how consistent was the effort?".
 * For a steady ride the session IS the effort, so a session-wide statistic
 * answers the question. For an interval session it does not: a coefficient of
 * variation measured across warmup + reps + recovery jogs describes the SHAPE
 * of the session, not the athlete's execution, and a perfectly ridden 4x4min
 * therefore scored near zero on "execution stability" and ~20/100 on
 * "repeatability" once an endurance-buffer block was averaged in with the
 * threshold reps.
 *
 * `deriveDecouplingV2` and the `paceDriftApplicable` gate already refuse to
 * answer when the session shape makes the number meaningless. The helpers below
 * extend the same discipline to the remaining signals: for intervalled and
 * stochastic sessions they are measured over the comparable work reps, and when
 * no comparable rep set can be formed the signal is withheld WITH A REASON
 * rather than quietly falling back to the session-wide figure.
 */

/**
 * How similar two efforts' durations must be before they count as repetitions
 * of the same thing. 0.75 keeps a 4:00 rep together with a 3:05 one (cutting a
 * rep short is still doing that rep) while separating 4-minute threshold reps
 * from a long endurance-buffer block.
 */
const COMPARABLE_REP_DURATION_RATIO = 0.75

/**
 * How far two PLANNED targets may sit apart and still describe the same
 * prescription. Tight, because this compares what was ASKED for rather than
 * what was done: 0.95 IF and 1.05 IF are different steps.
 */
const COMPARABLE_PLANNED_TARGET_TOLERANCE = 0.1

/**
 * How far two EXECUTED efforts may sit apart and still be grouped as the same
 * rep type when there is no plan to group by.
 *
 * Deliberately loose. Grouping executed reps by how alike they are is circular,
 * and too tight a bar would split a genuine fade into two internally
 * "consistent" groups and then report the larger one — the mirror image of the
 * lie this ticket fixes. 0.25 is wide enough that any realistic fade stays
 * inside one group and is scored honestly, and narrow enough to separate a
 * Z2 buffer block from threshold reps.
 */
const COMPARABLE_ACTUAL_EFFORT_TOLERANCE = 0.25

/** Fewest comparable reps a rep-scoped repeatability number may be built from. */
const MIN_COMPARABLE_REPS = 3

function durationSimilarity(a: number, b: number): number {
  const longest = Math.max(a, b)
  return longest > 0 ? Math.min(a, b) / longest : 0
}

function relativeDelta(a: number, b: number): number {
  const largest = Math.max(Math.abs(a), Math.abs(b))
  return largest > 0 ? Math.abs(a - b) / largest : 0
}

function positiveOrNull(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) && value > 0 ? value : null
}

/** Coefficient of variation as a percentage; `null` when it is undefined. */
function coefficientOfVariationPct(values: number[]): number | null {
  if (values.length < 2) return null
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  if (!(mean > 0)) return null
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length
  return (Math.sqrt(variance) / mean) * 100
}

type RepEffortSource = 'speed' | 'power' | 'intensity'

/**
 * One effort number per rep, all drawn from the SAME channel.
 *
 * Mixing channels here would be a units bug rather than a rounding one — raw
 * watts sitting next to an intensity factor — so a channel is only used when
 * every rep in the set carries it.
 */
function resolveRepEfforts(
  reps: ActualInterval[],
  family: ReturnType<typeof getWorkoutFamily>
): { values: number[]; source: RepEffortSource } | null {
  if (reps.length === 0) return null
  const channels: Array<{ source: RepEffortSource; read: (rep: ActualInterval) => number | null }> =
    family === 'run'
      ? [
          { source: 'speed', read: (rep) => positiveOrNull(rep.avgSpeed) },
          { source: 'power', read: (rep) => positiveOrNull(rep.avgPower) },
          { source: 'intensity', read: (rep) => positiveOrNull(rep.intensity) }
        ]
      : [
          { source: 'power', read: (rep) => positiveOrNull(rep.avgPower) },
          { source: 'intensity', read: (rep) => positiveOrNull(rep.intensity) },
          { source: 'speed', read: (rep) => positiveOrNull(rep.avgSpeed) }
        ]

  for (const channel of channels) {
    const values = reps.map(channel.read)
    if (values.every((value): value is number => value !== null)) {
      return { values, source: channel.source }
    }
  }
  return null
}

/**
 * Greedy order-preserving clustering.
 *
 * A candidate joins a cluster only when it is comparable to EVERY member, not
 * merely to a representative: transitive drift is precisely how a 4-minute rep
 * ends up in the same group as a 20-minute block.
 */
function clusterComparable<T>(items: T[], comparable: (a: T, b: T) => boolean): T[][] {
  const clusters: T[][] = []
  for (const item of items) {
    const target = clusters.find((cluster) => cluster.every((member) => comparable(member, item)))
    if (target) target.push(item)
    else clusters.push([item])
  }
  return clusters
}

/** Do two planned work steps prescribe the same effort? */
function plannedPrescriptionMatches(
  a: FlattenedPlannedStep,
  b: FlattenedPlannedStep,
  refs: AnalysisRefs
): boolean {
  if (a.metric !== b.metric) return false
  if (durationSimilarity(a.durationSeconds, b.durationSeconds) < COMPARABLE_REP_DURATION_RATIO) {
    return false
  }
  const targetA = a.intensityFactor ?? resolveComparableTargetValue(a, refs)
  const targetB = b.intensityFactor ?? resolveComparableTargetValue(b, refs)
  // With no resolvable target on either side, duration is all the evidence
  // there is; with one resolvable and one not, they are not comparable.
  if (targetA === null || targetB === null) return targetA === targetB
  return relativeDelta(targetA, targetB) <= COMPARABLE_PLANNED_TARGET_TOLERANCE
}

/** Do two executed segments look like repetitions of the same effort? */
function executedRepsAreComparable(
  a: ActualInterval,
  b: ActualInterval,
  family: ReturnType<typeof getWorkoutFamily>
): boolean {
  if (durationSimilarity(a.durationSeconds, b.durationSeconds) < COMPARABLE_REP_DURATION_RATIO) {
    return false
  }
  const efforts = resolveRepEfforts([a, b], family)
  if (!efforts) return true
  return relativeDelta(efforts.values[0]!, efforts.values[1]!) <= COMPARABLE_ACTUAL_EFFORT_TOLERANCE
}

function meanRepEffort(
  reps: ActualInterval[],
  family: ReturnType<typeof getWorkoutFamily>
): number {
  const efforts = resolveRepEfforts(reps, family)
  return efforts ? (computeAverage(efforts.values) ?? 0) : 0
}

/**
 * The set of comparable work reps the rep-scoped signals are measured over.
 *
 * `active` is the session-shape gate; `reps` is empty with a `reason` whenever
 * the session is rep-scoped but no usable rep set exists. Callers must never
 * substitute a session-wide number when `active` is true and `reps` is empty —
 * presenting the session-wide figure as applicable is the bug being fixed.
 */
type RepScope = {
  active: boolean
  reps: ActualInterval[]
  basis: 'planned_step' | 'duration_intensity' | null
  reason: string | null
  /**
   * Planned work steps the alignment found no segment for at all. These are
   * genuine misses (execution evidence, CW-385/CW-386) rather than segments
   * that merely lack a measurement, so they are reported in the withholding
   * reason instead of being silently dropped. Whether a missed rep is a problem
   * is adherence's question (`workIntervalHitRate`), not repeatability's.
   */
  missedPlannedReps: number
  /** The unfiltered actual intervals, so callers need not extract them twice. */
  allActualIntervals: ActualInterval[]
}

function resolveRepScope(params: {
  workout: any
  plannedWorkout?: any
  family: ReturnType<typeof getWorkoutFamily>
  refs: AnalysisRefs
  archetype: WorkoutAnalysisFactsV2['guardrails']['archetype']
}): RepScope {
  const { workout, plannedWorkout, family, refs, archetype } = params
  const allActualIntervals = extractActualIntervals(workout, plannedWorkout, refs)
  // The same shapes `deriveDecouplingV2` refuses to interpret session-wide.
  const active = ['intervalled', 'stochastic'].includes(archetype.sessionSteadiness)

  if (!active) {
    return {
      active: false,
      reps: [],
      basis: null,
      reason: null,
      missedPlannedReps: 0,
      allActualIntervals
    }
  }

  const plannedSteps = flattenPlannedSteps(
    getStructuredSteps(
      plannedWorkout?.structuredWorkout || workout?.plannedWorkout?.structuredWorkout
    ),
    refs
  )
  // CW-386's alignment, not a re-pairing by index: `pairs` already knows which
  // segment each planned step was executed as, and `actualSegments` is already
  // free of lap-button stubs.
  const alignment = alignPlannedToActualIntervals(plannedSteps, allActualIntervals)
  const workPairs = alignment.pairs.filter((pair) => pair.planned.classification === 'work')
  const missedPlannedReps = workPairs.filter((pair) => pair.actual === null).length

  // Preferred basis: reps that were prescribed as the same thing. This is what
  // keeps an endurance-buffer block out of a threshold rep's company, and it
  // groups on the PRESCRIPTION rather than on the execution, so the athlete's
  // actual variation stays fully visible inside the group.
  if (workPairs.length >= MIN_COMPARABLE_REPS) {
    const dominant = clusterComparable(workPairs, (a, b) =>
      plannedPrescriptionMatches(a.planned, b.planned, refs)
    )
      .map((cluster) => ({
        reps: cluster
          .map((pair) => pair.actual)
          .filter((actual): actual is ActualInterval => actual !== null),
        intensity: Math.max(...cluster.map((pair) => pair.planned.intensityFactor ?? 0))
      }))
      .sort((a, b) => b.reps.length - a.reps.length || b.intensity - a.intensity)[0]

    if (dominant && dominant.reps.length >= MIN_COMPARABLE_REPS) {
      return {
        active,
        reps: dominant.reps,
        basis: 'planned_step',
        reason: null,
        missedPlannedReps,
        allActualIntervals
      }
    }
  }

  // No plan (or a plan that yielded too few aligned reps): group the executed
  // work segments by duration and effort similarity instead.
  const workSegments = alignment.actualSegments.filter(
    (interval) => interval.classification === 'work'
  )
  if (workSegments.length >= MIN_COMPARABLE_REPS) {
    const dominant = clusterComparable(workSegments, (a, b) =>
      executedRepsAreComparable(a, b, family)
    ).sort((a, b) => b.length - a.length || meanRepEffort(b, family) - meanRepEffort(a, family))[0]

    if (dominant && dominant.length >= MIN_COMPARABLE_REPS) {
      return {
        active,
        reps: dominant,
        basis: 'duration_intensity',
        reason: null,
        missedPlannedReps,
        allActualIntervals
      }
    }
  }

  const missNote =
    missedPlannedReps > 0
      ? ` (${missedPlannedReps} planned work rep${missedPlannedReps === 1 ? ' was' : 's were'} not executed at all)`
      : ''
  const reason =
    workSegments.length < MIN_COMPARABLE_REPS
      ? `This session is ${archetype.sessionSteadiness}, so the signal is measured across its work reps, and only ${workSegments.length} executed work rep${workSegments.length === 1 ? '' : 's'} could be identified${missNote}.`
      : `This session is ${archetype.sessionSteadiness}, so the signal is measured across comparable work reps, and no group of at least ${MIN_COMPARABLE_REPS} comparable reps could be formed${missNote} — a session-wide figure here would compare unlike efforts.`

  return {
    active,
    reps: [],
    basis: null,
    reason,
    missedPlannedReps,
    allActualIntervals
  }
}

/**
 * Mean per-rep coefficient of variation, measured INSIDE each rep.
 *
 * Delegates to `calculateStabilityMetrics`, which already implements per-interval
 * CoV via its `intervals` argument — the whole-session call sites pass `[]` and
 * read `overallCoV`, which is what makes the session-wide number meaningless
 * for an interval session.
 */
function repScopedStabilityCoV(reps: ActualInterval[], stream: number[]): number | null {
  if (stream.length === 0) return null
  const bounded = reps
    .filter(
      (rep) =>
        rep.startIndex !== null &&
        rep.endIndex !== null &&
        rep.startIndex < stream.length &&
        rep.endIndex > rep.startIndex
    )
    .map((rep) => ({
      type: 'WORK',
      start_index: rep.startIndex!,
      end_index: Math.min(rep.endIndex!, stream.length - 1)
    }))
  if (bounded.length === 0) return null

  const stability = calculateStabilityMetrics(stream, bounded)
  if (!stability || stability.intervalStability.length === 0) return null
  return computeAverage(stability.intervalStability.map((entry) => entry.cov))
}

/**
 * First rep versus last rep, as a percentage of the first.
 *
 * Extracted verbatim from `deriveDurabilitySignals` so the rep-scoped and the
 * legacy call sites cannot drift apart. The delta is a ratio, so the units only
 * need to agree between the two ends: an intensity factor scaled to a
 * percent-of-threshold stands in when watts are missing.
 */
function firstVsLastRepDeltaPct(
  reps: ActualInterval[],
  family: ReturnType<typeof getWorkoutFamily>
): number | null {
  if (reps.length < 2) return null
  const first = reps[0]!
  const last = reps[reps.length - 1]!
  const metricOf = (interval: ActualInterval) =>
    family === 'run'
      ? (interval.avgSpeed ?? null)
      : (interval.avgPower ?? (interval.intensity !== null ? interval.intensity * 100 : null))
  const firstMetric = metricOf(first)
  const lastMetric = metricOf(last)
  if (firstMetric && lastMetric && firstMetric > 0) {
    return round(((firstMetric - lastMetric) / firstMetric) * 100, 1)
  }
  return null
}

/** Whether a signal answers the question this session poses, and why not. */
type SignalGate = { applicable: boolean; reason: string | null }

const OPEN_GATE: SignalGate = { applicable: true, reason: null }

type DurabilityGates = {
  lateSessionFade: SignalGate
  executionStability: SignalGate
  repeatability: SignalGate
}

function deriveDurabilitySignals(params: {
  workout: any
  family: ReturnType<typeof getWorkoutFamily>
  plannedWorkout?: any
  refs: AnalysisRefs
  repScope: RepScope
}): {
  durability: WorkoutAnalysisFactsV2['performanceSignals']['durability']
  gates: DurabilityGates
} {
  const { workout, family, plannedWorkout, refs, repScope } = params
  const time = asNumberArray(workout?.streams?.time)
  const power = asNumberArray(workout?.streams?.watts)
  const hr = asNumberArray(workout?.streams?.heartrate)
  const speed = asNumberArray(workout?.streams?.velocity)
  const cadence = asNumberArray(workout?.streams?.cadence)
  const actualIntervals = repScope.allActualIntervals.filter(
    (interval) => interval.classification === 'work'
  )
  const suppressLateFade = hasTerminalRecoveryPhase(workout, plannedWorkout, refs)
  const gates: DurabilityGates = {
    lateSessionFade: OPEN_GATE,
    executionStability: OPEN_GATE,
    repeatability: OPEN_GATE
  }

  let lateSessionFadePct: number | null = null
  if (repScope.active) {
    // A cooldown is not evidence of fatigue and the first 20% of an interval
    // session is warmup, so the only honest "did the athlete fade?" question is
    // first rep versus last rep. `hasTerminalRecoveryPhase` is deliberately not
    // consulted here: rep-scoped fade never reads the cooldown in the first
    // place, so there is nothing to suppress.
    lateSessionFadePct = firstVsLastRepDeltaPct(repScope.reps, family)
    if (lateSessionFadePct === null) {
      gates.lateSessionFade = {
        applicable: false,
        reason:
          repScope.reason ??
          'Late-session fade is measured first rep versus last rep for this session shape, and the reps carry no comparable measurement.'
      }
    }
  } else if (!suppressLateFade && family === 'ride' && power.length >= 120) {
    const chunk = Math.max(1, Math.floor(power.length * 0.2))
    const first = computeAverage(power.slice(0, chunk).filter((value) => value > 0))
    const last = computeAverage(power.slice(-chunk).filter((value) => value > 0))
    if (first && last && first > 0) lateSessionFadePct = round(((first - last) / first) * 100, 1)
  } else if (!suppressLateFade && family === 'run' && speed.length >= 120) {
    const chunk = Math.max(1, Math.floor(speed.length * 0.2))
    const first = computeAverage(speed.slice(0, chunk).filter((value) => value > 0))
    const last = computeAverage(speed.slice(-chunk).filter((value) => value > 0))
    if (first && last && first > 0) lateSessionFadePct = round(((first - last) / first) * 100, 1)
  } else if (!suppressLateFade && power.length >= 120 && hr.length >= 120) {
    const fatigue = calculateFatigueSensitivity(
      power,
      hr,
      time.length ? time : power.map((_, index) => index)
    )
    lateSessionFadePct = round(fatigue?.decay, 1)
  }

  // Scoped to the comparable reps when there is a rep set, so first-vs-last is
  // a threshold rep against a threshold rep rather than against whatever block
  // happened to be classified as work last.
  const firstVsLastIntervalDeltaPct =
    repScope.reps.length >= 2
      ? firstVsLastRepDeltaPct(repScope.reps, family)
      : firstVsLastRepDeltaPct(actualIntervals, family)

  const avgRecoveryDrop = Array.isArray(workout?.recoveryTrend)
    ? computeAverage(
        workout.recoveryTrend
          .map((entry: any) => Number(entry?.drop60s))
          .filter((value: number) => Number.isFinite(value) && value > 0)
      )
    : null
  const recoveryTrendScore =
    avgRecoveryDrop !== null ? round(clamp((avgRecoveryDrop / 35) * 100, 0, 100), 1) : null

  // The pacing signal execution stability is measured on: watts for a ride,
  // speed for a run. Anything else has no primary pacing stream here.
  const stabilityStream = family === 'ride' ? power : family === 'run' ? speed : []
  const stabilityWeight = family === 'run' ? 8 : 6

  let executionStabilityScore: number | null = null
  if (repScope.active) {
    // Mean CoV WITHIN each rep. The session-wide CoV below measures the
    // difference between warmup, reps and recovery jogs, which for an interval
    // session is the prescribed shape of the workout rather than a flaw in how
    // it was ridden.
    const repCoV =
      stabilityStream.length >= 120 ? repScopedStabilityCoV(repScope.reps, stabilityStream) : null
    if (repCoV !== null) {
      executionStabilityScore = round(clamp(100 - repCoV * stabilityWeight, 0, 100), 1)
    } else {
      gates.executionStability = {
        applicable: false,
        reason:
          stabilityStream.length < 120
            ? 'Execution stability is unavailable because the primary pacing signal is missing or too sparse.'
            : (repScope.reason ??
              'Execution stability is measured within each work rep for this session shape, and the rep boundaries could not be located in the sample stream.')
      }
    }
  } else if (family === 'ride' && power.length >= 120) {
    const stability = calculateStabilityMetrics(power, [])
    executionStabilityScore =
      stability !== null ? round(clamp(100 - stability.overallCoV * 6, 0, 100), 1) : null
  } else if (family === 'run' && speed.length >= 120) {
    const stability = calculateStabilityMetrics(speed, [])
    executionStabilityScore =
      stability !== null ? round(clamp(100 - stability.overallCoV * 8, 0, 100), 1) : null
  }

  let repeatabilityScore: number | null = null
  if (repScope.active) {
    // Comparable reps only. Lumping an endurance-buffer block in with threshold
    // reps is what turned three reps at 271/274/276 W - a CoV of 0.75%, which is
    // excellent - into a ~20/100 "inconsistent" verdict.
    const efforts =
      repScope.reps.length >= MIN_COMPARABLE_REPS ? resolveRepEfforts(repScope.reps, family) : null
    const cov = efforts ? coefficientOfVariationPct(efforts.values) : null
    if (cov !== null) {
      repeatabilityScore = round(clamp(100 - cov * 8, 0, 100), 1)
    } else {
      gates.repeatability = {
        applicable: false,
        reason:
          repScope.reason ??
          `Repeatability needs at least ${MIN_COMPARABLE_REPS} comparable work reps carrying the same measurement, and this session does not provide them.`
      }
    }
  } else if (actualIntervals.length >= 3) {
    const intervalMetrics = actualIntervals
      .map((interval) => (family === 'run' ? interval.avgSpeed : interval.avgPower))
      .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0)
    if (intervalMetrics.length >= 3) {
      const cov = coefficientOfVariationPct(intervalMetrics)
      if (cov !== null) repeatabilityScore = round(clamp(100 - cov * 8, 0, 100), 1)
    }
  }

  return {
    durability: {
      lateSessionFadePct,
      firstVsLastIntervalDeltaPct,
      recoveryTrendScore,
      executionStabilityScore,
      repeatabilityScore
    },
    gates
  }
}

function deriveSportSpecificSignals(params: {
  workout: any
  family: ReturnType<typeof getWorkoutFamily>
  archetype: WorkoutAnalysisFactsV2['guardrails']['archetype']
  motionPattern: MotionPattern
  repScope: RepScope
}): {
  sportSpecific: WorkoutAnalysisFactsV2['performanceSignals']['sportSpecific']
  gates: { cadenceDrift: SignalGate }
} {
  const { workout, family, archetype, motionPattern, repScope } = params
  const cadence = asNumberArray(workout?.streams?.cadence)
  const speed = asNumberArray(workout?.streams?.velocity)
  let cadenceDriftPct: number | null = null
  let cadenceStabilityScore: number | null = null
  let pacingDriftPct: number | null = null
  let cadenceDriftGate: SignalGate = OPEN_GATE
  let torqueProfile: WorkoutAnalysisFactsV2['performanceSignals']['sportSpecific']['torqueProfile'] =
    'unknown'

  if (repScope.active) {
    // First rep versus last rep. The 20%-window form reads the warmup spin-up
    // against the cooldown and reports the difference as fatigue-driven decay.
    const repCadences = repScope.reps.map((rep) => positiveOrNull(rep.avgCadence))
    const first = repCadences[0] ?? null
    const last = repCadences[repCadences.length - 1] ?? null
    if (repCadences.length >= 2 && first !== null && last !== null) {
      cadenceDriftPct = round(((first - last) / first) * 100, 1)
    } else {
      cadenceDriftGate = {
        applicable: false,
        reason:
          repScope.reason ??
          'Cadence drift is measured first rep versus last rep for this session shape, and the reps carry no cadence.'
      }
    }
  } else if (cadence.length >= 120) {
    const chunk = Math.max(1, Math.floor(cadence.length * 0.2))
    const first = computeAverage(cadence.slice(0, chunk).filter((value) => value > 0))
    const last = computeAverage(cadence.slice(-chunk).filter((value) => value > 0))
    if (first && last && first > 0) cadenceDriftPct = round(((first - last) / first) * 100, 1)
  }

  // Session-wide cadence stability is untouched by CW-393: it has no
  // applicability gate and is out of that ticket's scope.
  if (cadence.length >= 120) {
    const stability = calculateStabilityMetrics(cadence, [])
    if (stability) cadenceStabilityScore = round(clamp(100 - stability.overallCoV * 5, 0, 100), 1)
  }

  const paceDriftApplicable =
    family === 'run' &&
    !motionPattern.stopGoLikely &&
    !['intervalled', 'stochastic'].includes(archetype.sessionSteadiness)

  if (speed.length >= 120 && paceDriftApplicable) {
    const chunk = Math.max(1, Math.floor(speed.length * 0.2))
    const first = computeAverage(speed.slice(0, chunk).filter((value) => value > 0))
    const last = computeAverage(speed.slice(-chunk).filter((value) => value > 0))
    if (first && last && first > 0) pacingDriftPct = round(((first - last) / first) * 100, 1)
  }

  if (family === 'ride') {
    const avgCadence = Number(
      workout?.averageCadence || computeAverage(cadence.filter((value) => value > 0)) || 0
    )
    if (avgCadence > 0) {
      if (avgCadence < 80) torqueProfile = 'low_cadence_force'
      else if (avgCadence > 95) torqueProfile = 'high_cadence_spin'
      else torqueProfile = 'neutral'
    }
  } else {
    torqueProfile = 'unknown'
  }

  return {
    sportSpecific: {
      cadenceDriftPct,
      cadenceStabilityScore,
      torqueProfile,
      pacingDriftPct
    },
    gates: { cadenceDrift: cadenceDriftGate }
  }
}

function deriveSignalApplicability(params: {
  workout: any
  family: ReturnType<typeof getWorkoutFamily>
  archetype: WorkoutAnalysisFactsV2['guardrails']['archetype']
  motionPattern: MotionPattern
  durability: WorkoutAnalysisFactsV2['performanceSignals']['durability']
  sportSpecific: WorkoutAnalysisFactsV2['performanceSignals']['sportSpecific']
  gates: DurabilityGates & { cadenceDrift: SignalGate }
}): WorkoutAnalysisFactsV2['performanceSignals']['applicability'] {
  const { workout, family, archetype, motionPattern, durability, sportSpecific, gates } = params
  const durationSec = Number(workout?.durationSec || 0)
  const hasReliableSteadyState =
    durationSec >= 1800 &&
    !motionPattern.stopGoLikely &&
    !['intervalled', 'stochastic'].includes(archetype.sessionSteadiness)

  /**
   * Applicability is `gate && value`, never `value` alone (CW-393).
   *
   * A number existing says nothing about whether it answers the question this
   * session poses. The gate carries that judgement, and its reason - the one
   * that names the actual session shape - wins over the generic fallback.
   */
  const resolve = (
    gate: SignalGate,
    value: number | null,
    fallbackReason: string
  ): SignalApplicability =>
    gate.applicable && value !== null
      ? { applicable: true, reason: null }
      : { applicable: false, reason: gate.reason ?? fallbackReason }

  return {
    lateSessionFade: resolve(
      gates.lateSessionFade,
      durability.lateSessionFadePct,
      hasReliableSteadyState
        ? 'Late-session fade could not be estimated from the available signals.'
        : 'Late-session fade is not meaningful for stochastic, intervalled, or cooldown-biased sessions.'
    ),
    executionStability: resolve(
      gates.executionStability,
      durability.executionStabilityScore,
      family === 'ride' || family === 'run'
        ? 'Execution stability is unavailable because the primary pacing signal is missing or too sparse.'
        : 'Execution stability is not a primary signal for this modality.'
    ),
    repeatability: resolve(
      gates.repeatability,
      durability.repeatabilityScore,
      archetype.sessionSteadiness === 'intervalled'
        ? 'Repeatability needs enough comparable work intervals and those were not available.'
        : 'Repeatability is only meaningful when the session contains comparable repeated efforts.'
    ),
    cadenceDrift: resolve(
      gates.cadenceDrift,
      sportSpecific.cadenceDriftPct,
      'Cadence drift is unavailable because cadence telemetry is missing or too sparse.'
    ),
    pacingDrift:
      sportSpecific.pacingDriftPct !== null
        ? { applicable: true, reason: null }
        : {
            applicable: false,
            reason:
              family === 'run' &&
              !motionPattern.stopGoLikely &&
              !['intervalled', 'stochastic'].includes(archetype.sessionSteadiness)
                ? 'Pacing drift could not be estimated from the available pace signal.'
                : 'Pacing drift is only interpreted for steady run-like sessions with stable pace semantics.'
          }
  }
}

function deriveAdherence(params: {
  workout: any
  plannedWorkout: any
  family: ReturnType<typeof getWorkoutFamily>
  refs: AnalysisRefs
  metricOrder?: PlannedStepMetric[] | null
}): WorkoutAnalysisFactsV2['adherence'] {
  const { workout, plannedWorkout, family, refs, metricOrder } = params
  if (!plannedWorkout) {
    return {
      planLinked: false,
      adherenceAssessable: false,
      adherenceReason: 'No linked planned workout is available.',
      completionPct: null,
      durationVsPlanPct: null,
      workIntervalHitRate: null,
      recoveryHitRate: null,
      cadenceHitRate: null,
      cadenceAssessable: false,
      targetOvershootPct: null,
      targetUndershootPct: null,
      structureMatched: false,
      executionClassification: 'not_assessable'
    }
  }

  const plannedDuration = Number(plannedWorkout?.durationSec || 0)
  const actualDuration = Number(workout?.durationSec || 0)
  const durationVsPlanPct =
    plannedDuration > 0 ? round((actualDuration / plannedDuration) * 100, 1) : null
  const completionPct =
    durationVsPlanPct !== null ? round(clamp(durationVsPlanPct, 0, 140), 1) : null

  const plannedSteps = flattenPlannedSteps(
    getStructuredSteps(plannedWorkout?.structuredWorkout),
    refs,
    metricOrder
  )
  const actualIntervals = extractActualIntervals(workout, plannedWorkout, refs)
  // One alignment for every comparison below: work steps, recovery steps and
  // cadence targets all read the same pairs, so they cannot disagree about
  // which executed segment a given planned step belongs to (CW-386).
  const alignment = alignPlannedToActualIntervals(plannedSteps, actualIntervals)
  const comparableActual = alignment.actualSegments
  const plannedWork = plannedSteps.filter((step) => step.classification === 'work')
  const plannedRecovery = plannedSteps.filter((step) => step.classification === 'recovery')
  const actualWork = comparableActual.filter((step) => step.classification === 'work')
  const actualRecovery = comparableActual.filter((step) => step.classification === 'recovery')

  if (plannedSteps.length === 0) {
    return {
      planLinked: true,
      adherenceAssessable: false,
      adherenceReason: 'Linked plan has no structured steps to compare.',
      completionPct,
      durationVsPlanPct,
      workIntervalHitRate: null,
      recoveryHitRate: null,
      cadenceHitRate: null,
      cadenceAssessable: false,
      targetOvershootPct: null,
      targetUndershootPct: null,
      structureMatched: false,
      executionClassification:
        durationVsPlanPct !== null && durationVsPlanPct >= 60
          ? 'unstructured_substitution'
          : 'not_assessable'
    }
  }

  if (actualIntervals.length === 0) {
    return {
      planLinked: true,
      adherenceAssessable: false,
      adherenceReason: 'Actual interval segmentation is unavailable for precise adherence scoring.',
      completionPct,
      durationVsPlanPct,
      workIntervalHitRate: null,
      recoveryHitRate: null,
      cadenceHitRate: null,
      cadenceAssessable: false,
      targetOvershootPct: null,
      targetUndershootPct: null,
      structureMatched: false,
      executionClassification:
        durationVsPlanPct !== null &&
        durationVsPlanPct >= 60 &&
        (family === 'ride' || family === 'run')
          ? 'unstructured_substitution'
          : 'not_assessable'
    }
  }

  const cadencePlanned = plannedSteps.filter((step) => step.cadence !== null)
  const pairMetric = (
    planned: FlattenedPlannedStep,
    actual: ActualInterval | null
  ): { deltaPct: number | null; hit: boolean; comparable: boolean } => {
    const target = resolveComparableTargetValue(planned, refs)
    const bounds = resolveComparableTargetBounds(planned, refs)
    let actualValue: number | null = null
    let threshold = 10

    if (planned.metric === 'power') {
      actualValue = actual?.avgPower ?? null
    } else if (planned.metric === 'pace') {
      actualValue = actual?.avgSpeed ?? null
      threshold = 8
    } else if (planned.metric === 'heartRate') {
      actualValue = actual?.avgHr ?? null
      threshold = 6
    } else if (planned.metric === 'rpe') {
      // Both sides are intensity factors: `resolveComparableTargetValue`
      // returns `planned.intensityFactor` (rpe / 10, clamped) and
      // `ActualInterval.intensity` is normalised to the same fraction-of-
      // threshold scale in `mapIntervalsToActual`. Comparing the raw provider
      // percentage here produced deltas in the thousands of percent.
      actualValue = actual?.intensity ?? null
      threshold = 10
    }

    if (
      bounds &&
      actualValue !== null &&
      Number.isFinite(actualValue) &&
      actualValue > 0 &&
      bounds.end > 0
    ) {
      if (actualValue >= bounds.start && actualValue <= bounds.end) {
        return { deltaPct: 0, hit: true, comparable: true }
      }

      const reference = actualValue < bounds.start ? bounds.start : bounds.end
      const deltaPct = ((actualValue - reference) / reference) * 100
      return { deltaPct, hit: false, comparable: true }
    }

    if (
      target === null ||
      !Number.isFinite(target) ||
      target <= 0 ||
      actualValue === null ||
      !Number.isFinite(actualValue) ||
      actualValue <= 0
    ) {
      return { deltaPct: null, hit: false, comparable: false }
    }

    const deltaPct = ((actualValue - target) / target) * 100
    return { deltaPct, hit: Math.abs(deltaPct) <= threshold, comparable: true }
  }

  /**
   * An RPE-planned step can only be scored when the actual side carries an
   * intensity signal — engine-detected intervals never do, and not every
   * provider lap does either. A missing measurement is not evidence of poor
   * execution, so those steps drop out of the hit-rate denominator instead of
   * being counted as misses. Other metrics keep their existing behaviour: an
   * unmeasured power/pace/HR step still counts against the athlete.
   */
  const isUnmeasurableRpeStep = (
    planned: FlattenedPlannedStep,
    actual: ActualInterval | null,
    result: { comparable: boolean }
  ) => actual !== null && planned.metric === 'rpe' && !result.comparable

  /**
   * A planned step the alignment could not pair at all is a different case from
   * CW-385's unmeasurable RPE step, and is treated differently on purpose.
   *
   * CW-385 excludes a step when the segment exists but carries no comparable
   * measurement - the athlete may well have executed it perfectly and the file
   * simply cannot say. Here there is no segment at all: the alignment already
   * tolerates extra laps, split laps and stub fragments, so a planned step with
   * no counterpart left is evidence the work was not executed, not evidence
   * that the measurement is missing. Those steps therefore stay in the
   * denominator and count as misses - which is also what index pairing did for
   * planned steps past the end of the actual list, so no session gets a better
   * hit rate merely because alignment replaced indexing.
   */

  let workHits = 0
  let recoveryHits = 0
  let cadenceHits = 0
  // Denominators start at every planned step and shrink only when an RPE step
  // turns out to be unmeasurable (see `isUnmeasurableRpeStep`).
  let scorableWorkSteps = plannedWork.length
  let scorableRecoverySteps = plannedRecovery.length
  const overshoots: number[] = []
  const undershoots: number[] = []

  for (const { planned, actual } of alignment.pairs) {
    if (planned.classification !== 'work') continue
    const result = pairMetric(planned, actual)
    if (isUnmeasurableRpeStep(planned, actual, result)) {
      scorableWorkSteps--
      continue
    }
    if (result.hit) workHits++
    if (result.deltaPct !== null && result.deltaPct > 0) overshoots.push(result.deltaPct)
    if (result.deltaPct !== null && result.deltaPct < 0) undershoots.push(Math.abs(result.deltaPct))
  }

  for (const { planned, actual } of alignment.pairs) {
    if (planned.classification !== 'recovery') continue
    const result = pairMetric(planned, actual)
    if (isUnmeasurableRpeStep(planned, actual, result)) {
      scorableRecoverySteps--
      continue
    }
    if (result.hit) recoveryHits++
  }

  // Cadence reads the same aligned pairs as the loops above. It used to walk
  // `plannedSteps[i]` against `actualIntervals[i]` with no classification
  // filter at all, so rep 1 of the plan was routinely scored against the
  // athlete's warmup lap (CW-386).
  for (const { planned, actual } of alignment.pairs) {
    if (planned.cadence === null) continue
    if (!actual || actual.avgCadence === null || actual.avgCadence <= 0) continue
    const tolerance = planned.ramp ? 8 : 5
    if (Math.abs(actual.avgCadence - planned.cadence) <= tolerance) cadenceHits++
  }

  const workIntervalHitRate =
    scorableWorkSteps > 0 ? round((workHits / scorableWorkSteps) * 100, 1) : null
  const recoveryHitRate =
    scorableRecoverySteps > 0 ? round((recoveryHits / scorableRecoverySteps) * 100, 1) : null
  const cadenceHitRate =
    cadencePlanned.length > 0 ? round((cadenceHits / cadencePlanned.length) * 100, 1) : null
  const structureMatched =
    plannedWork.length > 0 &&
    actualWork.length > 0 &&
    Math.abs(plannedWork.length - actualWork.length) <= 1 &&
    Math.abs(plannedRecovery.length - actualRecovery.length) <= 1

  const targetOvershootPct =
    overshoots.length > 0
      ? round(overshoots.reduce((a, b) => a + b, 0) / overshoots.length, 1)
      : null
  const targetUndershootPct =
    undershoots.length > 0
      ? round(undershoots.reduce((a, b) => a + b, 0) / undershoots.length, 1)
      : null

  let executionClassification: ExecutionClassification = 'as_prescribed'
  if (!structureMatched) executionClassification = 'unstructured_substitution'
  else if ((durationVsPlanPct ?? 100) < 85) executionClassification = 'shortened'
  else if ((targetUndershootPct ?? 0) >= 8) executionClassification = 'intensity_reduced'
  else if ((targetOvershootPct ?? 0) >= 8) executionClassification = 'intensity_inflated'

  return {
    planLinked: true,
    adherenceAssessable: true,
    adherenceReason: null,
    completionPct,
    durationVsPlanPct,
    workIntervalHitRate,
    recoveryHitRate,
    cadenceHitRate,
    cadenceAssessable: cadencePlanned.length > 0,
    targetOvershootPct,
    targetUndershootPct,
    structureMatched,
    executionClassification
  }
}

function buildPromptDecisionsV2(facts: WorkoutAnalysisFactsV2): Record<string, PromptDecision> {
  const decisions: Record<string, PromptDecision> = {}
  const set = (path: string, include: boolean, reason: string) => {
    decisions[path] = { include, reason }
  }

  set('guardrails.analysisMode', true, 'Keep compatibility analysis mode visible during rollout.')
  set(
    'guardrails.archetype.primaryArchetype',
    true,
    'Primary workout archetype should guide interpretation.'
  )
  set(
    'guardrails.archetype.executionEnvironment',
    true,
    'Execution environment changes how pacing discipline should be judged.'
  )
  set(
    'guardrails.archetype.primaryMetric',
    true,
    'Primary metric tells the AI which signal family should lead the analysis.'
  )
  set(
    'guardrails.archetype.sessionSteadiness',
    true,
    'Session steadiness controls decoupling and pacing interpretation.'
  )
  set('guardrails.telemetry.hrUsable', true, 'HR usability must always be explicit.')
  set(
    'guardrails.telemetry.hrArtifactSeverity',
    facts.guardrails.telemetry.hrArtifactSeverity !== 'none',
    facts.guardrails.telemetry.hrArtifactSeverity !== 'none'
      ? 'HR artifact severity explains telemetry suppression.'
      : 'No HR artifact severity needs to be shown.'
  )
  set(
    'guardrails.telemetry.powerSourceType',
    facts.guardrails.telemetry.powerSourceType !== 'unknown',
    'Power provenance affects how strongly power claims can be made.'
  )
  set(
    'guardrails.telemetry.powerAbsoluteUsable',
    true,
    'The prompt needs to know whether absolute power benchmarking is allowed.'
  )
  set(
    'guardrails.telemetry.powerRelativeUsable',
    true,
    'Relative power usability helps preserve trend analysis when absolute power is uncertain.'
  )
  set(
    'guardrails.telemetry.paceUsable',
    facts.guardrails.telemetry.paceUsable,
    facts.guardrails.telemetry.paceUsable
      ? 'Pace can be trusted as a leading metric.'
      : 'No pace signal is available.'
  )
  set(
    'guardrails.telemetry.gpsConfidence',
    facts.guardrails.telemetry.paceUsable,
    facts.guardrails.telemetry.paceUsable
      ? 'GPS/pace confidence calibrates how strongly to interpret pacing.'
      : 'GPS confidence is irrelevant without pace.'
  )
  set(
    'guardrails.telemetry.lrBalanceUsable',
    true,
    'The prompt should know whether L/R balance is safe to use.'
  )
  set(
    'guardrails.telemetry.lrInterpretationMode',
    true,
    'L/R interpretation mode explains how balance data was handled.'
  )
  set('guardrails.erg.detected', true, 'ERG detection changes pacing judgment.')
  set(
    'guardrails.erg.powerControlMode',
    facts.guardrails.erg.powerControlMode !== 'unknown',
    'Trainer control mode provides environment context when known.'
  )
  set(
    'guardrails.suppressions',
    facts.guardrails.suppressions.length > 0,
    facts.guardrails.suppressions.length > 0
      ? 'Suppression reasons must be explicit in the prompt.'
      : 'No suppressions need to be shown.'
  )

  set(
    'adherence.planLinked',
    facts.adherence.planLinked,
    'Plan linkage is essential context for execution analysis.'
  )
  set(
    'adherence.adherenceAssessable',
    facts.adherence.planLinked,
    'The model must know whether adherence claims are defensible.'
  )
  set(
    'adherence.adherenceReason',
    Boolean(facts.adherence.adherenceReason),
    'A reason is useful when adherence cannot be assessed precisely.'
  )
  set(
    'adherence.completionPct',
    facts.adherence.completionPct !== null,
    'Completion percentage provides a compact summary of plan completion.'
  )
  set(
    'adherence.durationVsPlanPct',
    facts.adherence.durationVsPlanPct !== null,
    'Duration variance is a core adherence signal.'
  )
  set(
    'adherence.workIntervalHitRate',
    facts.adherence.workIntervalHitRate !== null,
    'Work interval hit rate is the core structured adherence metric.'
  )
  set(
    'adherence.recoveryHitRate',
    facts.adherence.recoveryHitRate !== null,
    'Recovery hit rate helps judge complete execution, not just hard efforts.'
  )
  set(
    'adherence.cadenceHitRate',
    facts.adherence.cadenceHitRate !== null,
    'Cadence hit rate summarizes how often prescribed cadence was respected.'
  )
  set(
    'adherence.cadenceAssessable',
    facts.adherence.cadenceAssessable,
    'The model should know whether cadence prescriptions were present and assessable.'
  )
  set(
    'adherence.targetOvershootPct',
    facts.adherence.targetOvershootPct !== null,
    'Overshoot quantifies intensity inflation when present.'
  )
  set(
    'adherence.targetUndershootPct',
    facts.adherence.targetUndershootPct !== null,
    'Undershoot quantifies intensity reduction when present.'
  )
  set(
    'adherence.structureMatched',
    facts.adherence.planLinked,
    'Structure matching distinguishes faithful execution from substitution.'
  )
  set(
    'adherence.executionClassification',
    facts.adherence.planLinked,
    'Execution classification is the highest-level adherence summary.'
  )

  set(
    'performanceSignals.decoupling.interpretable',
    true,
    'The prompt must know whether classic decoupling can be discussed.'
  )
  set(
    'performanceSignals.applicability.lateSessionFade.applicable',
    !facts.performanceSignals.applicability.lateSessionFade.applicable,
    'Show non-applicability when fade should not be interpreted.'
  )
  set(
    'performanceSignals.applicability.lateSessionFade.reason',
    !facts.performanceSignals.applicability.lateSessionFade.applicable &&
      Boolean(facts.performanceSignals.applicability.lateSessionFade.reason),
    'A reason is useful when late-session fade is not applicable.'
  )
  set(
    'performanceSignals.applicability.executionStability.applicable',
    !facts.performanceSignals.applicability.executionStability.applicable,
    'Show non-applicability when execution stability should not drive feedback.'
  )
  set(
    'performanceSignals.applicability.executionStability.reason',
    !facts.performanceSignals.applicability.executionStability.applicable &&
      Boolean(facts.performanceSignals.applicability.executionStability.reason),
    'A reason is useful when execution stability is unavailable or inapplicable.'
  )
  set(
    'performanceSignals.applicability.repeatability.applicable',
    !facts.performanceSignals.applicability.repeatability.applicable,
    'Show non-applicability when repeatability should not be inferred.'
  )
  set(
    'performanceSignals.applicability.repeatability.reason',
    !facts.performanceSignals.applicability.repeatability.applicable &&
      Boolean(facts.performanceSignals.applicability.repeatability.reason),
    'A reason is useful when repeatability is unavailable or inapplicable.'
  )
  set(
    'performanceSignals.applicability.cadenceDrift.applicable',
    !facts.performanceSignals.applicability.cadenceDrift.applicable,
    'Show non-applicability when cadence drift cannot be trusted.'
  )
  set(
    'performanceSignals.applicability.cadenceDrift.reason',
    !facts.performanceSignals.applicability.cadenceDrift.applicable &&
      Boolean(facts.performanceSignals.applicability.cadenceDrift.reason),
    'A reason is useful when cadence drift is unavailable or inapplicable.'
  )
  set(
    'performanceSignals.applicability.pacingDrift.applicable',
    !facts.performanceSignals.applicability.pacingDrift.applicable,
    'Show non-applicability when pacing drift should not be interpreted.'
  )
  set(
    'performanceSignals.applicability.pacingDrift.reason',
    !facts.performanceSignals.applicability.pacingDrift.applicable &&
      Boolean(facts.performanceSignals.applicability.pacingDrift.reason),
    'A reason is useful when pacing drift is unavailable or inapplicable.'
  )
  set(
    'performanceSignals.decoupling.reason',
    Boolean(facts.performanceSignals.decoupling.reason),
    'A reason is useful when decoupling is suppressed.'
  )
  set(
    'performanceSignals.decoupling.effective',
    facts.performanceSignals.decoupling.interpretable &&
      facts.performanceSignals.decoupling.effective !== null,
    'Decoupling value is only useful when interpretable.'
  )
  set(
    'performanceSignals.decoupling.direction',
    facts.performanceSignals.decoupling.interpretable &&
      facts.performanceSignals.decoupling.direction !== 'unknown',
    'Decoupling direction is only useful when interpretable.'
  )
  set(
    'performanceSignals.durability.lateSessionFadePct',
    facts.performanceSignals.durability.lateSessionFadePct !== null,
    'Late-session fade helps the AI talk about durability.'
  )
  set(
    'performanceSignals.durability.firstVsLastIntervalDeltaPct',
    facts.performanceSignals.durability.firstVsLastIntervalDeltaPct !== null,
    'First-vs-last interval delta supports repeatability analysis.'
  )
  set(
    'performanceSignals.durability.recoveryTrendScore',
    facts.performanceSignals.durability.recoveryTrendScore !== null,
    'Recovery trend score helps with fatigue interpretation.'
  )
  set(
    'performanceSignals.durability.executionStabilityScore',
    facts.performanceSignals.durability.executionStabilityScore !== null,
    'Execution stability adds high-signal pacing consistency context.'
  )
  set(
    'performanceSignals.durability.repeatabilityScore',
    facts.performanceSignals.durability.repeatabilityScore !== null,
    'Repeatability helps the model describe interval-to-interval consistency.'
  )
  set(
    'performanceSignals.zones.dominantPowerZone',
    facts.performanceSignals.zones.dominantPowerZone !== null,
    'Dominant power zone gives concise intensity distribution context.'
  )
  set(
    'performanceSignals.zones.dominantHrZone',
    facts.performanceSignals.zones.dominantHrZone !== null,
    'Dominant HR zone gives concise physiological distribution context.'
  )
  set(
    'performanceSignals.zones.timeAboveThresholdPct',
    facts.performanceSignals.zones.timeAboveThresholdPct !== null,
    'Time above threshold helps characterize workout strain.'
  )
  set(
    'performanceSignals.sportSpecific.cadenceDriftPct',
    facts.performanceSignals.sportSpecific.cadenceDriftPct !== null,
    'Cadence drift is useful when available.'
  )
  set(
    'performanceSignals.sportSpecific.cadenceStabilityScore',
    facts.performanceSignals.sportSpecific.cadenceStabilityScore !== null,
    'Cadence stability adds sport-specific execution context.'
  )
  set(
    'performanceSignals.sportSpecific.torqueProfile',
    facts.performanceSignals.sportSpecific.torqueProfile !== 'unknown',
    'Torque profile is useful for cycling-specific execution analysis.'
  )
  set(
    'performanceSignals.sportSpecific.pacingDriftPct',
    facts.performanceSignals.sportSpecific.pacingDriftPct !== null,
    'Pacing drift is useful for running-specific execution analysis.'
  )

  set(
    'confidence.debugMeta.computedFrom',
    false,
    'Input provenance is for UI/debugging, not the prompt.'
  )
  set(
    'confidence.debugMeta.unavailableInputs',
    false,
    'Missing input inventory is for UI/debugging, not the prompt.'
  )
  set(
    'confidence.debugMeta.suppressedMetrics',
    facts.confidence.debugMeta.suppressedMetrics.length > 0,
    'Suppressed metrics list explains what the prompt must not infer.'
  )
  set(
    'confidence.overall',
    true,
    'Overall confidence calibrates how strongly the AI should state conclusions.'
  )

  return decisions
}

export function buildWorkoutAnalysisFactsV2({
  workout,
  sportSettings,
  plannedWorkout,
  userProfile
}: BuildWorkoutAnalysisFactsOptions): WorkoutAnalysisFactsV2 {
  const computedFrom = ['workout.summary']
  const unavailableInputs: string[] = []
  const suppressedMetrics: string[] = []

  if (workout?.rawJson) computedFrom.push('workout.rawJson')
  else unavailableInputs.push('workout.rawJson')

  if (workout?.streams) computedFrom.push('workout.streams')
  else unavailableInputs.push('workout.streams')

  if (plannedWorkout) computedFrom.push('plannedWorkout')
  else unavailableInputs.push('plannedWorkout')

  if (sportSettings) computedFrom.push('sportSettings')
  else unavailableInputs.push('sportSettings')

  if (userProfile) computedFrom.push('userProfile')
  else unavailableInputs.push('userProfile')

  const family = getWorkoutFamily(workout?.type)
  const durationMinutes = Math.round((workout?.durationSec || 0) / 60)
  const rpe =
    workout?.rpe ??
    (workout?.sessionRpe && durationMinutes > 0
      ? Math.round(workout.sessionRpe / durationMinutes)
      : null) ??
    null
  const hrStats = getHrStats(workout)
  const powerSourceType = inferPowerSourceType(workout, family)
  const powerAbsoluteUsable = powerSourceType === 'measured'
  const powerRelativeUsable =
    powerSourceType !== 'unknown' ||
    Boolean(workout?.averageWatts) ||
    Boolean(workout?.normalizedPower) ||
    asNumberArray(workout?.streams?.watts).length > 0 ||
    asNumberArray(workout?.streams?.powerZoneTimes).some((value) => value > 0)
  const hasPace =
    Boolean(workout?.averageSpeed) || asNumberArray(workout?.streams?.velocity).length > 0
  const analysisMode = getAnalysisMode({
    family,
    powerSourceType,
    hrUsable: hrStats.usable,
    hasPace,
    hasRpe: Boolean(rpe)
  })
  // Reference values come from the athlete's sport settings (profile-level), not from the
  // session row. They are resolved before archetype/interval work so every downstream
  // consumer — including interval detection and raw-vs-detected arbitration — sees the
  // same real FTP / LTHR / max HR / threshold pace instead of zeroed placeholders.
  const refs: AnalysisRefs = {
    ftp: Number(sportSettings?.ftp || workout?.ftp || 0),
    lthr: Number(sportSettings?.lthr || 0),
    // Profile max HR only; `workout.maxHr` is this session's max and would understate a
    // fitter athlete's true ceiling, so it is not used as a stand-in here.
    maxHr: Number(sportSettings?.maxHr || 0),
    thresholdPace: Number(sportSettings?.thresholdPace || 0),
    hrZones: sportSettings?.hrZones || [],
    powerZones: sportSettings?.powerZones || [],
    paceZones: sportSettings?.paceZones || []
  }
  const warmupExcludedMinutes = clamp(Number(sportSettings?.warmupTime || 10), 10, 15)
  const erg = detectErg(workout, plannedWorkout)
  const lrBalance = deriveLrBalance(workout)
  const motionPattern = deriveMotionPattern(workout)
  const archetype = classifyArchetype({
    workout,
    family,
    analysisMode,
    erg,
    plannedWorkout,
    powerSourceType,
    hrUsable: hrStats.usable,
    motionPattern,
    refs
  })
  const decoupling = deriveDecouplingV2({
    workout,
    family,
    hrUsable: hrStats.usable,
    warmupExcludedMinutes,
    archetype,
    motionPattern
  })

  if (!hrStats.usable)
    suppressedMetrics.push(
      'Heart-rate-derived interpretation suppressed because HR telemetry is unreliable.'
    )
  if (!powerAbsoluteUsable && powerRelativeUsable)
    suppressedMetrics.push(
      'Absolute power benchmarking suppressed because power provenance is uncertain.'
    )
  if (!decoupling.interpretable)
    suppressedMetrics.push(decoupling.reason || 'Classic decoupling interpretation suppressed.')
  if (lrBalance.interpretationMode === 'disabled')
    suppressedMetrics.push(lrBalance.correctionReason || 'L/R balance interpretation suppressed.')
  if (lrBalance.interpretationMode === 'corrected')
    suppressedMetrics.push('L/R balance channels were corrected before interpretation.')
  if (erg.detected)
    suppressedMetrics.push('Pacing discipline should be judged with ERG trainer control in mind.')
  if (motionPattern.stopGoLikely)
    suppressedMetrics.push(
      'Stop-and-go motion pattern detected; do not criticize lack of constant pace or invent steady-state drift narratives.'
    )

  const adherence = deriveAdherence({
    workout,
    plannedWorkout,
    family,
    refs,
    metricOrder: parseLegacyLoadPreference(sportSettings?.loadPreference)
  })
  // One comparable-rep resolution, shared by every rep-scoped signal, so the
  // durability and sport-specific blocks cannot disagree about which segments
  // count as this session's reps (CW-393).
  const repScope = resolveRepScope({ workout, plannedWorkout, family, refs, archetype })
  if (repScope.active && repScope.reason) {
    suppressedMetrics.push(repScope.reason)
  }

  const plannedRecoveryTail = hasTerminalRecoveryPhase(workout, plannedWorkout, refs)

  // Only relevant while fade is read off the tail of the session. A rep-scoped
  // fade compares rep to rep and never looks at the cooldown, so repeating this
  // caution there would contradict a number that is now trustworthy (CW-393).
  if (plannedRecoveryTail && !repScope.active) {
    suppressedMetrics.push(
      'Late-session fade should not be penalized because the workout ends with a planned recovery/cooldown phase.'
    )
  }

  const { durability, gates: durabilityGates } = deriveDurabilitySignals({
    workout,
    family,
    plannedWorkout,
    refs,
    repScope
  })
  const { sportSpecific, gates: sportSpecificGates } = deriveSportSpecificSignals({
    workout,
    family,
    archetype,
    motionPattern,
    repScope
  })
  const applicability = deriveSignalApplicability({
    workout,
    family,
    archetype,
    motionPattern,
    durability,
    sportSpecific,
    gates: { ...durabilityGates, ...sportSpecificGates }
  })
  const currentPowerZoneTimes =
    computeZoneTimesFromSamples(workout?.streams?.watts, refs.powerZones) ??
    workout?.streams?.powerZoneTimes
  const currentHrZoneTimes =
    computeZoneTimesFromSamples(workout?.streams?.heartrate, refs.hrZones) ??
    workout?.streams?.hrZoneTimes

  const performanceSignals: WorkoutAnalysisFactsV2['performanceSignals'] = {
    applicability,
    decoupling,
    durability,
    zones: {
      dominantPowerZone: getZoneDominance(currentPowerZoneTimes, 'Z'),
      dominantHrZone: getZoneDominance(currentHrZoneTimes, 'HRZ'),
      timeAboveThresholdPct:
        getTimeAboveThresholdPct(currentPowerZoneTimes) ??
        getTimeAboveThresholdPct(currentHrZoneTimes)
    },
    sportSpecific
  }

  const guardrails: WorkoutAnalysisFactsV2['guardrails'] = {
    analysisMode,
    archetype,
    telemetry: {
      hrUsable: hrStats.usable,
      hrArtifactSeverity: inferHrArtifactSeverity(hrStats),
      hrZeroRatio: hrStats.zeroRatio,
      hrMissingRatio: hrStats.missingRatio,
      powerSourceType,
      powerSourceConfidence:
        powerSourceType === 'measured'
          ? 'high'
          : powerSourceType === 'estimated'
            ? 'medium'
            : 'low',
      powerAbsoluteUsable,
      powerRelativeUsable,
      paceUsable: hasPace,
      gpsConfidence: inferPaceConfidence(workout, family),
      lrBalanceUsable: lrBalance.interpretationMode !== 'disabled',
      lrInterpretationMode: lrBalance.interpretationMode
    },
    erg,
    lrBalance,
    suppressions: suppressedMetrics
  }

  const guardrailsConfidence = rateConfidence(
    [
      guardrails.telemetry.hrUsable,
      guardrails.telemetry.powerSourceType !== 'unknown',
      guardrails.telemetry.paceUsable,
      archetype.confidence !== 'low'
    ].filter(Boolean).length / 4
  )
  const adherenceConfidence = !adherence.planLinked
    ? 'medium'
    : adherence.adherenceAssessable
      ? 'high'
      : adherence.executionClassification === 'unstructured_substitution'
        ? 'medium'
        : 'low'
  const performanceConfidence = rateConfidence(
    [
      performanceSignals.decoupling.interpretable,
      performanceSignals.durability.lateSessionFadePct !== null,
      performanceSignals.durability.executionStabilityScore !== null,
      performanceSignals.durability.repeatabilityScore !== null
    ].filter(Boolean).length / 4
  )

  const facts: WorkoutAnalysisFactsV2 = {
    guardrails,
    adherence,
    performanceSignals,
    confidence: {
      overall: rateConfidence(
        [
          guardrailsConfidence === 'high' ? 1 : guardrailsConfidence === 'medium' ? 0.6 : 0.2,
          adherenceConfidence === 'high' ? 1 : adherenceConfidence === 'medium' ? 0.6 : 0.2,
          performanceConfidence === 'high' ? 1 : performanceConfidence === 'medium' ? 0.6 : 0.2
        ].reduce((sum, value) => sum + value, 0) / 3
      ),
      guardrails: guardrailsConfidence,
      adherence: adherenceConfidence,
      performanceSignals: performanceConfidence,
      debugMeta: {
        factVersion: 'v2',
        computedFrom,
        unavailableInputs,
        suppressedMetrics,
        promptDecisions: {}
      }
    }
  }

  facts.confidence.debugMeta.promptDecisions = buildPromptDecisionsV2(facts)
  return facts
}
