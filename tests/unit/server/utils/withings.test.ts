import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildWithingsRateLimitDeferral,
  fetchWithingsMeasures,
  fetchWithingsSleep,
  isWithingsRateLimitError,
  parseWithingsRetryAfterMs,
  refreshWithingsToken,
  resolveWithingsDeferralDelayMs,
  throwIfWithingsRateLimited,
  WITHINGS_MAX_RATE_LIMIT_DEFERRALS,
  WITHINGS_RATE_LIMIT_BASE_BACKOFF_MS,
  WITHINGS_RATE_LIMIT_MAX_BACKOFF_MS,
  WITHINGS_RATE_LIMIT_MIN_PROVIDER_BACKOFF_MS,
  WithingsRateLimitError
} from '../../../../server/utils/withings'
import {
  IntegrationAuthError,
  isIntegrationProviderError
} from '../../../../server/utils/integration-errors'

// Both are read at call time, not import time, so setting them here is safe.
// The in-process pacer is real code that really sleeps; switch it off so the suite is not
// paying 250ms per mocked request. Its behaviour is covered separately below.
process.env.WITHINGS_MIN_REQUEST_INTERVAL_MS = '0'
process.env.WITHINGS_CLIENT_ID = 'test-client-id'
process.env.WITHINGS_CLIENT_SECRET = 'test-client-secret'

const { prismaIntegrationUpdate } = vi.hoisted(() => ({
  prismaIntegrationUpdate: vi.fn()
}))

vi.mock('../../../../server/utils/db', () => ({
  prisma: {
    integration: {
      update: prismaIntegrationUpdate
    }
  }
}))

const integration = {
  id: 'integration-1',
  userId: 'user-1',
  provider: 'withings',
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  // Far future so ensureValidToken never triggers a refresh we did not ask for.
  expiresAt: new Date(Date.now() + 60 * 60 * 1000)
} as any

const START = new Date('2026-08-01T00:00:00.000Z')
const END = new Date('2026-08-08T00:00:00.000Z')

function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
  return {
    json: async () => body,
    headers: new Headers(headers)
  }
}

const fetchMock = vi.fn()

beforeEach(() => {
  prismaIntegrationUpdate.mockReset()
  prismaIntegrationUpdate.mockResolvedValue(integration)
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const deferralContext = {
  userId: 'user-1',
  startDate: START.toISOString(),
  endDate: END.toISOString()
}

// No jitter, so the assertions below are about the policy rather than the dice.
const noJitter = () => 0

describe('withings 601 rate limit — classification', () => {
  it('throws a WithingsRateLimitError from a measures fetch instead of a generic failure', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 601 }))

    const error = await fetchWithingsMeasures(integration, START, END).catch((e) => e)

    expect(isWithingsRateLimitError(error)).toBe(true)
    expect(error).toBeInstanceOf(WithingsRateLimitError)
    expect(error.statusCode).toBe(601)
    expect(error.integrationId).toBe('integration-1')
    expect(error.retryAfterSource).toBe('default')
    expect(error.retryAfterMs).toBe(WITHINGS_RATE_LIMIT_BASE_BACKOFF_MS)
  })

  it('stays an IntegrationProviderError so existing provider-error handling keeps working', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 601 }))

    const error = await fetchWithingsSleep(integration, START, END).catch((e) => e)

    expect(isIntegrationProviderError(error)).toBe(true)
    expect(isWithingsRateLimitError(error)).toBe(true)
  })

  it('honours a Retry-After the provider communicated', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 601 }, { 'retry-after': '120' }))

    const error = await fetchWithingsMeasures(integration, START, END).catch((e) => e)

    expect(error.retryAfterSource).toBe('provider')
    expect(error.retryAfterMs).toBe(120_000)
  })

  it('leaves non-601 statuses alone', () => {
    expect(() => throwIfWithingsRateLimited(0, 'integration-1')).not.toThrow()
    expect(() => throwIfWithingsRateLimited(401, 'integration-1')).not.toThrow()
    expect(() => throwIfWithingsRateLimited(503, 'integration-1')).not.toThrow()
  })
})

describe('withings 601 rate limit — genuine failures and success are unaffected', () => {
  it('a genuine provider error still throws a plain, non-deferrable error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 342 }))

    const error = await fetchWithingsMeasures(integration, START, END).catch((e) => e)

    expect(isWithingsRateLimitError(error)).toBe(false)
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain('Status 342')
    // The deferral builder must not swallow it — it has to reach the normal failure path.
    expect(buildWithingsRateLimitDeferral(error, deferralContext)).toBeNull()
  })

  it('a successful run returns its measure groups unchanged', async () => {
    const measuregrps = [
      {
        grpid: 1,
        attrib: 0,
        date: 1_754_000_000,
        created: 0,
        modified: 0,
        category: 1,
        measures: []
      }
    ]
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 0, body: { measuregrps } }))

    await expect(fetchWithingsMeasures(integration, START, END)).resolves.toEqual(measuregrps)
    expect(prismaIntegrationUpdate).not.toHaveBeenCalled()
  })
})

