import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getServerSession } from '../../../../../server/utils/session'
import { prisma } from '../../../../../server/utils/db'
import { attachStreamToWorkout } from '../../../../../server/utils/repositories/workoutStreamRepository'
import { sportSettingsRepository } from '../../../../../server/utils/repositories/sportSettingsRepository'
import { getActualIntervalsForAnalysis } from '../../../../../server/utils/workout-analysis-facts'

vi.stubGlobal('defineRouteMeta', () => {})

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  createError: (err: any) => Object.assign(new Error(err.message), { statusCode: err.statusCode }),
  getRouterParam: (event: any, key: string) => event?.context?.params?.[key],
  getQuery: (event: any) => event?.query ?? {}
}))

vi.mock('../../../../../server/utils/session', () => ({
  getServerSession: vi.fn()
}))

vi.mock('../../../../../server/utils/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    workout: { findFirst: vi.fn() }
  }
}))

vi.mock('../../../../../server/utils/repositories/workoutStreamRepository', () => ({
  attachStreamToWorkout: vi.fn()
}))

vi.mock('../../../../../server/utils/repositories/sportSettingsRepository', () => ({
  sportSettingsRepository: { getForActivityType: vi.fn() }
}))

const getHandler = async () =>
  (await import('../../../../../server/api/workouts/[id]/intervals.get')).default

const FTP = 250

/**
 * A 4 x 3min @ 105% FTP session with 3min recoveries, book-ended by a warmup and a
 * cooldown. Flat (no repeat blocks) because the endpoint hands `structuredWorkout.steps`
 * to the detection engine verbatim.
 */
const PLAN_SEGMENTS: Array<{ type: string; seconds: number; factor: number }> = [
  { type: 'WARMUP', seconds: 600, factor: 0.55 },
  { type: 'WORK', seconds: 180, factor: 1.05 },
  { type: 'RECOVERY', seconds: 180, factor: 0.5 },
  { type: 'WORK', seconds: 180, factor: 1.05 },
  { type: 'RECOVERY', seconds: 180, factor: 0.5 },
  { type: 'WORK', seconds: 180, factor: 1.05 },
  { type: 'RECOVERY', seconds: 180, factor: 0.5 },
  { type: 'WORK', seconds: 180, factor: 1.05 },
  { type: 'RECOVERY', seconds: 180, factor: 0.5 },
  { type: 'COOLDOWN', seconds: 300, factor: 0.5 }
]

const structuredWorkout = {
  steps: PLAN_SEGMENTS.map((segment) => ({
    type: segment.type,
    durationSeconds: segment.seconds,
    power: { value: segment.factor }
  }))
}

/**
 * Build the recorded power stream.
 *
 * `fragmentReps` puts a short coast in the middle of every work rep — the kind of
 * junction/soft-pedal an athlete really does. The engine then segments each rep in two,
 * while the provider's laps (recorded from the athlete's lap button) still describe the
 * four reps the plan asked for.
 */
function buildStream(options: { fragmentReps: boolean }) {
  const time: number[] = []
  const watts: number[] = []
  let clock = 0

  for (const segment of PLAN_SEGMENTS) {
    const target = Math.round(FTP * segment.factor)
    for (let second = 0; second < segment.seconds; second++) {
      const inRepCoast =
        options.fragmentReps &&
        segment.type === 'WORK' &&
        second >= Math.floor(segment.seconds / 2) - 12 &&
        second < Math.floor(segment.seconds / 2) + 12
      time.push(clock)
      watts.push(inRepCoast ? Math.round(FTP * 0.4) : target)
      clock += 1
    }
  }

  return { time, watts }
}

/** Provider laps that describe exactly the planned structure. */
function trueProviderLaps() {
  let start = 0
  return PLAN_SEGMENTS.map((segment) => {
    const lap = {
      type: segment.type === 'WORK' ? 'WORK' : 'RECOVERY',
      start_index: start,
      end_index: start + segment.seconds - 1,
      start_time: start,
      end_time: start + segment.seconds,
      duration: segment.seconds,
      average_watts: Math.round(FTP * segment.factor),
      intensity: Math.round(segment.factor * 100)
    }
    start += segment.seconds
    return lap
  })
}

