import { Command } from 'commander'
import chalk from 'chalk'
import { pingQueue } from '../../server/utils/queue'
import { prisma } from '../../server/utils/db'

export const pingCommand = new Command('ping')
  .description('Add test jobs to the ping queue')
  .option('-c, --count <number>', 'Number of ping jobs to send', '100')
  .option('-p, --concurrency <number>', 'Number of concurrent job additions', '10')
  .action(async (options) => {
    const count = parseInt(options.count)
    const concurrency = parseInt(options.concurrency)

    try {
      console.log(
        chalk.blue(`Sending ${count} ping jobs to pingQueue (Concurrency: ${concurrency})...`)
      )

      let completed = 0
      const startTime = Date.now()

      const addJobs = async () => {
        while (completed < count) {
          const jobId = completed++
          await pingQueue.add('ping', {
            provider: 'ping',
            type: 'TEST_PING',
            userId: `system-ping-${jobId}`,
            event: { timestamp: new Date().toISOString(), index: jobId },
            logId: null
          })
          if (completed % 10 === 0 || completed === count) {
            process.stdout.write(chalk.gray(`\rProgress: ${completed}/${count}`))
          }
        }
      }

      // Run addition in parallel based on concurrency
      const workers = Array.from({ length: Math.min(concurrency, count) }, () => addJobs())
      await Promise.all(workers)

      const duration = ((Date.now() - startTime) / 1000).toFixed(2)
      console.log(chalk.green(`\n✔ ${count} jobs added in ${duration}s`))
      console.log(chalk.gray('Check the worker logs to see them processed.'))
    } catch (error: any) {
      console.error(chalk.red('\nFailed to add ping jobs:'), error)
    } finally {
      await pingQueue.close()
      await prisma.$disconnect()
      process.exit(0)
    }
  })
