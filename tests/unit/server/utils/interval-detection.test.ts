import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PEAK_DURATIONS,
  detectIntervals,
  findPeakEfforts,
  normalizePlannedStepType,
  resolveHrWorkThreshold,
  resolveProviderIntervalTypes,
  timeWeightedMean
} from '../../../../server/utils/interval-detection'
import { getActualIntervalsForAnalysis } from '../../../../server/utils/workout-analysis-facts'

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

  // CW-400: the HR branch of createIntervalObj used to be an empty block, so
  // every HR-detected interval came back with intensity_zone undefined. Zones
  // come from the PROFILE refs, never from the work bar (which is already
  // scaled - 0.82 * LTHR - and would put every effort a zone or two too high).
  describe('heart-rate intensity zones', () => {
    const block = (bpm: number, seconds: number) => Array.from({ length: seconds }, () => bpm)
    const heartrate = [
      ...block(112, 300), // warmup
      ...block(155, 240), // work 1
      ...block(115, 180), // recovery 1
      ...block(155, 240), // work 2
      ...block(115, 180), // recovery 2
      ...block(155, 240), // work 3
      ...block(105, 300) // cooldown
    ]
    const time = heartrate.map((_, index) => index)
    const LTHR = 160
    const threshold = resolveHrWorkThreshold({ lthr: LTHR })

    it('assigns zones from a profile LTHR, not from the work bar', () => {
      const intervals = detectIntervals(
        time,
        heartrate,
        'heartrate',
        threshold,
        undefined,
        undefined,
        undefined,
        { lthr: LTHR }
      )

      expect(intervals.length).toBeGreaterThan(1)
      // Friel LTHR bands at LTHR 160: Z1 <= 130, Z4 150-158.
      const workIntervals = intervals.filter((interval) => interval.type === 'WORK')
      expect(workIntervals.length).toBeGreaterThan(0)
      workIntervals.forEach((interval) => {
        expect(interval.intensity_zone).toBe(4)
      })
      intervals
        .filter((interval) => interval.type !== 'WORK')
        .forEach((interval) => {
          expect(interval.intensity_zone).toBe(1)
        })
    })

    it('falls back to the max-HR zone model when only max HR is known', () => {
      // Max-HR bands at 190: Z2 115-133, Z4 153-171.
      const intervals = detectIntervals(
        time,
        heartrate,
        'heartrate',
        resolveHrWorkThreshold({ maxHr: 190 }),
        undefined,
        undefined,
        undefined,
        { maxHr: 190 }
      )

      const workIntervals = intervals.filter((interval) => interval.type === 'WORK')
      expect(workIntervals.length).toBeGreaterThan(0)
      workIntervals.forEach((interval) => {
        expect(interval.intensity_zone).toBe(4)
      })
    })

    it('leaves the zone undefined when the profile carries neither LTHR nor max HR', () => {
      const intervals = detectIntervals(time, heartrate, 'heartrate', threshold)

      expect(intervals.length).toBeGreaterThan(1)
      intervals.forEach((interval) => {
        expect(interval.intensity_zone).toBeUndefined()
      })

      // ...and passing empty refs must not guess off the work bar either.
      const withEmptyRefs = detectIntervals(
        time,
        heartrate,
        'heartrate',
        threshold,
        undefined,
        undefined,
        undefined,
        { lthr: null, maxHr: null }
      )
      withEmptyRefs.forEach((interval) => {
        expect(interval.intensity_zone).toBeUndefined()
      })
    })
  })

  it('classifies a long steady power session with no candidates as STEADY', () => {
    const watts = Array.from({ length: 2400 }, (_, index) => 130 + (index % 5))
    const time = watts.map((_, index) => index)

    const intervals = detectIntervals(time, watts, 'power', 250)

    expect(intervals).toHaveLength(1)
    expect(intervals[0]?.type).toBe('STEADY')
  })

  // CW-417: the STEADY branch was the only createIntervalObj call site that
  // passed `undefined` instead of the cadence stream, so exactly the session
  // type where one steady cadence figure means the most reported none.
  it('carries the cadence stream onto a STEADY interval', () => {
    const watts = Array.from({ length: 2400 }, (_, index) => 130 + (index % 5))
    const time = watts.map((_, index) => index)
    const cadence = Array.from({ length: 2400 }, (_, index) => 88 + (index % 3))

    const intervals = detectIntervals(time, watts, 'power', 250, undefined, undefined, cadence)

    expect(intervals).toHaveLength(1)
    expect(intervals[0]?.type).toBe('STEADY')
    // Cadence cycles 88/89/90 across the whole session, so the mean is 89.
    expect(intervals[0]?.avg_cadence).toBeCloseTo(89, 5)
    expect(intervals[0]?.cadence_start).toBe(88)
    expect(intervals[0]?.cadence_end).toBe(cadence[cadence.length - 1])
  })

  it('leaves STEADY cadence fields absent when no cadence stream is supplied', () => {
    const watts = Array.from({ length: 2400 }, (_, index) => 130 + (index % 5))
    const time = watts.map((_, index) => index)

    const intervals = detectIntervals(time, watts, 'power', 250)

    expect(intervals).toHaveLength(1)
    expect(intervals[0]?.type).toBe('STEADY')
    expect(intervals[0]?.avg_cadence).toBeUndefined()
    expect(intervals[0]?.cadence_start).toBeUndefined()
    expect(intervals[0]?.cadence_end).toBeUndefined()
  })

  // CW-400: plan-guided labelling paired planned WORK steps with detected WORK
  // intervals only, so a STEADY session (which has no WORK interval at all) came
  // back unlabelled even with a planned workout linked to it.
  it('labels a STEADY session against its planned step', () => {
    const watts = Array.from({ length: 2400 }, (_, index) => 130 + (index % 5))
    const time = watts.map((_, index) => index)
    const plannedSteps = [{ type: 'STEADY', name: 'Endurance ride', durationSeconds: 2400 }]

    const intervals = detectIntervals(time, watts, 'power', 250, plannedSteps)

    expect(intervals).toHaveLength(1)
    expect(intervals[0]?.type).toBe('STEADY')
    expect(intervals[0]?.label).toBe('Endurance ride')
    expect(intervals[0]?.match_score).toBeGreaterThan(0.99)
  })

  it('still pairs planned WORK steps with detected WORK intervals only', () => {
    const block = (value: number, seconds: number) => Array.from({ length: seconds }, () => value)
    const watts = [
      ...block(120, 600), // warmup
      ...block(260, 300), // work 1
      ...block(120, 300), // recovery 1
      ...block(260, 300), // work 2
      ...block(110, 300) // cooldown
    ]
    const time = watts.map((_, index) => index)
    // A single planned step keeps plan-guided detection out of it (it needs two
    // or more), so the tail matching block runs on a session that does have WORK
    // intervals - the case the STEADY fallback must not disturb.
    const plannedSteps = [{ type: 'WORK', durationSeconds: 300, name: 'Rep 1' }]

    const intervals = detectIntervals(time, watts, 'power', 250, plannedSteps)
    const workIntervals = intervals.filter((interval) => interval.type === 'WORK')

    expect(workIntervals).toHaveLength(2)
    expect(workIntervals[0]?.label).toBe('Rep 1')
    expect(workIntervals[1]?.label).toBeUndefined()
    // The label must not leak onto the warmup/recovery/cooldown blocks.
    intervals
      .filter((interval) => interval.type !== 'WORK')
      .forEach((interval) => {
        expect(interval.label).toBeUndefined()
      })
  })

  /**
   * CW-426: segment boundaries are inclusive and disjoint — a block occupying
   * samples N..M comes back as exactly `start_index: N, end_index: M`, and the
   * next segment opens at M + 1.
   *
   * Both segmentation paths broke this, and they broke it DIFFERENTLY:
   *   - the candidate/merge pass ended each segment on the first sample of the
   *     next block, so adjacent segments overlapped on that sample (a 4min rep
   *     came back as [600..840] and the recovery after it as [840..1020]);
   *   - `detectIntervalsFromPlannedSteps` used the first sample at or after the
   *     planned end time as the step's own inclusive end and then started the
   *     next step at `end + 1`, shifting every segment to [N+1, M+1] — the
   *     `start_index: 601, end_index: 840` measured on CW-393's fixture.
   *
   * Either way every work rep lost its own first sample and/or carried one
   * sample of the block next door, which is the worst possible contamination
   * for CW-393's rep-scoped coefficient-of-variation signals.
   *
   * `smoothedValues` is passed through verbatim so these assertions measure the
   * boundary arithmetic and not the lag of the default moving average (a
   * centred SMA necessarily rounds a sharp edge; that is a separate concern).
   */
  describe('segment boundaries (CW-426)', () => {
    const BLOCKS = [
      { type: 'WARMUP', watts: 120, seconds: 600 },
      { type: 'WORK', watts: 280, seconds: 240 },
      { type: 'RECOVERY', watts: 110, seconds: 180 },
      { type: 'WORK', watts: 280, seconds: 240 },
      { type: 'RECOVERY', watts: 110, seconds: 180 },
      { type: 'WORK', watts: 280, seconds: 240 },
      { type: 'RECOVERY', watts: 110, seconds: 180 },
      { type: 'WORK', watts: 280, seconds: 240 },
      { type: 'COOLDOWN', watts: 100, seconds: 300 }
    ] as const

    /** The fixture plus the sample range each block genuinely occupies. */
    const buildSharpBlocks = () => {
      const watts: number[] = []
      const expected: { type: string; start: number; end: number }[] = []
      for (const block of BLOCKS) {
        const start = watts.length
        for (let index = 0; index < block.seconds; index++) watts.push(block.watts)
        expected.push({ type: block.type, start, end: watts.length - 1 })
      }
      return { watts, time: watts.map((_, index) => index), expected }
    }

    const asRanges = (intervals: { type: string; start_index: number; end_index: number }[]) =>
      intervals.map((interval) => ({
        type: interval.type,
        start: interval.start_index,
        end: interval.end_index
      }))

    it('returns a block occupying samples N..M as exactly N..M (candidate/merge pass)', () => {
      const { watts, time, expected } = buildSharpBlocks()

      const intervals = detectIntervals(time, watts, 'power', 250, undefined, watts)

      // Before the fix: WARMUP [0..600], WORK [600..840], RECOVERY [840..1020]...
      expect(asRanges(intervals)).toEqual(expected)
    })

    it('returns a block occupying samples N..M as exactly N..M (plan-guided pass)', () => {
      const { watts, time, expected } = buildSharpBlocks()
      const plannedSteps = BLOCKS.map((block) => ({
        type: block.type,
        durationSeconds: block.seconds,
        power: { value: block.watts }
      }))

      const intervals = detectIntervals(time, watts, 'power', 250, plannedSteps, watts)

      // Before the fix: WARMUP [0..600], WORK [601..840], RECOVERY [841..1020]...
      expect(asRanges(intervals)).toEqual(expected)
    })

    it('makes the two segmentation paths agree with each other', () => {
      // They used to disagree, which was a second latent bug: for the identical
      // 240-sample rep the candidate pass reported [600..840] (duration 240,
      // overlapping its neighbours) and the plan-guided pass [601..840]
      // (duration 239, disjoint but shifted). Neither was right.
      const { watts, time } = buildSharpBlocks()
      const plannedSteps = BLOCKS.map((block) => ({
        type: block.type,
        durationSeconds: block.seconds,
        power: { value: block.watts }
      }))

      const fromCandidates = detectIntervals(time, watts, 'power', 250, undefined, watts)
      const fromPlan = detectIntervals(time, watts, 'power', 250, plannedSteps, watts)

      expect(asRanges(fromCandidates)).toEqual(asRanges(fromPlan))
      expect(fromCandidates.map((interval) => interval.duration)).toEqual(
        fromPlan.map((interval) => interval.duration)
      )
    })

    it('emits disjoint, contiguous, gap-free segments that cover the stream once', () => {
      const { watts, time } = buildSharpBlocks()

      const intervals = detectIntervals(time, watts, 'power', 250, undefined, watts)

      expect(intervals[0]?.start_index).toBe(0)
      expect(intervals.at(-1)?.end_index).toBe(time.length - 1)
      intervals.slice(1).forEach((interval, index) => {
        // No shared sample, no skipped sample.
        expect(interval.start_index).toBe(intervals[index]!.end_index + 1)
      })
    })

    it('keeps every per-segment average free of the neighbouring block', () => {
      // The point of the whole ticket: one foreign sample in a 240-sample rep
      // dragged the average off its true value and inflated the rep's CoV.
      const { watts, time } = buildSharpBlocks()

      const intervals = detectIntervals(time, watts, 'power', 250, undefined, watts)

      intervals
        .filter((interval) => interval.type === 'WORK')
        .forEach((interval) => {
          // Exactly 280 W, not the 279.29 W a stray 110 W recovery sample gave.
          expect(interval.avg_power).toBe(280)
          expect(interval.max_power).toBe(280)
        })
      intervals
        .filter((interval) => interval.type === 'RECOVERY')
        .forEach((interval) => expect(interval.avg_power).toBe(110))
    })

    it('reports each segment duration as its own elapsed span, counting no second twice', () => {
      const { watts, time } = buildSharpBlocks()

      const intervals = detectIntervals(time, watts, 'power', 250, undefined, watts)

      intervals.forEach((interval) => {
        expect(interval.end_time - interval.start_time).toBe(interval.duration)
        // A K-sample block at 1 Hz spans K - 1 seconds, the same arithmetic the
        // whole-session STEADY block has always reported (2400 samples ->
        // 2399s). The candidate pass used to report a flat 240 for a 240-sample
        // rep only because it was measuring out to the FIRST RECOVERY SAMPLE:
        // that 240 was the off-by-one, not a correct duration.
        expect(interval.duration).toBe(interval.end_index - interval.start_index)
      })

      const workDurations = intervals
        .filter((interval) => interval.type === 'WORK')
        .map((interval) => interval.duration)
      expect(workDurations).toEqual([239, 239, 239, 239])
    })
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

  it('emits exactly the shared default buckets when no durations are requested', () => {
    // pbDetectionService mints a POWER_<LABEL> personal-best type per bucket and
    // both intervals endpoints render one peaks-table row per bucket, so this
    // list is a product contract: changing it invents PB types and UI rows.
    const times = Array.from({ length: 3601 }, (_, index) => index)
    const watts = times.map(() => 250)

    const peaks = findPeakEfforts(times, watts, 'power')

    expect(peaks.map((p) => p.duration)).toEqual([5, 30, 60, 300, 600, 1200, 3600])
    expect(peaks.map((p) => p.duration_label)).toEqual([
      '5s',
      '30s',
      '1m',
      '5m',
      '10m',
      '20m',
      '60m'
    ])
    expect(DEFAULT_PEAK_DURATIONS.map((d) => d.sec)).toEqual([5, 30, 60, 300, 600, 1200, 3600])

    // The 40 minute bucket thresholdDetectionService asks for must stay opt-in.
    expect(peaks.find((p) => p.duration === 2400)).toBeUndefined()
  })

  it('emits only the requested buckets when durations are passed explicitly', () => {
    const times = Array.from({ length: 2401 }, (_, index) => index)
    const velocity = times.map(() => 4)

    const peaks = findPeakEfforts(times, velocity, 'pace', [{ sec: 2400, label: '40m' }])

    expect(peaks).toHaveLength(1)
    expect(peaks[0]).toMatchObject({ duration: 2400, duration_label: '40m', metric: 'pace' })
    expect(peaks[0]?.value).toBeCloseTo(4, 5)
  })

  it('applies the same pause and time-weighting rules to a requested bucket', () => {
    // 20 minutes at 4 m/s, a 10 minute recording pause, then 20 more minutes.
    // The activity spans 50 minutes of wall time but holds no continuous 40.
    const times: number[] = []
    const velocity: number[] = []
    for (let t = 0; t <= 1199; t++) {
      times.push(t)
      velocity.push(4)
    }
    for (let t = 1800; t <= 2999; t++) {
      times.push(t)
      velocity.push(4)
    }

    expect(findPeakEfforts(times, velocity, 'pace', [{ sec: 2400, label: '40m' }])).toEqual([])
  })
})

