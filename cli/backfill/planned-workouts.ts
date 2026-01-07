import { Command } from 'commander'
import chalk from 'chalk'
import { PrismaClient, Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { normalizeIntervalsPlannedWorkout } from '../../server/utils/intervals'

const backfillPlannedWorkoutsCommand = new Command('planned-workouts')

backfillPlannedWorkoutsCommand
  .description('Backfill missing duration and structured data for PlannedWorkouts from rawJson')
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
      console.log(
        chalk.gray('Fetching PlannedWorkouts with missing duration or invalid intensity...')
      )

      // Find workouts with missing duration OR invalid intensity
      const workouts = await prisma.plannedWorkout.findMany({
        where: {
          OR: [{ durationSec: null }, { workIntensity: { gt: 2 } }],
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

        // Re-normalize using the new logic which handles rawJson better
        const raw = workout.rawJson as any

        // We need to construct a mock "IntervalsPlannedWorkout" object from rawJson + db fields to pass to normalize
        // rawJson usually IS the IntervalsPlannedWorkout object
        if (!raw) {
          skippedCount++
          continue
        }

        // Use the shared normalization logic
        const normalized = normalizeIntervalsPlannedWorkout(raw, workout.userId)

        // Check if we actually found new data
        const hasNewDuration =
          normalized.durationSec !== null &&
          normalized.durationSec !== undefined &&
          (workout.durationSec === null || workout.durationSec === undefined)
        const hasNewStructure =
          normalized.structuredWorkout !== null &&
          normalized.structuredWorkout !== undefined &&
          !workout.structuredWorkout
        const hasNewTss =
          normalized.tss !== null &&
          normalized.tss !== undefined &&
          (workout.tss === null || workout.tss === undefined)

        // Check for intensity fix (if DB has > 2 and normalized has <= 2)
        const hasNewIntensity =
          normalized.workIntensity !== null &&
          normalized.workIntensity <= 2 &&
          (workout.workIntensity === null || workout.workIntensity > 2)

        if (hasNewDuration || hasNewStructure || hasNewTss || hasNewIntensity) {
          if (isDryRun) {
            console.log(
              chalk.green(
                `[DRY RUN] Would update workout "${workout.title}" (${workout.date.toISOString().split('T')[0]})`
              )
            )
            if (hasNewDuration)
              console.log(
                chalk.gray(`  Duration: ${workout.durationSec} -> ${normalized.durationSec}`)
              )
            if (hasNewTss) console.log(chalk.gray(`  TSS: ${workout.tss} -> ${normalized.tss}`))
            if (hasNewIntensity)
              console.log(
                chalk.gray(`  Intensity: ${workout.workIntensity} -> ${normalized.workIntensity}`)
              )
            if (hasNewStructure) console.log(chalk.gray(`  Structure: Added`))
          } else {
            await prisma.plannedWorkout.update({
              where: { id: workout.id },
              data: {
                durationSec: normalized.durationSec,
                distanceMeters: normalized.distanceMeters,
                tss: normalized.tss,
                workIntensity: normalized.workIntensity,
                structuredWorkout: normalized.structuredWorkout as any
              }
            })
            process.stdout.write('.')
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

export default backfillPlannedWorkoutsCommand
