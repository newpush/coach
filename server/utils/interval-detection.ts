import { calculatePowerZones, calculateHrZones, identifyZone } from './zones'

/**
 * Utility for detecting intervals and peak efforts in workout stream data
 */

export interface Interval {
  start_index: number
  end_index: number
  start_time: number
  end_time: number
  duration: number
  avg_power?: number
  avg_heartrate?: number
  avg_pace?: number
  avg_cadence?: number
  cadence_start?: number
  cadence_end?: number
  max_power?: number
  max_heartrate?: number
  type: 'WORK' | 'RECOVERY' | 'WARMUP' | 'COOLDOWN' | 'STEADY'
  intensity_zone?: number // 1-7 for cycling power zones, 1-5 for HR/Pace
  label?: string
  match_score?: number // 0-1 score indicating how well it matches a planned step
  planned_step_id?: string
  classification_confidence?: number
  detection_confidence?: number
  ambiguity_note?: string
}

export interface PlannedStep {
  name?: string
  durationSeconds?: number
  duration?: number
  type?: string
  power?: { value?: number; range?: { start: number; end: number } }
  heartRate?: { value?: number; range?: { start: number; end: number } }
  pace?: { value?: number; range?: { start: number; end: number } }
  cadence?: number
  ramp?: boolean
}

export interface PeakEffort {
  duration: number
  duration_label: string
  start_time: number
  end_time: number
  value: number
  metric: 'power' | 'heartrate' | 'pace'
}

export interface ProviderIntervalSummary {
  type?: string | null
  /** Provider intensity as a percentage of threshold (Intervals.icu `intensity`) */
  intensity?: number | null
  avgPower?: number | null
  avgSpeed?: number | null
}

const PROVIDER_RECOVERY_TOKENS = [
  'rest',
  'recover',
  'recuper',
  'warm',
  'cool',
  'calentamiento',
  'enfriamiento',
  'descanso'
]

/**
 * Providers label synced laps inconsistently. Intervals.icu in particular marks
 * nearly every lap `WORK` — warmups, recovery jogs and cooldowns included — so
 * trusting the string verbatim makes a 4x4min threshold session look like ten
 * work reps of wildly different intensity.
 *
 * Re-derive the type from the intensity profile of the session itself: a lap
 * well below the session's own work band is recovery, and a low-intensity lap
 * at either end is a warmup/cooldown. Explicit recovery-ish labels are always
 * honoured — this only ever demotes a generic WORK lap, never promotes one.
 */
export function resolveProviderIntervalTypes(intervals: ProviderIntervalSummary[]): string[] {
  const originalTypes = intervals.map((interval) => String(interval?.type || 'WORK'))
  if (intervals.length < 3) return originalTypes

  const isExplicitRecovery = originalTypes.map((type) => {
    const lower = type.toLowerCase()
    return PROVIDER_RECOVERY_TOKENS.some((token) => lower.includes(token))
  })

  // Prefer the provider's own intensity (% of threshold); fall back to raw
  // power, then speed. Units do not matter — every comparison is a ratio
  // against the other laps of the same workout.
  const useIntensity = intervals.some((i) => Number.isFinite(Number(i?.intensity)))
  const usePower = !useIntensity && intervals.some((i) => Number.isFinite(Number(i?.avgPower)))
  const useSpeed =
    !useIntensity && !usePower && intervals.some((i) => Number.isFinite(Number(i?.avgSpeed)))
  if (!useIntensity && !usePower && !useSpeed) return originalTypes

  const levels = intervals.map((interval) => {
    const value = Number(
      useIntensity ? interval?.intensity : usePower ? interval?.avgPower : interval?.avgSpeed
    )
    return Number.isFinite(value) && value > 0 ? value : null
  })

  const known = levels.filter((level): level is number => level !== null)
  if (known.length < 3) return originalTypes

  // Work band = median of the top third of laps, so a single short spike does
  // not define "hard" for the whole session.
  const sorted = [...known].sort((a, b) => b - a)
  const topCount = Math.max(1, Math.round(sorted.length / 3))
  const top = sorted.slice(0, topCount)
  const workBand = top[Math.floor(top.length / 2)]!
  if (!(workBand > 0)) return originalTypes

  const RECOVERY_RATIO = 0.75
  const EDGE_RATIO = 0.85

  const demoted = levels.map((level, index) => {
    if (level === null || isExplicitRecovery[index]) return false
    const ratio = level / workBand
    if (ratio < RECOVERY_RATIO) return true
    // A first/last lap that sits clearly below the work band is a warmup or
    // cooldown even when it is not deep in recovery territory.
    const isEdge = index === 0 || index === intervals.length - 1
    return isEdge && ratio < EDGE_RATIO
  })

  const resolved = originalTypes.map((type, index) => (demoted[index] ? 'RECOVERY' : type))

  // Name the outermost demoted lap at each end for what it is. Trailing stubs
  // the provider already flagged as recovery are skipped over, and only the
  // first demoted lap reached is renamed — anything further in is a genuine
  // between-reps recovery, not part of the warmup/cooldown.
  const isRecoveryish = (index: number) => isExplicitRecovery[index] || demoted[index]
  for (let index = 0; index < resolved.length && isRecoveryish(index); index++) {
    if (demoted[index]) {
      resolved[index] = 'WARMUP'
      break
    }
  }
  for (let index = resolved.length - 1; index >= 0 && isRecoveryish(index); index--) {
    if (demoted[index]) {
      resolved[index] = 'COOLDOWN'
      break
    }
  }

  return resolved
}