/**
 * CW-414: one normaliser, one rule set.
 *
 * Detection used to classify a planned step twice with two different rules. The
 * facts layer promoted a RECOVERY-labelled step to WORK when its target was at
 * work intensity (CW-402), and then `flattenPlannedStepsForDetection` re-derived
 * the type from `type` AND the free-text `name` and demoted it straight back —
 * which hit essentially every promoted step, because they are named "Recovery",
 * "Recovery Jog" or "Rest". A step name is user-authored free text and must
 * never override a structured numeric target.
 */
describe('normalizePlannedStepType (CW-414)', () => {
  it('lets a structured numeric target stand against a contradicting free-text name', () => {
    // The step the CW-402 promotion is about: labelled recovery in both the
    // type and the name, but prescribed at 85% of threshold.
    expect(
      normalizePlannedStepType({ type: 'Recovery', name: 'Recovery', intensityFactor: 0.85 })
    ).toBe('WORK')
    expect(
      normalizePlannedStepType({ type: 'Active', name: 'Recovery Jog', intensityFactor: 0.9 })
    ).toBe('WORK')
    // The name is evidence, not an override, and with no target to check it
    // against it is the only evidence there is — so it is still honoured here.
    // What the detection layer must not do is consult it over a type that was
    // already resolved with an intensity factor; that is a call-site decision
    // (`flattenPlannedStepsForDetection`), covered by the next describe block.
    expect(normalizePlannedStepType({ type: 'Active', name: 'Recovery' })).toBe('RECOVERY')
  })

  it('demotes on a name only when the numeric target does not contradict it', () => {
    // No intensity factor to check against: the label is all the evidence there
    // is, so it is honoured (this is the adherence path's long-standing rule).
    expect(normalizePlannedStepType({ type: 'Active', name: 'Recovery' })).toBe('RECOVERY')
    expect(
      normalizePlannedStepType({ type: 'Active', name: 'Recovery', intensityFactor: 0.5 })
    ).toBe('RECOVERY')
    // 85% of threshold is work whatever it is called.
    expect(
      normalizePlannedStepType({ type: 'Active', name: 'Recovery', intensityFactor: 0.85 })
    ).toBe('WORK')
    expect(
      normalizePlannedStepType({ type: 'Recovery', name: 'Recovery', intensityFactor: 0.85 })
    ).toBe('WORK')
    // ...and the boundary is inclusive, matching `flattenPlannedSteps`.
    expect(normalizePlannedStepType({ type: 'Rest', intensityFactor: 0.8 })).toBe('WORK')
    expect(normalizePlannedStepType({ type: 'Rest', intensityFactor: 0.79 })).toBe('RECOVERY')
  })

  it('keeps warmup and cooldown structural — intensity never overrides them', () => {
    expect(normalizePlannedStepType({ type: 'Warmup', name: 'Warm up' })).toBe('WARMUP')
    expect(normalizePlannedStepType({ type: 'Cooldown', name: 'Spin down' })).toBe('COOLDOWN')
    // A warmup ramp can pass through work intensity and is still a warmup.
    expect(normalizePlannedStepType({ type: 'Warmup', intensityFactor: 0.95 })).toBe('WARMUP')
    expect(normalizePlannedStepType({ type: 'Cooldown', intensityFactor: 0.95 })).toBe('COOLDOWN')
  })

  it('reads Spanish labels', () => {
    expect(normalizePlannedStepType({ name: 'calentamiento' })).toBe('WARMUP')
    expect(normalizePlannedStepType({ name: 'enfriamiento' })).toBe('COOLDOWN')
    expect(normalizePlannedStepType({ name: 'recuperación' })).toBe('RECOVERY')
    expect(normalizePlannedStepType({ name: 'descanso' })).toBe('RECOVERY')
    // Same intensity veto as the English tokens.
    expect(normalizePlannedStepType({ name: 'recuperación', intensityFactor: 0.9 })).toBe('WORK')
  })

  it('returns undefined only when there is no evidence at all', () => {
    expect(normalizePlannedStepType({})).toBeUndefined()
    expect(normalizePlannedStepType({ type: '', name: '' })).toBeUndefined()
    expect(normalizePlannedStepType({ name: 'Effort 1' })).toBe('WORK')
  })
})

