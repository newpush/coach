import { Queue } from 'bullmq'
import IORedis from 'ioredis'

// Connection configuration for DragonflyDB/Redis
const connectionString = process.env.REDIS_URL || 'redis://localhost:6379'

// Create a Redis connection instance
const connection = new IORedis(connectionString, {
  maxRetriesPerRequest: null // Required by BullMQ
})

export const webhookQueue = new Queue('webhookQueue', { connection })
export const pingQueue = new Queue('pingQueue', { connection })
