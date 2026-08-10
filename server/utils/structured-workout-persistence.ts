import {
  applyRunTargetPolicyToStep,
  applyTargetFormatPolicyToStep,
  applyStepIntentGuard
} from '../../trigger/utils/workout-targeting'
import type { TargetPolicy } from './workout-target-policy'
import type { TargetFormatPolicy } from './workout-target-format-policy'

type StepMetric = 'power' | 'heartRate' | 'pace' | 'rpe'

type MetricRefs = {
  ftp: number
  lthr: number
  maxHr: number
  thresholdPace: number
  hrZones: any[]
  powerZones: any[]
  paceZones: any[]
}

type NormalizeContext = {
  refs: MetricRefs
  targetPolicy: TargetPolicy
  targetFormatPolicy: TargetFormatPolicy
  workoutType?: string | null
}

export const toPositiveInt = (value: unknown): number | undefined => {
  if (value === null || value === undefined) return undefined
  const raw =
    typeof value === 'string'
      ? value.trim().length > 0
        ? Number(value.trim())
        : NaN
      : Number(value)
  if (!Number.isFinite(raw)) return undefined
  const int = Math.trunc(raw)
  return int > 0 ? int : undefined
}

export function normalizeStructuredWorkoutRepetition(structuredWorkout: any) {
  const normalized = JSON.parse(JSON.stringify(structuredWorkout || {}))

  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach((entry) => visit(entry))
      return
    }

    const reps =
      toPositiveInt(node.reps) ?? toPositiveInt(node.repeat) ?? toPositiveInt(node.intervals)
    if (reps !== undefined) {
      node.reps = reps
    }

    if ('repeat' in node) delete node.repeat
    if ('intervals' in node && reps !== undefined) delete node.intervals

    Object.values(node).forEach((value) => visit(value))
  }

  visit(normalized)
  return normalized
}

function hasMetricTarget(step: any, metric: StepMetric) {
  if (metric === 'rpe') return typeof step?.rpe === 'number'
  const target = step?.[metric]
  return Boolean(target && (typeof target.value === 'number' || target.range))
}

function normalizePrimaryTarget(step: any, fallbackOrder: StepMetric[]) {
  const current = String(step?.primaryTarget || '')
  if ((['power', 'heartRate', 'pace', 'rpe'] as string[]).includes(current)) {
    return current as StepMetric
  }
  for (const metric of fallbackOrder) {
    if (hasMetricTarget(step, metric)) return metric
  }
  return undefined
}

function getTargetMidpoint(target: any): number | null {
  if (!target || typeof target !== 'object') return null
  if (
    target.rangeMps &&
    typeof target.rangeMps.min === 'number' &&
    typeof target.rangeMps.max === 'number'
  ) {
    return (target.rangeMps.min + target.rangeMps.max) / 2
  }
  if (typeof target.value === 'number') return target.value
  if (
    target.range &&
    typeof target.range.start === 'number' &&
    typeof target.range.end === 'number'
  ) {
    return (target.range.start + target.range.end) / 2
  }
  return null
}

function getZoneBoundsFromRefs(
  kind: 'heartRate' | 'power' | 'pace',
  zoneValue: number,
  refs: {
    ftp: number
    lthr: number
    maxHr: number
    thresholdPace: number
    hrZones?: any[]
    powerZones?: any[]
    paceZones?: any[]
  }
): { start: number; end: number } | null {
  const zoneIndex = Math.max(1, Math.round(zoneValue)) - 1
  if (kind === 'power') {
    const zone = refs.powerZones?.[zoneIndex]
    const min = Number(zone?.min)
    const max = Number(zone?.max)
    if (Number.isFinite(min) && Number.isFinite(max) && refs.ftp > 0) {
      return { start: min / refs.ftp, end: max / refs.ftp }
    }
    return null
  }
  if (kind === 'heartRate') {
    const zone = refs.hrZones?.[zoneIndex]
    const min = Number(zone?.min)
    const max = Number(zone?.max)
    if (Number.isFinite(min) && Number.isFinite(max)) {
      const denom = refs.lthr > 0 ? refs.lthr : refs.maxHr
      if (denom > 0) return { start: min / denom, end: max / denom }
    }
    return null
  }

  const zone = refs.paceZones?.[zoneIndex]
  const min = Number(zone?.min)
  const max = Number(zone?.max)
  if (Number.isFinite(min) && Number.isFinite(max) && refs.thresholdPace > 0) {
    return { start: min / refs.thresholdPace, end: max / refs.thresholdPace }
  }
  return null
}

