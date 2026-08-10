import { describe, expect, it } from 'vitest'
import {
  detectIntervals,
  findPeakEfforts,
  resolveHrWorkThreshold,
  resolveProviderIntervalTypes,
  timeWeightedMean
} from '../../../../server/utils/interval-detection'

describe('detectIntervals', () => {
  it('preserves the final recovery block before cooldown for plan-guided detection', () => {
    const warmup = Array.from({ length: 1200 }, () => 127)
    const work1 = Array.from({ length: 480 }, () => 153)
    const recovery1 = Array.from({ length: 120 }, () => 113)
    const work2 = Array.from({ length: 480 }, () => 153)
    const recovery2 = Array.from({ length: 120 }, () => 113)
    const work3 = Array.from({ length: 480 }, () => 153)
    const recovery3 = Array.from({ length: 120 }, (_, index) => (index < 100 ? 113 : 110))
    const cooldown = Array.from({ length: 600 }, (_, index) => 108 - index * 0.03)

    const time = Array.from(
      {
        length:
          warmup.length +
          work1.length +
          recovery1.length +
          work2.length +
          recovery2.length +
          work3.length +
          recovery3.length +
          cooldown.length
      },
      (_, index) => index
    )
    const watts = [
      ...warmup,
      ...work1,
      ...recovery1,
      ...work2,
      ...recovery2,
      ...work3,
      ...recovery3,
      ...cooldown
    ]
    const cadence = [
      ...Array.from({ length: 1200 }, () => 90),
      ...Array.from({ length: 480 }, () => 92),
      ...Array.from({ length: 120 }, () => 80),
      ...Array.from({ length: 480 }, () => 92),
      ...Array.from({ length: 120 }, () => 80),
      ...Array.from({ length: 480 }, () => 92),
      ...Array.from({ length: 120 }, () => 80),
      ...Array.from({ length: 600 }, (_, index) => 78 - index * 0.005)
    ]

    const plannedSteps = [
      {
        type: 'WARMUP',
        durationSeconds: 1200,
        power: { range: { start: 0.5, end: 0.7 } },
        cadence: 90
      },
      { type: 'WORK', durationSeconds: 480, power: { value: 0.72 }, cadence: 92 },
      { type: 'RECOVERY', durationSeconds: 120, power: { value: 0.52 }, cadence: 80 },
      { type: 'WORK', durationSeconds: 480, power: { value: 0.72 }, cadence: 92 },
      { type: 'RECOVERY', durationSeconds: 120, power: { value: 0.52 }, cadence: 80 },
      { type: 'WORK', durationSeconds: 480, power: { value: 0.72 }, cadence: 92 },
      { type: 'RECOVERY', durationSeconds: 120, power: { value: 0.52 }, cadence: 80 },
      {
        type: 'COOLDOWN',
        durationSeconds: 600,
        power: { range: { start: 0.5, end: 0.3 } },
        cadence: 75,
        ramp: true
      }
    ]

    const intervals = detectIntervals(time, watts, 'power', 212, plannedSteps, undefined, cadence)

    expect(intervals.map((interval) => interval.type)).toEqual([
      'WARMUP',
      'WORK',
      'RECOVERY',
      'WORK',
      'RECOVERY',
      'WORK',
      'RECOVERY',
      'COOLDOWN'
    ])
    expect(intervals[6]?.duration).toBeGreaterThanOrEqual(100)
    expect(intervals[6]?.avg_cadence).toBeGreaterThanOrEqual(78)
    expect(intervals[7]?.avg_cadence).toBeLessThan(intervals[6]?.avg_cadence || 999)
    expect(intervals[6]?.detection_confidence).toBeGreaterThan(0.35)
  })

  // Regression: the HR work bar used to end up at maxHr * 0.7 * 0.65 (~46% of
  // max HR) because the caller scaled the threshold and detectIntervals scaled
  // it again. Every sample read as "work" and the merge pass welded the whole
  // session into one interval.
  it('segments an HR interval session against a profile-sourced work bar', () => {
    const block = (bpm: number, seconds: number) => Array.from({ length: seconds }, () => bpm)

    const heartrate = [
      ...block(112, 300), // warmup
      ...block(165, 240), // work 1
      ...block(120, 180), // recovery 1
      ...block(165, 240), // work 2
      ...block(120, 180), // recovery 2
      ...block(165, 240), // work 3
      ...block(120, 180), // recovery 3
      ...block(165, 240), // work 4
      ...block(105, 300) // cooldown
    ]
    const time = heartrate.map((_, index) => index)

    // Athlete profile max HR, not this session's own max.
    const threshold = resolveHrWorkThreshold({ maxHr: 190 })
    expect(threshold).toBeCloseTo(133, 5)

    const intervals = detectIntervals(time, heartrate, 'heartrate', threshold)

    expect(intervals.length).toBeGreaterThan(1)
    expect(intervals.map((interval) => interval.type)).toEqual([
      'WARMUP',
      'WORK',
      'RECOVERY',
      'WORK',
      'RECOVERY',
      'WORK',
      'RECOVERY',
      'WORK',
      'COOLDOWN'
    ])

    const workIntervals = intervals.filter((interval) => interval.type === 'WORK')
    expect(workIntervals).toHaveLength(4)
    workIntervals.forEach((interval) => {
      expect(interval.avg_heartrate).toBeGreaterThan(threshold!)
      // Nowhere near the full session length (2100s) — no mega-interval.
      expect(interval.duration).toBeLessThan(300)
    })

    intervals
      .filter((interval) => interval.type === 'RECOVERY')
      .forEach((interval) => {
        expect(interval.avg_heartrate).toBeLessThan(threshold!)
      })
  })

  it('classifies a long steady HR session with no candidates as STEADY', () => {
    const heartrate = Array.from({ length: 2400 }, (_, index) => 122 + (index % 3))
    const time = heartrate.map((_, index) => index)

    const threshold = resolveHrWorkThreshold({ maxHr: 190 })
    const intervals = detectIntervals(time, heartrate, 'heartrate', threshold)

    expect(intervals).toHaveLength(1)
    expect(intervals[0]?.type).toBe('STEADY')
    expect(intervals[0]?.duration).toBe(2399)
  })

  it('classifies a long steady power session with no candidates as STEADY', () => {
    const watts = Array.from({ length: 2400 }, (_, index) => 130 + (index % 5))
    const time = watts.map((_, index) => index)

    const intervals = detectIntervals(time, watts, 'power', 250)

    expect(intervals).toHaveLength(1)
    expect(intervals[0]?.type).toBe('STEADY')
  })
})

