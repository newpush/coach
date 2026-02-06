import { Command } from 'commander'
import chalk from 'chalk'
import 'dotenv/config'
import { subDays, format } from 'date-fns'

const syncCommand = new Command('sync')
  .description('Force sync wellness data from an external provider')
  .option('--prod', 'Use production database')
  .option('--user <email>', 'User email')
  .option('--provider <source>', 'Provider (intervals, oura)', 'intervals')
  .option('--days <number>', 'Number of days to sync', '14')
  .action(async (options) => {
    const isProd = options.prod
    const connectionString = isProd ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL

    if (!connectionString) {
      console.error(chalk.red('Database connection string not found.'))
      process.exit(1)
    }

    if (isProd) {
      console.log(chalk.yellow('⚠️  Using PRODUCTION database.'))
      process.env.DATABASE_URL = connectionString
    } else {
      console.log(chalk.blue('Using DEVELOPMENT database.'))
    }

    const { prisma } = await import('../../../server/utils/db')

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
      const endDate = new Date()

      console.log(chalk.cyan(`\n=== Syncing Wellness for ${user.email} (${options.provider}) ===`))
      console.log(
        chalk.gray(`Range: ${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}`)
      )

      if (options.provider === 'intervals') {
        const { IntervalsService } = await import('../../../server/utils/services/intervalsService')
        const count = await IntervalsService.syncWellness(user.id, startDate, endDate)
        console.log(chalk.green(`✓ Successfully synced ${count} days from Intervals.icu`))
      } else if (options.provider === 'oura') {
        const { OuraService } = await import('../../../server/utils/services/ouraService')
        // OuraService.syncDay syncs one day at a time
        for (let i = 0; i <= days; i++) {
          const date = subDays(new Date(), i)
          process.stdout.write(`  Syncing ${format(date, 'yyyy-MM-dd')}...`)
          await OuraService.syncDay(user.id, date)
          process.stdout.write(chalk.green(' OK\n'))
        }
        console.log(chalk.green(`✓ Successfully synced ${days + 1} days from Oura`))
      } else {
        console.error(chalk.red(`Unsupported provider: ${options.provider}`))
      }
    } catch (e: any) {
      console.error(chalk.red('Error:'), e.message)
    } finally {
      await prisma.$disconnect()
    }
  })

export default syncCommand
