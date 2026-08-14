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

// File-level, not per-describe: the stubbed globals are shared by every block below, so tearing
// them down when the first describe finishes would break the ones after it.
afterAll(() => {
  vi.unstubAllGlobals()
})

// CW-73: startDate/endDate went straight from the query string into getWaveRange, so
// `endDate=2100-01-01` ran decades of day simulations in a single request.
describe('GET /api/nutrition/metabolic-wave range bounds (CW-73)', () => {
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

// CW-506: parseDateOnlyUtc did `String(value).slice(0, 10)`, so a repeated query parameter was
// joined and silently truncated to its first value, and trailing junk was quietly dropped —
// while the sibling extended-wave endpoint 400s on the same class of input.
describe('GET /api/nutrition/metabolic-wave date parameter strictness (CW-506)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'user-1' } } as any)
    vi.mocked(isNutritionTrackingEnabled).mockResolvedValue(true)
    vi.mocked(metabolicService.getWaveRange).mockResolvedValue({
      points: [],
      journeyEvents: []
    } as any)
  })

  it('rejects a repeated startDate instead of silently using the first value', async () => {
    await expect(
      get({ startDate: ['2026-02-01', '2026-02-05'], endDate: '2026-02-10' })
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(metabolicService.getWaveRange).not.toHaveBeenCalled()
  })

  it('rejects a repeated endDate instead of silently using the first value', async () => {
    await expect(
      get({ startDate: '2026-02-01', endDate: ['2026-02-10', '2100-01-01'] })
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(metabolicService.getWaveRange).not.toHaveBeenCalled()
  })

  it('rejects trailing junk rather than slicing it off', async () => {
    await expect(get({ startDate: '2026-02-01junk', endDate: '2026-02-10' })).rejects.toMatchObject(
      {
        statusCode: 400
      }
    )
    await expect(get({ startDate: '2026-02-01', endDate: '2026-02-10junk' })).rejects.toMatchObject(
      {
        statusCode: 400
      }
    )
    expect(metabolicService.getWaveRange).not.toHaveBeenCalled()
  })

  it('rejects a full ISO timestamp, which the old slice quietly accepted', async () => {
    await expect(
      get({ startDate: '2026-02-01T12:34:56Z', endDate: '2026-02-10' })
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(metabolicService.getWaveRange).not.toHaveBeenCalled()
  })

  it('rejects a non-string scalar such as a bare number', async () => {
    await expect(get({ startDate: 20260201, endDate: '2026-02-10' })).rejects.toMatchObject({
      statusCode: 400
    })
    expect(metabolicService.getWaveRange).not.toHaveBeenCalled()
  })

  it('rejects an out-of-range month, which parses to Invalid Date', async () => {
    await expect(get({ startDate: '2026-13-01', endDate: '2026-13-02' })).rejects.toMatchObject({
      statusCode: 400
    })
    await expect(get({ startDate: '2026-01-00', endDate: '2026-01-10' })).rejects.toMatchObject({
      statusCode: 400
    })
    await expect(get({ startDate: '2026-01-32', endDate: '2026-02-10' })).rejects.toMatchObject({
      statusCode: 400
    })
    expect(metabolicService.getWaveRange).not.toHaveBeenCalled()
  })

  // V8 falls back to its lenient legacy parser for out-of-range *days*, so these do NOT produce an
  // Invalid Date — `2026-02-30T00:00:00Z` silently rolls over to 2026-03-02. Without the
  // round-trip check the handler would answer for a different range than the caller asked for,
  // which is the same silent coercion removing `slice(0, 10)` was meant to eliminate.
  //
  // The end dates here are deliberately AFTER the rolled-over start date: an earlier version of
  // this test used `2026-02-30..2026-03-01`, where the rollover to 2026-03-02 inverts the range,
  // so the 400 came from the inverted-range guard and the assertion proved nothing about calendar
  // validity. Each case below fails without the round-trip check in parseDateOnlyUtc.
  it('rejects a day that overflows its month rather than silently rolling it over', async () => {
    await expect(get({ startDate: '2026-02-30', endDate: '2026-03-10' })).rejects.toMatchObject({
      statusCode: 400
    })
    await expect(get({ startDate: '2026-04-31', endDate: '2026-05-10' })).rejects.toMatchObject({
      statusCode: 400
    })
    await expect(get({ startDate: '2025-02-29', endDate: '2025-03-10' })).rejects.toMatchObject({
      statusCode: 400
    })
    await expect(get({ startDate: '2026-11-31', endDate: '2026-12-10' })).rejects.toMatchObject({
      statusCode: 400
    })
    expect(metabolicService.getWaveRange).not.toHaveBeenCalled()
  })

  it('rejects an overflowing endDate too, not just startDate', async () => {
    await expect(get({ startDate: '2026-02-01', endDate: '2026-02-30' })).rejects.toMatchObject({
      statusCode: 400
    })
    expect(metabolicService.getWaveRange).not.toHaveBeenCalled()
  })

  it('still accepts a real leap day', async () => {
    await get({ startDate: '2024-02-29', endDate: '2024-03-10' })

    const [, start] = vi.mocked(metabolicService.getWaveRange).mock.calls[0] as any
    expect(start.toISOString()).toBe('2024-02-29T00:00:00.000Z')
  })

  it('rejects an implausible year even when the span itself is within the cap', async () => {
    // A legal 32-day span, but 32 days of simulation for a nonsense date.
    await expect(get({ startDate: '9999-01-01', endDate: '9999-02-01' })).rejects.toMatchObject({
      statusCode: 400
    })
    await expect(get({ startDate: '0001-01-01', endDate: '0001-02-01' })).rejects.toMatchObject({
      statusCode: 400
    })
    expect(metabolicService.getWaveRange).not.toHaveBeenCalled()
  })

  it('reports the offending field and value, like extended-wave does', async () => {
    await expect(get({ startDate: '2026-02-01junk', endDate: '2026-02-10' })).rejects.toThrow(
      /Invalid startDate: 2026-02-01junk/
    )
    await expect(get({ startDate: '2026-02-01', endDate: 'not-a-date' })).rejects.toThrow(
      /Invalid endDate: not-a-date/
    )
  })

  it('still accepts a well-formed range', async () => {
    const result: any = await get({ startDate: '2026-02-01', endDate: '2026-02-10' })

    expect(result.success).toBe(true)
    const [, start, end] = vi.mocked(metabolicService.getWaveRange).mock.calls[0] as any
    expect(start.toISOString()).toBe('2026-02-01T00:00:00.000Z')
    expect(end.toISOString()).toBe('2026-02-10T00:00:00.000Z')
  })
})
