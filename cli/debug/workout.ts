import { Command } from 'commander'
import chalk from 'chalk'
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { fetchIntervalsActivityStreams } from '../../server/utils/intervals'
import {
  calculateAveragePace,
  calculatePaceVariability,
  formatPace,
  calculateLapSplits,
  analyzePacingStrategy,
  detectSurges
} from '../../server/utils/pacing'
import { IntervalsService } from '../../server/utils/services/intervalsService'

const troubleshootWorkoutsCommand = new Command('workout')

troubleshootWorkoutsCommand
  .description('Troubleshoot discrepancies between Workout records, rawJson, and Streams')
  .argument(
    '[url]',
    'Optional URL of the workout to troubleshoot (extracts ID and sets --prod if applicable)'
  )
  .option('--prod', 'Use production database')
  .option('--user <email>', 'Filter by user email')
  .option('--id <workoutId>', 'Filter by workout ID')
  .option('--date <date>', 'Filter by date (YYYY-MM-DD)')
  .option('--source <source>', 'Filter by source (intervals, strava, etc.)', 'intervals')
  .option('--check-streams', 'Verify streams against external API and DB')
  .option('--re-sync-streams', 'Re-fetch and recalculate stream data from external API')
  .option('-v, --verbose', 'Show all fields even if they match')
  .action(async (url, options) => {
    let workoutId = options.id
    let isProd = options.prod

    if (url) {
      console.log(chalk.gray(`Analyzing URL: ${url}`))
      // Match UUID in URL
      const uuidMatch = url.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
      if (uuidMatch) {
        workoutId = uuidMatch[0]
        console.log(chalk.green(`Extracted Workout ID/Token: ${workoutId}`))
      }

      if (url.includes('coachwatts.com')) {
        isProd = true
        console.log(chalk.yellow('Detected coachwatts.com URL. Forcing --prod mode.'))
      }
    }

    const connectionString = isProd ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL

    if (isProd) {
      if (!connectionString) {
        console.error(chalk.red('DATABASE_URL_PROD is not defined.'))
        process.exit(1)
      }
      process.env.DATABASE_URL = connectionString
      console.log(chalk.yellow('Using PRODUCTION database.'))
    } else {
      console.log(chalk.blue('Using DEVELOPMENT database.'))
    }

    // Create a fresh client
    const pool = new pg.Pool({ connectionString })
    const adapter = new PrismaPg(pool)
    const prisma = new PrismaClient({ adapter })

    try {
      const where: any = {}

      if (options.user) {
        const user = await prisma.user.findUnique({ where: { email: options.user } })
        if (!user) {
          console.error(chalk.red(`User not found: ${options.user}`))
          process.exit(1)
        }
        where.userId = user.id
      }

      if (workoutId) {
        // Check if this is a share token first
        const shareToken = await prisma.shareToken.findUnique({
          where: { token: workoutId }
        })

        if (shareToken && shareToken.resourceType === 'WORKOUT') {
          console.log(chalk.green(`Resolved ShareToken to Workout ID: ${shareToken.resourceId}`))
          where.id = shareToken.resourceId
        } else if (workoutId.match(/^i\d+$/)) {
          console.log(chalk.green(`Detected Intervals External ID: ${workoutId}`))
          where.externalId = workoutId
          where.source = 'intervals'
        } else {
          where.id = workoutId
        }
      }

      if (options.date) {
        const d = new Date(options.date)
        const nextDay = new Date(d)
        nextDay.setDate(d.getDate() + 1)
        where.date = {
          gte: d,
          lt: nextDay
        }
      }

      if (options.source && !workoutId) {
        where.source = options.source
      }

      console.log(chalk.gray(`Fetching workouts...`))

      const workouts = await prisma.workout.findMany({
        where,
        orderBy: { date: 'desc' },
        take: workoutId ? 1 : 100,
        include: { user: true }
      })

      console.log(chalk.gray(`Found ${workouts.length} workouts.`))

      let totalDiscrepancies = 0

      for (const w of workouts) {
        console.log(
          chalk.bold.cyan(`
=== Workout Details ===`)
        )
        console.log(`Title:       ${chalk.white(w.title)}`)
        console.log(`Date:        ${chalk.white(w.date.toISOString().split('T')[0])}`)
        console.log(`User:        ${chalk.magenta(w.user?.email || 'Unknown')}`)
        console.log(`ID:          ${chalk.gray(w.id)}`)
        console.log(`Source:      ${chalk.yellow(w.source)}`)
        console.log(`External ID: ${chalk.gray(w.externalId)}`)

        if (!w.rawJson || typeof w.rawJson !== 'object') {
          console.log(chalk.red(`❌ No rawJson found or invalid format`))
          continue
        }

        const raw: any = w.rawJson
        console.log(`Intervals Source: ${chalk.yellow(raw.source || 'Unknown')}`)
        console.log(chalk.gray(`Original data captured: Yes (rawJson present)`))

        const checks: { label: string; db: any; raw: any; tolerance: number; unit?: string }[] = []

        if (w.source === 'intervals') {
          // Metrics based on server/utils/intervals.ts normalization
          checks.push(
            {
              label: 'Avg Watts',
              db: w.averageWatts,
              raw: raw.icu_average_watts ?? raw.average_watts,
              tolerance: 1,
              unit: 'W'
            },
            { label: 'Max Watts', db: w.maxWatts, raw: raw.max_watts, tolerance: 1, unit: 'W' },
            {
              label: 'Norm Power',
              db: w.normalizedPower,
              raw: raw.normalized_power,
              tolerance: 1,
              unit: 'W'
            },
            {
              label: 'Avg HR',
              db: w.averageHr,
              raw: Math.round(raw.average_heartrate || 0),
              tolerance: 1,
              unit: 'bpm'
            },
            {
              label: 'Max HR',
              db: w.maxHr,
              raw: Math.round(raw.max_heartrate || 0),
              tolerance: 1,
              unit: 'bpm'
            },
            {
              label: 'Duration',
              db: w.durationSec,
              raw: raw.moving_time || raw.elapsed_time || raw.duration,
              tolerance: 1,
              unit: 's'
            },
            { label: 'Distance', db: w.distanceMeters, raw: raw.distance, tolerance: 1, unit: 'm' },
            {
              label: 'TSS',
              db: w.tss,
              raw: raw.tss ?? raw.icu_training_load ?? null,
              tolerance: 0.1
            },
            { label: 'Load', db: w.trainingLoad, raw: raw.icu_training_load, tolerance: 0.1 },
            {
              label: 'Intensity',
              db: w.intensity,
              raw: (() => {
                let val = raw.icu_intensity || raw.intensity || null
                if (val !== null && val > 5) {
                  val = val / 100
                }
                return val ? Math.round(val * 10000) / 10000 : null
              })(),
              tolerance: 0.01
            },
            {
              label: 'Kjoules',
              db: w.kilojoules,
              raw: (() => {
                let val = raw.icu_joules
                if (val && val > 10000) {
                  // Assume Joules, convert to kJ
                  val = Math.round(val / 1000)
                }
                return val
              })(),
              tolerance: 5
            },
            {
              label: 'Cadence',
              db: w.averageCadence,
              raw: Math.round(raw.average_cadence || 0),
              tolerance: 1,
              unit: 'rpm'
            },
            {
              label: 'Decoupling',
              db: w.decoupling,
              raw: raw.decoupling,
              tolerance: 0.1,
              unit: '%'
            },
            { label: 'RPE', db: w.rpe, raw: raw.perceived_exertion || raw.icu_rpe, tolerance: 0 },
            {
              label: 'Feel',
              db: w.feel,
              raw: raw.feel ? 6 - raw.feel : null,
              tolerance: 0
            },
            { label: 'Session RPE', db: w.sessionRpe, raw: raw.session_rpe, tolerance: 0 }
          )
        } else if (w.source === 'strava') {
          checks.push(
            {
              label: 'Avg Watts',
              db: w.averageWatts,
              raw: raw.average_watts,
              tolerance: 1,
              unit: 'W'
            },
            { label: 'Max Watts', db: w.maxWatts, raw: raw.max_watts, tolerance: 1, unit: 'W' },
            {
              label: 'Avg HR',
              db: w.averageHr,
              raw: raw.average_heartrate,
              tolerance: 1,
              unit: 'bpm'
            },
            { label: 'Max HR', db: w.maxHr, raw: raw.max_heartrate, tolerance: 1, unit: 'bpm' },
            { label: 'Duration', db: w.durationSec, raw: raw.moving_time, tolerance: 1, unit: 's' },
            { label: 'Distance', db: w.distanceMeters, raw: raw.distance, tolerance: 1, unit: 'm' },
            {
              label: 'Cadence',
              db: w.averageCadence,
              raw: raw.average_cadence,
              tolerance: 1,
              unit: 'rpm'
            }
          )
        } else {
          console.log(chalk.yellow(`No comparison logic defined for source: ${w.source}`))
          continue
        }

        console.log(
          chalk.bold.cyan(`
=== Field Comparison (DB vs Raw) ===`)
        )
        let workoutDiscrepancies = 0

        checks.forEach((c) => {
          let status = chalk.green('✓ OK')
          let dbVal = c.db
          let rawVal = c.raw
          let isMismatch = false

          // Handle null/undefined
          if (dbVal === null || dbVal === undefined) dbVal = 'null'
          if (rawVal === null || rawVal === undefined) rawVal = 'null'

          if (c.raw !== undefined && c.raw !== null) {
            // Number comparison with tolerance
            if (typeof c.db === 'number' && typeof c.raw === 'number') {
              if (Math.abs(c.db - c.raw) > c.tolerance) {
                status = chalk.red('❌ MISMATCH')
                isMismatch = true
              }
            }
            // Strict equality for others (if not nulls handled above)
            else if (c.db != c.raw) {
              // loose equality to handle null vs undefined if not caught
              status = chalk.red('❌ MISMATCH')
              isMismatch = true
            }
          } else {
            // Raw is missing
            if (c.db !== null && c.db !== undefined) {
              // DB has value but raw doesn't? Might be calculated or default.
              // Usually we only care if Raw HAS it and DB DOESN'T or DIFFERS.
              // Let's mark as info.
              status = chalk.gray('? Raw missing')
            } else {
              status = chalk.gray('✓ Both null')
            }
          }

          if (isMismatch) {
            workoutDiscrepancies++
            totalDiscrepancies++
          }

          if (isMismatch || options.verbose || workoutDiscrepancies > 0) {
            // Format values for display
            const unit = c.unit ? chalk.gray(c.unit) : ''
            const dbDisplay =
              typeof dbVal === 'number' ? chalk.yellow(dbVal) : chalk.yellow(String(dbVal))
            const rawDisplay =
              typeof rawVal === 'number' ? chalk.blue(rawVal) : chalk.blue(String(rawVal))

            console.log(
              `${c.label.padEnd(12)} | DB: ${dbDisplay}${unit} | Raw: ${rawDisplay}${unit} | ${status}`
            )
          }
        })

        if (workoutDiscrepancies === 0) {
          console.log(
            chalk.green(`
✅ All checked fields match within tolerance.`)
          )
        } else {
          console.log(
            chalk.red(`
❌ Found ${workoutDiscrepancies} discrepancies in this workout.`)
          )
        }

        if (options.checkStreams) {
          console.log(
            chalk.bold.blue(`

        === Stream Verification ===`)
          )

          // Fetch DB Stream

          const dbStream = await prisma.workoutStream.findUnique({
            where: { workoutId: w.id }
          })

          let streamsMissing = false
          if (dbStream) {
            console.log(chalk.green(`✓ DB Stream found (ID: ${dbStream.id})`))

            const timeLen = Array.isArray(dbStream.time) ? dbStream.time.length : 0
            const wattsLen = Array.isArray(dbStream.watts) ? dbStream.watts.length : 0
            const hrLen = Array.isArray(dbStream.heartrate) ? dbStream.heartrate.length : 0
            const cadenceLen = Array.isArray(dbStream.cadence) ? dbStream.cadence.length : 0
            const velocityLen = Array.isArray(dbStream.velocity) ? dbStream.velocity.length : 0
            const distLen = Array.isArray(dbStream.distance) ? dbStream.distance.length : 0

            console.log(
              `  Data Points: Time=${timeLen}, Watts=${wattsLen}, HR=${hrLen}, Cadence=${cadenceLen}, Velocity=${velocityLen}, Dist=${distLen}`
            )

            if (timeLen === 0 || (w.type !== 'WeightTraining' && wattsLen === 0)) {
              streamsMissing = true
            }

            console.log(
              `  Zone Data: HR Zones=${dbStream.hrZoneTimes ? 'Present' : 'Missing'}, Power Zones=${dbStream.powerZoneTimes ? 'Present' : 'Missing'}`
            )

            if (dbStream.hrZoneTimes)
              console.log(`    HR Zones: ${JSON.stringify(dbStream.hrZoneTimes)}`)
            if (dbStream.powerZoneTimes)
              console.log(`    Power Zones: ${JSON.stringify(dbStream.powerZoneTimes)}`)

            console.log(chalk.bold(`  Pacing Metrics (Stored):`))
            console.log(
              `    Avg Pace: ${dbStream.avgPacePerKm ? formatPace(dbStream.avgPacePerKm) : 'N/A'}`
            )
            console.log(
              `    Pace Variability: ${dbStream.paceVariability ? dbStream.paceVariability.toFixed(2) : 'N/A'}`
            )

            // Simulate Calculation
            if (velocityLen > 0 && timeLen > 0 && distLen > 0) {
              const simVariability = calculatePaceVariability(dbStream.velocity as number[])
              const simAvgPace = calculateAveragePace(
                (dbStream.time as number[])[timeLen - 1],
                (dbStream.distance as number[])[distLen - 1]
              )
              console.log(chalk.bold(`  Pacing Metrics (Simulated):`))
              console.log(`    Avg Pace: ${formatPace(simAvgPace)}`)
              console.log(`    Pace Variability: ${simVariability.toFixed(2)}`)
            } else {
              console.log(
                chalk.yellow(`  ⚠️  Cannot simulate pacing: missing velocity/time/dist arrays`)
              )
            }
          } else {
            console.log(chalk.red(`❌ DB Stream NOT found`))
            streamsMissing = true
          }

          if (w.source === 'intervals' && (options.reSyncStreams || streamsMissing)) {
            console.log(chalk.bold.yellow(`\n=== Re-Syncing Streams ===`))
            try {
              const result = await IntervalsService.syncActivityStream(w.userId, w.id, w.externalId)

              if (result) {
                console.log(chalk.green(`✓ Successfully synced streams for ${w.id}`))
                const timeLen = Array.isArray(result.time) ? result.time.length : 0
                const velocityLen = Array.isArray(result.velocity) ? result.velocity.length : 0

                console.log(`  New Data Points: Time=${timeLen}, Velocity=${velocityLen}`)
                console.log(
                  `  New Avg Pace: ${result.avgPacePerKm ? formatPace(result.avgPacePerKm) : 'N/A'}`
                )
                console.log(
                  `  New Pace Variability: ${result.paceVariability ? result.paceVariability.toFixed(2) : 'N/A'}`
                )
                console.log(
                  `  New Zone Data: HR Zones=${result.hrZoneTimes ? 'Present' : 'Missing'}, Power Zones=${result.powerZoneTimes ? 'Present' : 'Missing'}`
                )
              } else {
                console.log(chalk.red(`❌ No stream data returned from API`))
              }
            } catch (err: any) {
              console.log(chalk.red(`❌ Error during re-sync: ${err.message}`))
            }
          }

          // Fetch API Stream
          const integration = await prisma.integration.findUnique({
            where: { userId_provider: { userId: w.userId, provider: 'intervals' } }
          })

          if (integration) {
            try {
              console.log(chalk.gray(`Fetching streams from Intervals.icu...`))
              // Try with getIntervalsAthleteId logic first
              let apiStreams = await fetchIntervalsActivityStreams(integration, w.externalId)

              // If no streams, try stripping the 'i' prefix if it exists
              if (Object.keys(apiStreams).length === 0 && w.externalId.startsWith('i')) {
                const numericId = w.externalId.substring(1)
                console.log(
                  chalk.gray(`No streams with ID ${w.externalId}, trying numeric ID: ${numericId}`)
                )
                apiStreams = await fetchIntervalsActivityStreams(integration, numericId)
              }

              let streamKeys = Object.keys(apiStreams)

              if (streamKeys.length === 0 && integration.externalUserId) {
                console.log(
                  chalk.yellow(
                    `⚠️ No streams found with default athleteId. Retrying with explicit athleteId: ${integration.externalUserId}`
                  )
                )
                // Manually override for retry
                const legacyIntegration = { ...integration, scope: null, refreshToken: null } as any
                apiStreams = await fetchIntervalsActivityStreams(legacyIntegration, w.externalId)
                streamKeys = Object.keys(apiStreams)
              }

              if (streamKeys.length > 0) {
                console.log(chalk.green(`✓ API Streams found: ${streamKeys.join(', ')}`))
                const timeLen = Array.isArray(apiStreams.time?.data)
                  ? apiStreams.time.data.length
                  : 0
                const wattsLen = Array.isArray(apiStreams.watts?.data)
                  ? apiStreams.watts.data.length
                  : 0
                console.log(`  Data Points: Time=${timeLen}, Watts=${wattsLen}`)
              } else {
                console.log(chalk.red(`❌ API Streams empty or not found`))
              }
            } catch (err: any) {
              console.log(chalk.red(`❌ Error fetching API streams: ${err.message}`))
            }
          } else {
            console.log(chalk.yellow(`⚠️ Intervals integration not found for user`))
          }
        }
      }

      if (totalDiscrepancies === 0) {
        console.log(chalk.green('\n✨ No discrepancies found in any processed workouts.'))
      } else {
        console.log(chalk.red('\n⚠️  Total discrepancies found: ' + totalDiscrepancies))
      }
    } catch (e: any) {
      console.error(chalk.red('Error:'), e)
    } finally {
      await prisma.$disconnect()
    }
  })

export default troubleshootWorkoutsCommand
