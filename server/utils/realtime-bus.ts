import { randomUUID } from 'node:crypto'
import IORedis from 'ioredis'
import { logRealtimeDisabled, logRealtimeEvent } from './realtime-logger'

type RealtimeEnvelope = {
  originInstanceId: string
  userId: string
  data: any
}

const REALTIME_CHANNEL_BASE = 'app:realtime'
const REDIS_URL = process.env.REDIS_URL
const INSTANCE_ID = process.env.HOSTNAME || randomUUID()

/**
 * Pub/sub channel namespacing.
 *
 * Redis pub/sub ignores the selected database index, so the per-worktree Redis
 * DB index does NOT isolate events: every dev server on this machine publishes
 * to the same channel and (because template-cloned dev databases share the same
 * seeded user id) delivers each other's events.
 *
 * Production must keep the historical, shared channel name: several app
 * containers form one logical instance and legitimately need to broadcast to
 * each other. So the namespace suffix is only applied for local dev servers
 * (`NODE_ENV === 'development'`, which is what `nuxt dev` sets and what the
 * production Dockerfile never sets — it pins `NODE_ENV=production`), or when
 * `REALTIME_CHANNEL_NAMESPACE` is set explicitly.
 *
 * Dev suffix is derived from values `bin/worktree-up.sh` already writes per
 * worktree (`REDIS_URL` database index + dev server port), so no change to the
 * worktree scripts is required.
 */
function resolveChannelNamespace(): string {
  const explicit = process.env.REALTIME_CHANNEL_NAMESPACE?.trim()
  if (explicit) return explicit

  if (process.env.NODE_ENV !== 'development') return ''

  const parts: string[] = ['dev']

  const redisPath = (process.env.REDIS_URL || '').split(/[?#]/)[0]
  const redisDb = redisPath?.match(/\/(\d+)$/)?.[1]
  if (redisDb) parts.push(`db${redisDb}`)

  const port = (process.env.NITRO_PORT || process.env.NUXT_PORT || process.env.PORT || '').trim()
  if (port) parts.push(`p${port}`)

  return parts.join('-')
}

const CHANNEL_NAMESPACE = resolveChannelNamespace()
const REALTIME_CHANNEL = CHANNEL_NAMESPACE
  ? `${REALTIME_CHANNEL_BASE}:${CHANNEL_NAMESPACE}`
  : REALTIME_CHANNEL_BASE

let publisher: IORedis | null = null
let subscriber: IORedis | null = null
let subscriberHandler: ((channel: string, payload: string) => void) | null = null
let subscriptionPromise: Promise<void> | null = null
let hasLoggedDisabled = false

export function isRealtimeBusEnabled() {
  return !!REDIS_URL && !process.env.NITRO_BUILD
}

function logDisabledOnce() {
  if (hasLoggedDisabled || isRealtimeBusEnabled()) return
  hasLoggedDisabled = true
  logRealtimeDisabled('REDIS_URL missing or Nitro build mode')
}

function createRedisClient(name: string) {
  if (!REDIS_URL) {
    throw new Error('REDIS_URL is not configured')
  }

  const client = new IORedis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null
  })

  client.on('error', (error) => {
    logRealtimeEvent('bus', `${name}_redis_error`, {
      message: error.message
    })
  })

  return client
}

async function ensureConnected(client: IORedis) {
  if (client.status === 'wait') {
    try {
      await client.connect()
    } catch (error) {
      client.disconnect()
      throw error
    }
  }
}

async function getPublisher() {
  if (!publisher) {
    publisher = createRedisClient('publisher')
  }

  await ensureConnected(publisher)
  return publisher
}

async function getSubscriber() {
  if (!subscriber) {
    subscriber = createRedisClient('subscriber')
  }

  await ensureConnected(subscriber)
  return subscriber
}

export async function publishRealtimeEvent(userId: string, data: any) {
  if (!isRealtimeBusEnabled()) {
    logDisabledOnce()
    return
  }

  try {
    const client = await getPublisher()
    const envelope: RealtimeEnvelope = {
      originInstanceId: INSTANCE_ID,
      userId,
      data
    }

    logRealtimeEvent(data?.channel || 'bus', 'publish', {
      userId,
      type: data?.type,
      reason: data?.event?.reason,
      entityType: data?.event?.entityType,
      entityId: data?.event?.entityId,
      runId: data?.runId
    })

    await client.publish(REALTIME_CHANNEL, JSON.stringify(envelope))
  } catch (error: any) {
    logRealtimeEvent(data?.channel || 'bus', 'publish_failed', {
      userId,
      type: data?.type,
      message: error?.message || String(error)
    })
  }
}

export async function startRealtimeSubscription(
  onEvent: (event: { userId: string; data: any }) => void
) {
  if (!isRealtimeBusEnabled()) {
    logDisabledOnce()
    return
  }

  if (subscriptionPromise) {
    return subscriptionPromise
  }

  subscriptionPromise = (async () => {
    const client = await getSubscriber()

    if (!subscriberHandler) {
      subscriberHandler = (channel: string, payload: string) => {
        if (channel !== REALTIME_CHANNEL) return

        try {
          const envelope = JSON.parse(payload) as RealtimeEnvelope
          if (!envelope?.userId || envelope.originInstanceId === INSTANCE_ID) {
            return
          }

          logRealtimeEvent(envelope.data?.channel || 'bus', 'receive', {
            userId: envelope.userId,
            type: envelope.data?.type,
            reason: envelope.data?.event?.reason,
            entityType: envelope.data?.event?.entityType,
            entityId: envelope.data?.event?.entityId,
            runId: envelope.data?.runId
          })

          onEvent({
            userId: envelope.userId,
            data: envelope.data
          })
        } catch {
          logRealtimeEvent('bus', 'receive_parse_failed')
        }
      }

      client.on('message', subscriberHandler)
    }

    await client.subscribe(REALTIME_CHANNEL)
  })().catch((error) => {
    subscriptionPromise = null
    logRealtimeEvent('bus', 'subscribe_failed', {
      message: error instanceof Error ? error.message : String(error)
    })
  })

  return subscriptionPromise
}

export async function stopRealtimeSubscription() {
  try {
    if (subscriber) {
      if (subscriberHandler) {
        subscriber.off('message', subscriberHandler)
        subscriberHandler = null
      }
      await subscriber.unsubscribe(REALTIME_CHANNEL).catch(() => null)
      await subscriber.quit().catch(() => subscriber?.disconnect())
      subscriber = null
    }

    if (publisher) {
      await publisher.quit().catch(() => publisher?.disconnect())
      publisher = null
    }
  } finally {
    subscriptionPromise = null
  }
}
