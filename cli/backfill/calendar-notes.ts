import { Command } from 'commander'
import chalk from 'chalk'
import { PrismaClient, Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { normalizeIntervalsCalendarNote } from '../../server/utils/intervals'
import { calendarNoteRepository } from '../../server/utils/repositories/calendarNoteRepository'

const backfillCalendarNotesCommand = new Command('calendar-notes')

backfillCalendarNotesCommand
  .description('Migrate non-activity calendar items from PlannedWorkout to CalendarNote')
  .option('--prod', 'Use production database')
  .option('--dry-run', 'Run without saving changes', false)
  .option('--limit <number>', 'Limit the number of records to process', '2000')
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
      // Categories identified as "Notes" in Intervals.icu
      const categoriesToMove = [
        'NOTE',
        'TARGET',
        'HOLIDAY',
        'SICK',
        'INJURED',
        'SEASON_START',
        'FITNESS_DAYS',
        'SET_EFTP',
        'SET_FITNESS'
      ]

      console.log(
        chalk.gray(`Fetching PlannedWorkouts with categories: ${categoriesToMove.join(', ')}...`)
      )

      const workouts = await prisma.plannedWorkout.findMany({
        where: {
          OR: [
            { category: { in: categoriesToMove } },
            // Also catch things that might be typed as Note/Holiday but have WORKOUT category (unlikely but safe)
            { type: { in: ['Note', 'Holiday'] } }
          ]
        },
        take: limit
      })

      console.log(chalk.gray(`Found ${workouts.length} items to migrate.`))

      let movedCount = 0
      let errorCount = 0

      for (const workout of workouts) {
        try {
          const raw = workout.rawJson as any

          if (!raw) {
            console.warn(
              chalk.yellow(`Skipping ${workout.id} - No rawJson available for re-normalization.`)
            )
            continue
          }

          const normalizedNote = normalizeIntervalsCalendarNote(raw, workout.userId)

          if (isDryRun) {
            console.log(
              chalk.green(
                `[DRY RUN] Would migrate "${workout.title}" (${workout.date.toISOString().split('T')[0]}) as ${normalizedNote.category}`
              )
            )
          } else {
            // 1. Upsert to CalendarNote using repository
            await calendarNoteRepository.upsert(
              workout.userId,
              'intervals',
              normalizedNote.externalId,
              normalizedNote
            )

            // 2. Delete from PlannedWorkout
            await prisma.plannedWorkout.delete({
              where: { id: workout.id }
            })

            process.stdout.write('.')
          }
          movedCount++
        } catch (err: any) {
          console.error(chalk.red(`\nFailed to migrate ${workout.id}:`), err.message)
          errorCount++
        }
      }

      console.log('\n')
      console.log(chalk.bold('Summary:'))
      console.log(`Total Moved: ${movedCount}`)
      console.log(`Errors:      ${errorCount}`)

      if (isDryRun) {
        console.log(chalk.cyan('\nRun without --dry-run to apply changes.'))
      }
    } catch (e: any) {
      console.error(chalk.red('Fatal Error:'), e)
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })

export default backfillCalendarNotesCommand
