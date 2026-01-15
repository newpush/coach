import { Command } from 'commander'
import chalk from 'chalk'
import { webhookQueue, pingQueue } from '../../server/utils/queue'
import { prisma } from '../../server/utils/db'

export const statusCommand = new Command('status')
  .description('Check the status of the webhook and ping queues')
  .action(async () => {
    try {
      console.log(chalk.blue.bold('Fetching Queue Status...'))

      // --- Webhook Queue ---
      const counts = await webhookQueue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
        'paused'
      )

      console.log(chalk.white.bold('\nWebhook Queue Metrics:'))
      console.log(`  ${chalk.cyan('Waiting:')}   ${counts.waiting}`)
      console.log(`  ${chalk.green('Active:')}    ${counts.active}`)
      console.log(`  ${chalk.blue('Completed:')} ${counts.completed}`)
      console.log(`  ${chalk.red('Failed:')}    ${counts.failed}`)
      console.log(`  ${chalk.yellow('Delayed:')}   ${counts.delayed}`)
      console.log(`  ${chalk.gray('Paused:')}    ${counts.paused}`)

      const workers = await webhookQueue.getWorkers()
      console.log(chalk.white.bold(`  Workers: ${workers.length}`))

      // --- Ping Queue ---
      const pingCounts = await pingQueue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
        'paused'
      )

      console.log(chalk.white.bold('\nPing Queue Metrics:'))
      console.log(`  ${chalk.cyan('Waiting:')}   ${pingCounts.waiting}`)
      console.log(`  ${chalk.green('Active:')}    ${pingCounts.active}`)
      console.log(`  ${chalk.blue('Completed:')} ${pingCounts.completed}`)
      console.log(`  ${chalk.red('Failed:')}    ${pingCounts.failed}`)
      console.log(`  ${chalk.yellow('Delayed:')}   ${pingCounts.delayed}`)
      console.log(`  ${chalk.gray('Paused:')}    ${pingCounts.paused}`)

      const pingWorkers = await pingQueue.getWorkers()
      console.log(chalk.white.bold(`  Workers: ${pingWorkers.length}`))
    } catch (error: any) {
      console.error(chalk.red('Failed to fetch queue status:'), error)
    } finally {
      await webhookQueue.close()
      await pingQueue.close()
      await prisma.$disconnect()
      process.exit(0)
    }
  })
