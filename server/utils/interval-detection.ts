import { calculatePowerZones, calculateHrZones, identifyZone, type Zone } from './zones'

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
 * Fraction of max HR that marks the bottom of "work" for interval detection.
 * ~70% of max HR is the upper Z2 / lower Z3 border — an easy jog sits below it,
 * a tempo or threshold effort clearly above it.
 */
export const HR_WORK_BAR_FRACTION_OF_MAX_HR = 0.7

/**
 * Fraction of LTHR that marks the same bar. LTHR sits at roughly 85% of max HR,
 * so 0.82 * LTHR lands on the same bpm as 0.7 * maxHR for a typical athlete.
 */
export const HR_WORK_BAR_FRACTION_OF_LTHR = 0.82

/**
 * Fraction of threshold pace (velocity, m/s) that marks the bottom of "work".
 *
 * ~80% of threshold velocity is the easy/steady boundary for running: recovery
 * jogs in real interval sessions sit at 60-75% of threshold pace, while any
 * deliberate rep - steady, tempo, threshold or faster - sits at 85%+. The bar
 * used to be 0.65, which put a 4.0 m/s athlete's work bar at 2.6 m/s and made
 * every recovery jog above ~65% read as work, welding reps and recoveries into
 * one block (CW-401).
 */
export const PACE_WORK_BAR_FRACTION_OF_THRESHOLD = 0.8

/**
 * Resolve the FINAL heart-rate work bar (in bpm) to hand to `detectIntervals`.
 *
 * `detectIntervals` deliberately applies no further multiplier to an HR
 * threshold (see the contract note on that function), so this is the one place
 * the physiological scaling happens. Callers should source `lthr`/`maxHr` from
 * the athlete's PROFILE (sportSettings, falling back to the user record).
 *
 * `sessionMaxHr` is an explicit last-resort fallback only: it is the max HR of
 * the single workout being analysed, so a threshold derived from it is
 * self-referential and drifts workout to workout. Pass it so a profile-less
 * athlete still gets some segmentation, never as the preferred input.
 */
export function resolveHrWorkThreshold(refs: {
  lthr?: number | null
  maxHr?: number | null
  sessionMaxHr?: number | null
}): number | undefined {
  const lthr = Number(refs.lthr || 0)
  if (lthr > 0) return lthr * HR_WORK_BAR_FRACTION_OF_LTHR

  const maxHr = Number(refs.maxHr || 0)
  if (maxHr > 0) return maxHr * HR_WORK_BAR_FRACTION_OF_MAX_HR

  const sessionMaxHr = Number(refs.sessionMaxHr || 0)
  if (sessionMaxHr > 0) return sessionMaxHr * HR_WORK_BAR_FRACTION_OF_MAX_HR

  return undefined
}

/**
 * The athlete's PROFILE heart-rate references, used to build HR training zones.
 *
 * Deliberately separate from the `threshold` argument. For `heartrate` that
 * argument is the final work BAR in bpm (`resolveHrWorkThreshold`: 0.82 * LTHR
 * or 0.7 * max HR), which is a segmentation bar, not a zone reference —
 * `calculateHrZones` wants LTHR/max HR themselves. The bar cannot be turned
 * back into them either: it carries no record of which of the two fractions
 * produced it, so dividing by one of them would silently invent the other
 * athlete's physiology (CW-400).
 *
 * Optional throughout: with neither value the HR zone stays `undefined` rather
 * than being guessed off the work bar.
 */
export interface HrZoneRefs {
  lthr?: number | null
  maxHr?: number | null
}

