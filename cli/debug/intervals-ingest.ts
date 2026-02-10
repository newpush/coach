import { Command } from 'commander'
import chalk from 'chalk'
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import {
  fetchIntervalsActivity,
  normalizeIntervalsWorkout,
  fetchIntervalsWorkouts
} from '../../server/utils/intervals'

const intervalsIngestCommand = new Command('intervals-ingest')

intervalsIngestCommand
  .description('Debug ingestion of a specific Intervals.icu activity')
  .argument('<activityId>', 'The Intervals.icu activity ID (e.g. i124102207 or 124102207)')
  .option('--prod', 'Use production database')
  .option('--user <email>', 'User email to associate the activity with')
  .option('--dry-run', 'Do not save to database')
  .action(async (activityId, options) => {
    const isProd = options.prod
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
    const prisma = new PrismaClient({ adapter })

    try {
      if (!options.user) {
        console.error(
          chalk.red('--user <email> is required to fetch integration and associate data.')
        )
        process.exit(1)
      }

      console.log(chalk.gray(`Fetching user ${options.user}...`))
      const user = await prisma.user.findUnique({ where: { email: options.user } })
      if (!user) {
        console.error(chalk.red(`User not found: ${options.user}`))
        process.exit(1)
      }

      console.log(chalk.gray(`Fetching Intervals integration for ${user.email}...`))
      const integration = await prisma.integration.findFirst({
        where: {
          userId: user.id,
          provider: 'intervals'
        }
      })

      if (!integration) {
        console.error(chalk.red(`Intervals integration not found for user ${user.email}`))
        process.exit(1)
      }

      // Use the activityId as provided (e.g. i124102207)
      const targetId = activityId

      console.log(chalk.cyan(`\n--- Fetching Activity ${targetId} from Intervals.icu ---`))
      const activity = await fetchIntervalsActivity(integration as any, targetId)

      console.log(chalk.green(`✓ Successfully fetched: ${activity.name}`))
      console.log(chalk.gray(`Type: ${activity.type}`))
      console.log(chalk.gray(`Date: ${activity.start_date}`))

      console.log(chalk.cyan(`\n--- Normalizing Activity ---`))
      const normalized = normalizeIntervalsWorkout(activity, user.id)

      console.log(chalk.white(`Normalized Title: ${normalized.title}`))
      console.log(chalk.white(`Normalized Date:  ${normalized.date.toISOString()}`))
      console.log(chalk.white(`Normalized Type:  ${normalized.type}`))
      console.log(chalk.white(`Normalized TSS:   ${normalized.tss}`))

      if (options.dryRun) {
        console.log(chalk.yellow(`\nDry run: Skipping database save.`))
        console.log(chalk.gray('Normalized JSON:'))
        console.log(
          JSON.stringify(normalized, (key, value) => (key === 'rawJson' ? '[REDACTED]' : value), 2)
        )
      } else {
        console.log(chalk.cyan(`\n--- Saving to Database ---`))

        const existing = await prisma.workout.findFirst({
          where: {
            userId: user.id,
            source: 'intervals',
            externalId: String(activity.id)
          }
        })

        if (existing) {
          console.log(chalk.yellow(`Workout already exists (ID: ${existing.id}). Updating...`))
          await prisma.workout.update({
            where: { id: existing.id },
            data: {
              ...normalized,
              updatedAt: new Date()
            }
          })
          console.log(chalk.green('✓ Updated successfully.'))
        } else {
          console.log(chalk.blue('Creating new workout...'))
          const created = await prisma.workout.create({
            data: normalized
          })
          console.log(chalk.green(`✓ Created successfully (ID: ${created.id}).`))
        }
      }
    } catch (e: any) {
      console.error(chalk.red('Error:'), e)
      if (e.message.includes('401')) {
        console.log(
          chalk.yellow(
            '\nHint: The access token might be expired. Intervals.icu tokens usually last 1 hour for OAuth.'
          )
        )
      }
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })

const intervalsSearchCommand = new Command('intervals-search')
intervalsSearchCommand
  .description('Search for Intervals.icu activities for a user')
  .option('--prod', 'Use production database')
  .option('--user <email>', 'User email to search for')
  .option('--days <days>', 'Number of days to look back', '7')
  .action(async (options) => {
    const isProd = options.prod
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
    const prisma = new PrismaClient({ adapter })

    try {
      if (!options.user) {
        console.error(chalk.red('--user <email> is required.'))
        process.exit(1)
      }

      const user = await prisma.user.findUnique({ where: { email: options.user } })
      if (!user) {
        console.error(chalk.red(`User not found: ${options.user}`))
        process.exit(1)
      }

      const integration = await prisma.integration.findFirst({
        where: { userId: user.id, provider: 'intervals' }
      })

      if (!integration) {
        console.error(chalk.red(`Intervals integration not found for user ${user.email}`))
        process.exit(1)
      }

      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(endDate.getDate() - parseInt(options.days))

      console.log(
        chalk.cyan(
          `\n--- Searching Activities from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]} ---`
        )
      )
      const activities = await fetchIntervalsWorkouts(integration as any, startDate, endDate)

      console.log(chalk.white(`Found ${activities.length} activities:`))

      activities.forEach((a) => {
        console.log(
          `  - [${chalk.green(a.id)}] ${chalk.white(a.start_date_local)} | ${chalk.yellow(a.type.padEnd(10))} | ${a.name}`
        )
      })
    } catch (e: any) {
      console.error(chalk.red('Error:'), e)
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })

export { intervalsIngestCommand, intervalsSearchCommand }