function defaultRunSpeedFromIntent(
  intent: string | undefined,
  thresholdPace: number
): number | null {
  if (!(thresholdPace > 0)) return null
  const normalized = String(intent || '').toLowerCase()
  const factor =
    normalized === 'warmup'
      ? 0.72
      : normalized === 'recovery'
        ? 0.7
        : normalized === 'easy'
          ? 0.78
          : normalized === 'endurance'
            ? 0.85
            : normalized === 'tempo'
              ? 0.94
              : normalized === 'threshold'
                ? 1.0
                : normalized === 'vo2'
                  ? 1.06
                  : normalized === 'anaerobic'
                    ? 1.12
                    : normalized === 'sprint'
                      ? 1.2
                      : normalized === 'cooldown'
                        ? 0.68
                        : normalized === 'strides'
                          ? 1.1
                          : 0.82
  return thresholdPace * factor
}

function inferStepSpeedMps(
  step: any,
  refs: { ftp: number; lthr: number; maxHr: number; thresholdPace: number },
  fallbackOrder: StepMetric[]
): number | null {
  const orderedMetrics: StepMetric[] = []
  const primaryTarget = normalizePrimaryTarget(step, fallbackOrder)
  if (primaryTarget) orderedMetrics.push(primaryTarget)
  for (const metric of fallbackOrder) {
    if (!orderedMetrics.includes(metric)) orderedMetrics.push(metric)
  }

  for (const metric of orderedMetrics) {
    if (metric !== 'pace') continue
    const target = step?.pace
    if (target?.unresolved || target?.kind === 'freeform') continue
    if (target?.rangeMps) {
      const min = Number(target.rangeMps.min)
      const max = Number(target.rangeMps.max)
      if (Number.isFinite(min) && Number.isFinite(max)) return (min + max) / 2
    }
    const value = getTargetMidpoint(target)
    if (value === null || !Number.isFinite(value)) continue
    const units = String(target?.units || target?.sourceUnit || '')
      .trim()
      .toLowerCase()
    if (units === 'm/s') return value
    if (units.includes('/')) {
      const secondsPerKm = value * 60
      if (secondsPerKm > 0) return 1000 / secondsPerKm
    }
    if ((units === 'pace' || units === 'relative') && refs.thresholdPace > 0)
      return value * refs.thresholdPace
    if ((units === '%pace' || units === 'percentpace') && refs.thresholdPace > 0)
      return (value / 100) * refs.thresholdPace
  }

  return null
}

function parseSwimTargetSplitMps(targetSplit: unknown): number | null {
  if (typeof targetSplit !== 'string') return null
  const text = targetSplit.trim()
  if (!text) return null

  const candidate = text.includes('-') ? text.split('-')[0]! : text
  const match = candidate.match(/(\d+):(\d+)\s*\/\s*(25|50|100)m/i)
  if (!match) return null

  const minutes = Number(match[1])
  const seconds = Number(match[2])
  const meters = Number(match[3])
  if (
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    !Number.isFinite(meters) ||
    meters <= 0
  ) {
    return null
  }

  const totalSeconds = minutes * 60 + seconds
  if (totalSeconds <= 0) return null
  return meters / totalSeconds
}

function inferSwimSpeedMps(
  step: any,
  refs: { ftp: number; lthr: number; maxHr: number; thresholdPace: number },
  fallbackOrder: StepMetric[]
): number | null {
  const splitSpeed = parseSwimTargetSplitMps(step?.targetSplit)
  if (splitSpeed && splitSpeed > 0) return splitSpeed

  const orderedMetrics: StepMetric[] = []
  const primaryTarget = normalizePrimaryTarget(step, fallbackOrder)
  if (primaryTarget) orderedMetrics.push(primaryTarget)
  for (const metric of fallbackOrder) {
    if (!orderedMetrics.includes(metric)) orderedMetrics.push(metric)
  }

  for (const metric of orderedMetrics) {
    if (metric !== 'pace') continue
    const target = step?.pace
    const value = getTargetMidpoint(target)
    if (value === null || !Number.isFinite(value) || value <= 0) continue
    const units = String(target?.units || '')
      .trim()
      .toLowerCase()

    if (units === 'm/s') return value
    if (units.includes('/')) {
      const splitText =
        units === '/km'
          ? `${value}:00/1000m`
          : units === '/100m' || units === '/50m' || units === '/25m'
            ? `${value}`
            : ''
      const parsed = parseSwimTargetSplitMps(splitText)
      if (parsed && parsed > 0) return parsed
    }
    if (units === 'pace' || units === '') {
      if (value >= 0.2 && value <= 3) return value
      if (refs.thresholdPace > 0 && value > 0 && value <= 1.5) {
        return value * refs.thresholdPace
      }
    }
  }

  if (refs.thresholdPace > 0) return refs.thresholdPace * 0.75
  return 0.65
}

