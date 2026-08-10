import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getServerSession } from '../../../../../server/utils/session'
import { prisma } from '../../../../../server/utils/db'
import { attachStreamToWorkout } from '../../../../../server/utils/repositories/workoutStreamRepository'
import { sportSettingsRepository } from '../../../../../server/utils/repositories/sportSettingsRepository'

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