/**
 * Detect intervals in a workout based on power or heart rate data
 * Uses a moving average and threshold-based approach
 */
export function detectIntervals(
  times: number[],
  values: number[],
  metricType: 'power' | 'heartrate' | 'pace',
  threshold?: number, // FTP or Threshold Pace/HR
  plannedSteps?: PlannedStep[],
  smoothedValues?: number[],
  cadenceValues?: number[]
): Interval[] {
  if (!times || !values || times.length !== values.length || times.length === 0) {
    return []
  }

  // 1. Smooth the data
  // Use provided smoothedValues (e.g. rolling NP) or calculate centered SMA
  const smoothed = smoothedValues || smoothData(values, 10)

  const plannedGuided = detectIntervalsFromPlannedSteps(
    times,
    values,
    metricType,
    threshold,
    plannedSteps,
    smoothed,
    cadenceValues
  )
  if (plannedGuided.length > 0) {
    return plannedGuided
  }

  // 2. Determine threshold for "Work" vs "Recovery"
  // If no manual threshold provided, estimate baseline
  const baseline = threshold || calculateBaseline(smoothed)

  // For power, work is typically > 70% FTP (Zone 2/3 border)
  // For HR, work is > 65% Max (approx Z2)
  const workThreshold = metricType === 'power' ? baseline * 0.7 : baseline * 0.65

  let intervals: Interval[] = []
  let inInterval = false
  let startIndex = 0

  // Minimum duration for an interval (e.g., 30 seconds)
  const minDuration = 30

  // Minimum recovery between intervals (e.g., 15 seconds)
  // Used to merge close intervals
  const minRecovery = 15

  // First pass: Detect candidate intervals
  const candidates: { start: number; end: number }[] = []

  for (let i = 0; i < smoothed.length; i++) {
    const smoothedValue = smoothed[i]
    if (smoothedValue === undefined) continue

    const isWork = smoothedValue >= workThreshold

    if (isWork && !inInterval) {
      // Start of potential interval
      inInterval = true
      startIndex = i
    } else if (!isWork && inInterval) {
      // End of potential interval
      inInterval = false
      const currentTime = times[i]
      const startTime = times[startIndex]

      if (currentTime !== undefined && startTime !== undefined) {
        const duration = currentTime - startTime

        if (duration >= minDuration) {
          candidates.push({ start: startIndex, end: i })
        }
      }
    }
  }

  // Handle case where workout ends during an interval
  const lastTime = times[times.length - 1]
  const lastStartTime = times[startIndex]
  if (inInterval && lastTime !== undefined && lastStartTime !== undefined) {
    const duration = lastTime - lastStartTime
    if (duration >= minDuration) {
      candidates.push({ start: startIndex, end: times.length - 1 })
    }
  }

  // Second pass: Merge close intervals
  const merged: { start: number; end: number }[] = []
  if (candidates.length > 0) {
    let current = { ...candidates[0]! }

    for (let i = 1; i < candidates.length; i++) {
      const next = candidates[i]
      if (!next) continue

      const tNextStart = times[next.start]
      const tCurrentEnd = times[current.end]

      if (tNextStart !== undefined && tCurrentEnd !== undefined) {
        const gap = tNextStart - tCurrentEnd

        if (gap < minRecovery) {
          // Merge
          current.end = next.end
        } else {
          merged.push(current)
          current = { ...next }
        }
      } else {
        merged.push(current)
        current = { ...next }
      }
    }
    if (current) merged.push(current)
  }

  // Third pass: Classify and calculate stats
  // Identify warmup (first segment before first work interval)
  // Identify cooldown (segment after last work interval)

  let lastEndIndex = 0

  // SPECIAL CASE: If no intervals detected but the duration is long (> 15 min),
  // and average is reasonable (> 40% FTP), classify the whole thing as STEADY.
  if (merged.length === 0 && times.length > 0) {
    const totalDuration = (times[times.length - 1] || 0) - (times[0] || 0)
    const avgValue = values.reduce((a, b) => a + (b || 0), 0) / values.length
    const isSteady =
      totalDuration > 900 && // 15 mins
      (metricType === 'power' ? avgValue >= baseline * 0.4 : avgValue >= baseline * 0.5)

    if (isSteady) {
      intervals = [
        createIntervalObj(times, values, 0, times.length - 1, 'WORK', threshold, metricType)
      ]
    }
  } else {
    merged.forEach((candidate, index) => {
      // Add recovery/warmup segment before this work interval
      if (candidate.start > lastEndIndex) {
        const type = index === 0 ? 'WARMUP' : 'RECOVERY'
        if (times[lastEndIndex] !== undefined && times[candidate.start] !== undefined) {
          intervals.push(
            createIntervalObj(
              times,
              values,
              lastEndIndex,
              candidate.start,
              type,
              threshold,
              metricType,
              cadenceValues
            )
          )
        }
      }

      // Add the work interval
      if (times[candidate.start] !== undefined && times[candidate.end] !== undefined) {
        intervals.push(
          createIntervalObj(
            times,
            values,
            candidate.start,
            candidate.end,
            'WORK',
            threshold,
            metricType,
            cadenceValues
          )
        )
      }

      lastEndIndex = candidate.end
    })

    // Add cooldown if there's data after the last interval
    if (
      lastEndIndex < times.length - 1 &&
      times[lastEndIndex] !== undefined &&
      times[times.length - 1] !== undefined
    ) {
      intervals.push(
        createIntervalObj(
          times,
          values,
          lastEndIndex,
          times.length - 1,
          'COOLDOWN',
          threshold,
          metricType,
          cadenceValues
        )
      )
    }
  }

  // 4. Guided Matching (if planned steps available)
  if (plannedSteps && plannedSteps.length > 0 && intervals.length > 0) {
    // Basic greedy matching for now: align "WORK" intervals with planned WORK steps
    const plannedWorkSteps = plannedSteps.filter((s) => s.type === 'WORK' || !s.type)
    const detectedWorkIntervals = intervals.filter((i) => i.type === 'WORK')

    if (plannedWorkSteps.length > 0 && detectedWorkIntervals.length > 0) {
      detectedWorkIntervals.forEach((interval, idx) => {
        const plannedStep = plannedWorkSteps[idx]
        if (plannedStep) {
          interval.label = plannedStep.name
          // Calculate match score based on duration
          const plannedDur = plannedStep.durationSeconds || plannedStep.duration || 0
          if (plannedDur > 0) {
            const ratio =
              Math.min(interval.duration, plannedDur) / Math.max(interval.duration, plannedDur)
            interval.match_score = ratio
          }
        }
      })
    }
  }

  return intervals
}