export function toIntensityFactorFromTarget(
  target: any,
  kind: 'heartRate' | 'power' | 'pace',
  refs: {
    ftp: number
    lthr: number
    maxHr: number
    thresholdPace: number
    hrZones?: any[]
    powerZones?: any[]
    paceZones?: any[]
  }
): number | null {
  const valueRaw = getTargetMidpoint(target)
  if (valueRaw === null || !Number.isFinite(valueRaw)) return null
  const units = String(target?.units || '')
    .trim()
    .toLowerCase()

  const isRelative = units.includes('%') || units === 'relative' || units.includes('pct')
  const value = isRelative && valueRaw > 2 ? valueRaw / 100 : valueRaw

  const clamp = (n: number) => Math.max(0.3, Math.min(1.8, n))
  const paceValueToMps = (paceValue: number) => {
    if (!Number.isFinite(paceValue) || paceValue <= 0) return null
    if (units === 'm/s') return paceValue
    if (units.includes('/')) {
      const secondsPerKm = paceValue * 60
      return secondsPerKm > 0 ? 1000 / secondsPerKm : null
    }
    if (paceValue > 1.5 && paceValue < 8) return paceValue
    if (refs.thresholdPace > 0) {
      if (paceValue > 3) return paceValue / refs.thresholdPace
      return paceValue * refs.thresholdPace
    }
    return null
  }

  if (kind === 'heartRate') {
    if (units === 'bpm') {
      if (refs.lthr > 0) return clamp(value / refs.lthr)
      if (refs.maxHr > 0) return clamp(value / refs.maxHr)
      // If no reference, and it looks like BPM, we can't reliably return an IF.
      // Returning null allows classification logic to fall back to type/labels.
      return value > 30 ? null : clamp(value)
    }
    if (units.includes('zone')) {
      const bounds = getZoneBoundsFromRefs('heartRate', value, refs)
      if (bounds) return clamp((bounds.start + bounds.end) / 2)
      return clamp(0.45 + Math.max(1, Math.min(7, value)) * 0.1)
    }
    return isRelative || value <= 2 ? clamp(value) : null
  }

  if (kind === 'power') {
    if (units === 'w' || units === 'watts') {
      if (refs.ftp > 0) return clamp(value / refs.ftp)
      // No FTP reference: an absolute wattage cannot be converted to an intensity
      // factor. Never invent an FTP — a plausible-but-fabricated IF is worse than
      // `null`, because callers cannot tell it was made up. This mirrors the bpm
      // branch above and lets callers fall back to type/labels instead.
      return value > 3 ? null : clamp(value)
    }
    if (units === 'power_zone' || units.includes('zone') || units.startsWith('z')) {
      const bounds = getZoneBoundsFromRefs('power', value, refs)
      if (bounds) return clamp((bounds.start + bounds.end) / 2)
      return clamp(0.45 + Math.max(1, Math.min(7, value)) * 0.1)
    }
    return clamp(value > 3 ? value / 100 : value)
  }

  if (units.includes('zone')) {
    const bounds = getZoneBoundsFromRefs('pace', value, refs)
    if (bounds) return clamp((bounds.start + bounds.end) / 2)
    return clamp(0.45 + Math.max(1, Math.min(7, value)) * 0.1)
  }
  const metersPerSecond = paceValueToMps(value)
  if (metersPerSecond !== null && refs.thresholdPace > 0)
    return clamp(metersPerSecond / refs.thresholdPace)
  return isRelative || value <= 2 ? clamp(value) : null
}

