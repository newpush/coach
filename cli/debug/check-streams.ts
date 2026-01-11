import { Command } from 'commander'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import chalk from 'chalk'

const checkStreamsCommand = new Command('check-streams')
  .description('Check streams availability for user workouts')
  .argument('<userId>', 'User UUID')
  .option('--prod', 'Use production database')
  .action(async (userId: string, options) => {
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
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(endDate.getDate() - 30)

      console.log(`Checking workouts from ${startDate.toISOString()} to ${endDate.toISOString()}`)

      const workouts = await prisma.workout.findMany({
        where: {
          userId,
          date: { gte: startDate, lte: endDate },
          isDuplicate: false
        },
        select: {
          id: true,
          date: true,
          title: true,
          source: true,
          externalId: true
        }
      })

      console.log(`Found ${workouts.length} workouts.`)

      if (workouts.length === 0) return

      const workoutIds = workouts.map((w) => w.id)

      const streams = await prisma.workoutStream.findMany({
        where: { workoutId: { in: workoutIds } },
        select: {
          workoutId: true,
          heartrate: true,
          watts: true,
          hrZoneTimes: true,
          powerZoneTimes: true
        }
      })

      console.log(`Found ${streams.length} stream records.`)

      const streamsMap = new Map(streams.map((s) => [s.workoutId, s]))

      let missingStreamsCount = 0
      let emptyStreamsCount = 0
      let validStreamsCount = 0

      for (const workout of workouts) {
        const stream = streamsMap.get(workout.id)
        if (!stream) {
          console.log(
            chalk.red(
              `[MISSING] ${workout.date.toISOString().split('T')[0]} - ${workout.title} (${workout.source})`
            )
          )
          missingStreamsCount++
        } else {
          const hasHr =
            (Array.isArray(stream.heartrate) && (stream.heartrate as any[]).length > 0) ||
            (stream.hrZoneTimes as any[])?.length > 0
          const hasPower =
            (Array.isArray(stream.watts) && (stream.watts as any[]).length > 0) ||
            (stream.powerZoneTimes as any[])?.length > 0

          if (!hasHr && !hasPower) {
            console.log(
              chalk.yellow(
                `[EMPTY]   ${workout.date.toISOString().split('T')[0]} - ${workout.title} (${workout.source}) - Stream record exists but no HR/Power data`
              )
            )
            emptyStreamsCount++
          } else {
            validStreamsCount++
            //  console.log(chalk.green(`[OK]      ${workout.date.toISOString().split('T')[0]} - ${workout.title}`))
          }
        }
      }

      console.log('\nSummary:')
      console.log(`Total Workouts: ${workouts.length}`)
      console.log(`Missing Stream Records: ${missingStreamsCount}`)
      console.log(`Empty Data Streams: ${emptyStreamsCount}`)
      console.log(`Valid Streams: ${validStreamsCount}`)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      await prisma.$disconnect()
    }
  })

export default checkStreamsCommand
