import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildWebhookJob, type ClaimedWebhookLog } from '../../../../../cli/worker/start'

vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('defineRouteMeta', vi.fn())
vi.stubGlobal('getRouterParam', (event: any, name: string) => event?.params?.[name])
vi.stubGlobal('readBody', async (event: any) => event?.body)
vi.stubGlobal('getRequestHeaders', (event: any) => event?.headers || {})
vi.stubGlobal('getQuery', (event: any) => event?.query || {})
vi.stubGlobal('createError', (err: any) => {
  const error = new Error(err.message || err.statusMessage)
  // @ts-expect-error test helper property
  error.statusCode = err.statusCode
  return error
})

const oAuthAppFindUnique = vi.fn()
const webhookLogCreate = vi.fn()
const webhookLogUpdate = vi.fn()

vi.mock('../../../../../server/utils/db', () => ({
  prisma: {
    oAuthApp: {
      findUnique: (...args: unknown[]) => oAuthAppFindUnique(...args)
    },
    webhookLog: {
      create: (...args: unknown[]) => webhookLogCreate(...args),
      update: (...args: unknown[]) => webhookLogUpdate(...args)
    }
  }
}))

const getHandler = async () => {
  const mod = await import('../../../../../server/api/webhooks/oauth/[clientId].post')
  return mod.default
}

/**
 * Reproduce what the worker's atomic claim returns for the row the handler just
 * persisted. `claimPendingWebhookLogs` flips PENDING -> QUEUED in one statement
 * and RETURNs exactly these columns, so whatever the handler wrote in its
 * *first* statement is all the worker will ever see.
 */
const claimRowFrom = (createArgs: any): ClaimedWebhookLog => ({
  id: 'log-1',
  provider: createArgs.data.provider,
  eventType: createArgs.data.eventType ?? null,
  payload: createArgs.data.payload ?? null,
  headers: createArgs.data.headers ?? null,
  query: createArgs.data.query ?? null,
  error: createArgs.data.error ?? null
})

const buildEvent = (overrides: Record<string, any> = {}) => ({
  params: { clientId: 'client-abc' },
  body: { hello: 'world' },
  headers: {},
  query: {},
  ...overrides
})

describe('POST /api/webhooks/oauth/[clientId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    webhookLogCreate.mockImplementation(async (args: any) => ({ id: 'log-1', ...args.data }))
    oAuthAppFindUnique.mockResolvedValue({
      id: 'app-1',
      clientId: 'client-abc',
      name: 'withings',
      webhookSecret: 'super-secret'
    })
  })

  it('404s when the application is unknown', async () => {
    oAuthAppFindUnique.mockResolvedValue(null)
    const handler = await getHandler()

    await expect(handler(buildEvent() as any)).rejects.toMatchObject({
      statusCode: 404
    })
    expect(webhookLogCreate).not.toHaveBeenCalled()
  })

  it('persists eventType and the secret result in a single statement (CW-503)', async () => {
    const handler = await getHandler()

    await handler(buildEvent({ headers: { 'x-webhook-secret': 'super-secret' } }) as any)

    expect(webhookLogCreate).toHaveBeenCalledTimes(1)
    // The corrective second write is what CW-503 removes - there must be no
    // window in which a poll can observe the intermediate row.
    expect(webhookLogUpdate).not.toHaveBeenCalled()

    expect(webhookLogCreate.mock.calls[0]![0].data).toMatchObject({
      provider: 'oauth-generic',
      eventType: 'oauth:withings',
      error: 'SECRET_MATCHED',
      status: 'PENDING'
    })
  })

  it('a row claimed with no follow-up write still yields the right appName and secretMatched', async () => {
    const handler = await getHandler()

    await handler(buildEvent({ headers: { 'x-webhook-secret': 'super-secret' } }) as any)

    // Simulate the worker poller landing immediately after the create, i.e. the
    // exact window that previously produced appName 'unknown' / secretMatched false.
    const claimed = claimRowFrom(webhookLogCreate.mock.calls[0]![0])
    const { queueJobName, jobData } = buildWebhookJob(claimed)

    expect(queueJobName).toBe('oauth-webhook')
    expect(jobData).toMatchObject({
      provider: 'oauth-generic',
      type: 'oauth:withings',
      appName: 'withings',
      secretMatched: true,
      logId: 'log-1'
    })
  })

  it('records a mismatched secret as SECRET_MISMATCH and claims as secretMatched false', async () => {
    const handler = await getHandler()

    const result = await handler(
      buildEvent({ headers: { 'x-webhook-secret': 'wrong-secret' } }) as any
    )

    expect(webhookLogCreate.mock.calls[0]![0].data).toMatchObject({
      eventType: 'oauth:withings',
      error: 'SECRET_MISMATCH'
    })
    expect(webhookLogUpdate).not.toHaveBeenCalled()

    const { jobData } = buildWebhookJob(claimRowFrom(webhookLogCreate.mock.calls[0]![0]))
    expect(jobData).toMatchObject({ appName: 'withings', secretMatched: false })

    // Accept/reject semantics are unchanged: still a 200 with the flag echoed back.
    expect(result).toMatchObject({ status: 'success', secretMatched: false })
  })

  it('records a missing secret as NO_SECRET_PROVIDED', async () => {
    const handler = await getHandler()

    await handler(buildEvent() as any)

    expect(webhookLogCreate.mock.calls[0]![0].data).toMatchObject({
      eventType: 'oauth:withings',
      error: 'NO_SECRET_PROVIDED'
    })
    expect(webhookLogUpdate).not.toHaveBeenCalled()
  })

  it('accepts the secret from the query string as well as the header', async () => {
    const handler = await getHandler()

    await handler(buildEvent({ query: { secret: 'super-secret' } }) as any)

    expect(webhookLogCreate.mock.calls[0]![0].data).toMatchObject({
      error: 'SECRET_MATCHED'
    })
  })

  it('still returns 200 with the captured payload envelope', async () => {
    const handler = await getHandler()

    const result = await handler(
      buildEvent({ headers: { 'x-webhook-secret': 'super-secret' } }) as any
    )

    expect(result).toMatchObject({ status: 'success', message: 'Data captured' })
    expect(typeof (result as any).receivedAt).toBe('string')
  })
})
