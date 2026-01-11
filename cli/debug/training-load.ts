import { Command } from 'commander'
import chalk from 'chalk'
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import {
  calculatePMCForDateRange,
  getInitialPMCValues,
  getCurrentFitnessSummary
} from '../../server/utils/training-stress'

const trainingLoadCommand = new Command('training-load')

trainingLoadCommand
  .description('Debug training load metrics (CTL/ATL/TSB) discrepancies')
  .argument('<email_or_id>', 'User Email or UUID')
  .option('--prod', 'Use production database')
  .option('--days <days>', 'Number of days to analyze', '7')
  .action(async (identifier, options) => {
    const isProd = options.prod
    const days = parseInt(options.days)
    const connectionString = isProd ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL

    if (isProd) {
      if (!connectionString) {
        console.error(chalk.red('DATABASE_URL_PROD is not defined.'))
        process.exit(1)
      }
      console.log(chalk.yellow('Using PRODUCTION database.'))
    } else {
      console.log(chalk.blue('Using DEVELOPMENT database.'))
    }

    const pool = new pg.Pool({ connectionString })
    const adapter = new PrismaPg(pool)

    // Hack: We need to ensure the utils use *our* prisma instance or connection.
    if (isProd) {
      process.env.DATABASE_URL = connectionString
    }

    // Now we can import the client that the utils use
    const { prisma } = await import('../../server/utils/db')

    try {
      console.log(chalk.gray(`Fetching training load data for: ${identifier}...`))

      // Resolve User
      let user = await prisma.user.findUnique({
        where: { id: identifier }
      })

      if (!user) {
        user = await prisma.user.findUnique({
          where: { email: identifier }
        })
      }

      if (!user) {
        console.error(chalk.red(`User not found: ${identifier}`))
        process.exit(1)
      }

      const userId = user.id
      console.log(`User: ${chalk.white(user.email)} (${user.id})`)

      // 1. Current Fitness Summary (Dashboard Logic)
      console.log(chalk.bold.cyan('\n=== 1. Dashboard Summary (getCurrentFitnessSummary) ==='))
      const summary = await getCurrentFitnessSummary(userId)
      console.log(
        `Last Updated: ${summary.lastUpdated ? summary.lastUpdated.toISOString() : 'N/A'}`
      )
      console.log(`CTL: ${chalk.green(summary.ctl.toFixed(1))}`)
      console.log(`ATL: ${chalk.yellow(summary.atl.toFixed(1))}`)
      console.log(`TSB: ${chalk.blue(summary.tsb.toFixed(1))}`)

      // 2. Latest DB Records
      console.log(chalk.bold.cyan('\n=== 2. Latest DB Records ==='))

      const latestWellness = await prisma.wellness.findFirst({
        where: { userId },
        orderBy: { date: 'desc' }
      })
      console.log(chalk.bold('Latest Wellness:'))
      if (latestWellness) {
        console.log(`  Date: ${latestWellness.date.toISOString().split('T')[0]}`)
        console.log(`  CTL:  ${latestWellness.ctl} | ATL: ${latestWellness.atl}`)
      } else {
        console.log('  None')
      }

      const latestWorkout = await prisma.workout.findFirst({
        where: { userId, isDuplicate: false, ctl: { not: null } },
        orderBy: { date: 'desc' }
      })
      console.log(chalk.bold('Latest Workout:'))
      if (latestWorkout) {
        console.log(`  Date: ${latestWorkout.date.toISOString().split('T')[0]}`)
        console.log(`  Title: ${latestWorkout.title}`)
        console.log(`  CTL:  ${latestWorkout.ctl} | ATL: ${latestWorkout.atl}`)
      } else {
        console.log('  None')
      }

      // 3. Chart Calculation Logic (calculatePMCForDateRange)
      console.log(chalk.bold.cyan(`\n=== 3. Chart Calculation (Last ${days} Days) ===`))

      const endDate = new Date()
      // Extend end date to include "tomorrow" if summary is ahead, mirroring API logic
      if (summary.lastUpdated && new Date(summary.lastUpdated) > endDate) {
        const lastUpdate = new Date(summary.lastUpdated)
        const maxDate = new Date()
        maxDate.setDate(maxDate.getDate() + 2)
        if (lastUpdate < maxDate) {
          endDate.setTime(lastUpdate.getTime())
        }
      }
      // Force end of day as per recent fix
      endDate.setHours(23, 59, 59, 999)

      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)
      startDate.setHours(0, 0, 0, 0)

      console.log(
        `Range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`
      )

      // Step 3a: Initial Values
      const initialValues = await getInitialPMCValues(userId, startDate)
      console.log(`Initial Values (Pre-${startDate.toISOString().split('T')[0]}):`)
      console.log(`  CTL: ${initialValues.ctl.toFixed(2)} | ATL: ${initialValues.atl.toFixed(2)}`)

      // Step 3b: Run Calculation
      const pmcData = await calculatePMCForDateRange(
        startDate,
        endDate,
        userId,
        initialValues.ctl,
        initialValues.atl
      )

      console.log(chalk.bold('\nDaily Chart Data:'))
      console.log(chalk.gray('Date       | TSS | Chart CTL | Chart ATL | Chart TSB | Source?'))
      console.log(chalk.gray('-----------|-----|-----------|-----------|-----------|--------'))

      // Fetch wellness for comparison
      const rangeWellness = await prisma.wellness.findMany({
        where: { userId, date: { gte: startDate, lte: endDate } },
        select: { date: true, ctl: true, atl: true }
      })
      const wellnessMap = new Map(rangeWellness.map((w) => [w.date.toISOString().split('T')[0], w]))

      for (const day of pmcData) {
        const dateKey = day.date.toISOString().split('T')[0]
        const w = wellnessMap.get(dateKey)

        let sourceInfo = ''
        if (w && w.ctl !== null) {
          const match = Math.abs(w.ctl - day.ctl) < 0.1 && Math.abs(w.atl - day.atl) < 0.1
          sourceInfo = match
            ? chalk.green('Matches Wellness')
            : chalk.red(`Mismatch (Well: ${w.ctl?.toFixed(1)})`)
        } else {
          sourceInfo = chalk.gray('Calculated')
        }

        console.log(
          `${dateKey} | ` +
            `${day.tss.toFixed(0).padStart(3)} | ` +
            `${day.ctl.toFixed(1).padStart(9)} | ` +
            `${day.atl.toFixed(1).padStart(9)} | ` +
            `${day.tsb.toFixed(1).padStart(9)} | ` +
            sourceInfo
        )
      }
    } catch (e: any) {
      console.error(chalk.red('Error:'), e)
    } finally {
      await prisma.$disconnect()
    }
  })

export default trainingLoadCommand
