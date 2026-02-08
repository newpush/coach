import { Command } from 'commander'
import chalk from 'chalk'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

export const listBugsCommand = new Command('list')
  .description('List bug reports')
  .option('--all', 'Show all bug reports including closed/resolved', false)
  .option('--limit <number>', 'Limit the number of reports shown', '10')
  .option('--prod', 'Use production database')
  .action(async (options) => {
    const isProd = options.prod
    const limit = parseInt(options.limit)
    const showAll = options.all

    // Database connection logic
    const connectionString = isProd ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL

    if (!connectionString) {
      console.error(chalk.red('Error: Database connection string is not defined.'))
      process.exit(1)
    }

    if (isProd) {
      console.log(chalk.yellow('⚠️  Using PRODUCTION database.'))
    }

    const pool = new pg.Pool({ connectionString })
    const adapter = new PrismaPg(pool)
    const prisma = new PrismaClient({ adapter })

    try {
      const where = showAll
        ? {}
        : {
            status: {
              in: ['OPEN', 'IN_PROGRESS']
            }
          }

      const reports = await prisma.bugReport.findMany({
        where,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { email: true }
          }
        }
      })

      if (reports.length === 0) {
        console.log(chalk.yellow('No bug reports found.'))
      } else {
        console.table(
          reports.map((r) => ({
            ID: r.id.substring(0, 8) + '...',
            Status: r.status,
            Title: r.title.length > 50 ? r.title.substring(0, 47) + '...' : r.title,
            User: r.user.email,
            Created: r.createdAt.toISOString().split('T')[0]
          }))
        )
      }
    } catch (error) {
      console.error(chalk.red('Error fetching bug reports:'), error)
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })
