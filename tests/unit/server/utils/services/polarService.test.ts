import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { polarService } from '../../../../../server/utils/services/polarService'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    integration: {
      findFirst: vi.fn(),
      update: vi.fn()
    }
  }
}))

vi.mock('../../../../../server/utils/db', () => ({
  prisma: prismaMock
}))

const baseIntegration = {
  id: 'int-polar-1',
  userId: 'user-1',
  provider: 'polar',
  accessToken: 'token-abc',
  refreshToken: null,
  expiresAt: null,
  externalUserId: null,
  scope: null,
  lastSyncAt: null,
  syncStatus: null,
  errorMessage: null,
  initialSyncCompleted: false,
  ingestWorkouts: true,
  settings: {}
}

describe('polarService.syncUser sync status lifecycle', () => {
  beforeEach(() => {
    prismaMock.integration.findFirst.mockReset()
    prismaMock.integration.update.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('throws when the Polar integration is missing an access token', async () => {
    prismaMock.integration.findFirst.mockResolvedValue(null)

    await expect(polarService.syncUser('user-1')).rejects.toThrow('Polar integration not found')

    expect(prismaMock.integration.update).not.toHaveBeenCalled()
  })

  it('marks the integration SYNCING before ingesting, then SUCCESS with lastSyncAt on completion', async () => {
    prismaMock.integration.findFirst.mockResolvedValue({
      ...baseIntegration,
      settings: { ingestWellness: false }
    })
    prismaMock.integration.update.mockResolvedValue({})

    const syncExercisesSpy = vi.spyOn(polarService, 'syncExercises').mockResolvedValue(3)
    const syncSleepSpy = vi.spyOn(polarService, 'syncSleep').mockResolvedValue(0)
    const syncNightlyRechargeSpy = vi
      .spyOn(polarService, 'syncNightlyRecharge')
      .mockResolvedValue(0)

    const results = await polarService.syncUser('user-1')

    expect(results).toEqual({ exercises: 3, sleeps: 0, recharges: 0 })

    // First update call marks the integration as actively syncing.
    expect(prismaMock.integration.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'int-polar-1' },
      data: { syncStatus: 'SYNCING' }
    })

    // Final update call marks success and stamps lastSyncAt, clearing any prior error.
    const lastCall =
      prismaMock.integration.update.mock.calls[prismaMock.integration.update.mock.calls.length - 1]
    expect(lastCall[0]).toEqual({
      where: { id: 'int-polar-1' },
      data: {
        lastSyncAt: expect.any(Date),
        syncStatus: 'SUCCESS',
        errorMessage: null
      }
    })

    expect(syncExercisesSpy).toHaveBeenCalled()
    expect(syncSleepSpy).not.toHaveBeenCalled()
    expect(syncNightlyRechargeSpy).not.toHaveBeenCalled()
  })

  it('marks the integration FAILED with the error message and rethrows on failure', async () => {
    prismaMock.integration.findFirst.mockResolvedValue({
      ...baseIntegration,
      settings: { ingestWellness: false }
    })
    prismaMock.integration.update.mockResolvedValue({})

    vi.spyOn(polarService, 'syncExercises').mockRejectedValue(new Error('Polar API exploded'))

    await expect(polarService.syncUser('user-1')).rejects.toThrow('Polar API exploded')

    expect(prismaMock.integration.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'int-polar-1' },
      data: { syncStatus: 'SYNCING' }
    })

    expect(prismaMock.integration.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'int-polar-1' },
      data: {
        syncStatus: 'FAILED',
        errorMessage: 'Polar API exploded'
      }
    })
  })

  it('marks the integration FAILED with a fallback message when a non-Error value is thrown', async () => {
    prismaMock.integration.findFirst.mockResolvedValue({
      ...baseIntegration,
      settings: { ingestWellness: false }
    })
    prismaMock.integration.update.mockResolvedValue({})

    vi.spyOn(polarService, 'syncExercises').mockRejectedValue('a string rejection')

    await expect(polarService.syncUser('user-1')).rejects.toBe('a string rejection')

    expect(prismaMock.integration.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'int-polar-1' },
      data: {
        syncStatus: 'FAILED',
        errorMessage: 'Unknown error'
      }
    })
  })
})