type NormalizedPlannedDetectionStep = {
  id: string
  name?: string
  durationSeconds: number
  type: Interval['type']
  metricTarget: number | null
  cadence: number | null
  ramp: boolean
}

function normalizePlannedStepType(type: unknown, name?: string): Interval['type'] {
  const normalized = String(type || '').toLowerCase()
  const normalizedName = String(name || '').toLowerCase()
  const recoveryTokens = ['rest', 'recovery', 'cooldown', 'warmup', 'recuperación', 'enfriamiento']

  if (normalized.includes('warm') || normalizedName.includes('calentamiento')) return 'WARMUP'
  if (normalized.includes('cool') || normalizedName.includes('enfriamiento')) return 'COOLDOWN'
  if (
    recoveryTokens.some((t) => normalized.includes(t) || normalizedName.includes(t)) ||
    normalizedName.includes('descanso')
  ) {
    return 'RECOVERY'
  }
  return 'WORK'
}

function getTargetMidpoint(
  target: PlannedStep['power'] | PlannedStep['heartRate'] | PlannedStep['pace']
) {
  if (!target || typeof target !== 'object') return null
  const value = typeof target.value === 'number' ? target.value : null
  if (value !== null && Number.isFinite(value)) return value
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

function getPlannedTargetForMetric(
  step: PlannedStep,
  metricType: 'power' | 'heartrate' | 'pace'
): number | null {
  if (metricType === 'power') return getTargetMidpoint(step.power)
  if (metricType === 'heartrate') return getTargetMidpoint(step.heartRate)
  return getTargetMidpoint(step.pace)
}

function flattenPlannedStepsForDetection(
  steps: PlannedStep[] | undefined,
  metricType: 'power' | 'heartrate' | 'pace',
  path = 'step'
): NormalizedPlannedDetectionStep[] {
  const flattened: NormalizedPlannedDetectionStep[] = []
  for (let index = 0; index < (steps || []).length; index++) {
    const step = steps?.[index]
    if (!step || typeof step !== 'object') continue
    const durationSeconds = Number(step.durationSeconds || step.duration || 0)
    if (Array.isArray((step as any).steps) && (step as any).steps.length > 0) {
      const reps = Math.max(1, Math.trunc(Number((step as any).reps || 1)) || 1)
      for (let rep = 0; rep < reps; rep++) {
        flattened.push(
          ...flattenPlannedStepsForDetection(
            (step as any).steps,
            metricType,
            `${path}-${index}-${rep}`
          )
        )
      }
      continue
    }
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) continue
    flattened.push({
      id: `${path}-${index}`,
      name: step.name,
      durationSeconds,
      type: normalizePlannedStepType(step.type, step.name),
      metricTarget: getPlannedTargetForMetric(step, metricType),
      cadence:
        typeof step.cadence === 'number' && Number.isFinite(step.cadence) ? step.cadence : null,
      ramp: Boolean((step as any).ramp || normalizePlannedStepType(step.type) === 'COOLDOWN')
    })
  }
  return flattened
}

function findIndexAtOrAfterTime(times: number[], targetTime: number, fallbackIndex: number) {
  for (let index = fallbackIndex; index < times.length; index++) {
    const time = times[index]
    if (time !== undefined && time >= targetTime) return index
  }
  return times.length - 1
}

