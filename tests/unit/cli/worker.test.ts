import { describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import {
  buildWebhookJob,
  claimPendingWebhookLogs,
  registerScheduledTasks,
  releaseClaimedWebhookLog,
  WEBHOOK_POLL_BATCH_SIZE,
  type ClaimedWebhookLog
} from '../../../cli/worker/start'
import {
  ensureTaskHandlersRegistered,
  getLoadedTaskDefinitions,
  type LoadedTaskDefinition
} from '../../../cli/worker/task-handler-loader'

describe('Worker schedule registration', () => {
  it('upserts BullMQ job schedulers for scheduled tasks and removes stale ones', async () => {
    const mockTaskDefinitions: LoadedTaskDefinition[] = [
      {
        id: 'finalize-daily-nutrition-cron',
        schedule: { cron: '10 2 * * *', timezone: 'UTC' },
        maxDuration: 300
      },
      {
        id: 'poll-ultrahuman',
        schedule: { cron: '5 * * * *', timezone: 'UTC' },
        queue: { name: 'user-ingestion', concurrencyLimit: 5 }
      },
      {
        id: 'deduplicate-workouts',
        maxDuration: 300
      }
    ]

    const existingSchedulers = [
      { key: 'task-schedule:finalize-daily-nutrition-cron' },
      { key: 'task-schedule:obsolete-task-cron' },
      { key: 'other-prefix:some-key' }
    ]

    const removedKeys: string[] = []
    const upsertedSchedulers: Array<{
      id: string
      scheduler: { pattern: string; tz?: string }
      jobTemplate: any
    }> = []

    const mockQueue = {
      getJobSchedulers: vi.fn().mockResolvedValue(existingSchedulers),
      removeJobScheduler: vi.fn().mockImplementation(async (key: string) => {
        removedKeys.push(key)
      }),
      upsertJobScheduler: vi.fn().mockImplementation(async (id, scheduler, jobTemplate) => {
        upsertedSchedulers.push({ id, scheduler, jobTemplate })
      })
    }

    const count = await registerScheduledTasks(mockQueue, mockTaskDefinitions)

    expect(count).toBe(2)
    expect(mockQueue.getJobSchedulers).toHaveBeenCalledWith(0, -1, true)

    // Stale schedule starting with task-schedule: should be removed, while non-matching prefix is kept
    expect(removedKeys).toEqual(['task-schedule:obsolete-task-cron'])

    // Scheduled tasks should be upserted
    expect(upsertedSchedulers).toHaveLength(2)
    expect(upsertedSchedulers[0]).toEqual({
      id: 'task-schedule:finalize-daily-nutrition-cron',
      scheduler: { pattern: '10 2 * * *', tz: 'UTC' },
      jobTemplate: {
        name: 'finalize-daily-nutrition-cron',
        data: {
          schedule: {
            scheduleId: 'task-schedule:finalize-daily-nutrition-cron',
            timezone: 'UTC'
          },
          options: {
            queueName: undefined,
            concurrencyLimit: undefined,
            maxDuration: 300,
            tags: ['system:schedule']
          }
        },
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 }
        }
      }
    })

    expect(upsertedSchedulers[1]).toEqual({
      id: 'task-schedule:poll-ultrahuman',
      scheduler: { pattern: '5 * * * *', tz: 'UTC' },
      jobTemplate: {
        name: 'poll-ultrahuman',
        data: {
          schedule: {
            scheduleId: 'task-schedule:poll-ultrahuman',
            timezone: 'UTC'
          },
          options: {
            queueName: 'user-ingestion',
            concurrencyLimit: 5,
            maxDuration: undefined,
            tags: ['system:schedule']
          }
        },
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 }
        }
      }
    })
  })

  it('enqueues loaded scheduled tasks from task handler loader', async () => {
    await ensureTaskHandlersRegistered()
    const loadedDefinitions = getLoadedTaskDefinitions()
    const scheduledDefinitions = loadedDefinitions.filter((d) => d.schedule?.cron)

    expect(scheduledDefinitions.length).toBeGreaterThan(0)

    const upserted: string[] = []
    const mockQueue = {
      getJobSchedulers: vi.fn().mockResolvedValue([]),
      removeJobScheduler: vi.fn().mockResolvedValue(true),
      upsertJobScheduler: vi.fn().mockImplementation(async (id: string) => {
        upserted.push(id)
      })
    }

    const count = await registerScheduledTasks(mockQueue, loadedDefinitions)

    expect(count).toBe(scheduledDefinitions.length)
    expect(upserted).toEqual(scheduledDefinitions.map((d) => `task-schedule:${d.id}`))
  })
})

