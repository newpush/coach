import { Command } from 'commander'
import chalk from 'chalk'
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { subDays, format } from 'date-fns'

const tableCommand = new Command('table')
  .description('Show wellness data for a user in a table for the past N days')
  .option('--prod', 'Use production database')
  .option('--user <email>', 'User email')
  .option('--days <number>', 'Number of days to show', '14')
  .action(async (options) => {
    const isProd = options.prod
    const connectionString = isProd ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL

    if (!connectionString) {
      console.error(chalk.red('Database connection string not found.'))
      process.exit(1)
    }

    const pool = new pg.Pool({ connectionString })
    const adapter = new PrismaPg(pool)
    const prisma = new PrismaClient({ adapter })

    try {
      const user = await prisma.user.findUnique({
        where: { email: options.user }
      })

      if (!user) {
        console.error(chalk.red(`User not found: ${options.user}`))
        process.exit(1)
      }

      const days = parseInt(options.days)
      const startDate = subDays(new Date(), days)

      console.log(
        chalk.cyan(`
=== Wellness Data for ${user.name || user.email} (Last ${days} days) ===`)
      )

      const records = await prisma.wellness.findMany({
        where: {
          userId: user.id,
          date: { gte: startDate }
        },
        orderBy: { date: 'desc' }
      })

      if (records.length === 0) {
        console.log(chalk.yellow('No wellness records found for this period.'))
        return
      }

      const tableData = records.map((w) => ({
        Date: format(w.date, 'yyyy-MM-dd'),
        HRV: w.hrv ?? '-',
        RHR: w.restingHr ?? '-',
        SpO2: w.spO2 ? `${w.spO2}%` : '-',
        Stress: w.stress ?? '-',
        Weight: w.weight ? `${w.weight}kg` : '-',
        Readiness: w.readiness ?? '-',
        Sleep: w.sleepHours ? `${w.sleepHours}h` : '-',
        Source: w.lastSource || 'unknown'
      }))

      console.table(tableData)
    } catch (e: any) {
      console.error(chalk.red('Error:'), e.message)
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })

export default tableCommand