function computeSegmentAverage(
  data: number[] | undefined,
  start: number,
  end: number
): number | null {
  if (!data || data.length === 0 || start > end) return null
  const values = data.slice(start, end + 1).filter((value) => Number.isFinite(value))
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function normalizeMetricDelta(
  actualValue: number | null,
  targetValue: number | null,
  metricType: 'power' | 'heartrate' | 'pace',
  threshold?: number
) {
  if (
    actualValue === null ||
    targetValue === null ||
    !Number.isFinite(actualValue) ||
    !Number.isFinite(targetValue) ||
    targetValue <= 0
  ) {
    return null
  }

  if (metricType === 'power' || metricType === 'heartrate') {
    const denominator = threshold && threshold > 0 ? threshold : targetValue
    return Math.abs(actualValue - targetValue) / Math.max(1, denominator)
  }

  return Math.abs(actualValue - targetValue) / targetValue
}

function scoreBoundaryCandidate(params: {
  candidateIndex: number
  currentStartIdx: number
  endLimitIdx: number
  expectedBoundaryIdx: number
  values: number[]
  smoothed: number[]
  cadenceValues?: number[]
  metricType: 'power' | 'heartrate' | 'pace'
  threshold?: number
  currentStep: NormalizedPlannedDetectionStep
  nextStep: NormalizedPlannedDetectionStep
}): { score: number; ambiguityNote?: string } {
  const {
    candidateIndex,
    currentStartIdx,
    endLimitIdx,
    expectedBoundaryIdx,
    values,
    smoothed,
    cadenceValues,
    metricType,
    threshold,
    currentStep,
    nextStep
  } = params

  const beforeWindow = Math.max(8, Math.min(45, Math.round(currentStep.durationSeconds * 0.2)))
  const afterWindow = Math.max(8, Math.min(45, Math.round(nextStep.durationSeconds * 0.2)))
  const beforeStart = Math.max(currentStartIdx, candidateIndex - beforeWindow)
  const afterEnd = Math.min(endLimitIdx, candidateIndex + afterWindow)

  const beforeAvg = computeSegmentAverage(smoothed, beforeStart, candidateIndex)
  const afterAvg = computeSegmentAverage(smoothed, candidateIndex + 1, afterEnd)
  const beforeCadence = computeSegmentAverage(cadenceValues, beforeStart, candidateIndex)
  const afterCadence = computeSegmentAverage(cadenceValues, candidateIndex + 1, afterEnd)

  let score = 1
  const distancePenalty =
    Math.abs(candidateIndex - expectedBoundaryIdx) / Math.max(10, beforeWindow)
  score -= Math.min(distancePenalty, 1.5) * 0.4

  const currentDelta = normalizeMetricDelta(
    beforeAvg,
    currentStep.metricTarget,
    metricType,
    threshold
  )
  if (currentDelta !== null) score += Math.max(0, 1 - currentDelta * 4) * 0.7

  const nextDelta = normalizeMetricDelta(afterAvg, nextStep.metricTarget, metricType, threshold)
  if (nextDelta !== null) score += Math.max(0, 1 - nextDelta * 4) * 0.7

  if (currentStep.cadence !== null && beforeCadence !== null) {
    score += Math.max(0, 1 - Math.abs(beforeCadence - currentStep.cadence) / 12) * 0.35
  }
  if (nextStep.cadence !== null && afterCadence !== null) {
    score += Math.max(0, 1 - Math.abs(afterCadence - nextStep.cadence) / 12) * 0.35
  }

  if (beforeAvg !== null && afterAvg !== null) {
    const transitionDelta = afterAvg - beforeAvg
    if (currentStep.type === 'WORK' && nextStep.type === 'RECOVERY') {
      score += transitionDelta < -Math.max(2, beforeAvg * 0.05) ? 0.9 : -0.5
    } else if (currentStep.type === 'RECOVERY' && nextStep.type === 'WORK') {
      score += transitionDelta > Math.max(2, beforeAvg * 0.05) ? 0.9 : -0.5
    } else if (currentStep.type === 'WORK' && nextStep.type === 'COOLDOWN') {
      score += transitionDelta < -Math.max(2, beforeAvg * 0.05) ? 0.8 : -0.3
    } else if (currentStep.type === 'RECOVERY' && nextStep.type === 'COOLDOWN') {
      score += transitionDelta < -Math.max(1.5, beforeAvg * 0.03) ? 1.1 : -0.2
      const tailTrend =
        afterEnd > candidateIndex + 6
          ? (smoothed[afterEnd] || 0) - (smoothed[candidateIndex + 1] || 0)
          : 0
      if (nextStep.ramp || nextStep.type === 'COOLDOWN') {
        score += tailTrend < 0 ? 0.7 : -0.2
      }
    }
  }

  const durationRatio =
    (candidateIndex - currentStartIdx + 1) / Math.max(1, Math.round(currentStep.durationSeconds))
  let ambiguityNote: string | undefined
  if (currentStep.type === 'RECOVERY' && nextStep.type === 'COOLDOWN' && durationRatio > 1.35) {
    ambiguityNote =
      'Late recovery/cooldown split is ambiguous; boundary inferred from planned structure.'
    score -= 0.2
  }

  return { score, ambiguityNote }
}

function detectIntervalsFromPlannedSteps(
  times: number[],
  values: number[],
  metricType: 'power' | 'heartrate' | 'pace',
  threshold?: number,
  plannedSteps?: PlannedStep[],
  smoothedValues?: number[],
  cadenceValues?: number[]
): Interval[] {
  const flattened = flattenPlannedStepsForDetection(plannedSteps, metricType)
  if (flattened.length < 2) return []

  const firstTime = times[0]
  const lastTime = times[times.length - 1]
  if (firstTime === undefined || lastTime === undefined || lastTime <= firstTime) return []

  const plannedDuration = flattened.reduce((sum, step) => sum + step.durationSeconds, 0)
  if (plannedDuration <= 0) return []

  const actualDuration = lastTime - firstTime
  const scale = actualDuration / plannedDuration
  const smoothed = smoothedValues || smoothData(values, 10)
  const intervals: Interval[] = []
  let currentStartIdx = 0
  let plannedElapsed = 0

  for (let index = 0; index < flattened.length; index++) {
    const step = flattened[index]!
    const plannedEndTime = firstTime + (plannedElapsed + step.durationSeconds) * scale
    const isLast = index === flattened.length - 1
    let endIdx = isLast
      ? times.length - 1
      : findIndexAtOrAfterTime(times, plannedEndTime, currentStartIdx)
    let confidence = 0.7
    let ambiguityNote: string | undefined

    if (!isLast) {
      const nextStep = flattened[index + 1]!
      const searchSeconds = Math.max(
        15,
        Math.min(75, Math.round(Math.min(step.durationSeconds, nextStep.durationSeconds) * 0.25))
      )
      const expectedBoundaryTime = times[endIdx] || plannedEndTime
      const startSearchTime = expectedBoundaryTime - searchSeconds
      const endSearchTime = expectedBoundaryTime + searchSeconds
      const minCurrentSeconds = Math.max(20, Math.round(step.durationSeconds * 0.45))
      const minNextSeconds = Math.max(20, Math.round(nextStep.durationSeconds * 0.45))

      let searchStartIdx = currentStartIdx
      while (searchStartIdx < endIdx && (times[searchStartIdx] || 0) < startSearchTime)
        searchStartIdx++
      let searchEndIdx = endIdx
      while (searchEndIdx < times.length - 1 && (times[searchEndIdx] || 0) < endSearchTime)
        searchEndIdx++

      let best = { index: endIdx, score: -Infinity, ambiguityNote: undefined as string | undefined }
      for (let candidateIndex = searchStartIdx; candidateIndex <= searchEndIdx; candidateIndex++) {
        const currentDuration = (times[candidateIndex] || 0) - (times[currentStartIdx] || 0)
        const nextDuration = (lastTime || 0) - (times[candidateIndex] || 0)
        if (currentDuration < minCurrentSeconds || nextDuration < minNextSeconds) continue
        const candidate = scoreBoundaryCandidate({
          candidateIndex,
          currentStartIdx,
          endLimitIdx: times.length - 1,
          expectedBoundaryIdx: endIdx,
          values,
          smoothed,
          cadenceValues,
          metricType,
          threshold,
          currentStep: step,
          nextStep
        })
        if (candidate.score > best.score) {
          best = {
            index: candidateIndex,
            score: candidate.score,
            ambiguityNote: candidate.ambiguityNote
          }
        }
      }

      endIdx = best.index
      ambiguityNote = best.ambiguityNote
      confidence = Math.max(0.35, Math.min(0.99, 0.45 + Math.max(0, best.score) / 4))
    }

    const interval = createIntervalObj(
      times,
      values,
      currentStartIdx,
      endIdx,
      step.type,
      threshold,
      metricType,
      cadenceValues
    )
    interval.label = step.name
    interval.planned_step_id = step.id
    interval.match_score = Math.max(
      0,
      Math.min(
        1,
        Math.min(interval.duration, step.durationSeconds) /
          Math.max(interval.duration, step.durationSeconds)
      )
    )
    interval.classification_confidence = confidence
    interval.detection_confidence = confidence
    if (ambiguityNote) interval.ambiguity_note = ambiguityNote
    intervals.push(interval)

    currentStartIdx = Math.min(endIdx + 1, times.length - 1)
    plannedElapsed += step.durationSeconds
  }

  return intervals.filter((interval) => interval.duration > 0)
}

/**
 * Find peak efforts for standard durations (1min, 5min, 20min, etc.)
 */
export function findPeakEfforts(
  times: number[],
  values: number[],
  metric: 'power' | 'heartrate' | 'pace'
): PeakEffort[] {
  if (!values || values.length === 0) return []

  const durations = [
    { sec: 5, label: '5s' },
    { sec: 30, label: '30s' },
    { sec: 60, label: '1m' },
    { sec: 300, label: '5m' },
    { sec: 600, label: '10m' },
    { sec: 1200, label: '20m' },
    { sec: 3600, label: '60m' }
  ]

  const peaks: PeakEffort[] = []

  // Optimization: Pre-calculate prefix sums for O(1) range sum queries?
  // Since we need max average, a simple sliding window is O(N) per duration.

  for (const dur of durations) {
    const lastTime = times[times.length - 1]
    if (lastTime === undefined || lastTime < dur.sec) continue

    // Find approximate number of data points for this duration
    // Assuming 1Hz sampling for simplicity, or we check timestamps
    // Robust approach: Sliding window on time

    let maxSum = -Infinity
    let bestStartIdx = -1
    let bestEndIdx = -1

    let currentSum = 0
    let startPtr = 0

    for (let endPtr = 0; endPtr < values.length; endPtr++) {
      const val = values[endPtr]
      if (val !== undefined) currentSum += val

      // Shrink window from left until duration is approx correct
      // We want times[endPtr] - times[startPtr] approx dur.sec

      while (times[endPtr] !== undefined && times[startPtr] !== undefined) {
        const tEnd = times[endPtr]
        const tStart = times[startPtr]
        if (tEnd !== undefined && tStart !== undefined && tEnd - tStart > dur.sec) {
          const startVal = values[startPtr]
          if (startVal !== undefined) currentSum -= startVal
          startPtr++
        } else {
          break
        }
      }

      // Check if window is valid duration (close enough)
      const tEnd = times[endPtr]
      const tStart = times[startPtr]

      if (tEnd !== undefined && tStart !== undefined) {
        const windowDuration = tEnd - tStart
        if (windowDuration >= dur.sec * 0.95) {
          // Allow slight tolerance
          const avg = currentSum / (endPtr - startPtr + 1)
          if (avg > maxSum) {
            maxSum = avg
            bestStartIdx = startPtr
            bestEndIdx = endPtr
          }
        }
      }
    }

    if (bestStartIdx !== -1 && bestEndIdx !== -1) {
      const startTimeValue = times[bestStartIdx]
      const endTimeValue = times[bestEndIdx]
      if (startTimeValue !== undefined && endTimeValue !== undefined) {
        peaks.push({
          duration: dur.sec,
          duration_label: dur.label,
          start_time: startTimeValue,
          end_time: endTimeValue,
          value: Math.round(maxSum),
          metric
        })
      }
    }
  }

  return peaks
}

// --- Helper Functions ---

function smoothData(data: number[], windowSize: number): number[] {
  const result: number[] = []
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2))
    const end = Math.min(data.length, i + Math.ceil(windowSize / 2))
    const subset = data.slice(start, end)
    const avg = subset.reduce((a, b) => a + (b || 0), 0) / subset.length
    result.push(avg)
  }
  return result
}