describe('Webhook poller atomic claim', () => {
  const makeClient = (rows: ClaimedWebhookLog[] = []) => {
    const queries: Prisma.Sql[] = []
    return {
      queries,
      client: {
        $queryRaw: vi.fn(async (query: Prisma.Sql) => {
          queries.push(query)
          return rows as any
        }),
        $executeRaw: vi.fn(async (query: Prisma.Sql) => {
          queries.push(query)
          return 1
        })
      }
    }
  }

  it('selects and marks PENDING rows QUEUED in a single locking statement', async () => {
    const { client, queries } = makeClient([
      {
        id: 'log-1',
        provider: 'strava',
        eventType: 'activity',
        payload: { a: 1 },
        headers: null,
        query: null,
        error: null
      }
    ])

    const claimed = await claimPendingWebhookLogs(client)

    expect(claimed).toHaveLength(1)
    expect(claimed[0]!.id).toBe('log-1')
    expect(client.$queryRaw).toHaveBeenCalledTimes(1)

    const sql = queries[0]!.sql.replace(/\s+/g, ' ')
    // One statement does both the selection and the status transition, so a
    // concurrently polling worker can never claim the same row twice.
    expect(sql).toContain('UPDATE "WebhookLog"')
    expect(sql).toContain(`SET "status" = 'QUEUED'`)
    expect(sql).toContain(`WHERE "status" = 'PENDING'`)
    expect(sql).toContain('ORDER BY "createdAt" ASC')
    expect(sql).toContain('FOR UPDATE SKIP LOCKED')
    expect(sql).toContain('RETURNING')
    expect(queries[0]!.values).toEqual([WEBHOOK_POLL_BATCH_SIZE])
  })

  it('returns an empty batch when nothing is pending', async () => {
    const { client } = makeClient([])
    await expect(claimPendingWebhookLogs(client, 10)).resolves.toEqual([])
  })

  it('releases a claimed row back to PENDING only while it is still QUEUED', async () => {
    const { client, queries } = makeClient()

    await releaseClaimedWebhookLog(client, 'log-9')

    const sql = queries[0]!.sql.replace(/\s+/g, ' ')
    expect(sql).toContain(`SET "status" = 'PENDING'`)
    expect(sql).toContain(`"status" = 'QUEUED'`)
    expect(queries[0]!.values).toEqual(['log-9'])
  })

  it('maps claimed logs onto the queue job name and payload', () => {
    expect(
      buildWebhookJob({
        id: 'log-1',
        provider: 'intervals',
        eventType: 'wellness',
        payload: { x: 1 },
        headers: { h: 1 },
        query: { q: 1 },
        error: null
      })
    ).toEqual({
      queueJobName: 'intervals-webhook-bulk',
      jobData: {
        provider: 'intervals-bulk',
        type: 'wellness',
        payload: { x: 1 },
        headers: { h: 1 },
        query: { q: 1 },
        logId: 'log-1',
        appName: 'unknown',
        secretMatched: false
      }
    })

    expect(
      buildWebhookJob({
        id: 'log-2',
        provider: 'oauth-generic',
        eventType: 'oauth:withings',
        payload: null,
        headers: null,
        query: null,
        error: 'SECRET_MATCHED'
      })
    ).toEqual({
      queueJobName: 'oauth-webhook',
      jobData: {
        provider: 'oauth-generic',
        type: 'oauth:withings',
        payload: null,
        headers: null,
        query: null,
        logId: 'log-2',
        appName: 'withings',
        secretMatched: true
      }
    })

    expect(
      buildWebhookJob({
        id: 'log-3',
        provider: 'resend',
        eventType: null,
        payload: { type: 'email.delivered', data: { id: 'e1' }, created_at: '2026-01-01' },
        headers: null,
        query: null,
        error: null
      })
    ).toEqual({
      queueJobName: 'resend-webhook',
      jobData: {
        provider: 'resend',
        type: 'email.delivered',
        data: { id: 'e1' },
        createdAt: '2026-01-01',
        logId: 'log-3'
      }
    })
  })
})