export function selectStepIntensity(
  step: any,
  refs: {
    ftp: number
    lthr: number
    maxHr: number
    thresholdPace: number
    hrZones?: any[]
    powerZones?: any[]
    paceZones?: any[]
  },
  fallbackOrder: StepMetric[]
) {
  const orderedMetrics: StepMetric[] = []
  const primaryTarget = normalizePrimaryTarget(step, fallbackOrder)
  if (primaryTarget) orderedMetrics.push(primaryTarget)
  for (const metric of fallbackOrder) {
    if (!orderedMetrics.includes(metric)) orderedMetrics.push(metric)
  }

  for (const metric of orderedMetrics) {
    if (metric === 'rpe') {
      if (typeof step?.rpe === 'number') return Math.max(0.3, Math.min(1.3, step.rpe / 10))
      continue
    }
    const intensity = toIntensityFactorFromTarget(step?.[metric], metric, refs)
    if (intensity !== null) return intensity
  }

  if (step?.type === 'Rest' || step?.type === 'Cooldown') return 0.4
  if (step?.type === 'Warmup') return 0.5
  return 0.75
}

export function estimateStepDurationSeconds(
  step: any,
  context: {
    refs: { ftp: number; lthr: number; maxHr: number; thresholdPace: number }
    fallbackOrder: StepMetric[]
    workoutType?: string | null
  }
): number {
  const explicitDuration = Number(step?.durationSeconds || step?.duration || 0)
  if (explicitDuration > 0) return explicitDuration

  const explicitDistance = Number(step?.distance || 0)
  if (explicitDistance > 0) {
    const workoutType = String(context.workoutType || '').toLowerCase()
    if (workoutType.includes('run')) {
      const speedMps = inferStepSpeedMps(step, context.refs, context.fallbackOrder)
      if (speedMps && speedMps > 0) return Math.round(explicitDistance / speedMps)
    }
    if (workoutType.includes('swim')) {
      const speedMps = inferSwimSpeedMps(step, context.refs, context.fallbackOrder)
      if (speedMps && speedMps > 0) return Math.round(explicitDistance / speedMps)
      return Math.round(explicitDistance * 2)
    }

    return Math.round(explicitDistance * 0.36)
  }

  if (step?.type !== 'Rest') return 60
  return 0
}

export function estimateStepDistanceMeters(
  step: any,
  context: {
    refs: { ftp: number; lthr: number; maxHr: number; thresholdPace: number }
    fallbackOrder: StepMetric[]
    workoutType?: string | null
  }
): number {
  const explicitDistance = Number(step?.distance || 0)
  if (explicitDistance > 0) return explicitDistance

  const workoutType = String(context.workoutType || '').toLowerCase()
  if (!workoutType.includes('run')) return 0

  const durationSec = Number(step?.durationSeconds || step?.duration || 0)
  if (durationSec <= 0) return 0

  const speedMps = inferStepSpeedMps(step, context.refs, context.fallbackOrder)
  if (!(speedMps && speedMps > 0)) return 0
  return Math.round(durationSec * speedMps)
}

export function normalizeStructuredWorkoutForPersistence(
  structuredWorkout: any,
  context: NormalizeContext
) {
  const normalized = normalizeStructuredWorkoutRepetition(structuredWorkout)
  const isRun = String(context.workoutType || '')
    .toLowerCase()
    .includes('run')

  const visitStep = (step: any) => {
    if (!step || typeof step !== 'object') return

    if (step.durationSeconds === undefined && step.duration !== undefined) {
      const duration = toPositiveInt(step.duration)
      if (duration) step.durationSeconds = duration
    }

    const primaryTarget = normalizePrimaryTarget(
      step,
      context.targetPolicy.fallbackOrder as StepMetric[]
    )
    if (primaryTarget) step.primaryTarget = primaryTarget

    if (isRun) {
      applyRunTargetPolicyToStep(step, context.targetPolicy)
    }

    applyTargetFormatPolicyToStep(step, context.targetFormatPolicy, {
      ftp: context.refs.ftp,
      lthr: context.refs.lthr,
      maxHr: context.refs.maxHr,
      thresholdPace: context.refs.thresholdPace,
      hrZones: context.refs.hrZones,
      powerZones: context.refs.powerZones,
      paceZones: context.refs.paceZones
    })
    applyStepIntentGuard(step, {
      ftp: context.refs.ftp,
      lthr: context.refs.lthr,
      thresholdPace: context.refs.thresholdPace
    })

    for (const metric of ['power', 'heartRate', 'pace'] as const) {
      const target = step?.[metric]
      if (!target?.range) continue
      if (step?.type === 'Warmup' || step?.type === 'Cooldown') {
        if (metric === 'pace' && context.targetFormatPolicy.pace.preferRange) {
          target.ramp = false
        } else {
          target.ramp = true
        }
      } else if (step?.type === 'Rest' && target.ramp === undefined) {
        target.ramp = false
      }
    }

    if (Array.isArray(step.steps)) {
      step.steps.forEach((child: any) => visitStep(child))
    }
  }

  if (Array.isArray(normalized?.steps)) {
    normalized.steps.forEach((step: any) => visitStep(step))
  }

  return normalized
}