function calculateBaseline(data: number[]): number {
  // Simple baseline: Median or Mean of non-zero values
  const nonZeros = data.filter((v) => v > 0).sort((a, b) => a - b)
  if (nonZeros.length === 0) return 0
  const median = nonZeros[Math.floor(nonZeros.length / 2)]
  return median !== undefined ? median : 0
}

function createIntervalObj(
  times: number[],
  values: number[],
  startIdx: number,
  endIdx: number,
  type: Interval['type'],
  threshold?: number,
  metricType?: 'power' | 'heartrate' | 'pace',
  cadenceValues?: number[]
): Interval {
  const segmentValues = values.slice(startIdx, endIdx + 1)
  const sum = segmentValues.reduce((a, b) => a + (b || 0), 0)
  const avg = sum / segmentValues.length
  const max = Math.max(...segmentValues.map((v) => v || 0))
  const cadenceSegment = cadenceValues
    ?.slice(startIdx, endIdx + 1)
    .filter((value) => Number.isFinite(value))
  const avgCadence =
    cadenceSegment && cadenceSegment.length > 0
      ? cadenceSegment.reduce((sum, value) => sum + value, 0) / cadenceSegment.length
      : undefined

  let intensity_zone: number | undefined

  if (threshold && metricType) {
    if (metricType === 'power') {
      const zones = calculatePowerZones(threshold)
      const zone = identifyZone(avg, zones)
      if (zone) {
        // Extract zone number from name "Z2 Endurance" -> 2
        const match = zone.name.match(/^Z(\d+)/)
        if (match && match[1]) intensity_zone = parseInt(match[1])
      }
    } else if (metricType === 'heartrate') {
      // Estimate maxHR roughly if threshold is LTHR
      // Or assume threshold passed IS MaxHR? The function signature says "FTP or Threshold Pace/HR"
      // Let's assume for HR detection, threshold passed is usually MaxHR or LTHR.
      // The identifyZone logic expects LTHR for HrZones usually.
      // This is a bit ambiguous in the original code.
      // For now, let's skip zone detection for HR here to avoid breakage,
      // or implement a simple check if we want.
    }
  }

  const startTimeValue = times[startIdx] || 0
  const endTimeValue = times[endIdx] || 0

  return {
    start_index: startIdx,
    end_index: endIdx,
    start_time: startTimeValue,
    end_time: endTimeValue,
    duration: endTimeValue - startTimeValue,
    ...(metricType === 'power' ? { avg_power: avg, max_power: max } : {}),
    ...(metricType === 'heartrate' ? { avg_heartrate: avg, max_heartrate: max } : {}),
    ...(metricType === 'pace' ? { avg_pace: avg } : {}),
    ...(avgCadence !== undefined
      ? {
          avg_cadence: avgCadence,
          cadence_start: cadenceValues?.[startIdx],
          cadence_end: cadenceValues?.[endIdx]
        }
      : {}),
    type,
    intensity_zone
    // Add generic average based on what 'values' represents?
    // In real implementation, we'd pass all streams to calculate all averages
  }
}

