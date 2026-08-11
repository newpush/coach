import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  fetchGarminActivityFile,
  fetchGarminActivityFileByCallbackUrl,
  fetchGarminData,
  buildGarminTimeSlices,
  ensureValidGarminToken,
  GarminDownloadTokenExpiredError,
  hasGarminPermission,
  isGarminDownloadTokenError,
  mergeGarminScopes,
  parseGarminScope,
  reconcileGarminScopes,
  refreshGarminToken,
  serializeGarminScopes
} from '../../../../server/utils/garmin'

const { prismaIntegrationFindUnique, prismaIntegrationUpdate, prismaQueryRaw, prismaTransaction } =
  vi.hoisted(() => ({
    prismaIntegrationFindUnique: vi.fn(),
    prismaIntegrationUpdate: vi.fn(),
    prismaQueryRaw: vi.fn(),
    prismaTransaction: vi.fn()
  }))

vi.mock('../../../../server/utils/db', () => ({
  prisma: {
    $transaction: prismaTransaction,
    integration: {
      findUnique: prismaIntegrationFindUnique,
      update: prismaIntegrationUpdate
    }
  }
}))

beforeEach(() => {
  prismaIntegrationFindUnique.mockReset()
  prismaIntegrationUpdate.mockReset()
  prismaQueryRaw.mockReset()
  prismaTransaction.mockReset()
  prismaQueryRaw.mockResolvedValue([])
  prismaTransaction.mockImplementation(async (callback: (transaction: unknown) => unknown) =>
    callback({
      $queryRaw: prismaQueryRaw,
      integration: {
        findUnique: prismaIntegrationFindUnique,
        update: prismaIntegrationUpdate
      }
    })
  )
  vi.restoreAllMocks()
  process.env.GARMIN_CLIENT_ID = 'test-client-id'
  process.env.GARMIN_CLIENT_SECRET = 'test-client-secret'
})

describe('buildGarminTimeSlices', () => {
  it('returns a single slice for ranges within 24 hours', () => {
    expect(buildGarminTimeSlices(1_000, 10_000)).toEqual([
      { startTimestamp: 1_000, endTimestamp: 10_000 }
    ])
  })

  it('chunks multi-day ranges into consecutive 24-hour slices', () => {
    expect(buildGarminTimeSlices(0, 200_000)).toEqual([
      { startTimestamp: 0, endTimestamp: 86_400 },
      { startTimestamp: 86_400, endTimestamp: 172_800 },
      { startTimestamp: 172_800, endTimestamp: 200_000 }
    ])
  })
})

