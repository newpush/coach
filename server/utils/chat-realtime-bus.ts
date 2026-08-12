import { randomUUID } from 'node:crypto'
import IORedis from 'ioredis'

type ChatRealtimeEnvelope = {
  originInstanceId: string
  userId: string
  data: any
}

const CHAT_REALTIME_CHANNEL_BASE = 'chat:realtime'
const REDIS_URL = process.env.REDIS_URL
const INSTANCE_ID = process.env.HOSTNAME || randomUUID()

/**
 * Pub/sub channel namespacing — see the matching comment in `realtime-bus.ts`.
 *
 * Redis pub/sub ignores the per-worktree Redis database index, so without a
 * namespaced channel every dev server on this machine receives every other dev
 * server's events (template-cloned dev databases share the same seeded user id,
 * so the `userId` dispatch matches).
 *
 * Production keeps the historical shared channel name so multiple app
 * containers still broadcast to each other: the suffix is only applied for
 * local dev servers (`NODE_ENV === 'development'`) or when
 * `REALTIME_CHANNEL_NAMESPACE` is set explicitly.
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
const CHAT_REALTIME_CHANNEL = CHANNEL_NAMESPACE
  ? `${CHAT_REALTIME_CHANNEL_BASE}:${CHANNEL_NAMESPACE}`
  : CHAT_REALTIME_CHANNEL_BASE

let publisher: IORedis | null = null
let subscriber: IORedis | null = null
let subscriberHandler: ((channel: string, payload: string) => void) | null = null
let subscriptionPromise: Promise<void> | null = null

export function isChatRealtimeBusEnabled() {
  return !!REDIS_URL && !process.env.NITRO_BUILD
}

function createRedisClient(name: string) {
  if (!REDIS_URL) {
    throw new Error('REDIS_URL is not configured')
  }

  const client = new IORedis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    // Retry up to 5 times with exponential backoff capped at 10s
    retryStrategy: (times) => {
      if (times > 5) return null
      return Math.min(500 * 2 ** (times - 1), 10000)
    }
  })

  client.on('error', (error) => {
    if (!process.env.NITRO_BUILD) {
      console.warn(`[ChatRealtimeBus] ${name} redis error:`, error.message)
    }
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
  if (publisher?.status === 'end') {
    publisher = null
  }
  if (!publisher) {
    publisher = createRedisClient('publisher')
  }

  await ensureConnected(publisher)
  return publisher
}

async function getSubscriber() {
  if (subscriber?.status === 'end') {
    // Clear all subscriber state so the handler gets re-attached to the new client
    subscriptionPromise = null
    subscriberHandler = null
    subscriber = null
  }
  if (!subscriber) {
    subscriber = createRedisClient('subscriber')
  }

  await ensureConnected(subscriber)
  return subscriber
}

export async function publishChatRealtimeEvent(userId: string, data: any) {
  if (!isChatRealtimeBusEnabled()) {
    return
  }

  try {
    const client = await getPublisher()
    const envelope: ChatRealtimeEnvelope = {
      originInstanceId: INSTANCE_ID,
      userId,
      data
    }
    await client.publish(CHAT_REALTIME_CHANNEL, JSON.stringify(envelope))
  } catch (error: any) {
    console.warn('[ChatRealtimeBus] Failed to publish realtime event:', error?.message || error)
  }
}

export async function startChatRealtimeSubscription(
  onEvent: (event: { userId: string; data: any }) => void
) {
  if (!isChatRealtimeBusEnabled()) {
    return
  }

  if (subscriptionPromise) {
    return subscriptionPromise
  }

  subscriptionPromise = (async () => {
    const client = await getSubscriber()

    if (!subscriberHandler) {
      subscriberHandler = (channel: string, payload: string) => {
        if (channel !== CHAT_REALTIME_CHANNEL) return

        try {
          const envelope = JSON.parse(payload) as ChatRealtimeEnvelope
          if (!envelope?.userId || envelope.originInstanceId === INSTANCE_ID) {
            return
          }

          onEvent({
            userId: envelope.userId,
            data: envelope.data
          })
        } catch (error) {
          console.warn('[ChatRealtimeBus] Failed to parse realtime event payload')
        }
      }

      client.on('message', subscriberHandler)
    }

    await client.subscribe(CHAT_REALTIME_CHANNEL)
  })().catch((error) => {
    subscriptionPromise = null
    console.warn('[ChatRealtimeBus] Failed to subscribe:', error?.message || error)
  })

  return subscriptionPromise
}

export async function stopChatRealtimeSubscription() {
  try {
    if (subscriber) {
      if (subscriberHandler) {
        subscriber.off('message', subscriberHandler)
        subscriberHandler = null
      }
      await subscriber.unsubscribe(CHAT_REALTIME_CHANNEL).catch(() => null)
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