/**
 * Detect intervals in a workout based on power or heart rate data
 * Uses a moving average and threshold-based approach
 *
 * THRESHOLD CONTRACT (do not add a second discount on top of a scaled value):
 * - `power`:     `threshold` is the athlete's FTP. The work bar is derived here
 *                as 70% of FTP (the Z2/Z3 border).
 * - `pace`:      `threshold` is a reference VELOCITY in m/s — the athlete's
 *                threshold pace (omit it and the stream's own median is used
 *                instead). The work bar is derived here as
 *                `PACE_WORK_BAR_FRACTION_OF_THRESHOLD` (80%) of it, the
 *                easy/steady boundary. Do not pre-scale it in the caller: pace
 *                stays on the "caller passes the reference, engine scales it"
 *                side of this contract, unlike heartrate.
 * - `heartrate`: `threshold` is ALREADY THE FINAL WORK BAR in bpm — build it
 *                with `resolveHrWorkThreshold()` from profile LTHR/max HR. No
 *                multiplier is applied here. Callers used to pass `maxHr * 0.7`
 *                into a function that multiplied by 0.65 again, putting the work
 *                bar at ~46% of max HR: every sample read as work and the merge
 *                pass welded whole sessions into one interval (CW-383).
 *
 * `hrRefs` is the separate, optional channel for the athlete's profile LTHR/max
 * HR. It exists only so HR intervals can be assigned an `intensity_zone`, and is
 * never used for segmentation — see `HrZoneRefs`.
 *
 * SEGMENT BOUNDARY CONVENTION (`start_index` / `end_index`):
 * - **Fully inclusive.** A block occupying samples N..M is returned as
 *   `start_index: N, end_index: M`. Both endpoints belong to the segment, which
 *   is why every consumer slices it as `stream.slice(start_index, end_index + 1)`
 *   (`createIntervalObj`, `computeSegmentAverage`, `calculateStabilityMetrics`,
 *   the intervals endpoints).
 * - **Disjoint and contiguous.** Consecutive segments never share a sample:
 *   `next.start_index === prev.end_index + 1`. No sample is counted twice and
 *   none is dropped.
 * - This is the same convention providers use for synced laps
 *   (Intervals.icu `icu_intervals[].start_index`/`end_index`), and both sources
 *   are normalised through one code path downstream, so they must agree.
 * - `start_time`/`end_time` are the timestamps of those two samples and
 *   `duration` is the elapsed span between them. At 1 Hz a K-sample block is
 *   therefore `K - 1` seconds long — the same arithmetic the whole-session
 *   STEADY block has always reported.
 *
 * Neither path honoured this before CW-426, and they were broken differently:
 * the candidate/merge pass below ended each segment on the FIRST sample of the
 * next block (so adjacent segments overlapped by one sample), while
 * `detectIntervalsFromPlannedSteps` shifted every segment one sample later at
 * both ends. Either way a work rep carried one out-of-band sample, which is the
 * single worst input to a coefficient of variation computed inside that rep.
 */
