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
  shareTokenFindUnique: vi.fn(),
  workoutFindUnique: vi.fn(),
  getForActivityType: vi.fn(),
  // Spied so the exact work bar and zone refs handed to the engine can be asserted;
  // `resolveHrWorkThreshold` stays real so the shared helper is what is under test.
  detectIntervals: vi.fn(() => [] as any[])
}))

const { shareTokenFindUnique, workoutFindUnique, getForActivityType, detectIntervals } = mocks

vi.mock('../../../../../server/utils/db', () => ({
  prisma: {
    shareToken: { findUnique: mocks.shareTokenFindUnique },
    workout: { findUnique: mocks.workoutFindUnique }
  }
}))

vi.mock('../../../../../server/utils/repositories/workoutStreamRepository', () => ({
  attachStreamToWorkout: vi.fn(async (workout: any) => ({
    ...workout,
    streams: workout.__streams
  }))
}))

vi.mock('../../../../../server/utils/repositories/sportSettingsRepository', () => ({
  sportSettingsRepository: { getForActivityType: mocks.getForActivityType }
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
    userId: 'owner-1',
    type: 'Run',
    maxHr: 178,
    ftp: null,
    user: { id: 'owner-1', ftp: null, ...user },
    __streams: { time: TIME, heartrate: HEARTRATE }
  }
}

function hrCall() {
  return detectIntervals.mock.calls.find((call: any[]) => call[2] === 'heartrate')
}

describe('GET /api/share/workouts/[token]/intervals heart-rate work bar (CW-418)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getForActivityType.mockResolvedValue(null)
    shareTokenFindUnique.mockResolvedValue({
      resourceType: 'WORKOUT',
      resourceId: 'workout-1',
      expiresAt: null
    })
  })

  it("derives the work bar from the OWNER's LTHR when one is on file", async () => {
    workoutFindUnique.mockResolvedValue(makeWorkout({ maxHr: 190, lthr: 165 }))

    const mod = await import('../../../../../server/api/share/workouts/[token]/intervals.get')
    await mod.default({ context: { params: { token: 'share-token' } } })

    expect(hrCall()![3]).toBe(165 * HR_WORK_BAR_FRACTION_OF_LTHR)
  })

  it("resolves the sport settings of the workout's OWNER, not of the link viewer", async () => {
    workoutFindUnique.mockResolvedValue(makeWorkout({ maxHr: 190, lthr: 165 }))
    getForActivityType.mockResolvedValue({ lthr: 150, maxHr: 185 })

    const mod = await import('../../../../../server/api/share/workouts/[token]/intervals.get')
    await mod.default({ context: { params: { token: 'share-token' } } })

    // The endpoint has no session user at all, so the only correct source is the owner id
    // carried by the workout record.
    expect(getForActivityType).toHaveBeenCalledWith('owner-1', 'Run')
    expect(hrCall()![3]).toBe(150 * HR_WORK_BAR_FRACTION_OF_LTHR)
  })

  it('falls back to 0.7 * max HR when the owner has no LTHR on file', async () => {
    workoutFindUnique.mockResolvedValue(makeWorkout({ maxHr: 190, lthr: null }))

    const mod = await import('../../../../../server/api/share/workouts/[token]/intervals.get')
    await mod.default({ context: { params: { token: 'share-token' } } })

    expect(hrCall()![3]).toBe(190 * HR_WORK_BAR_FRACTION_OF_MAX_HR)
  })

  it('passes the owner refs as hrRefs so HR intervals can carry an intensity_zone', async () => {
    workoutFindUnique.mockResolvedValue(makeWorkout({ maxHr: 190, lthr: 165 }))

    const mod = await import('../../../../../server/api/share/workouts/[token]/intervals.get')
    await mod.default({ context: { params: { token: 'share-token' } } })

    expect(hrCall()![7]).toEqual({ lthr: 165, maxHr: 190 })
  })

  it('keeps the owner HR profile out of the public response', async () => {
    workoutFindUnique.mockResolvedValue(makeWorkout({ maxHr: 190, lthr: 165 }))
    getForActivityType.mockResolvedValue({ lthr: 150, maxHr: 185, hrZones: [{ min: 100 }] })

    const mod = await import('../../../../../server/api/share/workouts/[token]/intervals.get')
    const result: any = await mod.default({ context: { params: { token: 'share-token' } } })

    for (const denied of ['user', 'userId', 'lthr', 'maxHr', 'hrZones', 'sportSettings']) {
      expect(result).not.toHaveProperty(denied)
    }
    // The whole serialized payload must not carry the athlete's HR references either.
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('lthr')
    expect(serialized).not.toContain('owner-1')
  })
})
