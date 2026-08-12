import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { getServerSession } from '../../../../../server/utils/session'
import { isNutritionTrackingEnabled } from '../../../../../server/utils/nutrition/feature'
import { metabolicService } from '../../../../../server/utils/services/metabolicService'

vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('defineRouteMeta', () => {})
vi.stubGlobal('createError', (error: any) => {
  const err = new Error(error.message) as any
  err.statusCode = error.statusCode
  return err
})

let query: any = {}
vi.stubGlobal('getQuery', () => query)

vi.mock('../../../../../server/utils/session', () => ({ getServerSession: vi.fn() }))
vi.mock('../../../../../server/utils/nutrition/feature', () => ({
  isNutritionTrackingEnabled: vi.fn()
}))
vi.mock('../../../../../server/utils/services/metabolicService', () => ({
  metabolicService: { getWaveRange: vi.fn() }
}))
vi.mock('../../../../../server/utils/nutrition/intake-confidence', () => ({
  summariseIntakeConfidence: vi.fn(() => null)
}))

async function get(params: Record<string, unknown>) {
  query = params
  const handler = (await import('../../../../../server/api/nutrition/metabolic-wave.get')).default
  return handler({} as any)
}

// CW-73: startDate/endDate went straight from the query string into getWaveRange, so
// `endDate=2100-01-01` ran decades of day simulations in a single request.
describe('GET /api/nutrition/metabolic-wave range bounds (CW-73)', () => {
  afterAll(() => {
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'user-1' } } as any)
    vi.mocked(isNutritionTrackingEnabled).mockResolvedValue(true)
    vi.mocked(metabolicService.getWaveRange).mockResolvedValue({
      points: [],
      journeyEvents: []
    } as any)
  })

  it('accepts a normal range', async () => {
    const result: any = await get({ startDate: '2026-02-01', endDate: '2026-02-10' })

    expect(result.success).toBe(true)
    const [, start, end] = vi.mocked(metabolicService.getWaveRange).mock.calls[0] as any
    expect(start.toISOString()).toBe('2026-02-01T00:00:00.000Z')
    expect(end.toISOString()).toBe('2026-02-10T00:00:00.000Z')
  })

  it('accepts the widest padded month grid the activities calendar can request (42 days)', async () => {
    // The calendar pads a month out to whole weeks, so the real-world worst case is 6 weeks.
    await get({ startDate: '2026-02-23', endDate: '2026-04-05' })

    expect(metabolicService.getWaveRange).toHaveBeenCalled()
  })

  it('still requires both dates', async () => {
    await expect(get({ startDate: '2026-02-01' })).rejects.toMatchObject({ statusCode: 400 })
    await expect(get({ endDate: '2026-02-01' })).rejects.toMatchObject({ statusCode: 400 })
    expect(metabolicService.getWaveRange).not.toHaveBeenCalled()
  })

  it('rejects a malformed date instead of passing an Invalid Date to the simulation', async () => {
    await expect(get({ startDate: '2026-02-01', endDate: 'not-a-date' })).rejects.toMatchObject({
      statusCode: 400
    })
    await expect(get({ startDate: 'nonsense', endDate: '2026-02-01' })).rejects.toMatchObject({
      statusCode: 400
    })
    expect(metabolicService.getWaveRange).not.toHaveBeenCalled()
  })

  it('rejects an inverted range', async () => {
    await expect(get({ startDate: '2026-02-10', endDate: '2026-02-01' })).rejects.toMatchObject({
      statusCode: 400
    })
    expect(metabolicService.getWaveRange).not.toHaveBeenCalled()
  })

  it('rejects a range wider than the cap rather than simulating it', async () => {
    await expect(get({ startDate: '2026-01-01', endDate: '2027-01-01' })).rejects.toMatchObject({
      statusCode: 400
    })
    await expect(get({ startDate: '2026-01-01', endDate: '2100-01-01' })).rejects.toMatchObject({
      statusCode: 400
    })
    expect(metabolicService.getWaveRange).not.toHaveBeenCalled()
  })

  it('accepts exactly the maximum span and rejects one day more', async () => {
    // 62-day inclusive span.
    await get({ startDate: '2026-01-01', endDate: '2026-03-03' })
    expect(metabolicService.getWaveRange).toHaveBeenCalledTimes(1)

    await expect(get({ startDate: '2026-01-01', endDate: '2026-03-04' })).rejects.toMatchObject({
      statusCode: 400
    })
    expect(metabolicService.getWaveRange).toHaveBeenCalledTimes(1)
  })

  it('rejects unauthenticated requests before any parsing', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null as any)

    await expect(get({ startDate: '2026-01-01', endDate: '2026-01-02' })).rejects.toMatchObject({
      statusCode: 401
    })
  })
})