describe('resolveHrWorkThreshold', () => {
  it('prefers LTHR, then max HR, and only then the session max as a last resort', () => {
    expect(resolveHrWorkThreshold({ lthr: 160, maxHr: 190, sessionMaxHr: 175 })).toBeCloseTo(
      160 * 0.82,
      5
    )
    expect(resolveHrWorkThreshold({ lthr: null, maxHr: 190, sessionMaxHr: 175 })).toBeCloseTo(
      190 * 0.7,
      5
    )
    expect(resolveHrWorkThreshold({ sessionMaxHr: 175 })).toBeCloseTo(175 * 0.7, 5)
    expect(resolveHrWorkThreshold({})).toBeUndefined()
  })

  // Threshold pace in m/s (same unit the app stores sportSettings.thresholdPace in).
  const THRESHOLD_PACE = 4.0

  /** 5 x 3min reps with 3min jogs, bracketed by a warmup and a cooldown. */
  const buildIntervalRun = (workFraction: number, recoveryFraction: number) => {
    const workPace = THRESHOLD_PACE * workFraction
    const recoveryPace = THRESHOLD_PACE * recoveryFraction
    const velocity = [
      ...Array.from({ length: 600 }, () => 2.3), // warmup
      ...Array.from({ length: 5 }, () => [
        ...Array.from({ length: 180 }, () => workPace),
        ...Array.from({ length: 180 }, () => recoveryPace)
      ]).flat(),
      ...Array.from({ length: 300 }, () => 2.2) // cooldown
    ]
    return { velocity, time: velocity.map((_, index) => index), workPace }
  }

  it('separates run work reps from a realistic 70%-of-threshold recovery jog', () => {
    // The case that failed before CW-401: with the old 0.65 work bar a 70% jog
    // (2.8 m/s against a 2.6 m/s bar) read as work and the session welded into
    // one block. The bar is now 0.8 * threshold pace, so it sits at 3.2 m/s.
    const { velocity, time, workPace } = buildIntervalRun(1.05, 0.7)

    const withThreshold = detectIntervals(time, velocity, 'pace', THRESHOLD_PACE)
    const workIntervals = withThreshold.filter((interval) => interval.type === 'WORK')

    expect(workIntervals).toHaveLength(5)
    for (const interval of workIntervals) {
      expect(interval.duration).toBeGreaterThan(150)
      expect(interval.duration).toBeLessThan(210)
      expect(interval.avg_pace || 0).toBeGreaterThan(THRESHOLD_PACE)
      expect(interval.avg_pace || 0).toBeLessThanOrEqual(workPace)
    }
    // The gaps between reps must come back as recovery, not be swallowed into the reps.
    const recoveries = withThreshold.filter((interval) => interval.type === 'RECOVERY')
    expect(recoveries).toHaveLength(4)
    for (const interval of recoveries) {
      expect(interval.avg_pace || 0).toBeLessThan(THRESHOLD_PACE * 0.8)
    }
    expect(withThreshold[0]?.type).toBe('WARMUP')
    expect(withThreshold.at(-1)?.type).toBe('COOLDOWN')
  })

  it('holds the work/recovery split across the realistic 60-75% recovery-jog range', () => {
    // Real recovery jogs land anywhere in this band; none of them is work.
    for (const recoveryFraction of [0.6, 0.65, 0.7, 0.75]) {
      const { velocity, time } = buildIntervalRun(1.05, recoveryFraction)
      const detected = detectIntervals(time, velocity, 'pace', THRESHOLD_PACE)
      expect({
        recoveryFraction,
        work: detected.filter((interval) => interval.type === 'WORK').length,
        recovery: detected.filter((interval) => interval.type === 'RECOVERY').length
      }).toEqual({ recoveryFraction, work: 5, recovery: 4 })
    }
  })

  it('still collapses into one block when no threshold pace is available', () => {
    // Regression guard for CW-384's fix at the CALL SITES: without a threshold the engine
    // falls back to 0.8 * median(stream), and the median of an interval run sits at recovery
    // pace — so the work bar lands below the jog and the run reads as one work block. This is
    // why callers must pass the athlete's real thresholdPace; the engine cannot infer it.
    const { velocity, time } = buildIntervalRun(1.05, 0.7)
    const withoutThreshold = detectIntervals(time, velocity, 'pace', undefined)
    expect(withoutThreshold.filter((interval) => interval.type === 'WORK')).toHaveLength(1)
    expect(withoutThreshold.filter((interval) => interval.type === 'RECOVERY')).toHaveLength(0)
  })
})