/**
 * Calculate basic heart rate recovery (HRR)
 * Looks for the biggest drop in HR over 60s after peak effort
 */
export function calculateHeartRateRecovery(
  times: number[],
  hrValues: number[]
): { peakHr: number; peakTime: number; recoveryHr: number; drops: number } | null {
  if (!hrValues || hrValues.length === 0) return null

  // Find max HR index
  let maxHr = -Infinity
  let maxIdx = -1

  for (let i = 0; i < hrValues.length; i++) {
    const val = hrValues[i]
    if (val !== undefined && val > maxHr) {
      maxHr = val
      maxIdx = i
    }
  }

  if (maxIdx === -1) return null

  // Look ahead 60 seconds (or closest available)
  const peakTime = times[maxIdx]
  if (peakTime === undefined) return null

  const targetTime = peakTime + 60

  let recoveryIdx = -1

  for (let i = maxIdx; i < times.length; i++) {
    const currentTime = times[i]
    if (currentTime !== undefined && currentTime >= targetTime) {
      recoveryIdx = i
      break
    }
  }

  // If workout ended before 60s, take last value
  if (recoveryIdx === -1 && maxIdx < times.length - 1) {
    recoveryIdx = times.length - 1
  }

  if (recoveryIdx !== -1) {
    const recoveryHr = hrValues[recoveryIdx]
    if (recoveryHr !== undefined) {
      return {
        peakHr: maxHr,
        peakTime,
        recoveryHr,
        drops: maxHr - recoveryHr
      }
    }
  }

  return null
}

