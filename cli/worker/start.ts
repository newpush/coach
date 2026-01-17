import type { Job } from 'bullmq'
import { Worker } from 'bullmq'
import IORedis from 'ioredis'
import chalk from 'chalk'
import { IntervalsService } from '../../server/utils/services/intervalsService'
import { logWebhookRequest, updateWebhookStatus } from '../../server/utils/webhook-logger'
import { prisma } from '../../server/utils/db'
import { webhookQueue, pingQueue } from '../../server/utils/queue'
import { Command } from 'commander'

export const startCommand = new Command('start')
  .description('Start the webhook worker')
  .action(async () => {
    const connectionString = process.env.REDIS_URL || 'redis://localhost:6379'

    console.log(chalk.blue.bold('Initializing Webhook Worker...'))
    console.log(chalk.gray(`Using REDIS_URL connection string`))

    const connection = new IORedis(connectionString, {
      maxRetriesPerRequest: null // Required by BullMQ
    })

    const concurrency = parseInt(process.env.CW_WORKER_QUEUE_WEBHOOK_CONCURRENCY || '1')

    // Redis Connection Logging
    connection.on('connect', () => {
      const options = connection.options
      const host = options.host
      const port = options.port
      const family = options.family
      const db = options.db
      const hasPassword = !!options.password
      const tls = !!options.tls

      console.log(chalk.green(`✔ Redis connected`))
      console.log(chalk.gray(`  Host: ${host}`))
      console.log(chalk.gray(`  Port: ${port}`))
      console.log(chalk.gray(`  Family: IPv${family}`))
      console.log(chalk.gray(`  Database: ${db}`))
      console.log(chalk.gray(`  TLS: ${tls ? 'Yes' : 'No'}`))
      console.log(chalk.gray(`  Password: ${hasPassword ? 'Yes' : 'No'}`))
    })
    connection.on('ready', () => console.log(chalk.green.bold('✔ Redis ready to accept commands')))
    connection.on('error', (err) => console.error(chalk.red.bold('✘ Redis connection error:'), err))
    connection.on('reconnecting', () => console.log(chalk.yellow('↻ Redis reconnecting...')))
    connection.on('end', () => console.log(chalk.red('Redis connection ended')))

    // --- Webhook Worker ---
    const webhookWorker = new Worker(
      'webhookQueue',
      async (job: Job) => {
        const { provider, type, userId, event, logId } = job.data

        // Handle bulk ingest jobs from the async API endpoint
        if (provider === 'intervals-bulk') {
          const { payload, headers } = job.data
          const events = payload.events || []

          console.log(
            chalk.cyan(`[BulkJob ${job.id}]`) +
              ` Processing bulk webhook payload with ${chalk.yellow(events.length)} events`
          )

          // Log raw request receipt in worker instead of API
          const log = await logWebhookRequest({
            provider: 'intervals',
            eventType: events[0]?.type || 'UNKNOWN',
            payload,
            headers,
            status: 'PENDING'
          })

          let queuedCount = 0
          for (const intervalEvent of events) {
            const { athlete_id, type: eventType } = intervalEvent
            if (!athlete_id) continue

            // Verify integration exists in worker instead of API
            const integration = await prisma.integration.findFirst({
              where: {
                provider: 'intervals',
                externalUserId: athlete_id.toString()
              }
            })

            if (!integration) {
              console.warn(`[BulkJob ${job.id}] No integration found for athlete_id: ${athlete_id}`)
              continue
            }

            // Enqueue individual event for standard processing
            await webhookQueue.add('intervals-webhook', {
              provider: 'intervals',
              type: eventType,
              userId: integration.userId,
              event: intervalEvent,
              logId: log?.id
            })
            queuedCount++
          }

          if (log) await updateWebhookStatus(log.id, 'QUEUED', `Queued ${queuedCount} events`)
          return { queuedCount }
        }

        console.log(
          chalk.cyan(`[WebhookJob ${job.id}]`) +
            ` Processing ${chalk.magenta(provider)}:${chalk.yellow(type)} for user ${chalk.blue(userId)}
`
        )

        try {
          if (provider === 'intervals') {
            const result = await IntervalsService.processWebhookEvent(userId, type, event)
            console.log(chalk.green(`[WebhookJob ${job.id}] Completed: ${result.message}`))

            if (logId) {
              await updateWebhookStatus(logId, 'PROCESSED')
            }
            return result
          } else {
            throw new Error(`Unknown provider: ${provider}`)
          }
        } catch (error: any) {
          console.error(chalk.red(`[WebhookJob ${job.id}] Failed:`), error)
          if (logId) {
            await updateWebhookStatus(logId, 'FAILED', error.message || 'Unknown error')
          }
          throw error
        }
      },
      { connection, concurrency }
    )

    webhookWorker.on('ready', () => {
      console.log(chalk.green.bold('🚀 Webhook Worker listening on "webhookQueue"'))
      console.log(chalk.white(`   Concurrency: ${chalk.yellow(concurrency)}`))
    })

    webhookWorker.on('failed', (job, err) => {
      console.log(chalk.red(`[WebhookJob ${job?.id}] has failed with: ${err?.message}`))
    })

    webhookWorker.on('error', (err) => {
      console.error(chalk.red.bold('Webhook Worker error:'), err)
    })

    // --- Ping Worker ---
    const pingWorker = new Worker(
      'pingQueue',
      async (job: Job) => {
        const { provider } = job.data
        console.log(
          chalk.cyan(`[PingJob ${job.id}]`) +
            ` Processing ping...
`
        )

        if (provider === 'ping') {
          console.log(chalk.green(`[PingJob ${job.id}] PONG! Ping received successfully.`))
          return { handled: true, message: 'PONG' }
        }
        throw new Error(`Unknown provider for ping queue: ${provider}`)
      },
      { connection, concurrency: 1 }
    )

    pingWorker.on('ready', () => {
      console.log(chalk.green.bold('🚀 Ping Worker listening on "pingQueue"'))
    })

    pingWorker.on('failed', (job, err) => {
      console.log(chalk.red(`[PingJob ${job?.id}] has failed with: ${err?.message}`))
    })

    pingWorker.on('error', (err) => {
      console.error(chalk.red.bold('Ping Worker error:'), err)
    })

    // Stats Reporter
    const statsInterval = setInterval(async () => {
      try {
        const counts = await webhookQueue.getJobCounts(
          'waiting',
          'active',
          'completed',
          'failed',
          'delayed'
        )
        const pingCounts = await pingQueue.getJobCounts('waiting', 'active', 'completed', 'failed')

        console.log(
          chalk.gray('[Stats] ') +
            chalk.bold('Webhook: ') +
            `W:${counts.waiting} A:${counts.active} C:${counts.completed} F:${counts.failed}` +
            chalk.gray(' | ') +
            chalk.bold('Ping: ') +
            `W:${pingCounts.waiting} A:${pingCounts.active} C:${pingCounts.completed} F:${pingCounts.failed}`
        )
      } catch (err) {
        console.error(chalk.red('Failed to fetch queue stats:'), err)
      }
    }, 30000) // Every 30 seconds

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(
        chalk.yellow(`
Received ${signal}. Shutting down workers...
`)
      )
      clearInterval(statsInterval)

      try {
        await Promise.all([webhookWorker.close(), pingWorker.close()])
        console.log(chalk.gray('Workers closed.'))

        await Promise.all([webhookQueue.close(), pingQueue.close()])
        console.log(chalk.gray('Queues closed.'))

        await connection.quit()
        console.log(chalk.gray('Redis connection closed.'))

        await prisma.$disconnect()
        console.log(chalk.gray('Prisma disconnected.'))

        process.exit(0)
      } catch (err) {
        console.error(chalk.red('Error during shutdown:'), err)
        process.exit(1)
      }
    }

    process.on('SIGINT', () => shutdown('SIGINT'))
    process.on('SIGTERM', () => shutdown('SIGTERM'))
  })