/** Auto-laps every 5 minutes: no relationship at all to the session's structure. */
function autoLaps(totalSeconds: number) {
  const laps: any[] = []
  for (let start = 0; start < totalSeconds; start += 300) {
    const seconds = Math.min(300, totalSeconds - start)
    laps.push({
      type: 'WORK',
      start_index: start,
      end_index: start + seconds - 1,
      start_time: start,
      end_time: start + seconds,
      duration: seconds,
      average_watts: Math.round(FTP * 0.75),
      intensity: 75
    })
  }
  return laps
}

type Scenario = {
  laps: any[]
  fragmentReps?: boolean
  plan?: boolean
}

function mockWorkout(scenario: Scenario) {
  const streams = buildStream({ fragmentReps: Boolean(scenario.fragmentReps) })
  const workout = {
    id: 'workout-1',
    userId: 'user-1',
    type: 'Ride',
    ftp: null,
    maxHr: null,
    decoupling: null,
    rawJson: { icu_intervals: scenario.laps },
    plannedWorkout:
      scenario.plan === false ? null : { id: 'plan-1', title: '4x3', structuredWorkout }
  }

  vi.mocked(prisma.workout.findFirst).mockResolvedValue(workout as any)
  vi.mocked(attachStreamToWorkout).mockResolvedValue({
    ...workout,
    streams: {
      time: streams.time,
      watts: streams.watts,
      heartrate: null,
      cadence: null,
      velocity: null
    }
  } as any)

  return { workout, streams }
}

const event = (query: Record<string, unknown> = {}) => ({
  context: { params: { id: 'workout-1' } },
  query
})

const totalPlannedSeconds = PLAN_SEGMENTS.reduce((sum, segment) => sum + segment.seconds, 0)

describe('GET /api/workouts/[id]/intervals interval source arbitration (CW-430)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'a@b.c' } } as any)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      ftp: FTP,
      maxHr: 190,
      lthr: 165,
      email: 'a@b.c'
    } as any)
    vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
      ftp: FTP,
      lthr: 165,
      maxHr: 190,
      thresholdPace: 0,
      hrZones: [],
      powerZones: [],
      paceZones: []
    } as any)
  })

  it('keeps the provider laps when they describe the plan better than our engine does', async () => {
    // The recorded reps contain a mid-rep coast, so the engine splits each of the four reps
    // in two while the provider's laps still match the plan.
    mockWorkout({ laps: trueProviderLaps(), fragmentReps: true })

    const result = await (await getHandler())(event({ debug: 'true' }) as any)

    expect(result.detectionMetric).toBe('intervals.icu')
    expect(result.intervals).toHaveLength(PLAN_SEGMENTS.length)
    expect(result.audit.intervalSource).toMatchObject({
      chosen: 'raw',
      arbitrated: 'raw',
      planAvailable: true,
      detectionMetric: 'intervals.icu'
    })
    expect(result.audit.intervalSource.syncedCount).toBe(PLAN_SEGMENTS.length)
    expect(result.audit.intervalSource.detectedCount).toBeGreaterThan(0)
  })

  it('switches the chart to the engine segmentation when the provider laps do not match the plan', async () => {
    // Auto-laps every 5 minutes: the athlete rode the session cleanly, but the provider's
    // laps describe none of it. Before CW-430 these won unconditionally.
    mockWorkout({ laps: autoLaps(totalPlannedSeconds) })

    const result = await (await getHandler())(event({ debug: 'true' }) as any)

    expect(result.detectionMetric).toBe('power')
    expect(result.audit.intervalSource).toMatchObject({
      chosen: 'detected',
      arbitrated: 'detected',
      planAvailable: true,
      detectionMetric: 'power'
    })
    expect(result.intervals.length).toBe(result.audit.intervalSource.detectedCount)
    // The chart no longer renders the provider's 5-minute blocks.
    expect(result.intervals.length).not.toBe(result.audit.intervalSource.syncedCount)
  })

  it('falls back to the provider laps when no plan is linked (nothing to arbitrate against)', async () => {
    mockWorkout({ laps: autoLaps(totalPlannedSeconds), plan: false })

    const result = await (await getHandler())(event({ debug: 'true' }) as any)

    expect(result.detectionMetric).toBe('intervals.icu')
    expect(result.audit.intervalSource).toMatchObject({
      chosen: 'raw',
      arbitrated: 'raw',
      planAvailable: false,
      plannedStepCount: 0
    })
  })

  it('uses the engine segmentation when the provider sent no laps at all', async () => {
    mockWorkout({ laps: [] })

    const result = await (await getHandler())(event({ debug: 'true' }) as any)

    expect(result.detectionMetric).toBe('power')
    expect(result.audit.intervalSource).toMatchObject({
      chosen: 'detected',
      // Nothing to arbitrate: only one candidate existed.
      arbitrated: null,
      syncedCount: 0
    })
  })

  it('never exposes the interval provenance outside the debug audit block', async () => {
    mockWorkout({ laps: autoLaps(totalPlannedSeconds) })

    const result = await (await getHandler())(event() as any)

    expect(result.audit).toBeNull()
    expect(JSON.stringify(result)).not.toContain('intervalSource')
  })
})

