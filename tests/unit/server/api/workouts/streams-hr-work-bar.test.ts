import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  HR_WORK_BAR_FRACTION_OF_LTHR,
  HR_WORK_BAR_FRACTION_OF_MAX_HR
} from '../../../../../server/utils/interval-detection'

vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('defineRouteMeta', () => undefined)
vi.stubGlobal('createError', (err: any) => {
  const error = new Error(err.message || err.statusMessage)
  ;(error as any).statusCode = err.statusCode
  return error
})
vi.stubGlobal('getRouterParam', (event: any, key: string) => event.context?.params?.[key])

const mocks = vi.hoisted(() => ({
  workoutFindFirst: vi.fn(),
  findByWorkoutId: vi.fn(),
  updateMetadata: vi.fn(async () => ({})),
  getForActivityType: vi.fn(),
  // `detectIntervals` is spied so the exact work bar and zone refs the endpoint hands it can
  // be asserted; `resolveHrWorkThreshold` stays real so the assertion exercises the shared
  // helper rather than a re-implementation of it.
  detectIntervals: vi.fn(() => [] as any[])
}))

const { workoutFindFirst, findByWorkoutId, getForActivityType, detectIntervals } = mocks

vi.stubGlobal('prisma', {
  workout: { findFirst: mocks.workoutFindFirst }
})

vi.mock('../../../../../server/utils/repositories/workoutStreamRepository', () => ({
  workoutStreamRepository: {
    findByWorkoutId: mocks.findByWorkoutId,
    updateMetadata: mocks.updateMetadata
  }
}))

vi.mock('../../../../../server/utils/repositories/sportSettingsRepository', () => ({
  sportSettingsRepository: { getForActivityType: mocks.getForActivityType }
}))

vi.mock('../../../../../server/utils/auth-guard', () => ({
  requireAuth: vi.fn(async () => ({ id: 'user-1' }))
}))

vi.mock('../../../../../server/utils/interval-detection', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../../server/utils/interval-detection')>()
  return { ...actual, detectIntervals: mocks.detectIntervals }
})

const TIME = Array.from({ length: 60 }, (_, i) => i)
const HEARTRATE = TIME.map((_, i) => (i < 30 ? 120 : 165))

function makeWorkout(user: Record<string, unknown>) {
  return {
    id: 'workout-1',
    userId: 'user-1',
    type: 'Run',
    maxHr: 178,
    user: { ftp: null, distanceUnits: 'Kilometers', ...user }
  }
}

function makeStream() {
  return {
    workoutId: 'workout-1',
    time: TIME,
    heartrate: HEARTRATE,
    lapSplits: [{ lap: 1, distance: 1000, time: 300, paceSeconds: 300 }]
  }
}

// The LAST heart-rate detection is the endpoint's own. Since CW-436 the endpoint also
// builds the v2 analysis facts (to gate the pacing verdict on session shape), and that
// builder runs its own interval detection over the same streams -- so the first
// heart-rate call is the builder's, not the one under test here.
function hrCall() {
  return detectIntervals.mock.calls.filter((call: any[]) => call[2] === 'heartrate').at(-1)
}

describe('GET /api/workouts/[id]/streams heart-rate work bar (CW-418)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findByWorkoutId.mockResolvedValue(makeStream())
    getForActivityType.mockResolvedValue(null)
  })

  it('derives the work bar from the profile LTHR when the athlete has one on file', async () => {
    workoutFindFirst.mockResolvedValue(makeWorkout({ maxHr: 190, lthr: 165 }))

    const mod = await import('../../../../../server/api/workouts/[id]/streams.get')
    await mod.default({ context: { params: { id: 'workout-1' } } })

    const call = hrCall()
    expect(call).toBeDefined()
    expect(call![3]).toBe(165 * HR_WORK_BAR_FRACTION_OF_LTHR)
  })

  it('prefers the sport settings LTHR over the user record', async () => {
    workoutFindFirst.mockResolvedValue(makeWorkout({ maxHr: 190, lthr: 165 }))
    getForActivityType.mockResolvedValue({ lthr: 150, maxHr: 185 })

    const mod = await import('../../../../../server/api/workouts/[id]/streams.get')
    await mod.default({ context: { params: { id: 'workout-1' } } })

    expect(hrCall()![3]).toBe(150 * HR_WORK_BAR_FRACTION_OF_LTHR)
  })

  it('falls back to 0.7 * max HR unchanged when no LTHR is on file', async () => {
    workoutFindFirst.mockResolvedValue(makeWorkout({ maxHr: 190, lthr: null }))

    const mod = await import('../../../../../server/api/workouts/[id]/streams.get')
    await mod.default({ context: { params: { id: 'workout-1' } } })

    expect(hrCall()![3]).toBe(190 * HR_WORK_BAR_FRACTION_OF_MAX_HR)
  })

  it('passes the profile refs as hrRefs so HR intervals can carry an intensity_zone', async () => {
    workoutFindFirst.mockResolvedValue(makeWorkout({ maxHr: 190, lthr: 165 }))

    const mod = await import('../../../../../server/api/workouts/[id]/streams.get')
    await mod.default({ context: { params: { id: 'workout-1' } } })

    expect(hrCall()![7]).toEqual({ lthr: 165, maxHr: 190 })
  })

  it('uses the same bar on the no-lapSplits downsampling branch', async () => {
    // Second detection call site in this endpoint: reached when the stream carries no
    // lapSplits and is long enough to be downsampled. It used to duplicate the inline
    // `maxHr * 0.7` too.
    const longTime = Array.from({ length: 2001 }, (_, i) => i)
    findByWorkoutId.mockResolvedValue({
      workoutId: 'workout-1',
      time: longTime,
      heartrate: longTime.map((_, i) => (i % 200 < 100 ? 120 : 165))
    })
    workoutFindFirst.mockResolvedValue(makeWorkout({ maxHr: 190, lthr: 165 }))

    const mod = await import('../../../../../server/api/workouts/[id]/streams.get')
    await mod.default({ context: { params: { id: 'workout-1' } } })

    const call = hrCall()
    expect(call).toBeDefined()
    expect(call![3]).toBe(165 * HR_WORK_BAR_FRACTION_OF_LTHR)
    expect(call![7]).toEqual({ lthr: 165, maxHr: 190 })
  })
})