/**
 * Calculate Aerobic Decoupling (Pw:HR)
 * Measures aerobic endurance by comparing Efficiency Factor (Power/HR)
 * in the first half vs second half of the data.
 */
export function calculateAerobicDecoupling(
  times: number[],
  powerValues: number[],
  hrValues: number[]
): number | null {
  if (
    !powerValues ||
    !hrValues ||
    powerValues.length !== hrValues.length ||
    powerValues.length < 600
  ) {
    // Need at least 10 minutes of data
    return null
  }

  // Filter out zeros and non-moving time (simplification: just zeros in power/hr)
  const validData: { p: number; h: number }[] = []
  for (let i = 0; i < powerValues.length; i++) {
    const p = powerValues[i]
    const h = hrValues[i]
    if (p !== undefined && h !== undefined && p > 10 && h > 40) {
      validData.push({ p, h })
    }
  }

  if (validData.length < 300) return null

  // Split into two halves
  const midPoint = Math.floor(validData.length / 2)
  const firstHalf = validData.slice(0, midPoint)
  const secondHalf = validData.slice(midPoint)

  // Calculate Efficiency Factor (EF) = AvgPower / AvgHR
  const getEF = (data: { p: number; h: number }[]) => {
    if (data.length === 0) return 0
    const avgP = data.reduce((sum, d) => sum + d.p, 0) / data.length
    const avgH = data.reduce((sum, d) => sum + d.h, 0) / data.length
    return avgH > 0 ? avgP / avgH : 0
  }

  const ef1 = getEF(firstHalf)
  const ef2 = getEF(secondHalf)

  if (ef1 === 0) return null

  // Decoupling = (EF1 - EF2) / EF1
  // Positive value means EF dropped (HR rose for same power, or Power dropped for same HR)
  return (ef1 - ef2) / ef1
}

/**
 * Calculate Coasting Statistics
 * Measures time spent not pedaling while moving.
 */
export function calculateCoastingStats(
  times: number[],
  powerValues: number[],
  cadenceValues: number[],
  velocityValues?: number[]
): { totalTime: number; percentTime: number; eventCount: number } {
  if (!powerValues || powerValues.length === 0) {
    return { totalTime: 0, percentTime: 0, eventCount: 0 }
  }

  let coastingTime = 0
  let coastingEvents = 0
  let inCoasting = false

  // Thresholds
  const minPower = 10
  const minCadence = 20
  const minVelocity = 2.0 // m/s (~7.2 km/h) - ensuring we are moving, not stopped

  for (let i = 0; i < powerValues.length; i++) {
    const p = powerValues[i]
    const c = cadenceValues ? cadenceValues[i] : 0
    const v = velocityValues ? velocityValues[i] : 5 // Assume moving if no velocity stream

    if (p === undefined || c === undefined || v === undefined) continue

    // Check if moving but not pedaling
    // If cadence data exists, rely on it primarily. If not, use power < 10W.
    const isPedaling = cadenceValues ? c > minCadence : p > minPower
    const isMoving = v > minVelocity

    if (isMoving && !isPedaling) {
      coastingTime++ // Assuming 1s intervals roughly

      if (!inCoasting) {
        inCoasting = true
        coastingEvents++
      }
    } else {
      inCoasting = false
    }
  }

  const firstTime = times[0]
  const lastTime = times[times.length - 1]
  const totalDuration = firstTime !== undefined && lastTime !== undefined ? lastTime - firstTime : 0

  return {
    totalTime: coastingTime,
    percentTime: totalDuration > 0 ? (coastingTime / totalDuration) * 100 : 0,
    eventCount: coastingEvents
  }
}

