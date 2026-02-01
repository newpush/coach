import { Command } from 'commander'
import chalk from 'chalk'
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import {
  startOfYesterday,
  endOfYesterday,
  startOfToday,
  endOfToday,
  getHours,
  format
} from 'date-fns'

const growthCommand = new Command('growth')
  .description('Show new users per hour for today vs yesterday')
  .option('--prod', 'Use production database')
  .action(async (options) => {
    const isProd = options.prod
    const connectionString = isProd ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL

    if (isProd) {
      console.log(chalk.yellow('⚠️  Using PRODUCTION database.'))
    } else {
      console.log(chalk.blue('Using DEVELOPMENT database.'))
    }

    if (!connectionString) {
      console.error(chalk.red('Error: Database connection string is not defined.'))
      if (isProd) {
        console.error(chalk.red('Make sure DATABASE_URL_PROD is set in .env'))
      } else {
        console.error(chalk.red('Make sure DATABASE_URL is set in .env'))
      }
      process.exit(1)
    }

    const pool = new pg.Pool({ connectionString })
    const adapter = new PrismaPg(pool)
    const prisma = new PrismaClient({ adapter })

    try {
      console.log(chalk.blue('Fetching user growth stats...'))

      const yesterdayStart = startOfYesterday()
      const yesterdayEnd = endOfYesterday()
      const todayStart = startOfToday()
      const todayEnd = endOfToday()

      // Fetch users created yesterday
      const usersYesterday = await prisma.user.findMany({
        where: {
          createdAt: {
            gte: yesterdayStart,
            lte: yesterdayEnd
          }
        },
        select: {
          createdAt: true
        }
      })

      // Fetch users created today
      const usersToday = await prisma.user.findMany({
        where: {
          createdAt: {
            gte: todayStart,
            lte: todayEnd
          }
        },
        select: {
          createdAt: true
        }
      })

      // Bucket by hour (0-23)
      const hourlyStats: Record<number, { yesterday: number; today: number }> = {}

      for (let i = 0; i < 24; i++) {
        hourlyStats[i] = { yesterday: 0, today: 0 }
      }

      usersYesterday.forEach((u) => {
        const hour = getHours(u.createdAt)
        if (hourlyStats[hour]) {
          hourlyStats[hour].yesterday++
        }
      })

      usersToday.forEach((u) => {
        const hour = getHours(u.createdAt)
        if (hourlyStats[hour]) {
          hourlyStats[hour].today++
        }
      })

      // Prepare table data
      const tableData = Object.keys(hourlyStats).map((hourKey) => {
        const hour = parseInt(hourKey)
        const hourLabel = `${hour.toString().padStart(2, '0')}:00`
        const yesterdayCount = hourlyStats[hour].yesterday
        const todayCount = hourlyStats[hour].today

        let diffStr = ''
        const diff = todayCount - yesterdayCount
        if (diff > 0) {
          diffStr = chalk.green(`+${diff}`)
        } else if (diff < 0) {
          diffStr = chalk.red(`${diff}`)
        } else {
          diffStr = chalk.gray('=')
        }

        return {
          Hour: hourLabel,
          Yesterday: yesterdayCount,
          Today: todayCount,
          Diff: diffStr
        }
      })

      // Filter rows to show only up to current hour for today?
      // Or just show all 24 hours (today's future hours will be 0)
      // Showing all 24 hours is fine, maybe stop at current hour for cleaner view?
      // But user asked for "today and yesterday as a comparison", so usually side-by-side.

      console.log(chalk.bold(`\nNew Users Per Hour (Local Time)`))
      console.log(
        `Yesterday: ${format(yesterdayStart, 'yyyy-MM-dd')} | Total: ${usersYesterday.length}`
      )
      console.log(`Today:     ${format(todayStart, 'yyyy-MM-dd')} | Total: ${usersToday.length}`)
      console.log('')

      // Use console.table but we need to handle the colored strings manually if console.table supports it (it usually prints ANSI codes literally in some envs, but commander/node usually handles it ok).
      // Actually standard console.table might mess up column width with ANSI codes.
      // Let's print a custom formatted table or just try console.table first.

      // Simple custom table for better control
      console.log('Hour  | Yesterday | Today | Diff')
      console.log('------+-----------+-------+-----')
      const currentHour = getHours(new Date())
      tableData.forEach((row) => {
        const hour = parseInt(row.Hour)
        const isFuture = hour > currentHour

        if (!isFuture || row.Yesterday > 0) {
          const todayDisplay = isFuture ? '-' : row.Today.toString()
          const diffDisplay = isFuture ? '-' : row.Diff
          console.log(
            `${row.Hour} | ${row.Yesterday.toString().padStart(9)} | ${todayDisplay.padStart(5)} | ${diffDisplay}`
          )
        }
      })
    } catch (e: any) {
      console.error(chalk.red('Error fetching growth stats:'), e.message)
      process.exit(1)
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })

export default growthCommand