export function estimateStrengthExerciseDurationSec(exercise: any) {
  const parseMmSsToSeconds = (text: string): number | null => {
    const parts = text
      .trim()
      .split(':')
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length < 2 || parts.length > 3) return null
    const nums = parts.map((p) => Number(p))
    if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null
    if (parts.length === 2) {
      const mm = nums[0] ?? 0
      const ss = nums[1] ?? 0
      return Math.round(mm * 60 + ss)
    }
    const hh = nums[0] ?? 0
    const mm = nums[1] ?? 0
    const ss = nums[2] ?? 0
    return Math.round(hh * 3600 + mm * 60 + ss)
  }

  const parseRestSeconds = (raw: any, fallbackSeconds: number) => {
    const restText = String(raw || '')
      .trim()
      .toLowerCase()
    if (!restText) return fallbackSeconds
    const mmss = parseMmSsToSeconds(restText)
    if (mmss !== null) return mmss
    if (restText.includes('m') && !restText.includes('ms')) {
      return (parseFloat(restText) || 0) * 60
    }
    return parseFloat(restText) || fallbackSeconds
  }

  const distanceToMeters = (value: any, prescriptionMode: any): number | null => {
    const text = typeof value === 'string' ? value : String(value || '')
    const match = text.match(/(\d+(\.\d+)?)/)
    const n = match ? Number(match[1]) : NaN
    if (!Number.isFinite(n) || n <= 0) return null
    const mode = String(prescriptionMode || '').trim()
    if (mode === 'distance_meters') return n
    if (mode === 'distance_km') return n * 1000
    if (mode === 'distance_ft') return n * 0.3048
    if (mode === 'distance_yd') return n * 0.9144
    if (mode === 'distance_miles') return n * 1609.34
    return null
  }

  if (Array.isArray(exercise?.setRows) && exercise.setRows.length > 0) {
    let total = 0
    const prescriptionMode = String(exercise?.prescriptionMode || '').trim()
    const isDurationMode = prescriptionMode === 'duration'
    const isDistanceMode = prescriptionMode.startsWith('distance_')

    // Conservative default: a loaded carry / sled / farmer walk tends to be slow.
    // This is only used to avoid treating distance as "reps" (which explodes duration).
    const ASSUMED_DISTANCE_SPEED_MPS = 1.5
    for (const row of exercise.setRows) {
      if (isDurationMode) {
        const duration = toPositiveInt(row?.value)
        if (duration) {
          total += duration
        }
      } else if (isDistanceMode) {
        const meters = distanceToMeters(row?.value, prescriptionMode)
        if (meters) {
          total += meters / ASSUMED_DISTANCE_SPEED_MPS
        }
      } else {
        let reps = 10
        const value = typeof row?.value === 'string' ? row.value : String(row?.value || '')
        const match = value.match(/\d+/)
        if (match) reps = Number(match[0])
        if (value.toLowerCase().includes('/side') || value.toLowerCase().includes('per side')) {
          reps *= 2
        }

        const repDurationSec = 5
        total += reps * repDurationSec
      }

      const restDurationSec = parseRestSeconds(
        row?.restOverride || exercise?.defaultRest || '',
        isDurationMode ? 0 : 90
      )
      total += restDurationSec
    }

    return Math.round(total)
  }

  if (
    String(exercise?.prescriptionType || exercise?.prescriptionMode || '').trim() === 'duration'
  ) {
    const sets = toPositiveInt(exercise?.sets) || 1
    const duration = toPositiveInt(exercise?.value) || toPositiveInt(exercise?.duration) || 0
    if (duration > 0) return duration * sets
  }

  const explicitDuration = toPositiveInt(exercise?.duration)
  if (explicitDuration) return explicitDuration

  const sets = toPositiveInt(exercise?.sets) || 1
  let reps = 10
  if (
    typeof exercise?.value === 'number' &&
    Number.isFinite(exercise.value) &&
    exercise.value > 0
  ) {
    reps = Number(exercise.value)
  } else if (typeof exercise?.value === 'string') {
    const match = exercise.value.match(/\d+/)
    if (match) reps = Number(match[0])
  } else if (
    typeof exercise?.reps === 'number' &&
    Number.isFinite(exercise.reps) &&
    exercise.reps > 0
  ) {
    reps = Number(exercise.reps)
  } else if (typeof exercise?.reps === 'string') {
    const match = exercise.reps.match(/\d+/)
    if (match) reps = Number(match[0])
  }

  const repDurationSec = 5
  const workDurationSec = sets * reps * repDurationSec

  let restDurationSec = 90
  if (typeof exercise?.rest === 'string' && exercise.rest.trim()) {
    restDurationSec = parseRestSeconds(exercise.rest, 90)
  }

  return Math.round(workDurationSec + sets * restDurationSec)
}

