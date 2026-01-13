import { Command } from 'commander'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import chalk from 'chalk'

const analyzeStreamsCommand = new Command('analyze-streams')
  .description('Analyze available stream types in rawJson vs processed streams')
  .option('--prod', 'Use production database')
  .option('--limit <number>', 'Limit number of workouts to scan', '1000')
  .action(async (options) => {
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

    // List of streams we currently have columns for in WorkoutStream
    // based on server/utils/services/intervalsService.ts mapping
    const PROCESSED_STREAMS = new Set([
      'time',
      'distance',
      'velocity', // mapped from velocity or velocity_smooth
      'heartrate',
      'cadence',
      'watts',
      'altitude', // mapped from altitude or fixed_altitude
      'latlng', // mapped from lat+lon or latlng
      'grade',
      'moving',
      'torque',
      'temp',
      'respiration',
      'hrv',
      'left_right_balance'
    ])

    // Some streams are implicitly handled or mapped to the above
    const MAPPED_STREAMS = new Map([
      ['velocity_smooth', 'velocity'],
      ['fixed_altitude', 'altitude'],
      ['lat', 'latlng'],
      ['lon', 'latlng'],
      ['watts_calc', 'watts'] // sometimes used if watts missing? (not currently mapped but good to know)
    ])

    try {
      console.log(chalk.gray(`Fetching workouts with rawJson...`))

      const workouts = await prisma.workout.findMany({
        where: {
          source: 'intervals',
          rawJson: {
            path: ['stream_types'],
            not: null
          }
        },
        select: {
          id: true,
          rawJson: true
        },
        take: parseInt(options.limit),
        orderBy: { date: 'desc' }
      })

      console.log(chalk.gray(`Scanning ${workouts.length} workouts...`))

      const stats = new Map<string, number>()
      let totalStreamTypesFound = 0

      for (const w of workouts) {
        const raw = w.rawJson as any
        if (Array.isArray(raw.stream_types)) {
          for (const type of raw.stream_types) {
            stats.set(type, (stats.get(type) || 0) + 1)
            totalStreamTypesFound++
          }
        }
      }

      console.log(
        chalk.bold.cyan(`
=== Stream Analysis ===`)
      )
      console.log(`Unique Stream Types Found: ${stats.size}`)
      console.log(`Total Streams Counted: ${totalStreamTypesFound}
`)

      // Sort by frequency
      const sortedStats = [...stats.entries()].sort((a, b) => b[1] - a[1])

      console.log(chalk.bold('Freq\tStatus\t\tStream Name'))
      console.log(chalk.gray('----\t------\t\t-----------'))

      const unprocessed: string[] = []

      for (const [type, count] of sortedStats) {
        let status = ''
        let color = chalk.white

        if (PROCESSED_STREAMS.has(type)) {
          status = '✅ Processed'
          color = chalk.green
        } else if (MAPPED_STREAMS.has(type)) {
          const mappedTo = MAPPED_STREAMS.get(type)
          status = `🔄 Mapped -> ${mappedTo}`
          color = chalk.blue
        } else {
          status = '❌ Unprocessed'
          color = chalk.yellow
          unprocessed.push(type)
        }

        // Pad for table alignment
        const countStr = count.toString().padEnd(4)
        const statusStr = status.padEnd(20)

        console.log(`${countStr}\t${statusStr}\t${color(type)}`)
      }

      if (unprocessed.length > 0) {
        console.log(
          chalk.bold.yellow(`
⚠️  Top Unprocessed Streams:`)
        )
        console.log(chalk.gray(`Consider adding these to WorkoutStream schema if valuable:`))
        console.log(unprocessed.join(', '))
      } else {
        console.log(
          chalk.green(`
✨ All detected stream types are currently processed or mapped!`)
        )
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error)
    } finally {
      await prisma.$disconnect()
    }
  })

export default analyzeStreamsCommand