describe('plan-guided detection does not re-read the step name (CW-414)', () => {
  const STEP_SECONDS = 300
  const FTP = 200

  function block(watts: number) {
    return Array.from({ length: STEP_SECONDS }, () => watts)
  }

  it('keeps a step the facts layer resolved to WORK as WORK, even when it is named Recovery', () => {
    // These are planned steps in the shape `toDetectionPlannedSteps` hands to
    // the engine: the type is already the resolved answer. Step 2 is the
    // promoted one — labelled "Recovery", prescribed at 170 W (85% of FTP).
    // Before this fix the name demoted it back to RECOVERY here.
    const plannedSteps = [
      { type: 'WARMUP', name: 'Warm up', durationSeconds: STEP_SECONDS, power: { value: 120 } },
      { type: 'WORK', name: 'Effort 1', durationSeconds: STEP_SECONDS, power: { value: 240 } },
      { type: 'WORK', name: 'Recovery', durationSeconds: STEP_SECONDS, power: { value: 170 } },
      { type: 'WORK', name: 'Effort 2', durationSeconds: STEP_SECONDS, power: { value: 240 } },
      { type: 'RECOVERY', name: 'Recovery', durationSeconds: STEP_SECONDS, power: { value: 100 } },
      { type: 'COOLDOWN', name: 'Cool down', durationSeconds: STEP_SECONDS, power: { value: 110 } }
    ]
    const watts = [
      ...block(120),
      ...block(240),
      ...block(170),
      ...block(240),
      ...block(100),
      ...block(110)
    ]
    const time = watts.map((_, index) => index)

    const intervals = detectIntervals(time, watts, 'power', FTP, plannedSteps)

    expect(intervals.map((interval) => interval.type)).toEqual([
      'WARMUP',
      'WORK',
      'WORK',
      'WORK',
      'RECOVERY',
      'COOLDOWN'
    ])
    // The name is still carried through as the segment label — it just no
    // longer decides the type.
    expect(intervals[2]?.label).toBe('Recovery')
  })

  it('still classifies from the name when the step carries no type at all', () => {
    const plannedSteps = [
      { name: 'calentamiento', durationSeconds: STEP_SECONDS, power: { value: 120 } },
      { name: 'Effort 1', durationSeconds: STEP_SECONDS, power: { value: 240 } },
      { name: 'descanso', durationSeconds: STEP_SECONDS, power: { value: 100 } },
      { name: 'Effort 2', durationSeconds: STEP_SECONDS, power: { value: 240 } },
      { name: 'recuperación', durationSeconds: STEP_SECONDS, power: { value: 100 } },
      { name: 'enfriamiento', durationSeconds: STEP_SECONDS, power: { value: 110 } }
    ]
    const watts = [
      ...block(120),
      ...block(240),
      ...block(100),
      ...block(240),
      ...block(100),
      ...block(110)
    ]
    const time = watts.map((_, index) => index)

    const intervals = detectIntervals(time, watts, 'power', FTP, plannedSteps)

    expect(intervals.map((interval) => interval.type)).toEqual([
      'WARMUP',
      'WORK',
      'RECOVERY',
      'WORK',
      'RECOVERY',
      'COOLDOWN'
    ])
  })

  it('promotes a work-intensity step named Recovery end to end, and leaves a genuine one alone', () => {
    // Plan -> toDetectionPlannedSteps (which resolves the type against the
    // athlete's FTP) -> detectIntervals. Every step here is BOTH typed
    // Recovery-ish AND named "Recovery": only the numeric target separates them.
    const steps = [
      {
        type: 'Warmup',
        name: 'Warm up',
        durationSeconds: STEP_SECONDS,
        power: { value: 120, units: 'w' }
      },
      {
        type: 'Interval',
        name: 'Effort 1',
        durationSeconds: STEP_SECONDS,
        power: { value: 240, units: 'w' }
      },
      // 170 W is 85% of a 200 W FTP: work, whatever the type and name say.
      {
        type: 'Recovery',
        name: 'Recovery',
        durationSeconds: STEP_SECONDS,
        power: { value: 170, units: 'w' }
      },
      {
        type: 'Interval',
        name: 'Effort 2',
        durationSeconds: STEP_SECONDS,
        power: { value: 240, units: 'w' }
      },
      // 100 W is 50% of FTP: a genuine recovery step, and it stays one.
      {
        type: 'Recovery',
        name: 'Recovery',
        durationSeconds: STEP_SECONDS,
        power: { value: 100, units: 'w' }
      },
      {
        type: 'Cooldown',
        name: 'Cool down',
        durationSeconds: STEP_SECONDS,
        power: { value: 110, units: 'w' }
      }
    ]
    const watts = [
      ...block(120),
      ...block(240),
      ...block(170),
      ...block(240),
      ...block(100),
      ...block(110)
    ]

    const intervals = getActualIntervalsForAnalysis(
      {
        id: 'workout-cw-414',
        title: '2 x 5min with tempo floats',
        type: 'Ride',
        durationSec: watts.length,
        streams: { time: watts.map((_, index) => index), watts }
      },
      { structuredWorkout: { steps } },
      { ftp: FTP, lthr: 0, maxHr: 0, thresholdPace: 0 }
    )

    expect(intervals.map((interval) => interval.type)).toEqual([
      'WARMUP',
      'WORK',
      'WORK',
      'WORK',
      'RECOVERY',
      'COOLDOWN'
    ])
  })

  it('leaves both steps as RECOVERY when there is no FTP to judge the target against', () => {
    // The same plan with no usable reference: no intensity factor can be built,
    // so nothing contradicts the labels and both steps stay recovery. This is
    // what makes the promotion evidence-based rather than a blanket rule.
    const steps = [
      {
        type: 'Warmup',
        name: 'Warm up',
        durationSeconds: STEP_SECONDS,
        power: { value: 120, units: 'w' }
      },
      {
        type: 'Interval',
        name: 'Effort 1',
        durationSeconds: STEP_SECONDS,
        power: { value: 240, units: 'w' }
      },
      {
        type: 'Recovery',
        name: 'Recovery',
        durationSeconds: STEP_SECONDS,
        power: { value: 170, units: 'w' }
      },
      {
        type: 'Interval',
        name: 'Effort 2',
        durationSeconds: STEP_SECONDS,
        power: { value: 240, units: 'w' }
      },
      {
        type: 'Recovery',
        name: 'Recovery',
        durationSeconds: STEP_SECONDS,
        power: { value: 100, units: 'w' }
      },
      {
        type: 'Cooldown',
        name: 'Cool down',
        durationSeconds: STEP_SECONDS,
        power: { value: 110, units: 'w' }
      }
    ]
    const watts = [
      ...block(120),
      ...block(240),
      ...block(170),
      ...block(240),
      ...block(100),
      ...block(110)
    ]

    const intervals = getActualIntervalsForAnalysis(
      {
        id: 'workout-cw-414-no-ftp',
        title: '2 x 5min with tempo floats',
        type: 'Ride',
        durationSec: watts.length,
        streams: { time: watts.map((_, index) => index), watts }
      },
      { structuredWorkout: { steps } },
      { ftp: 0, lthr: 0, maxHr: 0, thresholdPace: 0 }
    )

    expect(intervals.map((interval) => interval.type)).toEqual([
      'WARMUP',
      'WORK',
      'RECOVERY',
      'WORK',
      'RECOVERY',
      'COOLDOWN'
    ])
  })
})