describe('Garmin permission helpers', () => {
  it('parses and normalizes Garmin scope strings', () => {
    expect(parseGarminScope('partner_write connect_read  workout_import')).toEqual(
      new Set(['PARTNER_WRITE', 'CONNECT_READ', 'WORKOUT_IMPORT'])
    )
  })

  it('treats PARTNER_WRITE as sufficient for Garmin import permissions', () => {
    const scopes = parseGarminScope('PARTNER_WRITE CONNECT_READ')

    expect(hasGarminPermission(scopes, 'WORKOUT_IMPORT')).toBe(true)
    expect(hasGarminPermission(scopes, 'COURSE_IMPORT')).toBe(true)
  })

  it('merges stored OAuth scopes with fetched Garmin permissions', () => {
    expect(mergeGarminScopes('PARTNER_WRITE CONNECT_READ', ['workout_import'])).toEqual(
      new Set(['PARTNER_WRITE', 'CONNECT_READ', 'WORKOUT_IMPORT'])
    )
  })

  it('refreshGarminIntegrationPermissions merges and persists without failing ingest callers', async () => {
    const { refreshGarminIntegrationPermissions } = await import('../../../../server/utils/garmin')

    const integration = {
      id: 'integration-perms',
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: new Date(Date.now() + 3600_000),
      scope: 'PARTNER_WRITE'
    } as any

    prismaIntegrationFindUnique.mockResolvedValue(integration)
    prismaIntegrationUpdate.mockResolvedValue({
      ...integration,
      scope: 'PARTNER_WRITE HEALTH_EXPORT ACTIVITY_EXPORT'
    })

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ['HEALTH_EXPORT', 'ACTIVITY_EXPORT'],
      headers: new Headers()
    })
    vi.stubGlobal('fetch', fetchMock as any)

    const updated = await refreshGarminIntegrationPermissions(integration)

    expect(updated.scope).toContain('HEALTH_EXPORT')
    expect(prismaIntegrationUpdate).toHaveBeenCalledWith({
      where: { id: 'integration-perms' },
      data: {
        scope: expect.stringContaining('HEALTH_EXPORT')
      }
    })
  })

  it('adds newly granted user permissions while keeping OAuth scopes', () => {
    expect(reconcileGarminScopes('PARTNER_WRITE CONNECT_READ', ['health_export'])).toEqual(
      new Set(['PARTNER_WRITE', 'CONNECT_READ', 'HEALTH_EXPORT'])
    )
  })

  it('prunes user permissions absent from the live response but keeps OAuth scopes', () => {
    expect(
      reconcileGarminScopes('PARTNER_WRITE CONNECT_READ HEALTH_EXPORT ACTIVITY_EXPORT', [
        'ACTIVITY_EXPORT'
      ])
    ).toEqual(new Set(['PARTNER_WRITE', 'CONNECT_READ', 'ACTIVITY_EXPORT']))
  })

  it('drops every user permission when the live response is empty', () => {
    expect(reconcileGarminScopes('PARTNER_WRITE HEALTH_EXPORT WORKOUT_IMPORT', [])).toEqual(
      new Set(['PARTNER_WRITE'])
    )
  })

  it('throws rather than pruning when a 200 array holds non-string entries', async () => {
    // A future shape like [{ permission: 'HEALTH_EXPORT' }] passes Array.isArray
    // but filters to [], which reconcileGarminScopes would faithfully apply as a
    // full revoke for every user.
    const { fetchGarminUserPermissions } = await import('../../../../server/utils/garmin')

    const integration = {
      id: 'integration-shape',
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: new Date(Date.now() + 3600_000),
      scope: 'PARTNER_WRITE HEALTH_EXPORT'
    } as any

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ permission: 'HEALTH_EXPORT' }, { permission: 'ACTIVITY_EXPORT' }],
        headers: new Headers()
      }) as any
    )

    await expect(fetchGarminUserPermissions(integration)).rejects.toThrow(/unrecognized payload/i)
  })

  it('throws when a 200 permissions object holds non-string entries', async () => {
    const { fetchGarminUserPermissions } = await import('../../../../server/utils/garmin')

    const integration = {
      id: 'integration-shape-2',
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: new Date(Date.now() + 3600_000),
      scope: 'PARTNER_WRITE HEALTH_EXPORT'
    } as any

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ permissions: [{ permission: 'HEALTH_EXPORT' }] }),
        headers: new Headers()
      }) as any
    )

    await expect(fetchGarminUserPermissions(integration)).rejects.toThrow(/unrecognized payload/i)
  })

  it('leaves the stored scope untouched when the payload shape is unrecognized', async () => {
    const { refreshGarminIntegrationPermissions } = await import('../../../../server/utils/garmin')

    const integration = {
      id: 'integration-shape-3',
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: new Date(Date.now() + 3600_000),
      scope: 'PARTNER_WRITE HEALTH_EXPORT ACTIVITY_EXPORT'
    } as any

    prismaIntegrationFindUnique.mockResolvedValue(integration)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ permission: 'HEALTH_EXPORT' }],
        headers: new Headers()
      }) as any
    )

    const result = await refreshGarminIntegrationPermissions(integration)

    expect(result.scope).toBe('PARTNER_WRITE HEALTH_EXPORT ACTIVITY_EXPORT')
    expect(prismaIntegrationUpdate).not.toHaveBeenCalled()
  })

  it('keeps unknown permissions reported by Garmin', () => {
    expect(reconcileGarminScopes('PARTNER_WRITE', ['MCT_EXPORT'])).toEqual(
      new Set(['PARTNER_WRITE', 'MCT_EXPORT'])
    )
  })

  it('serializes an empty scope set as null', () => {
    expect(serializeGarminScopes(new Set())).toBeNull()
    expect(serializeGarminScopes(new Set(['PARTNER_WRITE']))).toBe('PARTNER_WRITE')
  })

  it('refreshGarminIntegrationPermissions prunes a partially revoked permission', async () => {
    const { refreshGarminIntegrationPermissions } = await import('../../../../server/utils/garmin')

    const integration = {
      id: 'integration-partial-revoke',
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: new Date(Date.now() + 3600_000),
      scope: 'PARTNER_WRITE HEALTH_EXPORT ACTIVITY_EXPORT'
    } as any

    prismaIntegrationFindUnique.mockResolvedValue(integration)
    prismaIntegrationUpdate.mockImplementation(async ({ data }: any) => ({
      ...integration,
      ...data
    }))

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ['ACTIVITY_EXPORT'],
        headers: new Headers()
      }) as any
    )

    const updated = await refreshGarminIntegrationPermissions(integration)

    expect(prismaIntegrationUpdate).toHaveBeenCalledWith({
      where: { id: 'integration-partial-revoke' },
      data: { scope: 'PARTNER_WRITE ACTIVITY_EXPORT' }
    })
    expect(updated.scope).toBe('PARTNER_WRITE ACTIVITY_EXPORT')
    expect(hasGarminPermission(updated.scope, 'HEALTH_EXPORT')).toBe(false)
  })

  it('refreshGarminIntegrationPermissions clears every user permission on a full revoke', async () => {
    const { refreshGarminIntegrationPermissions } = await import('../../../../server/utils/garmin')

    const integration = {
      id: 'integration-full-revoke',
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: new Date(Date.now() + 3600_000),
      scope: 'HEALTH_EXPORT ACTIVITY_EXPORT WORKOUT_IMPORT'
    } as any

    prismaIntegrationFindUnique.mockResolvedValue(integration)
    prismaIntegrationUpdate.mockImplementation(async ({ data }: any) => ({
      ...integration,
      ...data
    }))

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
        headers: new Headers()
      }) as any
    )

    const updated = await refreshGarminIntegrationPermissions(integration)

    expect(prismaIntegrationUpdate).toHaveBeenCalledWith({
      where: { id: 'integration-full-revoke' },
      data: { scope: null }
    })
    expect(updated.scope).toBeNull()
  })

  it('refreshGarminIntegrationPermissions skips the write when nothing changed', async () => {
    const { refreshGarminIntegrationPermissions } = await import('../../../../server/utils/garmin')

    const integration = {
      id: 'integration-unchanged',
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: new Date(Date.now() + 3600_000),
      scope: 'PARTNER_WRITE HEALTH_EXPORT'
    } as any

    prismaIntegrationFindUnique.mockResolvedValue(integration)

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ['HEALTH_EXPORT'],
        headers: new Headers()
      }) as any
    )

    const result = await refreshGarminIntegrationPermissions(integration)

    expect(result).toBe(integration)
    expect(prismaIntegrationUpdate).not.toHaveBeenCalled()
  })

  it('refreshGarminIntegrationPermissions keeps stored permissions when the network fails', async () => {
    const { refreshGarminIntegrationPermissions } = await import('../../../../server/utils/garmin')

    const integration = {
      id: 'integration-network-error',
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: new Date(Date.now() + 3600_000),
      scope: 'PARTNER_WRITE HEALTH_EXPORT WORKOUT_IMPORT'
    } as any

    prismaIntegrationFindUnique.mockResolvedValue(integration)

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')) as any)

    // The permissions fetch retries with exponential backoff; drive its timers instead of waiting.
    vi.useFakeTimers()
    let result: any
    try {
      const pending = refreshGarminIntegrationPermissions(integration)
      await vi.runAllTimersAsync()
      result = await pending
    } finally {
      vi.useRealTimers()
    }

    expect(result).toBe(integration)
    expect(result.scope).toBe('PARTNER_WRITE HEALTH_EXPORT WORKOUT_IMPORT')
    expect(prismaIntegrationUpdate).not.toHaveBeenCalled()
  })

  it('refreshGarminIntegrationPermissions does not prune on an unrecognized 200 payload', async () => {
    const { refreshGarminIntegrationPermissions } = await import('../../../../server/utils/garmin')

    const integration = {
      id: 'integration-bad-payload',
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: new Date(Date.now() + 3600_000),
      scope: 'PARTNER_WRITE HEALTH_EXPORT'
    } as any

    prismaIntegrationFindUnique.mockResolvedValue(integration)

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ unexpected: true }),
        headers: new Headers()
      }) as any
    )

    const result = await refreshGarminIntegrationPermissions(integration)

    expect(result).toBe(integration)
    expect(prismaIntegrationUpdate).not.toHaveBeenCalled()
  })

  it('refreshGarminIntegrationPermissions returns the original integration on API failure', async () => {
    const { refreshGarminIntegrationPermissions } = await import('../../../../server/utils/garmin')

    const integration = {
      id: 'integration-perms-fail',
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: new Date(Date.now() + 3600_000),
      scope: 'PARTNER_WRITE'
    } as any

    prismaIntegrationFindUnique.mockResolvedValue(integration)

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        json: async () => ({ errorMessage: 'boom' }),
        headers: new Headers()
      }) as any
    )

    const result = await refreshGarminIntegrationPermissions(integration)
    expect(result).toBe(integration)
    expect(prismaIntegrationUpdate).not.toHaveBeenCalled()
  })
})