describe('resolveProviderIntervalTypes', () => {
  // Intervals.icu labels nearly every synced lap WORK, including the recovery
  // jogs of a threshold session.
  const thresholdSession = [
    { type: 'WORK', intensity: 83, avgPower: 220 },
    { type: 'WORK', intensity: 101, avgPower: 270 },
    { type: 'WORK', intensity: 52, avgPower: 139 },
    { type: 'WORK', intensity: 103, avgPower: 275 },
    { type: 'WORK', intensity: 52, avgPower: 138 },
    { type: 'WORK', intensity: 105, avgPower: 280 },
    { type: 'WORK', intensity: 52, avgPower: 139 },
    { type: 'WORK', intensity: 109, avgPower: 291 },
    { type: 'WORK', intensity: 52, avgPower: 140 },
    { type: 'WORK', intensity: 69, avgPower: 184 },
    { type: 'RECOVERY', intensity: 38, avgPower: 103 }
  ]

  it('demotes recovery jogs and end blocks that the provider labelled WORK', () => {
    expect(resolveProviderIntervalTypes(thresholdSession)).toEqual([
      'WARMUP',
      'WORK',
      'RECOVERY',
      'WORK',
      'RECOVERY',
      'WORK',
      'RECOVERY',
      'WORK',
      'RECOVERY',
      'COOLDOWN',
      'RECOVERY'
    ])
  })

  it('falls back to average power when the provider reports no intensity', () => {
    const withoutIntensity = thresholdSession.map(({ type, avgPower }) => ({ type, avgPower }))
    expect(resolveProviderIntervalTypes(withoutIntensity)).toEqual(
      resolveProviderIntervalTypes(thresholdSession)
    )
  })

  it('leaves an evenly paced endurance run untouched', () => {
    const steadyLaps = [62, 64, 63, 65, 64, 63, 66, 64].map((intensity) => ({
      type: 'WORK',
      intensity
    }))
    expect(resolveProviderIntervalTypes(steadyLaps)).toEqual(steadyLaps.map(() => 'WORK'))
  })

  it('never promotes an explicit recovery label to work', () => {
    const laps = [
      { type: 'WARMUP', intensity: 60 },
      { type: 'RECOVERY', intensity: 104 },
      { type: 'WORK', intensity: 105 },
      { type: 'RECOVERY', intensity: 103 },
      { type: 'WORK', intensity: 106 }
    ]
    expect(resolveProviderIntervalTypes(laps)).toEqual([
      'WARMUP',
      'RECOVERY',
      'WORK',
      'RECOVERY',
      'WORK'
    ])
  })

  it('keeps provider types when there is nothing to compare', () => {
    expect(resolveProviderIntervalTypes([{ type: 'WORK' }, { type: 'WORK' }])).toEqual([
      'WORK',
      'WORK'
    ])
    expect(resolveProviderIntervalTypes([])).toEqual([])
  })
})

/**
 * A minute of riding recorded at two different rates: 50 seconds sampled every
 * 10s at 100W, then the last 10 seconds sampled at 1Hz at 400W.
 *
 * Time-weighted mean over the minute: (50 * 100 + 10 * 400) / 60 = 150.
 * Counting samples instead of seconds gives 4600 / 16 = 287.5 — the old bug.
 */
