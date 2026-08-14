import { describe, expect, it, vi, beforeEach } from 'vitest'
import { BugStatus } from '@prisma/client'

// CW-597: `sendToUser` publishes through realtime-bus, which lazily opens an
// ioredis publisher. The support CLI never closed it, so every comment /
// update-status committed its write and then hung until something killed it.
const stopRealtimeSubscription = vi.fn(async () => {})

vi.mock('../../../server/utils/ws-state', () => ({
  sendToUser: vi.fn(async () => {})
}))

vi.mock('../../../server/utils/realtime-bus', () => ({
  stopRealtimeSubscription
}))

const { closeResources, VALID_STATUSES } = await import('../../../cli/support/tickets')

describe('support tickets CLI teardown (CW-597)', () => {
  beforeEach(() => {
    stopRealtimeSubscription.mockClear()
  })

  it('closes the realtime bus so the process can exit', async () => {
    const prisma = { $disconnect: vi.fn(async () => {}) }
    const pool = { end: vi.fn(async () => {}) }

    await closeResources(prisma as any, pool as any)

    expect(prisma.$disconnect).toHaveBeenCalledTimes(1)
    expect(pool.end).toHaveBeenCalledTimes(1)
    // The regression: without this the ioredis handle keeps the event loop alive.
    expect(stopRealtimeSubscription).toHaveBeenCalledTimes(1)
  })
})

describe('support tickets CLI status validation (CW-597)', () => {
  it('derives the accepted status list from the Prisma enum', () => {
    // Guards against the help text drifting from validation again.
    expect(VALID_STATUSES).toEqual(Object.values(BugStatus))
  })

  it('does not advertise statuses the enum does not define', () => {
    expect(VALID_STATUSES).not.toContain('WONT_FIX')
    expect(VALID_STATUSES).not.toContain('DUPLICATE')
  })
})
