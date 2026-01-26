import { Command } from 'commander'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import chalk from 'chalk'
import { normalizeIntervalsPlannedWorkout } from '../../server/utils/intervals'

const checkPlannedStepsCommand = new Command('check-planned-steps')
  .description('Check steps of a planned workout')
  .argument('<id>', 'Workout ID or External ID')
  .option('--prod', 'Use production database')
  .action(async (id, options) => {
    const isProd = options.prod
    const connectionString = isProd ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL

    if (isProd) {
      console.log(chalk.yellow('Using PRODUCTION database.'))
    } else {
      console.log(chalk.blue('Using DEVELOPMENT database.'))
    }

    const pool = new pg.Pool({ connectionString })
    const adapter = new PrismaPg(pool)
    const prisma = new PrismaClient({ adapter })

    try {
      console.log(`Searching for PlannedWorkout with ID or ExternalID: ${id}`)
      const workout = await prisma.plannedWorkout.findFirst({
        where: {
          OR: [{ id: id }, { externalId: id }]
        }
      })

      if (!workout) {
        console.error(chalk.red('Workout not found!'))
        return
      }

      console.log(chalk.green(`Found workout: ${workout.title} (${workout.id})`))
      console.log(`External ID: ${workout.externalId}`)
      console.log(`User ID: ${workout.userId}`)
      console.log(`Sync Status: ${workout.syncStatus}`)
      console.log(`Date: ${workout.date.toISOString()}`)

      console.log(chalk.blue('\n--- Current structuredWorkout (DB) ---'))
      if (workout.structuredWorkout) {
        // @ts-expect-error -- implicit any type in debug script
        const steps = workout.structuredWorkout.steps
        if (steps && Array.isArray(steps)) {
          steps.forEach((step: any, index: number) => {
            console.log(`Step ${index + 1}:`)
            console.log(JSON.stringify(step, null, 2))
          })
        } else {
          console.log('No steps in structuredWorkout')
          console.log(JSON.stringify(workout.structuredWorkout, null, 2))
        }
      } else {
        console.log('null')
      }

      console.log(chalk.blue('\n--- Raw JSON (Source) ---'))
      if (workout.rawJson) {
        // @ts-expect-error -- implicit any type in debug script
        const rawSteps = workout.rawJson.workout_doc?.steps
        if (rawSteps) {
          console.log('Raw JSON steps found:')
          rawSteps.forEach((step: any, index: number) => {
            console.log(`Raw Step ${index + 1}:`)
            console.log(JSON.stringify(step, null, 2))
          })
        } else {
          console.log('No steps in rawJson.workout_doc')
          // @ts-expect-error -- implicit any type in debug script
          if (workout.rawJson.steps) {
            console.log('Found rawJson.steps directly:')
            // @ts-expect-error -- implicit any type in debug script
            console.log(JSON.stringify(workout.rawJson.steps, null, 2))
          } else {
            console.log('Full rawJson:')
            console.log(JSON.stringify(workout.rawJson, null, 2))
          }
        }
      } else {
        console.log('null')
      }

      console.log(chalk.blue('\n--- Re-parsing Raw JSON ---'))
      if (workout.rawJson) {
        try {
          // @ts-expect-error -- implicit any type in debug script
          const normalized = normalizeIntervalsPlannedWorkout(workout.rawJson, workout.userId)
          console.log('Normalized output steps:')
          // @ts-expect-error -- implicit any type in debug script
          const newSteps = normalized.structuredWorkout?.steps
          if (newSteps) {
            newSteps.forEach((step: any, index: number) => {
              console.log(`New Step ${index + 1}:`)
              console.log(JSON.stringify(step, null, 2))
            })
          } else {
            console.log('No steps in re-parsed output')
            console.log(JSON.stringify(normalized.structuredWorkout, null, 2))
          }
        } catch (e) {
          console.error('Error re-parsing:', e)
        }
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      await prisma.$disconnect()
    }
  })

export default checkPlannedStepsCommand
