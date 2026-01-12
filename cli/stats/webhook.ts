import { Command } from 'commander'
import chalk from 'chalk'
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const webhookStatsCommand = new Command('webhook')

webhookStatsCommand
  .description('Show webhook statistics (Hourly vs Daily pivot)')
  .option('--prod', 'Use DATABASE_URL_PROD from .env')
  .action(async (options) => {
    const dbUrl = options.prod ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL

    if (!dbUrl) {
      console.error(chalk.red('Error: DATABASE_URL (or DATABASE_URL_PROD) is not set.'))
      process.exit(1)
    }

    console.log(chalk.blue(`Connecting to database...`))

    const pool = new pg.Pool({ connectionString: dbUrl })
    const adapter = new PrismaPg(pool)
    const prisma = new PrismaClient({ adapter })

    try {
      // Calculate start date (3 days ago at midnight)
      const now = new Date()
      const today = new Date(now)
      today.setHours(0, 0, 0, 0)

      const startDate = new Date(today)
      startDate.setDate(today.getDate() - 3)

      console.log(
        chalk.bold(`Fetching webhook stats since ${startDate.toLocaleDateString()}...
`)
      )

      // Fetch data
      const hourlyStats: any[] = await prisma.$queryRaw`
        SELECT
          date_trunc('hour', "createdAt") as hour,
          count(*)::int as count,
          count(*) FILTER (WHERE status = 'FAILED' OR status = 'ERROR')::int as failed_count
        FROM "WebhookLog"
        WHERE "createdAt" >= ${startDate}
        GROUP BY 1
        ORDER BY 1 ASC;
      `

      // Identify the 4 days we want to show
      const dates: string[] = []
      for (let i = 3; i >= 0; i--) {
        const d = new Date(today)
        d.setDate(today.getDate() - i)
        dates.push(d.toLocaleDateString())
      }

      // Initialize the pivot table data structure
      // Hour (00-23) -> { Date1: count, Date2: count, ... }
      const pivotData: Record<string, Record<string, string | number>> = {}

      for (let h = 0; h < 24; h++) {
        const hourStr = h.toString().padStart(2, '0') + ':00'
        pivotData[hourStr] = {}
        dates.forEach((date) => {
          pivotData[hourStr][date] = 0
        })
      }

      // Fill the pivot table
      hourlyStats.forEach((stat) => {
        const dateObj = new Date(stat.hour)
        const dateKey = dateObj.toLocaleDateString()
        const hourKey = dateObj.getHours().toString().padStart(2, '0') + ':00'

        if (pivotData[hourKey] && pivotData[hourKey][dateKey] !== undefined) {
          let val = stat.count.toString()
          if (stat.failed_count > 0) {
            val += ` (${stat.failed_count} err)`
          }
          pivotData[hourKey][dateKey] = val
        }
      })

      // Clean up empty hours for better readability if requested,
      // but usually a full grid is better for "comparing spikes"
      const tableRows = Object.entries(pivotData).map(([hour, row]) => {
        return {
          Hour: hour,
          ...row
        }
      })

      console.log(chalk.bold('Webhook Requests by Hour (Failed in Red)'))
      console.table(tableRows)

      // Summary
      const totalCount = hourlyStats.reduce((acc, curr) => acc + curr.count, 0)
      const totalFailed = hourlyStats.reduce((acc, curr) => acc + curr.failed_count, 0)

      console.log(chalk.bold('\nSummary (Last 3 Days + Today):'))
      console.log(`Total Events: ${totalCount}`)
      console.log(
        `Failed Events: ${totalFailed > 0 ? chalk.red(totalFailed) : chalk.green(totalFailed)}`
      )
      if (totalCount > 0) {
        console.log(`Error Rate: ${((totalFailed / totalCount) * 100).toFixed(2)}%`)
      }
    } catch (error: any) {
      console.error(chalk.red('Error fetching stats:'), error.message)
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })

export default webhookStatsCommand