export interface Surge {
  start_time: number
  duration: number
  avg_power: number
  max_power: number
  cost_avg_power: number // Avg power in the 60s AFTER the surge
}

/**
 * Detect "Matches" (Surges) and their cost
 * Identifies efforts > threshold (e.g. 120% FTP) and analyzes subsequent fade.
 */
export function detectSurgesAndFades(times: number[], powerValues: number[], ftp: number): Surge[] {
  if (!powerValues || !ftp || ftp === 0) return []

  const surgeThreshold = ftp * 1.2 // 120% FTP
  const minSurgeDuration = 10 // seconds
  const recoveryWindow = 60 // seconds to analyze after surge

  const surges: Surge[] = []
  let inSurge = false
  let startIndex = 0

  // 1. Detect candidate segments
  const candidates: { start: number; end: number }[] = []

  for (let i = 0; i < powerValues.length; i++) {
    const p = powerValues[i]
    if (p === undefined) continue

    if (p >= surgeThreshold) {
      if (!inSurge) {
        inSurge = true
        startIndex = i
      }
    } else {
      if (inSurge) {
        inSurge = false
        // Check duration (assuming 1s intervals for simplicity, or use times)
        const tStart = times[startIndex]
        const tCurrent = times[i]

        if (tStart !== undefined && tCurrent !== undefined) {
          const duration = tCurrent - tStart
          if (duration >= minSurgeDuration) {
            candidates.push({ start: startIndex, end: i })
          }
        }
      }
    }
  }

  // Handle surge at end of workout
  if (inSurge) {
    const tStart = times[startIndex]
    const tLast = times[times.length - 1]

    if (tStart !== undefined && tLast !== undefined) {
      const duration = tLast - tStart
      if (duration >= minSurgeDuration) {
        candidates.push({ start: startIndex, end: times.length - 1 })
      }
    }
  }

  // 2. Process Surges
  // Merge close surges? For now, keep distinct to see repeated attacks.

  candidates.forEach((cand) => {
    const segment = powerValues.slice(cand.start, cand.end + 1)
    const sum = segment.reduce((a, b) => a + (b || 0), 0)
    const avg = sum / segment.length
    const max = Math.max(...segment.map((v) => v || 0))

    // Calculate "Cost" - power in the recovery window
    // Look ahead 60s
    let costSum = 0
    let costCount = 0
    const recoveryEndIndex = Math.min(powerValues.length - 1, cand.end + recoveryWindow)

    for (let k = cand.end + 1; k <= recoveryEndIndex; k++) {
      const val = powerValues[k]
      if (val !== undefined) {
        costSum += val
        costCount++
      }
    }

    const costAvg = costCount > 0 ? costSum / costCount : 0

    const tStart = times[cand.start]
    const tEnd = times[cand.end]

    if (tStart !== undefined && tEnd !== undefined) {
      surges.push({
        start_time: tStart,
        duration: tEnd - tStart,
        avg_power: Math.round(avg),
        max_power: Math.round(max),
        cost_avg_power: Math.round(costAvg)
      })
    }
  })

  return surges
}

interface RecoveryRate {
  intervalIndex: number
  startTime: number
  peakHr: number
  hr30s: number | null
  hr60s: number | null
  hr90s: number | null
  drop30s: number | null
  drop60s: number | null
  drop90s: number | null
}

/**
 * Calculate Recovery Rate Trend across all work intervals
 */
export function calculateRecoveryRateTrend(
  times: number[],
  hrStream: number[],
  intervals: Interval[]
): RecoveryRate[] {
  if (!hrStream || hrStream.length === 0 || !intervals) return []

  const workIntervals = intervals.filter((i) => i.type === 'WORK')
  const results: RecoveryRate[] = []

  workIntervals.forEach((interval, idx) => {
    const endIdx = interval.end_index
    const peakHr = hrStream[endIdx]
    const endTime = times[endIdx]

    if (peakHr === undefined || endTime === undefined) return

    const getHrAtOffset = (offset: number) => {
      const targetTime = endTime + offset
      for (let i = endIdx; i < times.length; i++) {
        const t = times[i]
        if (t !== undefined && t >= targetTime) return hrStream[i] || null
      }
      return null
    }

    const hr30s = getHrAtOffset(30)
    const hr60s = getHrAtOffset(60)
    const hr90s = getHrAtOffset(90)

    results.push({
      intervalIndex: idx,
      startTime: endTime,
      peakHr,
      hr30s,
      hr60s,
      hr90s,
      drop30s: hr30s !== null ? peakHr - hr30s : null,
      drop60s: hr60s !== null ? peakHr - hr60s : null,
      drop90s: hr90s !== null ? peakHr - hr90s : null
    })
  })

  return results
}