describe('refreshWithingsToken', () => {
  it('treats a 601 as a rate limit, not a revoked authorization (CW-334 regression)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 601 }))

    const error = await refreshWithingsToken(integration).catch((e) => e)

    expect(isWithingsRateLimitError(error)).toBe(true)
    expect(error).not.toBeInstanceOf(IntegrationAuthError)
    // Crucially: a healthy integration must not be marked FAILED / "please reconnect".
    expect(prismaIntegrationUpdate).not.toHaveBeenCalled()
  })

  it('still treats a 401 as a revoked authorization', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 401 }))

    const error = await refreshWithingsToken(integration).catch((e) => e)

    expect(error).toBeInstanceOf(IntegrationAuthError)
    expect(isWithingsRateLimitError(error)).toBe(false)
    expect(prismaIntegrationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ syncStatus: 'FAILED' })
      })
    )
  })
})

describe('parseWithingsRetryAfterMs', () => {
  const now = Date.parse('2026-08-09T12:00:00.000Z')

  it('returns null when the provider communicated nothing', () => {
    expect(parseWithingsRetryAfterMs(new Headers(), now)).toBeNull()
    expect(parseWithingsRetryAfterMs(undefined, now)).toBeNull()
    expect(parseWithingsRetryAfterMs(null, now)).toBeNull()
  })

  it('reads Retry-After in seconds', () => {
    expect(parseWithingsRetryAfterMs(new Headers({ 'retry-after': '90' }), now)).toBe(90_000)
  })

  it('reads Retry-After as an HTTP-date', () => {
    const headers = new Headers({ 'retry-after': 'Sun, 09 Aug 2026 12:05:00 GMT' })
    expect(parseWithingsRetryAfterMs(headers, now)).toBe(300_000)
  })

  it('reads a relative X-RateLimit-Reset', () => {
    expect(parseWithingsRetryAfterMs(new Headers({ 'x-ratelimit-reset': '45' }), now)).toBe(45_000)
  })

  it('reads an absolute epoch-seconds X-RateLimit-Reset', () => {
    const headers = new Headers({ 'x-ratelimit-reset': String(now / 1000 + 600) })
    expect(parseWithingsRetryAfterMs(headers, now)).toBe(600_000)
  })

  it('caps an absurd provider interval', () => {
    const headers = new Headers({ 'retry-after': '86400' })
    expect(parseWithingsRetryAfterMs(headers, now)).toBe(WITHINGS_RATE_LIMIT_MAX_BACKOFF_MS)
  })
})

describe('resolveWithingsDeferralDelayMs', () => {
  it('uses the documented default backoff on the first deferral', () => {
    expect(resolveWithingsDeferralDelayMs(0, null, noJitter)).toBe(
      WITHINGS_RATE_LIMIT_BASE_BACKOFF_MS
    )
  })

  it('escalates with each successive deferral and stops at the ceiling', () => {
    expect(resolveWithingsDeferralDelayMs(1, null, noJitter)).toBe(
      WITHINGS_RATE_LIMIT_BASE_BACKOFF_MS * 2
    )
    expect(resolveWithingsDeferralDelayMs(2, null, noJitter)).toBe(
      WITHINGS_RATE_LIMIT_BASE_BACKOFF_MS * 4
    )
    expect(resolveWithingsDeferralDelayMs(9, null, noJitter)).toBe(
      WITHINGS_RATE_LIMIT_MAX_BACKOFF_MS
    )
  })

  it('prefers an interval the provider communicated over the default escalation', () => {
    expect(resolveWithingsDeferralDelayMs(3, 90_000, noJitter)).toBe(90_000)
  })

  it('jitters upward only, so a deferral never returns earlier than the policy says', () => {
    const maxJitter = resolveWithingsDeferralDelayMs(0, null, () => 1)
    expect(maxJitter).toBeGreaterThan(WITHINGS_RATE_LIMIT_BASE_BACKOFF_MS)
    expect(maxJitter).toBeLessThanOrEqual(WITHINGS_RATE_LIMIT_BASE_BACKOFF_MS * 1.2)
    expect(resolveWithingsDeferralDelayMs(0, null, noJitter)).toBeGreaterThanOrEqual(
      WITHINGS_RATE_LIMIT_BASE_BACKOFF_MS
    )
  })

  it('still jitters once the escalation has reached the ceiling', () => {
    // Regression: clamping the *jittered* value rounded deferrals 3-5 back to exactly MAX,
    // so every ingest deferred during a sustained outage woke at the same instant — the
    // thundering herd the jitter exists to prevent, in the case that matters most.
    for (const deferral of [3, 4, 5]) {
      expect(resolveWithingsDeferralDelayMs(deferral, null, () => 1)).toBeGreaterThan(
        WITHINGS_RATE_LIMIT_MAX_BACKOFF_MS
      )
      expect(resolveWithingsDeferralDelayMs(deferral, null, noJitter)).toBe(
        WITHINGS_RATE_LIMIT_MAX_BACKOFF_MS
      )
    }
  })

  it('floors a small provider Retry-After so it cannot burn the deferral budget in seconds', () => {
    // An unfloored `Retry-After: 3` would fire all five deferrals ~3s apart and give up
    // permanently inside ~15s — strictly worse than the three plain retries this replaced.
    expect(resolveWithingsDeferralDelayMs(0, 3_000, noJitter)).toBe(
      WITHINGS_RATE_LIMIT_MIN_PROVIDER_BACKOFF_MS
    )
    // A provider interval above the floor is still honoured verbatim.
    expect(resolveWithingsDeferralDelayMs(0, 5 * 60 * 1000, noJitter)).toBe(5 * 60 * 1000)
  })
})

