import { Command } from 'commander'
import chalk from 'chalk'
import { PrismaClient, Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { normalizeIntervalsPlannedWorkout } from '../../server/utils/intervals'

const backfillIntervalsParsingCommand = new Command('intervals-parsing')

backfillIntervalsParsingCommand
  .description(
    'Re-parse Intervals.icu PlannedWorkouts to fix structured workout issues (cadence objects, missing power)'
  )
  .option('--prod', 'Use production database')
  .option('--dry-run', 'Run without saving changes', false)
  .option('--id <id>', 'Process a specific workout ID')
  .action(async (options) => {
    const isProd = options.prod
    const isDryRun = options.dryRun
    const specificId = options.id

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
      console.log(chalk.gray('Fetching PlannedWorkouts with rawJson...'))

      const where: any = {
        rawJson: { not: Prisma.JsonNull }
      }

      if (specificId) {
        where.id = specificId
      }

      const workouts = await prisma.plannedWorkout.findMany({
        where,

        select: { id: true, userId: true, rawJson: true, title: true, structuredWorkout: true }
      })

      console.log(chalk.gray(`Found ${workouts.length} workouts to process.`))

      let processedCount = 0

      let fixedCount = 0

      let skippedCount = 0

      let errorCount = 0

      for (const w of workouts) {
        processedCount++

        try {
          const raw = w.rawJson as any

          // Re-normalize using the new logic

          const normalized = normalizeIntervalsPlannedWorkout(raw, w.userId)

          // Optimization: Check if update is actually needed

          // We compare the structuredWorkout objects

          const currentJson = JSON.stringify(w.structuredWorkout)

          const newJson = JSON.stringify(normalized.structuredWorkout)

          // Also check other fields if critical, but structuredWorkout is the main target

          const needsUpdate =
            currentJson !== newJson ||
            w.durationSec !== normalized.durationSec ||
            w.distanceMeters !== normalized.distanceMeters

          if (!needsUpdate) {
            skippedCount++

            if (processedCount % 100 === 0) process.stdout.write('s')

            continue
          }

          if (isDryRun) {
            // In dry run, maybe log something if it would change?

            const steps = normalized.structuredWorkout?.steps || []

            const hasCadenceObject = steps.some((s: any) => typeof s.cadence === 'object')

            if (hasCadenceObject) {
              console.log(
                chalk.red(
                  `[DRY RUN] Workout ${w.id} (${w.title}) STILL HAS ISSUES after normalization!`
                )
              )
            }
          } else {
            await prisma.plannedWorkout.update({
              where: { id: w.id },

              data: {
                structuredWorkout: normalized.structuredWorkout as any,

                durationSec: normalized.durationSec,

                distanceMeters: normalized.distanceMeters,

                tss: normalized.tss,

                workIntensity: normalized.workIntensity
              }
            })

            if (fixedCount % 100 === 0) process.stdout.write('.')
          }

          fixedCount++
        } catch (e: any) {
          // Handle "Record to update not found" (P2025) gracefully

          if (e.code === 'P2025') {
            // Record was deleted during processing
            // console.log(chalk.yellow(`\nSkipped ${w.id} (deleted during sync)`))
          } else {
            console.error(chalk.red(`\nError fixing workout ${w.id} (${w.title}):`), e)

            errorCount++
          }
        }
      }

      console.log('\n')

      console.log(chalk.bold('Summary:'))

      console.log(`Total Processed: ${processedCount}`)

      console.log(`Fixed/Updated:   ${fixedCount}`)

      console.log(`Skipped (No Change): ${skippedCount}`)

      console.log(`Errors:          ${errorCount}`)

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

export default backfillIntervalsParsingCommand
