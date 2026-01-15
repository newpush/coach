import { Command } from 'commander'
import chalk from 'chalk'
import { pingQueue } from '../../server/utils/queue'
import { prisma } from '../../server/utils/db'

export const pingCommand = new Command('ping')
  .description('Add a test job to the ping queue')
  .action(async () => {
    try {
      console.log(chalk.blue('Sending ping job to pingQueue...'))

      const job = await pingQueue.add('ping', {
        provider: 'ping',
        type: 'TEST_PING',
        userId: 'system-ping',
        event: { timestamp: new Date().toISOString() },
        logId: null
      })

      console.log(chalk.green(`✔ Job added with ID: ${job.id}`))
      console.log(chalk.gray('Check the worker logs to see it processed.'))
    } catch (error: any) {
      console.error(chalk.red('Failed to add ping job:'), error)
    } finally {
      await pingQueue.close()
      await prisma.$disconnect()
      process.exit(0)
    }
  })
