import { Command } from 'commander'
import chalk from 'chalk'
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { subDays, startOfDay, endOfDay, format } from 'date-fns'

const statsCommand = new Command('stats')
  .description('Show user statistics including LLM usage and activity')
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
      console.log(chalk.blue('Fetching statistics...'))

      // 1. Total Users
      const totalUsers = await prisma.user.count()
      console.log(
        chalk.bold(`
Total Users: ${chalk.white(totalUsers)}`)
      )

      // 2. Users with new activities (last 7 days)
      const sevenDaysAgo = startOfDay(subDays(new Date(), 6)) // 7 days including today
      const usersWithActivities = await prisma.workout.findMany({
        where: {
          createdAt: {
            gte: sevenDaysAgo
          }
        },
        distinct: ['userId'],
        select: {
          userId: true
        }
      })
      console.log(
        chalk.bold(
          `Users with new activities (last 7 days): ${chalk.green(usersWithActivities.length)}`
        )
      )

      // 3. Users who did LLM calls per day (last 7 days)
      console.log(chalk.bold('\nDaily Stats - Last 7 Days:'))

      const tableData: Record<string, any> = {}

      // Iterate from 6 days ago to today (0)
      for (let i = 6; i >= 0; i--) {
        const date = subDays(new Date(), i)
        const start = startOfDay(date)
        const end = endOfDay(date)
        const dateStr = format(date, 'yyyy-MM-dd')
        const dayName = format(date, 'EEEE') // Monday, Tuesday...

        const activeUsers = await prisma.llmUsage.findMany({
          where: {
            createdAt: {
              gte: start,
              lte: end
            }
          },
          distinct: ['userId'],
          select: {
            userId: true
          }
        })

        const newRegistrations = await prisma.user.count({
          where: {
            createdAt: {
              gte: start,
              lte: end
            }
          }
        })

        const totalUsersAtDate = await prisma.user.count({
          where: {
            createdAt: {
              lte: end
            }
          }
        })

        const activePercent =
          totalUsersAtDate > 0
            ? ((activeUsers.length / totalUsersAtDate) * 100).toFixed(1) + '%'
            : '0%'

        tableData[dateStr] = {
          Day: dayName,
          'Active Users (LLM)': activeUsers.length,
          'New Users': newRegistrations,
          'Total Users': totalUsersAtDate,
          'Active %': activePercent
        }
      }

      console.table(tableData)
    } catch (e: any) {
      console.error(chalk.red('Error fetching stats:'), e.message)
      process.exit(1)
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })

export default statsCommand