export function computeStrengthExerciseMetrics(exercises: any[] | undefined | null) {
  let durationSec = 0

  for (const exercise of exercises || []) {
    durationSec += estimateStrengthExerciseDurationSec(exercise)
  }

  const tss = durationSec > 0 ? Math.round((durationSec / 3600) * 40) : 0
  const workIntensity =
    durationSec > 0 && tss > 0 ? Number(Math.sqrt((36 * tss) / durationSec).toFixed(2)) : null

  return { durationSec, tss, workIntensity }
}

function collectStrengthExercises(structuredWorkout: any) {
  if (Array.isArray(structuredWorkout?.blocks) && structuredWorkout.blocks.length > 0) {
    return structuredWorkout.blocks.flatMap((block: any) => block?.steps || [])
  }

  return structuredWorkout?.exercises || []
}

export function computeStructuredWorkoutMetrics(
  structuredWorkout: any,
  context: {
    refs: { ftp: number; lthr: number; maxHr: number; thresholdPace: number }
    fallbackOrder: StepMetric[]
    workoutType?: string | null
  }
) {
  const walk = (steps: any[]): { duration: number; tss: number; distance: number } => {
    let duration = 0
    let tss = 0
    let distance = 0

    for (const step of steps || []) {
      const reps = toPositiveInt(step?.reps) || 1
      let stepDuration: number
      let stepTss: number
      let stepDistance: number

      if (Array.isArray(step?.steps) && step.steps.length > 0) {
        const nested = walk(step.steps)
        stepDuration = nested.duration
        stepTss = nested.tss
        stepDistance = nested.distance
      } else {
        stepDuration = estimateStepDurationSeconds(step, context)
        stepDistance = estimateStepDistanceMeters(step, context)

        const intensity = selectStepIntensity(step, context.refs, context.fallbackOrder)
        stepTss = stepDuration > 0 ? ((stepDuration * intensity * intensity) / 3600) * 100 : 0
      }

      duration += stepDuration * reps
      tss += stepTss * reps
      distance += stepDistance * reps
    }

    return { duration, tss, distance }
  }

  const totals = walk(structuredWorkout?.steps || [])
  const strengthMetrics = computeStrengthExerciseMetrics(
    collectStrengthExercises(structuredWorkout)
  )
  const durationSec = Math.round(totals.duration + strengthMetrics.durationSec)
  const tss = Math.round(totals.tss + strengthMetrics.tss)
  const workIntensity =
    durationSec > 0 && tss > 0 ? Number(Math.sqrt((36 * tss) / durationSec).toFixed(2)) : null
  const distanceMeters = Math.round(totals.distance)
  return { durationSec, distanceMeters, tss, workIntensity }
}

export function computeStructuredWorkoutDurationSec(structuredWorkout: any) {
  return computeStructuredWorkoutMetrics(structuredWorkout, {
    refs: {
      ftp: 0,
      lthr: 0,
      maxHr: 0,
      thresholdPace: 0
    },
    fallbackOrder: ['power', 'heartRate', 'pace', 'rpe']
  }).durationSec
}

export function getPendingSyncStatus(syncStatus: string | null | undefined) {
  return syncStatus === 'LOCAL_ONLY' ? 'LOCAL_ONLY' : 'PENDING'
}

export function hasRenderableStructure(structuredWorkout: unknown): boolean {
  if (!structuredWorkout || typeof structuredWorkout !== 'object') return false

  const structure = structuredWorkout as Record<string, unknown>
  if (Array.isArray(structure.steps) && structure.steps.length > 0) return true
  if (Array.isArray(structure.exercises) && structure.exercises.length > 0) return true

  if (Array.isArray(structure.blocks) && structure.blocks.length > 0) {
    return structure.blocks.some((block) => {
      if (!block || typeof block !== 'object') return false
      const steps = (block as Record<string, unknown>).steps
      return Array.isArray(steps) && steps.length > 0
    })
  }

  return false
}
