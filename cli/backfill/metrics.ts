import { Command } from 'commander'
import chalk from 'chalk'
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const backfillMetricsCommand = new Command('metrics')
  .description('Backfill advanced metrics (strain, work, etc.) from raw JSON')
  .option('-p, --provider <provider>', 'Filter by provider (e.g., intervals, strava)', 'intervals')
  .option('-d, --dry-run', 'Dry run mode (do not commit changes)', false)
  .option('--prod', 'Use production database', false)
  .action(async (options) => {
    console.log(chalk.blue('=== Backfill Advanced Metrics ==='))
    console.log(`Provider: ${options.provider}`)
    console.log(`Dry Run: ${options.dryRun ? 'YES' : 'NO'}`)

    // Database selection logic
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

    // Initialize Prisma Client dynamically
    const pool = new pg.Pool({ connectionString })
    const adapter = new PrismaPg(pool)
    const prisma = new PrismaClient({ adapter })

    try {
      const workouts = await prisma.workout.findMany({
        where: {
          source: options.provider,
          rawJson: { not: null }
        },
        select: {
          id: true,
          title: true,
          source: true,
          rawJson: true,
          // Select current values to compare
          strainScore: true,
          hrLoad: true,
          workAboveFtp: true,
          wBalDepletion: true,
          wPrime: true,
          carbsUsed: true,
          tss: true // Added for comparison
        }
      })

      console.log(`Found ${workouts.length} workouts with raw data.`)

      let updatedCount = 0

      for (const workout of workouts) {
        const raw = workout.rawJson as any
        const updates: any = {}

        if (!raw) continue

        // Intervals.icu mappings
        if (workout.source === 'intervals') {
          // Strain
          if (raw.strain_score !== undefined && raw.strain_score !== null) {
            updates.strainScore = raw.strain_score
          }

          // TSS Mapping for Intervals
          // Intervals 'Load' (icu_training_load) is their calculated TSS
          // We prioritize icu_training_load as it's the main 'Load' field in Intervals
          if (raw.icu_training_load !== undefined && raw.icu_training_load !== null) {
            updates.tss = raw.icu_training_load
          } else if (raw.tss !== undefined && raw.tss !== null) {
            updates.tss = raw.tss
          }

          // HR Load

          // HR Load
          if (raw.hr_load !== undefined) updates.hrLoad = raw.hr_load

          // Work > FTP (Joules)
          if (raw.icu_joules_above_ftp !== undefined)
            updates.workAboveFtp = raw.icu_joules_above_ftp

          // W' Bal Depletion (Joules)
          if (raw.icu_max_wbal_depletion !== undefined)
            updates.wBalDepletion = raw.icu_max_wbal_depletion

          // W' (Joules)
          if (raw.icu_pm_w_prime !== undefined) updates.wPrime = raw.icu_pm_w_prime
          // Fallback to rolling if static is missing?
          if (updates.wPrime === undefined && raw.icu_rolling_w_prime)
            updates.wPrime = Math.round(raw.icu_rolling_w_prime)

          // Carbs (g)
          if (raw.carbs_used !== undefined) updates.carbsUsed = raw.carbs_used
        }

        // Check if update is needed
        let hasChanges = false
        for (const [key, value] of Object.entries(updates)) {
          // @ts-expect-error - dynamic access
          // Use loose equality for float comparison safety or undefined vs null
          if (workout[key] != value) {
            hasChanges = true
            break
          }
        }

        if (hasChanges) {
          if (options.dryRun) {
            console.log(
              chalk.yellow(`[DRY RUN] Would update ${workout.id} (${workout.title}):`),
              JSON.stringify(updates)
            )
          } else {
            await prisma.workout.update({
              where: { id: workout.id },
              data: updates
            })
            // console.log(chalk.green(`Updated ${workout.id}`));
            process.stdout.write('.')
          }
          updatedCount++
        }
      }

      console.log(chalk.bold(`\nComplete. Updated ${updatedCount} workouts.`))
    } catch (error) {
      console.error(chalk.red('Error during backfill:'), error)
      process.exit(1)
    } finally {
      await prisma.$disconnect()
    }
  })

export default backfillMetricsCommand
