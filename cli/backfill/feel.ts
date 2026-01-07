import { Command } from 'commander'
import chalk from 'chalk'
import { PrismaClient, Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { normalizeIntervalsWorkout } from '../../server/utils/intervals'

const backfillFeelCommand = new Command('feel')

backfillFeelCommand
  .description('Fix feel values in Workouts from rawJson (invert Intervals 1-5 scale)')
  .option('--prod', 'Use production database')
  .option('--dry-run', 'Run without saving changes', false)
  .option('--limit <number>', 'Limit the number of records to process', '100000')
  .action(async (options) => {
    const isProd = options.prod
    const isDryRun = options.dryRun
    const limit = parseInt(options.limit)

    const connectionString = isProd ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL

    if (isProd) {
      if (!connectionString) {
        console.error(chalk.red('DATABASE_URL_PROD is not defined.'))
        process.exit(1)
      }
      console.log(chalk.yellow('⚠️  Using PRODUCTION database.'))
    } else {
      console.log(chalk.blue('Using DEVELOPMENT database.'))
    }

    if (isDryRun) {
      console.log(chalk.cyan('🔍 DRY RUN mode enabled. No changes will be saved.'))
    }

    const pool = new pg.Pool({ connectionString })
    const adapter = new PrismaPg(pool)
    const prisma = new PrismaClient({ adapter })

    try {
      console.log(chalk.gray('Fetching Workouts with feel values...'))

      // Find workouts with feel value set and rawJson available
      const workouts = await prisma.workout.findMany({
        where: {
          source: 'intervals',
          feel: { not: null },
          rawJson: { not: Prisma.JsonNull }
        },
        take: limit,
        orderBy: { date: 'desc' }
      })

      console.log(chalk.gray(`Found ${workouts.length} workouts to process.`))

      let processedCount = 0
      let fixedCount = 0
      let skippedCount = 0

      for (const workout of workouts) {
        processedCount++

        const raw = workout.rawJson as any
        if (!raw) {
          skippedCount++
          continue
        }

        // Re-normalize using the UPDATED logic in server/utils/intervals.ts
        // which now contains: feel: activity.feel ? 6 - activity.feel : null
        const normalized = normalizeIntervalsWorkout(raw, workout.userId)

        // Check if feel changed
        // normalized.feel should be (6 - raw.feel)
        // workout.feel is the current DB value
        if (normalized.feel !== workout.feel) {
          if (isDryRun) {
            console.log(
              chalk.green(
                `[DRY RUN] Would update ${workout.source} workout "${workout.title}" (${workout.date.toISOString().split('T')[0]})`
              )
            )
            console.log(
              chalk.gray(
                `  Raw Feel: ${raw.feel} | Current DB: ${workout.feel} -> New DB: ${normalized.feel}`
              )
            )
          } else {
            await prisma.workout.update({
              where: { id: workout.id },
              data: {
                feel: normalized.feel
              }
            })
            if (fixedCount % 50 === 0) {
              process.stdout.write('.')
            }
          }
          fixedCount++
        } else {
          skippedCount++
        }
      }

      console.log('\n')
      console.log(chalk.bold('Summary:'))
      console.log(`Total Processed: ${processedCount}`)
      console.log(`Fixed:           ${fixedCount}`)
      console.log(`Skipped:         ${skippedCount}`)

      if (isDryRun) {
        console.log(chalk.cyan('\nRun without --dry-run to apply changes.'))
      }
    } catch (e: any) {
      console.error(chalk.red('Error:'), e)
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })

export default backfillFeelCommand
