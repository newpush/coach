import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getServerSession } from '../../../../../server/utils/session'
import { workoutRepository } from '../../../../../server/utils/repositories/workoutRepository'
import { workoutStreamRepository } from '../../../../../server/utils/repositories/workoutStreamRepository'

vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('defineRouteMeta', () => {})

vi.mock('../../../../../server/utils/session', () => ({
  getServerSession: vi.fn()
}))

vi.mock('../../../../../server/utils/db', () => ({
  prisma: {}
}))

vi.mock('../../../../../server/utils/repositories/workoutRepository', () => ({
  workoutRepository: { getForUser: vi.fn() }
}))

vi.mock('../../../../../server/utils/repositories/workoutStreamRepository', () => ({
  workoutStreamRepository: { findWattsByWorkoutIds: vi.fn() }
}))

vi.mock('../../../../../server/utils/date', async () => {
  const actual = await vi.importActual<typeof import('../../../../../server/utils/date')>(
    '../../../../../server/utils/date'
  )
  return { ...actual, getUserTimezone: vi.fn().mockResolvedValue('UTC') }
})

const getHandler = async () =>
  (await import('../../../../../server/api/workouts/power-curve.get')).default

/** A 10-minute ride at a flat `watts`, long enough to populate every duration bucket up to 10m. */
const steadyRide = (watts: number, seconds = 700) => Array.from({ length: seconds }, () => watts)

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000)

describe('GET /api/workouts/power-curve', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'user-1' } } as any)
    vi.mocked(workoutRepository.getForUser).mockResolvedValue([] as any)
    vi.mocked(workoutStreamRepository.findWattsByWorkoutIds).mockResolvedValue(new Map())
  })

  it('rejects unauthenticated requests', async () => {
    const handler = await getHandler()
    vi.mocked(getServerSession).mockResolvedValue(null as any)

    await expect(handler({ query: {} } as any)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('builds the curve from streams resolved through the repository (V2-aware read path)', async () => {
    // Regression guard for CW-377: the handler used to read the legacy
    // `streams` relation via a Prisma include, which returns nothing for
    // athletes whose power data only exists in WorkoutStreamV2.
    const handler = await getHandler()
    const workouts = [{ id: 'workout-1', date: daysAgo(10) }]
    vi.mocked(workoutRepository.getForUser).mockResolvedValue(workouts as any)
    vi.mocked(workoutStreamRepository.findWattsByWorkoutIds).mockResolvedValue(
      new Map([['workout-1', steadyRide(250)]])
    )

    const result = await handler({ query: { days: 90 } } as any)

    expect(result.current.length).toBeGreaterThan(0)
    expect(result.allTime.length).toBeGreaterThan(0)
    expect(result.current.find((p: any) => p.duration === 300)?.watts).toBe(250)
    expect(result.current.find((p: any) => p.duration === 600)?.watts).toBe(250)
    // No effort is long enough to fill the 20m+ buckets.
    expect(result.current.find((p: any) => p.duration === 1200)).toBeUndefined()
  })

  it('never asks the repository for the raw `streams` relation', async () => {
    const handler = await getHandler()

    await handler({ query: { days: 90 } } as any)

    for (const call of vi.mocked(workoutRepository.getForUser).mock.calls) {
      expect((call[1] as any)?.include).toBeUndefined()
      expect((call[1] as any)?.select).toEqual({ id: true, date: true })
    }
  })

  it('resolves streams once for the union of the current and all-time workout sets', async () => {
    const handler = await getHandler()
    const recent = { id: 'workout-recent', date: daysAgo(10) }
    const old = { id: 'workout-old', date: daysAgo(400) }

    vi.mocked(workoutRepository.getForUser)
      .mockResolvedValueOnce([recent] as any) // current period (90d)
      .mockResolvedValueOnce([recent, old] as any) // all-time (730d)

    await handler({ query: { days: 90 } } as any)

    expect(workoutStreamRepository.findWattsByWorkoutIds).toHaveBeenCalledTimes(1)
    expect(workoutStreamRepository.findWattsByWorkoutIds).toHaveBeenCalledWith([
      'workout-recent',
      'workout-old'
    ])
  })

  it('returns empty curves when the athlete has no power data at all', async () => {
    const handler = await getHandler()
    vi.mocked(workoutRepository.getForUser).mockResolvedValue([
      { id: 'workout-1', date: daysAgo(5) }
    ] as any)

    const result = await handler({ query: { days: 90 } } as any)

    expect(result.current).toEqual([])
    expect(result.allTime).toEqual([])
  })

  it('reports an all-time best above the current period without inflating the current curve', async () => {
    const handler = await getHandler()
    const recent = { id: 'workout-recent', date: daysAgo(10) }
    const old = { id: 'workout-old', date: daysAgo(400) }

    vi.mocked(workoutRepository.getForUser)
      .mockResolvedValueOnce([recent] as any)
      .mockResolvedValueOnce([recent, old] as any)
    vi.mocked(workoutStreamRepository.findWattsByWorkoutIds).mockResolvedValue(
      new Map([
        ['workout-recent', steadyRide(250)],
        ['workout-old', steadyRide(320)]
      ])
    )

    const result = await handler({ query: { days: 90 } } as any)

    expect(result.current.find((p: any) => p.duration === 300)?.watts).toBe(250)
    expect(result.allTime.find((p: any) => p.duration === 300)?.watts).toBe(320)
  })

  it('marks a duration stale when nothing in the last two years came near the all-time best', async () => {
    const handler = await getHandler()
    const old = { id: 'workout-old', date: daysAgo(400) }

    vi.mocked(workoutRepository.getForUser)
      .mockResolvedValueOnce([] as any) // nothing in the current 90-day window
      .mockResolvedValueOnce([old] as any)
    vi.mocked(workoutStreamRepository.findWattsByWorkoutIds).mockResolvedValue(
      new Map([['workout-old', steadyRide(320)]])
    )

    const result = await handler({ query: { days: 90 } } as any)

    expect(result.current).toEqual([])
    const allTime300 = result.allTime.find((p: any) => p.duration === 300)
    expect(allTime300?.watts).toBe(320)
    expect(allTime300?.freshnessState).toBe('stale')
    expect(allTime300?.daysSince).toBeGreaterThanOrEqual(399)
  })
})
