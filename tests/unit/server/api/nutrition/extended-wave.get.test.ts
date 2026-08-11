import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { requireAuth } from '../../../../../server/utils/auth-guard'
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

vi.mock('../../../../../server/utils/auth-guard', () => ({ requireAuth: vi.fn() }))
vi.mock('../../../../../server/utils/services/metabolicService', () => ({
  metabolicService: { generateExtendedWave: vi.fn() }
}))
vi.mock('../../../../../server/utils/nutrition/intake-confidence', () => ({
  summariseIntakeConfidence: vi.fn(() => null)
}))

async function get(params: Record<string, unknown>) {
  query = params
  const handler = (await import('../../../../../server/api/nutrition/extended-wave.get')).default
  return handler({} as any)
}

function daysAheadArg() {
  return (vi.mocked(metabolicService.generateExtendedWave).mock.calls[0] as any)?.[1]
}

// CW-73: daysAhead fed getWaveRange unvalidated, so `daysAhead=3650` simulated a decade of wave
// (~97 timeline points per day) in one request.
describe('GET /api/nutrition/extended-wave daysAhead bounds (CW-73)', () => {
  afterAll(() => {
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(metabolicService.generateExtendedWave).mockResolvedValue({
      points: [],
      journeyEvents: []
    } as any)
  })

  it('defaults to 3 days when the parameter is absent', async () => {
    const result: any = await get({})

    expect(result.success).toBe(true)
    expect(daysAheadArg()).toBe(3)
  })

  it('passes an in-range value through untouched', async () => {
    await get({ daysAhead: '7' })

    expect(daysAheadArg()).toBe(7)
  })

  it('clamps an absurd range instead of simulating a decade of wave', async () => {
    await get({ daysAhead: '3650' })

    expect(daysAheadArg()).toBe(14)
  })

  it('clamps zero and negative values up to the minimum', async () => {
    await get({ daysAhead: '0' })
    expect(daysAheadArg()).toBe(1)

    vi.mocked(metabolicService.generateExtendedWave).mockClear()
    await get({ daysAhead: '-5' })
    expect(daysAheadArg()).toBe(1)
  })

  it('rejects non-numeric input rather than silently defaulting', async () => {
    await expect(get({ daysAhead: 'abc' })).rejects.toMatchObject({ statusCode: 400 })
    expect(metabolicService.generateExtendedWave).not.toHaveBeenCalled()
  })

  it('rejects a fractional value', async () => {
    await expect(get({ daysAhead: '2.5' })).rejects.toMatchObject({ statusCode: 400 })
    expect(metabolicService.generateExtendedWave).not.toHaveBeenCalled()
  })

  it('rejects a repeated query parameter', async () => {
    await expect(get({ daysAhead: ['1', '9999'] })).rejects.toMatchObject({ statusCode: 400 })
    expect(metabolicService.generateExtendedWave).not.toHaveBeenCalled()
  })

  it('surfaces a service 400 instead of masking it as a 500', async () => {
    const serviceError = Object.assign(new Error('range too wide'), { statusCode: 400 })
    vi.mocked(metabolicService.generateExtendedWave).mockRejectedValue(serviceError)

    await expect(get({ daysAhead: '3' })).rejects.toMatchObject({ statusCode: 400 })
  })
})
