import { Command } from 'commander'
import chalk from 'chalk'
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const debugWellnessCommand = new Command('wellness')

debugWellnessCommand
  .description('Debug wellness data and discrepancies between DB columns and rawJson')
  .option('--prod', 'Use production database')
  .option('--user <email>', 'Filter by user email')
  .option('--date <date>', 'Filter by date (YYYY-MM-DD)')
  .option('-v, --verbose', 'Show all fields even if they match')
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
        console.log(chalk.green(`User found: ${user.name || user.email} (${user.id})`))
      } else {
        // Find a user with wellness data if no user specified
        console.log(
          chalk.gray('No user specified. Searching for recent wellness data across all users...')
        )
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

      console.log(chalk.gray(`Fetching wellness records...`))

      const records = await prisma.wellness.findMany({
        where,
        orderBy: { date: 'desc' },
        take: options.date ? 100 : 10 // Limit if no specific date
      })

      console.log(chalk.gray(`Found ${records.length} wellness records.`))

      for (const w of records) {
        console.log(
          chalk.bold.cyan(`
=== Wellness Record: ${w.date.toISOString().split('T')[0]} ===`)
        )
        console.log(`ID:          ${chalk.gray(w.id)}`)

        if (!w.rawJson || typeof w.rawJson !== 'object') {
          console.log(chalk.red(`❌ No rawJson found or invalid format`))
        } else {
          console.log(chalk.gray(`Original data captured: Yes`))
        }

        const raw: any = w.rawJson || {}

        // Define fields to check
        // Format: { label, db, raw, tolerance, unit }
        const checks = [
          { label: 'Resting HR', db: w.restingHr, raw: raw.restingHR, unit: 'bpm' },
          { label: 'HRV (rMSSD)', db: w.hrv, raw: raw.hrv, unit: 'ms' },
          { label: 'HRV (SDNN)', db: w.hrvSdnn, raw: raw.hrvSdnn ?? raw.sdnn, unit: 'ms' },
          { label: 'Sleep Secs', db: w.sleepSecs, raw: raw.sleepSecs, unit: 's' },
          { label: 'Sleep Score', db: w.sleepScore, raw: raw.sleepScore, unit: '%' },
          { label: 'Readiness', db: w.readiness, raw: raw.readiness, unit: '' },
          { label: 'Weight', db: w.weight, raw: raw.weight, unit: 'kg' },
          { label: 'SpO2', db: w.spO2, raw: raw.spO2, unit: '%' },
          { label: 'Stress', db: w.stress, raw: raw.stress, unit: '' }
        ]

        let discrepancies = 0

        for (const c of checks) {
          let status = chalk.green('✓ OK')
          let dbVal = c.db
          let rawVal = c.raw
          let isMismatch = false

          // Normalization for comparison
          if (dbVal === null || dbVal === undefined) dbVal = 'null'
          if (rawVal === null || rawVal === undefined) rawVal = 'null'

          if (rawVal !== 'null' && dbVal !== 'null') {
            if (Number(dbVal) !== Number(rawVal)) {
              status = chalk.red('❌ MISMATCH')
              isMismatch = true
            }
          } else if (rawVal !== 'null' && dbVal === 'null') {
            status = chalk.red('❌ MISSING IN DB')
            isMismatch = true
          } else if (rawVal === 'null' && dbVal !== 'null') {
            status = chalk.yellow('? DB HAS EXTRA') // Computed?
          } else {
            status = chalk.gray('✓ Both null')
          }

          if (isMismatch) discrepancies++

          if (isMismatch || options.verbose || c.label.includes('SDNN')) {
            const dbDisplay =
              typeof c.db === 'number'
                ? chalk.yellow(c.db) + (c.unit ? chalk.gray(c.unit) : '')
                : chalk.yellow(String(dbVal))
            const rawDisplay =
              typeof c.raw === 'number'
                ? chalk.blue(c.raw) + (c.unit ? chalk.gray(c.unit) : '')
                : chalk.blue(String(rawVal))

            console.log(`${c.label.padEnd(12)} | DB: ${dbDisplay} | Raw: ${rawDisplay} | ${status}`)
          }
        }

        if (discrepancies === 0 && !options.verbose) {
          console.log(chalk.green('✓ All checked fields match raw data.'))
        }

        // --- Deep Inspection of Nested Structures ---

        // 1. Whoop/Intervals Sleep Data
        const sleep = raw.sleep || (raw.sleep?.score ? raw.sleep : null)
        if (sleep) {
          console.log(chalk.magenta('\n🔍 Detailed Sleep Data Found:'))
          console.log(`  - Source ID:   ${sleep.id || 'N/A'}`)
          if (sleep.score) {
            const s = sleep.score
            console.log(`  - Performance: ${chalk.white(s.sleep_performance_percentage)}%`)
            console.log(
              `  - Efficiency:  ${chalk.white(s.sleep_efficiency_percentage?.toFixed(1))}%`
            )
            console.log(`  - Consistency: ${chalk.white(s.sleep_consistency_percentage)}%`)
            console.log(`  - Respiratory: ${chalk.white(s.respiratory_rate)} rpm`)

            if (s.stage_summary) {
              const stages = s.stage_summary
              const toHours = (ms: number) => (ms / (1000 * 60 * 60)).toFixed(1)
              console.log(
                chalk.gray(
                  `  - Stages: Deep ${toHours(stages.total_slow_wave_sleep_time_milli)}h | REM ${toHours(stages.total_rem_sleep_time_milli)}h | Light ${toHours(stages.total_light_sleep_time_milli)}h`
                )
              )
            }
          }
        }

        // 2. Sport Info (eFTP, etc.)
        if (raw.sportInfo && Array.isArray(raw.sportInfo)) {
          console.log(chalk.magenta('\n🔍 Sport Info Found:'))
          raw.sportInfo.forEach((info: any, idx: number) => {
            console.log(`  [${idx}] Type: ${info.type}`)
            if (info.eftp) console.log(`      eFTP:   ${chalk.cyan(info.eftp.toFixed(0))} W`)
            if (info.pMax) console.log(`      pMax:   ${chalk.cyan(info.pMax.toFixed(0))} W`)
            if (info.wPrime) console.log(`      wPrime: ${chalk.cyan(info.wPrime.toFixed(0))} J`)
          })
        }

        // 3. Recovery Details
        if (raw.recovery?.score) {
          console.log(chalk.magenta('\n🔍 Recovery Details:'))
          const r = raw.recovery.score
          if (r.skin_temp_celsius)
            console.log(`  - Skin Temp: ${chalk.cyan(r.skin_temp_celsius)}°C`)
          if (r.spo2_percentage) console.log(`  - SpO2: ${chalk.cyan(r.spo2_percentage)}%`)
        }

        // List all top-level keys for visibility
        if (options.verbose) {
          console.log(chalk.gray('\nRaw Keys:'), Object.keys(raw).join(', '))
        }
      }
    } catch (e: any) {
      console.error(chalk.red('Error:'), e)
    } finally {
      await prisma.$disconnect()
    }
  })

export default debugWellnessCommand
