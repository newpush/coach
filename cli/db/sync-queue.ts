import { Command } from 'commander'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import chalk from 'chalk'

const syncQueueCommand = new Command('sync-queue-stats')
  .description('Show statistics for the SyncQueue table')
  .option('--prod', 'Use production database')
  .action(async (options) => {
    // Check if --prod flag is used
    if (options.prod) {
      console.log(chalk.yellow('⚠️  Running against PRODUCTION database'))
      if (!process.env.DATABASE_URL_PROD) {
        console.error(chalk.red('Error: DATABASE_URL_PROD environment variable is not set.'))
        process.exit(1)
      }
      process.env.DATABASE_URL = process.env.DATABASE_URL_PROD
    } else {
      console.log(chalk.blue('Running against LOCAL database'))
    }

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    const adapter = new PrismaPg(pool)
    const prisma = new PrismaClient({ adapter })

    try {
      console.log(chalk.gray('Connecting to database...'))

      // Get counts grouped by status
      const statusCounts = await prisma.syncQueue.groupBy({
        by: ['status'],
        _count: {
          id: true
        }
      })

      // Get total count
      const totalCount = await prisma.syncQueue.count()

      console.log('\n' + chalk.bold.underline('SyncQueue Statistics'))
      console.log(chalk.white(`Total Records: ${chalk.cyan(totalCount)}`))

      if (statusCounts.length > 0) {
        console.log('\n' + chalk.bold('By Status:'))
        statusCounts.forEach((group) => {
          let color = chalk.white
          if (group.status === 'COMPLETED') color = chalk.green
          else if (group.status === 'FAILED') color = chalk.red
          else if (group.status === 'PENDING') color = chalk.yellow
          else if (group.status === 'PROCESSING') color = chalk.blue

          console.log(`${color(group.status.padEnd(12))}: ${group._count.id}`)
        })
      } else {
        console.log(chalk.gray('\nNo records found grouped by status.'))
      }

      // Get counts grouped by operation
      const operationCounts = await prisma.syncQueue.groupBy({
        by: ['operation'],
        _count: {
          id: true
        }
      })

      if (operationCounts.length > 0) {
        console.log('\n' + chalk.bold('By Operation:'))
        operationCounts.forEach((group) => {
          console.log(`${chalk.white(group.operation.padEnd(12))}: ${group._count.id}`)
        })
      }

      // Get counts grouped by entityType
      const entityCounts = await prisma.syncQueue.groupBy({
        by: ['entityType'],
        _count: {
          id: true
        }
      })

      if (entityCounts.length > 0) {
        console.log('\n' + chalk.bold('By Entity Type:'))
        entityCounts.forEach((group) => {
          console.log(`${chalk.white(group.entityType.padEnd(15))}: ${group._count.id}`)
        })
      }

      // Check for stuck pending items (older than 1 hour)
      const stuckPending = await prisma.syncQueue.count({
        where: {
          status: 'PENDING',
          createdAt: {
            lt: new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
          }
        }
      })

      if (stuckPending > 0) {
        console.log(
          '\n' + chalk.yellow(`⚠️  Found ${stuckPending} PENDING items older than 1 hour.`)
        )
      }
    } catch (error) {
      console.error(chalk.red('Error fetching SyncQueue stats:'), error)
    } finally {
      await prisma.$disconnect()
    }
  })

export default syncQueueCommand