describe('Garmin auth retry', () => {
  it('serializes concurrent refreshes and reuses the rotated credentials', async () => {
    const expiredIntegration = {
      id: 'integration-concurrent-refresh',
      accessToken: 'expired-token',
      refreshToken: 'old-refresh-token',
      expiresAt: new Date(Date.now() - 1000)
    } as any
    let storedIntegration = expiredIntegration
    let transactionQueue = Promise.resolve()

    prismaIntegrationFindUnique.mockImplementation(async () => storedIntegration)
    prismaIntegrationUpdate.mockImplementation(async ({ data }) => {
      storedIntegration = { ...storedIntegration, ...data }
      return storedIntegration
    })
    prismaTransaction.mockImplementation((callback: (transaction: unknown) => Promise<unknown>) => {
      const result = transactionQueue.then(() =>
        callback({
          $queryRaw: prismaQueryRaw,
          integration: {
            findUnique: prismaIntegrationFindUnique,
            update: prismaIntegrationUpdate
          }
        })
      )
      transactionQueue = result.then(
        () => undefined,
        () => undefined
      )
      return result
    })

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'fresh-token',
        refresh_token: 'fresh-refresh-token',
        expires_in: 86_400
      })
    })
    vi.stubGlobal('fetch', fetchMock as any)

    const [first, second] = await Promise.all([
      refreshGarminToken(expiredIntegration),
      refreshGarminToken(expiredIntegration)
    ])

    expect(first.accessToken).toBe('fresh-token')
    expect(second.accessToken).toBe('fresh-token')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(prismaIntegrationUpdate).toHaveBeenCalledTimes(1)
  })

  it('uses credentials refreshed by another caller without marking the integration failed', async () => {
    const staleIntegration = {
      id: 'integration-stale-refresh',
      accessToken: 'expired-token',
      refreshToken: 'old-refresh-token',
      expiresAt: new Date(Date.now() - 1000)
    } as any
    const refreshedIntegration = {
      ...staleIntegration,
      accessToken: 'fresh-token',
      refreshToken: 'fresh-refresh-token',
      expiresAt: new Date(Date.now() + 86_400_000)
    }
    prismaIntegrationFindUnique.mockResolvedValue(refreshedIntegration)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock as any)

    await expect(refreshGarminToken(staleIntegration)).resolves.toBe(refreshedIntegration)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(prismaIntegrationUpdate).not.toHaveBeenCalled()
  })

  it('re-reads fresh credentials for callers holding a stale Training API integration object', async () => {
    const staleIntegration = {
      id: 'integration-training-stale',
      accessToken: 'expired-token',
      refreshToken: 'old-refresh-token',
      expiresAt: new Date(Date.now() - 1000)
    } as any
    const refreshedIntegration = {
      ...staleIntegration,
      accessToken: 'fresh-token',
      refreshToken: 'fresh-refresh-token',
      expiresAt: new Date(Date.now() + 86_400_000)
    }
    prismaIntegrationFindUnique.mockResolvedValue(refreshedIntegration)

    await expect(ensureValidGarminToken(staleIntegration)).resolves.toBe(refreshedIntegration)
    expect(prismaTransaction).not.toHaveBeenCalled()
  })

  it('refreshes and retries summary requests when Garmin reports an inactive token', async () => {
    const integration = {
      id: 'integration-1',
      accessToken: 'expired-token',
      refreshToken: 'refresh-token',
      expiresAt: new Date(Date.now() + 3600_000)
    } as any

    prismaIntegrationFindUnique.mockResolvedValue(integration)
    prismaIntegrationUpdate.mockResolvedValue({
      ...integration,
      accessToken: 'fresh-token',
      refreshToken: 'fresh-refresh-token',
      expiresAt: new Date(Date.now() + 3600_000)
    })

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ errorMessage: 'Token is not active' }),
        headers: new Headers()
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'fresh-token',
          refresh_token: 'fresh-refresh-token',
          expires_in: 3600
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true })
      })

    vi.stubGlobal('fetch', fetchMock as any)

    const result = await fetchGarminData(
      integration,
      'https://apis.garmin.com/wellness-api/rest/dailies'
    )

    expect(result).toEqual({ ok: true })
    expect(prismaIntegrationUpdate).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://diauth.garmin.com/di-oauth2-service/oauth/token'
    )
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer fresh-token'
    })
  })

  it('refreshes and retries summary requests when Garmin returns a generic unauthorized response', async () => {
    const integration = {
      id: 'integration-generic-401',
      accessToken: 'expired-token',
      refreshToken: 'refresh-token',
      expiresAt: new Date(Date.now() + 3600_000)
    } as any

    prismaIntegrationFindUnique.mockResolvedValue(integration)
    prismaIntegrationUpdate.mockResolvedValue({
      ...integration,
      accessToken: 'fresh-token',
      refreshToken: 'fresh-refresh-token',
      expiresAt: new Date(Date.now() + 3600_000)
    })

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({}),
        headers: new Headers()
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'fresh-token',
          refresh_token: 'fresh-refresh-token',
          expires_in: 3600
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true })
      })

    vi.stubGlobal('fetch', fetchMock as any)

    const result = await fetchGarminData(
      integration,
      'https://apis.garmin.com/wellness-api/rest/dailies'
    )

    expect(result).toEqual({ ok: true })
    expect(prismaIntegrationUpdate).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer fresh-token'
    })
  })

  it('marks Garmin integration failed when the refresh token is rejected', async () => {
    const integration = {
      id: 'integration-invalid-refresh',
      accessToken: 'expired-token',
      refreshToken: 'invalid-refresh-token',
      expiresAt: new Date(Date.now() - 1000)
    } as any

    prismaIntegrationFindUnique.mockResolvedValue(integration)

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ error: 'invalid_grant' })
      }) as any
    )

    await expect(
      fetchGarminData(integration, 'https://apis.garmin.com/wellness-api/rest/dailies')
    ).rejects.toThrow('Failed to refresh Garmin token: invalid_grant')

    expect(prismaIntegrationUpdate).toHaveBeenCalledWith({
      where: { id: integration.id },
      data: {
        syncStatus: 'FAILED',
        errorMessage: 'Garmin authorization expired or was revoked. Please reconnect Garmin.'
      }
    })
  })

  it('refreshes and retries FIT file fetches when Garmin reports an inactive token', async () => {
    const integration = {
      id: 'integration-2',
      accessToken: 'expired-token',
      refreshToken: 'refresh-token',
      expiresAt: new Date(Date.now() + 3600_000)
    } as any

    prismaIntegrationFindUnique.mockResolvedValue(integration)
    prismaIntegrationUpdate.mockResolvedValue({
      ...integration,
      accessToken: 'fresh-token',
      refreshToken: 'fresh-refresh-token',
      expiresAt: new Date(Date.now() + 3600_000)
    })

    const fileBytes = new Uint8Array([1, 2, 3, 4])
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ errorMessage: 'Token is not active' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'fresh-token',
          refresh_token: 'fresh-refresh-token',
          expires_in: 3600
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => fileBytes.buffer
      })

    vi.stubGlobal('fetch', fetchMock as any)

    const buffer = await fetchGarminActivityFile(integration, 'activity-123')

    expect([...buffer]).toEqual([1, 2, 3, 4])
    expect(prismaIntegrationUpdate).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer fresh-token'
    })
  })

  it('throws GarminDownloadTokenExpiredError for HTTP 400 Invalid download token', async () => {
    const integration = {
      id: 'int-file-token',
      accessToken: 'fresh-token',
      refreshToken: 'refresh-token',
      expiresAt: new Date(Date.now() + 3600_000)
    }

    prismaIntegrationFindUnique.mockResolvedValue(integration)

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ errorMessage: 'Invalid download token' })
    })
    vi.stubGlobal('fetch', fetchMock as any)

    await expect(
      fetchGarminActivityFile(integration as any, '23772550387', 'stale')
    ).rejects.toBeInstanceOf(GarminDownloadTokenExpiredError)

    await expect(
      fetchGarminActivityFileByCallbackUrl(
        integration as any,
        'https://apis.garmin.com/wellness-api/rest/activityFile?id=23772550387&token=stale'
      )
    ).rejects.toMatchObject({
      name: 'GarminDownloadTokenExpiredError',
      code: 'GARMIN_DOWNLOAD_TOKEN_EXPIRED',
      statusCode: 400,
      retryable: true
    })

    expect(
      isGarminDownloadTokenError(new Error('Garmin File API error (400): Invalid download token'))
    ).toBe(true)
  })
})