describe('buildWithingsRateLimitDeferral', () => {
  const rateLimitError = new WithingsRateLimitError({
    integrationId: 'integration-1',
    statusCode: 601,
    retryAfterMs: WITHINGS_RATE_LIMIT_BASE_BACKOFF_MS,
    retryAfterSource: 'default'
  })

  it('defers the run rather than failing it', () => {
    const deferral = buildWithingsRateLimitDeferral(rateLimitError, deferralContext, {
      random: noJitter
    })

    expect(deferral).not.toBeNull()
    expect(deferral!.shouldReenqueue).toBe(true)
    expect(deferral!.syncStatus).toBe('RATE_LIMITED')
    expect(deferral!.delayMs).toBe(WITHINGS_RATE_LIMIT_BASE_BACKOFF_MS)
    expect(deferral!.nextDeferralCount).toBe(1)
    expect(deferral!.message).toContain('resume automatically')
  })

  it('marks the result as rate-limited so it is distinguishable from a real failure', () => {
    const deferral = buildWithingsRateLimitDeferral(rateLimitError, deferralContext, {
      random: noJitter
    })!

    expect(deferral.result.error).toMatchObject({
      code: 'RATE_LIMITED',
      provider: 'withings',
      statusCode: 601,
      deferred: true,
      retryAfterSource: 'default'
    })
    expect(deferral.result.userId).toBe('user-1')
    expect(deferral.result.startDate).toBe(deferralContext.startDate)
  })

  it('reports the partial progress made before the quota ran out', () => {
    const deferral = buildWithingsRateLimitDeferral(rateLimitError, deferralContext, {
      counts: { wellness: 4, sleep: 2, workouts: 0 },
      skipped: 1,
      random: noJitter
    })!

    expect(deferral.result.counts).toEqual({ wellness: 4, sleep: 2, workouts: 0 })
    expect(deferral.result.skipped).toBe(1)
  })

  it('escalates the delay as the same window keeps being deferred', () => {
    const first = buildWithingsRateLimitDeferral(
      rateLimitError,
      { ...deferralContext, deferralCount: 0 },
      { random: noJitter }
    )!
    const third = buildWithingsRateLimitDeferral(
      rateLimitError,
      { ...deferralContext, deferralCount: 2 },
      { random: noJitter }
    )!

    expect(third.delayMs).toBeGreaterThan(first.delayMs)
    expect(third.nextDeferralCount).toBe(3)
  })

  it('stops re-enqueueing once the deferral budget is spent', () => {
    const deferral = buildWithingsRateLimitDeferral(
      rateLimitError,
      { ...deferralContext, deferralCount: WITHINGS_MAX_RATE_LIMIT_DEFERRALS },
      { random: noJitter }
    )!

    expect(deferral.shouldReenqueue).toBe(false)
    expect(deferral.result.error.deferred).toBe(false)
    expect(deferral.message).toContain('next sync')
  })

  it('uses a provider-communicated interval when there was one', () => {
    const providerError = new WithingsRateLimitError({
      integrationId: 'integration-1',
      statusCode: 601,
      retryAfterMs: 45_000,
      retryAfterSource: 'provider'
    })

    const deferral = buildWithingsRateLimitDeferral(providerError, deferralContext, {
      random: noJitter
    })!

    expect(deferral.delayMs).toBe(45_000)
    expect(deferral.result.error.retryAfterSource).toBe('provider')
  })

  it('returns null for anything that is not a rate limit', () => {
    expect(buildWithingsRateLimitDeferral(new Error('boom'), deferralContext)).toBeNull()
    expect(
      buildWithingsRateLimitDeferral(
        new IntegrationAuthError({
          provider: 'withings',
          integrationId: 'integration-1',
          message: 'revoked'
        }),
        deferralContext
      )
    ).toBeNull()
  })
})

describe('withings request pacer', () => {
  it('spaces consecutive requests by the configured interval', async () => {
    // The per-workout intraday loop is the burst this exists to flatten.
    process.env.WITHINGS_MIN_REQUEST_INTERVAL_MS = '40'
    try {
      fetchMock.mockResolvedValue(jsonResponse({ status: 0, body: { measuregrps: [] } }))

      const startedAt = Date.now()
      await Promise.all([
        fetchWithingsMeasures(integration, START, END),
        fetchWithingsMeasures(integration, START, END),
        fetchWithingsMeasures(integration, START, END)
      ])

      expect(fetchMock).toHaveBeenCalledTimes(3)
      // Three paced calls cannot all land inside a single interval.
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(40)
    } finally {
      process.env.WITHINGS_MIN_REQUEST_INTERVAL_MS = '0'
    }
  })
})
