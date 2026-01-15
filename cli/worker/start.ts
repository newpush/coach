import type { Job } from 'bullmq'
import { Worker } from 'bullmq'
import IORedis from 'ioredis'
import chalk from 'chalk'
import { IntervalsService } from '../../server/utils/services/intervalsService'
import { updateWebhookStatus } from '../../server/utils/webhook-logger'
import { prisma } from '../../server/utils/db'
import { webhookQueue, pingQueue } from '../../server/utils/queue'
import { Command } from 'commander'

export const startCommand = new Command('start')
  .description('Start the webhook worker')
  .action(async () => {
    const connectionString = process.env.REDIS_URL

    console.log(chalk.blue.bold('Initializing Webhook Worker...'))
    if (connectionString) {
      console.log(chalk.gray(`Using REDIS_URL connection string`))
    } else {
      console.log(chalk.gray(`Using individual Redis host/port settings`))
    }

    const connection = connectionString
      ? new IORedis(connectionString, { maxRetriesPerRequest: null })
      : new IORedis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD || undefined,
          maxRetriesPerRequest: null
        })

    const concurrency = parseInt(process.env.CW_WORKER_QUEUE_WEBHOOK_CONCURRENCY || '1')

    // Redis Connection Logging
    connection.on('connect', () => {
      const host = connection.options.host || 'localhost'
      const port = connection.options.port || '6379'
      const hasPassword = !!connection.options.password
      console.log(
        chalk.green(`✔ Redis connected `) +
          chalk.gray(`(${host}:${port}${hasPassword ? ' with password' : ''})
`)
      )
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