function mixedRateMinute() {
  const times = [0, 10, 20, 30, 40, 50]
  const values = [100, 100, 100, 100, 100, 100]
  for (let t = 51; t <= 60; t++) {
    times.push(t)
    values.push(400)
  }
  return { times, values }
}

describe('timeWeightedMean', () => {
  it('weights each sample by the time it covers, not by sample count', () => {
    const { times, values } = mixedRateMinute()
    expect(timeWeightedMean(times, values)).toBe(150)
  })

  it('drops the time spent inside a recording pause', () => {
    // 60s at 100, a 10 minute pause, then 20s at 400.
    const times: number[] = []
    const values: number[] = []
    for (let t = 0; t <= 59; t++) {
      times.push(t)
      values.push(100)
    }
    for (let t = 660; t <= 679; t++) {
      times.push(t)
      values.push(400)
    }

    // The paused 600s carries no value at all: only the recorded seconds count
    // (59 in the first block, 19 in the second — the sample that reopens
    // recording is a boundary). Charging the pause to the 400W sample that
    // follows it would give ~372.
    expect(timeWeightedMean(times, values)).toBeCloseTo((59 * 100 + 19 * 400) / 78, 10)
  })

  it('returns null when the range covers no elapsed time', () => {
    expect(timeWeightedMean([5], [250])).toBeNull()
    expect(timeWeightedMean([], [])).toBeNull()
  })
})

describe('findPeakEfforts', () => {
  it('averages a steady effort to its actual value', () => {
    const times = Array.from({ length: 400 }, (_, index) => index)
    const watts = times.map(() => 250)

    const peaks = findPeakEfforts(times, watts, 'power')

    expect(peaks.find((p) => p.duration === 60)?.value).toBe(250)
    expect(peaks.find((p) => p.duration === 300)?.value).toBe(250)
    expect(peaks.find((p) => p.duration === 600)).toBeUndefined()
  })

  it('averages by elapsed time when the sample rate is not 1Hz', () => {
    const { times, values } = mixedRateMinute()

    const peak = findPeakEfforts(times, values, 'power').find((p) => p.duration === 60)

    // Sample-count averaging reported 288W for this minute.
    expect(peak?.value).toBe(150)
    expect(peak?.start_time).toBe(0)
    expect(peak?.end_time).toBe(60)
  })

  it('does not let a peak window borrow time from across a recording pause', () => {
    // 15 minutes at 200W, a 10 minute pause, then 15 minutes at 400W.
    const times: number[] = []
    const watts: number[] = []
    for (let t = 0; t <= 899; t++) {
      times.push(t)
      watts.push(200)
    }
    for (let t = 1500; t <= 2399; t++) {
      times.push(t)
      watts.push(400)
    }

    const peaks = findPeakEfforts(times, watts, 'power')

    // The best continuous 10 minutes is inside the second block.
    const peak10m = peaks.find((p) => p.duration === 600)
    expect(peak10m?.value).toBe(400)
    expect(peak10m?.start_time).toBeGreaterThanOrEqual(1500)
    expect(peaks.find((p) => p.duration === 300)?.start_time).toBeGreaterThanOrEqual(1500)

    // No continuous 20 minute effort exists: the activity spans 40 minutes of
    // wall time but only two 15 minute blocks were recorded. Sample-count
    // averaging happily reported a 20m peak of 400W here.
    expect(peaks.find((p) => p.duration === 1200)).toBeUndefined()
  })

  it('keeps decimal precision for pace peaks and whole numbers for power', () => {
    const times = Array.from({ length: 301 }, (_, index) => index)
    // A fast half at 3.42 m/s, then an easy half at 2.61 m/s. Rounded to whole
    // numbers both collapse to 3, which is what made the pace curve useless.
    const velocity = times.map((_, index) => (index <= 150 ? 3.42 : 2.61))
    const watts = times.map((_, index) => 200 + (index % 10))

    const pacePeaks = findPeakEfforts(times, velocity, 'pace')
    const pacePeak = pacePeaks.find((p) => p.duration === 60)
    const powerPeak = findPeakEfforts(times, watts, 'power').find((p) => p.duration === 60)

    expect(pacePeak?.metric).toBe('pace')
    expect(pacePeak?.value).toBe(3.42)
    expect(pacePeaks.every((p) => Number.isInteger(p.value))).toBe(false)

    expect(powerPeak?.value).toBe(Math.round(powerPeak?.value ?? 0))
  })

  it('returns nothing for streams that are too short or empty', () => {
    expect(findPeakEfforts([], [], 'power')).toEqual([])
    expect(findPeakEfforts([0, 1, 2], [200, 200, 200], 'power')).toEqual([])
  })
})