/* -------------------------------------------------------------------------- */
/* CW-434: one detected-interval candidate for the chart and the arbitration    */
/* -------------------------------------------------------------------------- */

const THRESHOLD_PACE = 3.5 // m/s
const LTHR = 165
const MAX_HR = 190

/** A 3 x 4min run session, expressed in the metric a run is actually prescribed in. */
const RUN_SEGMENTS: Array<{ type: string; seconds: number; paceFactor: number }> = [
  { type: 'WARMUP', seconds: 600, paceFactor: 0.7 },
  { type: 'WORK', seconds: 240, paceFactor: 1.05 },
  { type: 'RECOVERY', seconds: 180, paceFactor: 0.6 },
  { type: 'WORK', seconds: 240, paceFactor: 1.05 },
  { type: 'RECOVERY', seconds: 180, paceFactor: 0.6 },
  { type: 'WORK', seconds: 240, paceFactor: 1.05 },
  { type: 'COOLDOWN', seconds: 300, paceFactor: 0.6 }
]

/**
 * A run recorded by a device that also reports running power — velocity and watts both
 * present, both full length, both describing the same session.
 */
function buildRunStreams() {
  const time: number[] = []
  const velocity: number[] = []
  const watts: number[] = []
  let clock = 0

  for (const segment of RUN_SEGMENTS) {
    for (let second = 0; second < segment.seconds; second++) {
      time.push(clock)
      velocity.push(Number((THRESHOLD_PACE * segment.paceFactor).toFixed(3)))
      watts.push(Math.round(FTP * segment.paceFactor))
      clock += 1
    }
  }

  return { time, velocity, watts }
}

/**
 * Mount a workout on the mocked repositories and hand back the object the endpoint will
 * see, so a test can run the facts layer over exactly the same input.
 */
function mountWorkout(options: {
  type: string
  streams: Record<string, number[] | null>
  laps?: any[]
  structuredWorkout?: any
  thresholdPace?: number
}) {
  const workout = {
    id: 'workout-1',
    userId: 'user-1',
    type: options.type,
    ftp: null,
    maxHr: null,
    decoupling: null,
    rawJson: { icu_intervals: options.laps ?? [] },
    plannedWorkout: options.structuredWorkout
      ? { id: 'plan-1', title: 'session', structuredWorkout: options.structuredWorkout }
      : null
  }
  const withStreams = {
    ...workout,
    streams: {
      time: null,
      watts: null,
      heartrate: null,
      cadence: null,
      velocity: null,
      ...options.streams
    }
  }

  vi.mocked(prisma.workout.findFirst).mockResolvedValue(workout as any)
  vi.mocked(attachStreamToWorkout).mockResolvedValue(withStreams as any)
  vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
    ftp: FTP,
    lthr: LTHR,
    maxHr: MAX_HR,
    thresholdPace: options.thresholdPace ?? 0,
    hrZones: [],
    powerZones: [],
    paceZones: []
  } as any)

  return withStreams
}

/** The reference values the endpoint derives from the same mocked sport settings. */
const analysisRefs = (thresholdPace = 0) => ({
  ftp: FTP,
  lthr: LTHR,
  maxHr: MAX_HR,
  thresholdPace,
  hrZones: [],
  powerZones: [],
  paceZones: []
})