export function detectIntervals(
  times: number[],
  values: number[],
  metricType: 'power' | 'heartrate' | 'pace',
  threshold?: number, // FTP, reference pace, or the final HR work bar in bpm
  plannedSteps?: PlannedStep[],
  smoothedValues?: number[],
  cadenceValues?: number[],
  hrRefs?: HrZoneRefs
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
    cadenceValues,
    hrRefs
  )
  if (plannedGuided.length > 0) {
    return plannedGuided
  }

  // 2. Determine threshold for "Work" vs "Recovery"
  // If no manual threshold provided, estimate baseline
  const baseline = threshold || calculateBaseline(smoothed)

  // Per the threshold contract above:
  // - power: work is > 70% FTP (Zone 2/3 border)
  // - heartrate: the caller already handed us the final work bar in bpm
  //   (`resolveHrWorkThreshold`), so it is used verbatim. With no threshold at
  //   all the fallback baseline is the stream's own median HR, which is a
  //   sensible "above your typical effort = work" bar on its own.
  // - pace: work is > 80% of the reference velocity (the easy/steady boundary),
  //   so a 60-75%-of-threshold recovery jog stays recovery (CW-401).
  const workThreshold =
    metricType === 'power'
      ? baseline * 0.7
      : metricType === 'heartrate'
        ? baseline
        : baseline * PACE_WORK_BAR_FRACTION_OF_THRESHOLD

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
      // End of potential interval. `i` is the first sample that is NOT work, so
      // the last sample the interval owns is `i - 1` — ends are inclusive (see
      // the boundary convention above). Using `i` handed every work rep the
      // first sample of the recovery that follows it and left adjacent segments
      // overlapping on that sample (CW-426).
      inInterval = false
      const endIndex = i - 1
      const currentTime = times[endIndex]
      const startTime = times[startIndex]

      if (currentTime !== undefined && startTime !== undefined) {
        // Gate on the duration of the segment actually emitted, not on the span
        // out to the first recovery sample.
        const duration = currentTime - startTime

        if (duration >= minDuration) {
          candidates.push({ start: startIndex, end: endIndex })
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

  // Index of the first sample not yet claimed by an emitted segment. Segments
  // are inclusive and disjoint, so a filler block runs from here up to the
  // sample before the next work interval starts (CW-426).
  let nextSegmentStart = 0

  // SPECIAL CASE: If no intervals detected but the duration is long (> 15 min),
  // and average is reasonable (> 40% FTP), classify the whole thing as STEADY.
  if (merged.length === 0 && times.length > 0) {
    const totalDuration = (times[times.length - 1] || 0) - (times[0] || 0)
    const avgValue = values.reduce((a, b) => a + (b || 0), 0) / values.length
    // `baseline` here is the caller's reference, NOT the work bar: FTP for
    // power, threshold velocity for pace, the final work bar for HR (see the
    // threshold contract above). Pace kept that meaning through CW-401 — only
    // the work-bar factor moved — so "averaged at least half of threshold
    // velocity for 15+ minutes" is still the right bar for a continuous run.
    const isSteady =
      totalDuration > 900 && // 15 mins
      (metricType === 'power' ? avgValue >= baseline * 0.4 : avgValue >= baseline * 0.5)

    if (isSteady) {
      // STEADY, not WORK: a continuous ride/run is one steady block, not a rep.
      // Downstream consumers that count reps filter on `type === 'WORK'`, and
      // labelling this WORK made every endurance session look like a 1x session.
      intervals = [
        createIntervalObj(
          times,
          values,
          0,
          times.length - 1,
          'STEADY',
          threshold,
          metricType,
          cadenceValues,
          hrRefs
        )
      ]
    }
  } else {
    merged.forEach((candidate, index) => {
      // Add recovery/warmup segment before this work interval. It ends on the
      // sample BEFORE the work interval starts: `candidate.start` is the rep's
      // own first sample and belongs to the rep, not to the block feeding it.
      const fillerEnd = candidate.start - 1
      if (fillerEnd >= nextSegmentStart) {
        const type = index === 0 ? 'WARMUP' : 'RECOVERY'
        if (times[nextSegmentStart] !== undefined && times[fillerEnd] !== undefined) {
          intervals.push(
            createIntervalObj(
              times,
              values,
              nextSegmentStart,
              fillerEnd,
              type,
              threshold,
              metricType,
              cadenceValues,
              hrRefs
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
            cadenceValues,
            hrRefs
          )
        )
      }

      nextSegmentStart = candidate.end + 1
    })

    // Add cooldown if there's data after the last interval
    if (
      nextSegmentStart <= times.length - 1 &&
      times[nextSegmentStart] !== undefined &&
      times[times.length - 1] !== undefined
    ) {
      intervals.push(
        createIntervalObj(
          times,
          values,
          nextSegmentStart,
          times.length - 1,
          'COOLDOWN',
          threshold,
          metricType,
          cadenceValues,
          hrRefs
        )
      )
    }
  }

  // 4. Guided Matching (if planned steps available)
  if (plannedSteps && plannedSteps.length > 0 && intervals.length > 0) {
    // Basic greedy matching for now: align "WORK" intervals with planned WORK steps
    const plannedWorkSteps = plannedSteps.filter((s) => s.type === 'WORK' || !s.type)
    const detectedWorkIntervals = intervals.filter((i) => i.type === 'WORK')

    // A STEADY session has no WORK interval at all, so the WORK-only pairing
    // above left it with no label and no match score even when the athlete had
    // linked a planned workout. Fall back to the unfiltered lists whenever
    // either side of the WORK pairing is empty — when both sides have WORK the
    // pairing is unchanged (CW-400).
    const canPairWork = plannedWorkSteps.length > 0 && detectedWorkIntervals.length > 0
    const stepsToMatch = canPairWork ? plannedWorkSteps : plannedSteps
    const intervalsToMatch = canPairWork ? detectedWorkIntervals : intervals

    if (stepsToMatch.length > 0 && intervalsToMatch.length > 0) {
      intervalsToMatch.forEach((interval, idx) => {
        const plannedStep = stepsToMatch[idx]
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

/**
 * A planned step whose target sits at or above this fraction of threshold is
 * working, whatever its label says. Shared by every planned-step classifier so
 * the promotion and the demotion below use one number (CW-402, CW-414).
 */
export const PLANNED_WORK_INTENSITY_FACTOR = 0.8

const PLANNED_RECOVERY_TOKENS = [
  'rest',
  // 'recover' rather than 'recovery' so 'Recover', 'Recovery' and 'Recovering'
  // all match — the type-side rule this replaced already used the short form.
  'recover',
  'cooldown',
  'warmup',
  'recuperación',
  'recuperacion',
  'enfriamiento',
  'descanso'
]

export type PlannedStepTypeEvidence = {
  /** The structured step type, e.g. 'Warmup' | 'Active' | 'Rest' | 'Cooldown'. */
  type?: unknown
  /**
   * The step's free-text, user-authored name. Evidence, never an override: see
   * the intensity veto below and the note on `flattenPlannedStepsForDetection`.
   */
  name?: unknown
  /**
   * This step's target expressed as a fraction of threshold
   * (`toIntensityFactorFromTarget`). Pass it whenever the athlete's references
   * are resolvable; leave it out when they are not — it only ever *vetoes* a
   * recovery label, so its absence reproduces the label-only classification.
   */
  intensityFactor?: number | null
}

/**
 * THE planned-step type normaliser. One rule, used by every path that has to
 * decide whether a planned step is work.
 *
 * The rule (lifted from `flattenPlannedSteps` in `workout-analysis-facts.ts`,
 * which has always had it right):
 *
 * 1. Warmup and cooldown are STRUCTURAL, not intensity-based — a warmup ramp
 *    can pass through work intensity and is still a warmup — so a `warm`/`cool`
 *    type wins outright.
 * 2. A recovery token in the type OR in the name marks the step recovery...
 * 3. ...unless the step's own numeric target contradicts it. A step prescribed
 *    at >= 80% of threshold is work no matter what it is called.
 *
 * Rule 3 is the point. A step name is user-authored free text — the analysis
 * prompt itself tells the model that step names carry stale labels and must
 * never override the structured values — and this used to be the one place that
 * let free text beat a structured numeric target. Two normalisers disagreed:
 * the facts layer promoted a work-intensity `Recovery` step to WORK on its
 * intensity factor (CW-402), and then detection re-derived the type from the
 * name and demoted it straight back, which is most recovery-labelled steps
 * ("Recovery", "Recovery Jog", "Rest"). CW-414 folded both into this function.
 *
 * Returns `undefined` only when there is no evidence at all (no type, no name).
 */
export function normalizePlannedStepType(
  step: PlannedStepTypeEvidence
): Interval['type'] | undefined {
  const type = String(step.type ?? '').toLowerCase()
  const name = String(step.name ?? '').toLowerCase()
  if (!type && !name) return undefined

  if (type.includes('warm') || name.includes('calentamiento')) return 'WARMUP'
  if (type.includes('cool') || name.includes('enfriamiento')) return 'COOLDOWN'

  const hasRecoveryLabel = PLANNED_RECOVERY_TOKENS.some(
    (token) => type.includes(token) || name.includes(token)
  )
  if (!hasRecoveryLabel) return 'WORK'

  const intensityFactor = Number(step.intensityFactor)
  const targetSaysWork =
    Number.isFinite(intensityFactor) && intensityFactor >= PLANNED_WORK_INTENSITY_FACTOR
  return targetSaysWork ? 'WORK' : 'RECOVERY'
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
    // The free-text name is offered ONLY when the step carries no type at all.
    //
    // This layer cannot resolve an intensity factor — it never sees the
    // athlete's references — so it has no way to check a name against the
    // step's structured target, and `normalizePlannedStepType`'s intensity veto
    // cannot fire here. A plan that reached detection through the facts layer
    // has already been classified once by that same function WITH the intensity
    // factor (`toDetectionPlannedSteps`), so its type is a resolved answer, not
    // a raw label. Re-reading the name over it is exactly the bug: it demoted
    // every step the CW-402 promotion had just moved to WORK, because those
    // steps are named "Recovery" (CW-414). With no type, the name is the only
    // evidence there is, and it is used as before.
    const resolvedType =
      normalizePlannedStepType({
        type: step.type,
        name: step.type ? undefined : step.name
      }) ?? 'WORK'
    flattened.push({
      id: `${path}-${index}`,
      name: step.name,
      durationSeconds,
      type: resolvedType,
      metricTarget: getPlannedTargetForMetric(step, metricType),
      cadence:
        typeof step.cadence === 'number' && Number.isFinite(step.cadence) ? step.cadence : null,
      ramp: Boolean((step as any).ramp || resolvedType === 'COOLDOWN')
    })
  }
  return flattened
}

/**
 * Index of the LAST sample belonging to a step that ends at `targetTime`.
 *
 * Segment ends are inclusive (see the boundary convention on `detectIntervals`),
 * so a step owns every sample recorded strictly before its end time and the
 * first sample at or after that time is the next step's opening sample. This
 * used to return that next-step sample instead, which pushed the step's own end
 * one sample too far and — because the following step then started at
 * `endIdx + 1` — pushed its start one sample too far as well. Every planned
 * segment came back as [N+1, M+1] (CW-426).
 *
 * Never returns less than `fallbackIndex`, so a step always keeps one sample.
 */
function findLastIndexBeforeTime(times: number[], targetTime: number, fallbackIndex: number) {
  for (let index = fallbackIndex; index < times.length; index++) {
    const time = times[index]
    if (time !== undefined && time >= targetTime) return Math.max(fallbackIndex, index - 1)
  }
  // Every remaining sample precedes the target: the step runs to the end.
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

/**
 * Score `candidateIndex` as the INCLUSIVE last sample of `currentStep` — the
 * "before" window ends on it and the "after" window opens at `candidateIndex + 1`.
 * This scorer always used the inclusive reading; it was the seed boundary handed
 * to it that did not (CW-426).
 */
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
  cadenceValues?: number[],
  hrRefs?: HrZoneRefs
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
      : findLastIndexBeforeTime(times, plannedEndTime, currentStartIdx)
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
      cadenceValues,
      hrRefs
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

/** A gap has to be at least this long before it can count as a recording pause. */
export const MIN_PAUSE_GAP_SEC = 30

/** ...and also this many times the stream's typical sample spacing. */
const PAUSE_GAP_MULTIPLE = 4

/**
 * Seconds after which a gap between two consecutive samples is a recording
 * pause rather than a slow sample rate.
 *
 * Derived from the stream itself so that files recorded at 1Hz, with Garmin
 * "smart recording", or at a fixed coarse interval are all judged against their
 * own normal spacing instead of a single hardcoded number.
 */
export function estimatePauseGapSeconds(times: number[]): number {
  const gaps: number[] = []
  for (let i = 1; i < times.length; i++) {
    const current = times[i]
    const previous = times[i - 1]
    if (!Number.isFinite(current) || !Number.isFinite(previous)) continue
    const delta = (current as number) - (previous as number)
    if (delta > 0) gaps.push(delta)
  }

  if (gaps.length === 0) return MIN_PAUSE_GAP_SEC

  gaps.sort((a, b) => a - b)
  const median = gaps[Math.floor(gaps.length / 2)] ?? 1
  return Math.max(MIN_PAUSE_GAP_SEC, median * PAUSE_GAP_MULTIPLE)
}

/**
 * Elapsed time, in seconds, that the sample at `index` represents when
 * averaging over time. A recorded sample describes the interval since the
 * previous sample, so its weight is that gap.
 *
 * Returns 0 for the first sample (it is the left boundary of a range and covers
 * no time), for missing/non-monotonic timestamps, and for gaps that exceed
 * `pauseGapSeconds` — those are recording pauses, and the value recorded when
 * the athlete started again says nothing about the time they were stopped.
 */
export function sampleWeightSeconds(
  times: number[],
  index: number,
  pauseGapSeconds: number = MIN_PAUSE_GAP_SEC
): number {
  if (index <= 0) return 0
  const current = times[index]
  const previous = times[index - 1]
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return 0
  const delta = (current as number) - (previous as number)
  if (!(delta > 0) || delta > pauseGapSeconds) return 0
  return delta
}

/**
 * Time-weighted mean of `values` over the inclusive sample range
 * [`startIndex`, `endIndex`].
 *
 * Each sample is weighted by the time it covers instead of counting as one
 * sample, so streams recorded at anything other than a steady 1Hz — or with
 * recording pauses in them — average correctly. `startIndex` is the boundary of
 * the range and contributes no weight; time inside a recording pause is
 * excluded entirely rather than attributed to the value that follows it.
 *
 * Returns `null` when the range covers no elapsed time.
 */
export function timeWeightedMean(
  times: number[],
  values: number[],
  startIndex = 0,
  endIndex = values.length - 1
): number | null {
  const pauseGapSeconds = estimatePauseGapSeconds(times)
  let weightedSum = 0
  let totalSeconds = 0

  for (let i = Math.max(1, startIndex + 1); i <= endIndex; i++) {
    const weight = sampleWeightSeconds(times, i, pauseGapSeconds)
    if (weight <= 0) continue
    const value = values[i]
    weightedSum += (Number.isFinite(value) ? (value as number) : 0) * weight
    totalSeconds += weight
  }

  return totalSeconds > 0 ? weightedSum / totalSeconds : null
}

/** One duration bucket `findPeakEfforts` searches for. */
export interface PeakDuration {
  sec: number
  label: string
}

/**
 * The standard duration buckets every peak consumer shares.
 *
 * This list is load-bearing well beyond the peaks themselves: `pbDetectionService`
 * mints a `POWER_<LABEL>` personal-best type from every entry, and both intervals
 * endpoints return the buckets verbatim as rows in the UI peaks table. Adding a
 * bucket here therefore invents a new PB type and a new UI row for every athlete.
 * A caller that needs an off-list duration for its own maths should pass it via
 * `findPeakEfforts`' `durations` argument instead of extending this list.
 */
export const DEFAULT_PEAK_DURATIONS: readonly PeakDuration[] = [
  { sec: 5, label: '5s' },
  { sec: 30, label: '30s' },
  { sec: 60, label: '1m' },
  { sec: 300, label: '5m' },
  { sec: 600, label: '10m' },
  { sec: 1200, label: '20m' },
  { sec: 3600, label: '60m' }
]

/**
 * Find peak efforts for standard durations (1min, 5min, 20min, etc.).
 *
 * `durations` defaults to {@link DEFAULT_PEAK_DURATIONS}. Pass an explicit list
 * only when the caller consumes the result itself — anything handed to the PB
 * detector or to the intervals endpoints must keep the default buckets.
 */
export function findPeakEfforts(
  times: number[],
  values: number[],
  metric: 'power' | 'heartrate' | 'pace',
  durations: readonly PeakDuration[] = DEFAULT_PEAK_DURATIONS
): PeakEffort[] {
  if (!values || values.length === 0) return []
  if (!times || times.length < 2) return []

  const peaks: PeakEffort[] = []

  // Optimization: Pre-calculate prefix sums for O(1) range sum queries?
  // Since we need max average, a simple sliding window is O(N) per duration.

  const pauseGapSeconds = estimatePauseGapSeconds(times)

  for (const dur of durations) {
    const lastTime = times[times.length - 1]
    if (lastTime === undefined || lastTime < dur.sec) continue

    // Sliding window over time. The window is both advanced *and* averaged by
    // elapsed time: each sample contributes the seconds it covers, so a file
    // with non-1Hz sampling (or gaps) is not mis-averaged by sample count.

    let maxAvg = -Infinity
    let bestStartIdx = -1
    let bestEndIdx = -1

    // Weighted sum of value*seconds over (startPtr, endPtr], and the seconds
    // those samples cover. `startPtr` is the window's left boundary and carries
    // no weight of its own.
    let weightedSum = 0
    let windowSeconds = 0
    let startPtr = 0

    for (let endPtr = 1; endPtr < values.length; endPtr++) {
      const weight = sampleWeightSeconds(times, endPtr, pauseGapSeconds)

      if (weight <= 0) {
        // Recording pause (or an unusable timestamp): a peak window may not
        // span it, so restart the window on the far side of the break.
        weightedSum = 0
        windowSeconds = 0
        startPtr = endPtr
        continue
      }

      const val = values[endPtr]
      weightedSum += (Number.isFinite(val) ? (val as number) : 0) * weight
      windowSeconds += weight

      // Shrink from the left until the window is no longer than the target.
      while (startPtr < endPtr && windowSeconds > dur.sec) {
        const dropIdx = startPtr + 1
        const dropWeight = sampleWeightSeconds(times, dropIdx, pauseGapSeconds)
        const dropVal = values[dropIdx]
        weightedSum -= (Number.isFinite(dropVal) ? (dropVal as number) : 0) * dropWeight
        windowSeconds -= dropWeight
        startPtr = dropIdx
      }

      // Allow slight tolerance so coarse sampling still yields a peak.
      if (windowSeconds >= dur.sec * 0.95) {
        const avg = weightedSum / windowSeconds
        if (avg > maxAvg) {
          maxAvg = avg
          bestStartIdx = startPtr
          bestEndIdx = endPtr
        }
      }
    }

    if (bestStartIdx !== -1 && bestEndIdx !== -1 && Number.isFinite(maxAvg)) {
      const startTimeValue = times[bestStartIdx]
      const endTimeValue = times[bestEndIdx]
      if (startTimeValue !== undefined && endTimeValue !== undefined) {
        peaks.push({
          duration: dur.sec,
          duration_label: dur.label,
          start_time: startTimeValue,
          end_time: endTimeValue,
          // Pace is a velocity in m/s (typically 2-6), so whole-number rounding
          // would destroy the curve. Watts and bpm stay integers.
          value: metric === 'pace' ? Math.round(maxAvg * 100) / 100 : Math.round(maxAvg),
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

/**
 * Zone number from a zone definition list: "Z2 Endurance" -> 2. HR zones split
 * the top zone into Z5a/Z5b/Z5c, which all collapse to 5. Returns `undefined`
 * for an empty zone list or a value outside every band.
 */
function resolveZoneNumber(value: number, zones: Zone[]): number | undefined {
  const zone = identifyZone(value, zones)
  if (!zone) return undefined
  const match = zone.name.match(/^Z(\d+)/)
  if (!match || !match[1]) return undefined
  return parseInt(match[1])
}

/**
 * Build one segment over the INCLUSIVE sample range [`startIdx`, `endIdx`] —
 * see the boundary convention on `detectIntervals`. Every average here is taken
 * over `slice(startIdx, endIdx + 1)`, so both callers must hand in the segment's
 * own last sample and never the first sample of the block that follows it.
 *
 * `duration` is the elapsed span between those two samples. It deliberately does
 * not reach out to the next block's timestamp: adjacent segments are disjoint,
 * so the second between them is claimed by exactly one of them.
 */
function createIntervalObj(
  times: number[],
  values: number[],
  startIdx: number,
  endIdx: number,
  type: Interval['type'],
  threshold?: number,
  metricType?: 'power' | 'heartrate' | 'pace',
  cadenceValues?: number[],
  hrRefs?: HrZoneRefs
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

  if (metricType === 'power' && threshold) {
    // `threshold` is the athlete's FTP here, which IS the power zone reference.
    intensity_zone = resolveZoneNumber(avg, calculatePowerZones(threshold))
  } else if (metricType === 'heartrate') {
    // HR zones do NOT come from `threshold`: for heartrate that argument is the
    // final work bar in bpm (CW-383), a segmentation bar rather than a zone
    // reference. Zones come from the athlete's profile LTHR/max HR, handed in
    // separately as `hrRefs`. With neither available `calculateHrZones` returns
    // an empty list and the zone stays undefined - the work bar is never used
    // as a stand-in for LTHR (CW-400).
    const zones = calculateHrZones(hrRefs?.lthr ?? null, hrRefs?.maxHr ?? null)
    if (zones.length > 0) intensity_zone = resolveZoneNumber(avg, zones)
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
