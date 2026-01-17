import { Command } from 'commander'
import chalk from 'chalk'
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const intervalsTypesCommand = new Command('intervals-types')

intervalsTypesCommand
  .description('Inspect and debug Intervals.icu activity types (Notes, Holidays, etc.)')
  .option('--prod', 'Use production database')
  .option('--user <email>', 'Filter by user email')
  .option('--fix', 'Delete detected Notes/Holidays')
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
      console.log(chalk.cyan('\n--- Analyzing Workout Types ---'))

      const where: any = {}
      if (options.user) {
        const user = await prisma.user.findUnique({ where: { email: options.user } })
        if (user) {
          where.userId = user.id
        } else {
          console.error(chalk.red(`User not found: ${options.user}`))
        }
      }

      // 1. Analyze Distinct Types
      const workoutTypes = await prisma.workout.groupBy({
        by: ['type'],
        _count: true,
        where
      })
      console.log(chalk.white('\nDistinct Workout Types:'))
      workoutTypes.forEach((t) => {
        console.log(`  ${t.type}: ${chalk.yellow(t._count)}`)
      })

      const plannedTypes = await prisma.plannedWorkout.groupBy({
        by: ['type', 'category'],
        _count: true,
        where
      })
      console.log(chalk.white('\nDistinct PlannedWorkout Types/Categories:'))
      plannedTypes.forEach((t) => {
        console.log(`  Type: ${t.type}, Category: ${t.category}: ${chalk.yellow(t._count)}`)
      })

      // 2. Find Suspicious Items
      console.log(chalk.cyan('\n--- Searching for Notes & Holidays ---'))

      // Fetch ALL potentially suspicious items (lightweight select)
      const suspiciousWorkouts = await prisma.workout.findMany({
        where: {
          ...where,
          OR: [
            { type: { in: ['Note', 'Holiday', 'Other'] } },
            { title: { contains: 'Note', mode: 'insensitive' } },
            { title: { contains: 'Holiday', mode: 'insensitive' } },
            { durationSec: { lte: 0 } }
          ]
        },
        select: { id: true, title: true, type: true, rawJson: true }
      })

      console.log(
        chalk.white(
          `\nFound ${suspiciousWorkouts.length} potential Note/Holiday Workouts candidates.`
        )
      )

      const toDeleteWorkouts: string[] = []

      for (const w of suspiciousWorkouts) {
        const raw = w.rawJson as any
        const rawType = raw?.type
        const rawCategory = raw?.category

        const isNote = w.type === 'Note' || rawType === 'Note' || rawCategory === 'NOTE'
        const isHoliday = w.type === 'Holiday' || rawType === 'Holiday' || rawCategory === 'HOLIDAY'

        if (isNote || isHoliday) {
          // Only log the first few to avoid spam
          if (toDeleteWorkouts.length < 10) {
            console.log(
              chalk.red(
                `  [MATCH] ID: ${w.id} | Title: ${w.title} | Type: ${w.type} | Raw: ${rawType}/${rawCategory}`
              )
            )
          }
          toDeleteWorkouts.push(w.id)
        }
      }
      if (toDeleteWorkouts.length > 10)
        console.log(chalk.red(`  ... and ${toDeleteWorkouts.length - 10} more.`))

      const suspiciousPlanned = await prisma.plannedWorkout.findMany({
        where: {
          ...where,
          OR: [
            { category: { in: ['NOTE', 'HOLIDAY', 'SICK', 'INJURED', 'SEASON_START'] } },
            { type: { in: ['Note', 'Holiday'] } },
            { category: null },
            { title: { contains: 'Note', mode: 'insensitive' } },
            { title: { contains: 'Holiday', mode: 'insensitive' } }
          ]
        },
        select: { id: true, title: true, type: true, category: true, rawJson: true }
      })

      console.log(
        chalk.white(
          `\nFound ${suspiciousPlanned.length} potential Note/Holiday PlannedWorkouts candidates.`
        )
      )

      const toDeletePlanned: string[] = []

      for (const p of suspiciousPlanned) {
        const raw = p.rawJson as any
        const rawType = raw?.type
        const rawCategory = raw?.category

        const isNote =
          p.category === 'NOTE' || p.type === 'Note' || rawCategory === 'NOTE' || rawType === 'Note'

        const isHoliday =
          p.category === 'HOLIDAY' ||
          p.type === 'Holiday' ||
          rawCategory === 'HOLIDAY' ||
          rawType === 'Holiday'

        const isOther =
          ['SICK', 'INJURED', 'SEASON_START'].includes(p.category || '') ||
          ['SICK', 'INJURED', 'SEASON_START'].includes(rawCategory)

        if (isNote || isHoliday || isOther) {
          if (toDeletePlanned.length < 10) {
            console.log(
              chalk.red(
                `  [MATCH] ID: ${p.id} | Title: ${p.title} | Type: ${p.type}/${p.category} | Raw: ${rawType}/${rawCategory}`
              )
            )
          }

          toDeletePlanned.push(p.id)
        }
      }
      if (toDeletePlanned.length > 10)
        console.log(chalk.red(`  ... and ${toDeletePlanned.length - 10} more.`))

      // 3. Fix
      if (options.fix) {
        if (toDeleteWorkouts.length > 0) {
          console.log(chalk.yellow(`\nDeleting ${toDeleteWorkouts.length} Workouts...`))
          const BATCH_SIZE = 500
          for (let i = 0; i < toDeleteWorkouts.length; i += BATCH_SIZE) {
            const batch = toDeleteWorkouts.slice(i, i + BATCH_SIZE)
            await prisma.workout.deleteMany({ where: { id: { in: batch } } })
            console.log(chalk.gray(`  Deleted batch ${i / BATCH_SIZE + 1}...`))
          }
          console.log(chalk.green('Done.'))
        }
        if (toDeletePlanned.length > 0) {
          console.log(chalk.yellow(`\nDeleting ${toDeletePlanned.length} PlannedWorkouts...`))
          const BATCH_SIZE = 500
          for (let i = 0; i < toDeletePlanned.length; i += BATCH_SIZE) {
            const batch = toDeletePlanned.slice(i, i + BATCH_SIZE)
            await prisma.plannedWorkout.deleteMany({ where: { id: { in: batch } } })
            console.log(chalk.gray(`  Deleted batch ${i / BATCH_SIZE + 1}...`))
          }
          console.log(chalk.green('Done.'))
        }
        if (toDeleteWorkouts.length === 0 && toDeletePlanned.length === 0) {
          console.log(chalk.green('\nNothing to delete.'))
        }
      } else if (toDeleteWorkouts.length > 0 || toDeletePlanned.length > 0) {
        console.log(
          chalk.yellow(
            `\nRun with --fix to delete these ${toDeleteWorkouts.length + toDeletePlanned.length} items.`
          )
        )
      }
    } catch (e: any) {
      console.error(chalk.red('Error:'), e)
    } finally {
      await prisma.$disconnect()
    }
  })

export default intervalsTypesCommand