describe('GET /api/workouts/[id]/intervals shared detection candidate (CW-434)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'a@b.c' } } as any)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      ftp: FTP,
      maxHr: MAX_HR,
      lthr: LTHR,
      email: 'a@b.c'
    } as any)
  })

  it('segments a power-metered run on pace, and renders exactly what the arbitration scores', async () => {
    // Both streams are present and full length. The endpoint used to take watts first
    // regardless of sport, so the chart showed a power-detected segmentation while the
    // facts layer arbitrated over a pace-detected one — a verdict about intervals the
    // athlete never saw.
    const { time, velocity, watts } = buildRunStreams()
    const withStreams = mountWorkout({
      type: 'Run',
      streams: { time, velocity, watts },
      thresholdPace: THRESHOLD_PACE
    })

    const result = await (await getHandler())(event({ debug: 'true' }) as any)

    expect(result.detectionMetric).toBe('pace')
    expect(result.audit.autoDetectionMetric).toBe('pace')
    expect(result.intervals.filter((i: any) => i.type === 'WORK')).toHaveLength(3)

    // The facts layer, given the same workout, builds the same candidate — same count,
    // same sample boundaries. This is the property CW-430's arbitration depends on.
    const factsCandidate = getActualIntervalsForAnalysis(
      withStreams,
      null,
      analysisRefs(THRESHOLD_PACE)
    )
    expect(factsCandidate).toHaveLength(result.intervals.length)
    expect(factsCandidate.map((i) => [i.startIndex, i.endIndex])).toEqual(
      result.intervals.map((i: any) => [i.start_index, i.end_index])
    )
  })

  it.each(['VirtualRun', 'TrailRun', 'Treadmill'])(
    'resolves %s through getWorkoutFamily and segments it as a run',
    async (type) => {
      const { time, velocity, watts } = buildRunStreams()
      mountWorkout({
        type,
        streams: { time, velocity, watts },
        thresholdPace: THRESHOLD_PACE
      })

      const result = await (await getHandler())(event() as any)

      // The endpoint's old `type === 'Run' || type === 'Swim'` string match reached none
      // of these, so they fell through to watts.
      expect(result.detectionMetric).toBe('pace')
    }
  )

  it('skips a ragged stream instead of attempting it, and falls through to the next metric', async () => {
    // A watts stream five samples shorter than the time stream. `detectIntervals` rejects
    // mismatched arrays outright, so the endpoint used to report `detectionMetric: 'power'`
    // with zero intervals while the facts layer skipped watts and detected on HR.
    const time: number[] = []
    const hr: number[] = []
    for (const segment of RUN_SEGMENTS) {
      for (let second = 0; second < segment.seconds; second++) {
        time.push(time.length)
        hr.push(segment.type === 'WORK' ? 168 : 118)
      }
    }
    const watts = new Array(time.length - 5).fill(200)

    const withStreams = mountWorkout({ type: 'Ride', streams: { time, watts, heartrate: hr } })

    const result = await (await getHandler())(event({ debug: 'true' }) as any)

    expect(result.detectionMetric).toBe('heartrate')
    expect(result.intervals.length).toBeGreaterThan(0)

    const factsCandidate = getActualIntervalsForAnalysis(withStreams, null, analysisRefs())
    expect(factsCandidate).toHaveLength(result.intervals.length)
    expect(factsCandidate.map((i) => [i.startIndex, i.endIndex])).toEqual(
      result.intervals.map((i: any) => [i.start_index, i.end_index])
    )
  })

  it('runs the plan through toDetectionPlannedSteps: duration_s aliases and the RECOVERY -> WORK promotion (CW-435)', async () => {
    // The endpoint used to hand `structuredWorkout.steps` to the engine raw. The engine
    // reads only `durationSeconds`/`duration`, so a plan written with `duration_s` gave it
    // no usable durations at all and plan-guided segmentation never fired; and a RECOVERY
    // step prescribed at 240 W against a 250 W FTP stayed labelled RECOVERY instead of
    // being promoted to WORK (CW-402).
    const PLAN = [
      { type: 'WARMUP', duration_s: 600, power: { value: 140, units: 'w' } },
      { type: 'WORK', duration_s: 300, power: { value: 265, units: 'w' } },
      { type: 'RECOVERY', duration_s: 300, power: { value: 240, units: 'w' } },
      { type: 'WORK', duration_s: 300, power: { value: 265, units: 'w' } },
      { type: 'COOLDOWN', duration_s: 300, power: { value: 120, units: 'w' } }
    ]

    const time: number[] = []
    const watts: number[] = []
    for (const step of PLAN) {
      for (let second = 0; second < step.duration_s; second++) {
        time.push(time.length)
        watts.push(step.power.value)
      }
    }

    mountWorkout({
      type: 'Ride',
      streams: { time, watts },
      structuredWorkout: { steps: PLAN }
    })

    const result = await (await getHandler())(event({ debug: 'true' }) as any)

    // Plan-guided segmentation fired: one segment per planned step.
    expect(result.intervals).toHaveLength(PLAN.length)
    // ...and the 240 W "recovery" is segmented as work, on the chart as well as in the facts.
    expect(result.intervals[2].type).toBe('WORK')
  })
})
