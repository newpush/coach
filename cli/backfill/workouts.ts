import { Command } from 'commander'
import chalk from 'chalk'
import { PrismaClient, Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { normalizeIntervalsWorkout } from '../../server/utils/intervals'
import { normalizeStravaActivity } from '../../server/utils/strava'

const backfillWorkoutsCommand = new Command('workouts')

backfillWorkoutsCommand
  .description('Fix invalid intensity values in Workouts from rawJson')
  .option('--prod', 'Use production database')
  .option('--dry-run', 'Run without saving changes', false)
  .option('--limit <number>', 'Limit the number of records to process', '1000')
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
      console.log(chalk.gray('Fetching Workouts with invalid intensity (> 2.0)...'))

      // Find workouts with intensity > 2.0
      const workouts = await prisma.workout.findMany({
        where: {
          intensity: { gt: 2.0 },
          rawJson: { not: Prisma.JsonNull }
        },
        take: limit
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

        let normalized: any
        if (workout.source === 'intervals') {
          normalized = normalizeIntervalsWorkout(raw, workout.userId)
        } else if (workout.source === 'strava') {
          normalized = normalizeStravaActivity(raw, workout.userId)

          // If Strava normalization returns null for intensity, we might want to
          // apply a custom fix if we can derive it from raw data
          if (normalized.intensity === null && workout.intensity > 2.0) {
            // Custom fix for Strava: if intensity is huge, it's probably wrong.
            // If we have FTP and watts, we could recalculate, but for now
            // let's just clear it if it's clearly invalid (> 2.0)
            normalized.intensity = null
          }
        } else {
          skippedCount++
          continue
        }

        // Check if intensity changed
        if (normalized.intensity !== workout.intensity) {
          if (isDryRun) {
            console.log(
              chalk.green(
                `[DRY RUN] Would update ${workout.source} workout "${workout.title}" (${workout.date.toISOString().split('T')[0]})`
              )
            )
            console.log(chalk.gray(`  Intensity: ${workout.intensity} -> ${normalized.intensity}`))
          } else {
            await prisma.workout.update({
              where: { id: workout.id },
              data: {
                intensity: normalized.intensity
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

export default backfillWorkoutsCommand
