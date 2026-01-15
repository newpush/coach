import { Queue } from 'bullmq'
import IORedis from 'ioredis'

// Connection configuration for DragonflyDB/Redis
const redisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null // Required by BullMQ
}

const connectionString = process.env.REDIS_URL

// Create a Redis connection instance
const connection = connectionString
  ? new IORedis(connectionString, { maxRetriesPerRequest: null })
  : new IORedis(redisOptions)

export const webhookQueue = new Queue('webhookQueue', { connection })
export const pingQueue = new Queue('pingQueue', { connection })
