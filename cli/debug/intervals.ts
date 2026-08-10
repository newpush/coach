import { Command } from 'commander'
import chalk from 'chalk'
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import {
  detectIntervals,
  findPeakEfforts,
  calculateHeartRateRecovery,
  calculateAerobicDecoupling
} from '../../server/utils/interval-detection'
import { buildWorkoutAnalysisFactsV2 } from '../../server/utils/workout-analysis-facts'
import Table from 'cli-table3'

function toNumber(value: unknown): number | null {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function formatDuration(secondsRaw: unknown): string {
  const seconds = toNumber(secondsRaw)
  if (!seconds || seconds <= 0) return '-'
  const rounded = Math.round(seconds)
  const mins = Math.floor(rounded / 60)
  const secs = rounded % 60
  if (mins <= 0) return `${secs}s`
  if (secs === 0) return `${mins}m`
  return `${mins}m ${secs}s`
}

function stepDurationSeconds(step: Record<string, any>): number | null {
  return (
    toNumber(step.durationSeconds) ??
    toNumber(step.duration) ??
    toNumber(step.duration_s) ??
    toNumber(step.elapsed_time)
  )
}

function formatPowerTarget(target: any, ftp?: number | null): string | null {
  if (!target || typeof target !== 'object') return null
  const units = String(target.units || '').toLowerCase()
  const render = (value: number) => {
    if (units.includes('w')) return `${Math.round(value)}W`
    if (units.includes('%') || value <= 2) {
      const ratio = value <= 2 ? value : value / 100
      const pct = `${Math.round(ratio * 100)}% FTP`
      return ftp && ftp > 0 ? `${pct} (~${Math.round(ratio * ftp)}W)` : pct
    }
    return `${Math.round(value)}W`
  }

  if (target.range && typeof target.range === 'object') {
    const start = toNumber(target.range.start)
    const end = toNumber(target.range.end)
    if (start !== null && end !== null) return `${render(start)} - ${render(end)}`
  }

  const value = toNumber(target.value)
  return value !== null ? render(value) : null
}

function formatHrTarget(target: any): string | null {
  if (!target || typeof target !== 'object') return null
  const units = String(target.units || '').toLowerCase()
  const render = (value: number) =>
    units.includes('%') || value <= 2
      ? `${Math.round((value <= 2 ? value : value / 100) * 100)}% LTHR`
      : `${Math.round(value)} bpm`

  if (target.range && typeof target.range === 'object') {
    const start = toNumber(target.range.start)
    const end = toNumber(target.range.end)
    if (start !== null && end !== null) return `${render(start)} - ${render(end)}`
  }

  const value = toNumber(target.value)
  return value !== null ? render(value) : null
}

function formatPaceTarget(target: any): string | null {
  if (!target || typeof target !== 'object') return null
  const units = String(target.units || '').trim()

  if (target.range && typeof target.range === 'object') {
    const start = toNumber(target.range.start)
    const end = toNumber(target.range.end)
    if (start !== null && end !== null)
      return `${start}${units ? ` ${units}` : ''} - ${end}${units ? ` ${units}` : ''}`
  }

  const value = toNumber(target.value)
  return value !== null ? `${value}${units ? ` ${units}` : ''}` : null
}

function flattenPlannedSteps(
  steps: Array<Record<string, any>>,
  depth = 0
): Array<{ step: Record<string, any>; depth: number }> {
  const rows: Array<{ step: Record<string, any>; depth: number }> = []
  for (const step of steps) {
    if (!step || typeof step !== 'object') continue
    rows.push({ step, depth })
    const nested = Array.isArray(step.steps)
      ? step.steps.filter((entry: any) => entry && typeof entry === 'object')
      : []
    if (!nested.length) continue

    const reps = Math.max(1, Math.trunc(Number(step.reps || 1)) || 1)
    for (let index = 0; index < reps; index++) {
      rows.push(...flattenPlannedSteps(nested, depth + 1))
    }
  }
  return rows
}

function getStepTarget(step: Record<string, any>, ftp?: number | null): string {
  return (
    formatPowerTarget(step.power, ftp) ||
    formatHrTarget(step.heartRate || step.hr) ||
    formatPaceTarget(step.pace) ||
    '-'
  )
}

function getStepCadence(step: Record<string, any>): string {
  if (typeof step.cadence === 'number' && Number.isFinite(step.cadence)) {
    return `${Math.round(step.cadence)}rpm`
  }
  return '-'
}

const intervalsDebugCommand = new Command('intervals')
  .description('Debug workout intervals and detection logic')
  .argument('<id>', 'Workout ID (UUID)')
  .option('--prod', 'Use production database')
  .action(async (id, options) => {
    const isProd = options.prod
    const connectionString = isProd ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL
    if (!connectionString) {
      console.error(
        chalk.red(isProd ? 'DATABASE_URL_PROD is not defined.' : 'DATABASE_URL is not defined.')
      )
      process.exit(1)
    }

    const pool = new pg.Pool({ connectionString })
    const adapter = new PrismaPg(pool)
    const prisma = new PrismaClient({ adapter })

    if (isProd) {
      console.log(chalk.yellow('Using PRODUCTION database.'))
    } else {
      console.log(chalk.blue('Using DEVELOPMENT database.'))
    }

    try {
      console.log(chalk.blue(`Fetching workout ${id}...`))
      const workout = await prisma.workout.findUnique({
        where: { id },
        include: {
          user: true,
          streams: true,
          plannedWorkout: true
        }
      })

      if (!workout) {
        console.error(chalk.red('Workout not found'))
        return
      }

      console.log(chalk.green(`✓ Found Workout: ${workout.title}`))
      console.log(`- Date: ${workout.date.toISOString().split('T')[0]}`)
      console.log(`- Type: ${workout.type}`)
      console.log(`- Source: ${workout.source}`)
      console.log(`- FTP: ${workout.ftp || workout.user?.ftp || 'Not set'}`)
      if (workout.plannedWorkout) {
        console.log(
          `- Planned Workout: ${workout.plannedWorkout.title || workout.plannedWorkout.id}`
        )
      }

      const raw = workout.rawJson as any
      const icuIntervals = raw?.icu_intervals || raw?.intervals || []
      console.log(chalk.bold(`\n--- Raw Synced Intervals (${icuIntervals.length}) ---`))
      if (icuIntervals.length > 0) {
        const p = new Table({
          head: ['#', 'Start', 'End', 'Dur', 'Type', 'Watts', 'HR', 'Label'].map((h) =>
            chalk.cyan(h)
          )
        })

        icuIntervals.forEach((interval: any, index: number) => {
          p.push([
            index,
            interval.start_time,
            interval.end_time,
            interval.duration || interval.end_time - interval.start_time,
            interval.type || 'WORK',
            interval.average_watts || '-',
            interval.average_heartrate || '-',
            interval.label || '-'
          ])
        })
        console.log(p.toString())
      } else {
        console.log(chalk.gray('No synced intervals found in rawJson.'))
      }

      if (!workout.streams) {
        console.log(chalk.yellow('\n⚠️ No streams found in database for this workout.'))
        return
      }

      console.log(chalk.bold('\n--- Stream Data Audit ---'))
      const time = workout.streams.time as number[]
      const watts = workout.streams.watts as number[]
      const hr = workout.streams.heartrate as number[]
      const velocity = workout.streams.velocity as number[]
      const cadence = workout.streams.cadence as number[]

      console.log(`- Time stream: ${time?.length || 0} samples`)
      console.log(`- Watts stream: ${watts?.length || 0} samples`)
      console.log(`- HR stream: ${hr?.length || 0} samples`)
      console.log(`- Velocity stream: ${velocity?.length || 0} samples`)

      if (!time || time.length === 0) {
        console.error(chalk.red('Cannot detect intervals without time stream.'))
        return
      }

      const calculationFtp = workout.ftp || workout.user?.ftp || 250
      const plannedSteps = Array.isArray((workout.plannedWorkout?.structuredWorkout as any)?.steps)
        ? ((workout.plannedWorkout?.structuredWorkout as any).steps as Array<Record<string, any>>)
        : []

      console.log(chalk.bold(`\n--- Planned Workout Structure (${plannedSteps.length}) ---`))
      if (plannedSteps.length > 0) {
        const flattenedPlanned = flattenPlannedSteps(plannedSteps)
        const plannedTable = new Table({
          head: ['#', 'Depth', 'Type', 'Dur', 'Target', 'Cadence', 'Name'].map((h) => chalk.cyan(h))
        })

        flattenedPlanned.forEach(({ step, depth }, index) => {
          plannedTable.push([
            index,
            depth,
            step.type || 'Interval',
            formatDuration(stepDurationSeconds(step)),
            getStepTarget(step, calculationFtp),
            getStepCadence(step),
            step.name || '-'
          ])
        })

        console.log(plannedTable.toString())
      } else {
        console.log(chalk.gray('No structured planned workout steps found.'))
      }

      console.log(chalk.bold(`\n--- Engine Detection (FTP: ${calculationFtp}W) ---`))

      let detected: any[] = []
      let metric = ''

      if (watts && watts.length > 0) {
        metric = 'power'
        detected = detectIntervals(
          time,
          watts,
          'power',
          calculationFtp,
          plannedSteps,
          undefined,
          cadence
        )
      } else if (
        velocity &&
        velocity.length > 0 &&
        (workout.type === 'Run' || workout.type === 'Swim')
      ) {
        metric = 'pace'
        detected = detectIntervals(
          time,
          velocity,
          'pace',
          undefined,
          plannedSteps,
          undefined,
          cadence
        )
      } else if (hr && hr.length > 0) {
        metric = 'heartrate'
        const maxHr = workout.maxHr || workout.user?.maxHr
        const threshold = maxHr ? maxHr * 0.7 : undefined
        // Zone reference is the athlete's PROFILE LTHR/max HR, not the work bar
        // above and not this session's own max HR (CW-400).
        const hrRefs = { lthr: workout.user?.lthr, maxHr: workout.user?.maxHr }
        detected = detectIntervals(
          time,
          hr,
          'heartrate',
          threshold,
          plannedSteps,
          undefined,
          cadence,
          hrRefs
        )
      }

      console.log(`Detection Metric: ${chalk.cyan(metric || 'None')}`)
      console.log(`Intervals detected: ${chalk.green(detected.length)}`)

      if (detected.length > 0) {
        const p = new Table({
          head: [
            '#',
            'Start',
            'End',
            'Dur',
            'Type',
            'Avg Val',
            'Cad',
            'Zone',
            'Name',
            'Match',
            'Conf'
          ].map((h) => chalk.cyan(h))
        })

        detected.forEach((interval: any, index: number) => {
          const avgVal =
            metric === 'power'
              ? interval.avg_power
              : metric === 'heartrate'
                ? interval.avg_heartrate
                : interval.avg_pace
          p.push([
            index,
            interval.start_time,
            interval.end_time,
            interval.duration,
            interval.type,
            Math.round(avgVal || 0),
            interval.avg_cadence ? Math.round(interval.avg_cadence) : '-',
            interval.intensity_zone || '-',
            interval.label || chalk.gray('-'),
            interval.match_score ? (interval.match_score * 100).toFixed(0) + '%' : chalk.gray('-'),
            interval.detection_confidence
              ? (interval.detection_confidence * 100).toFixed(0) + '%'
              : chalk.gray('-')
          ])
        })
        console.log(p.toString())
        const ambiguous = detected.filter((interval: any) => interval.ambiguity_note)
        if (ambiguous.length > 0) {
          console.log(chalk.yellow('\nAmbiguity Notes:'))
          ambiguous.forEach((interval: any, index: number) => {
            console.log(
              `  ${index + 1}. ${interval.type} @ ${interval.start_time}s - ${interval.ambiguity_note}`
            )
          })
        }
      }

      if (workout.plannedWorkout) {
        const facts = buildWorkoutAnalysisFactsV2({
          workout,
          plannedWorkout: workout.plannedWorkout,
          userProfile: {
            language: workout.user?.language || null
          }
        })
        console.log(chalk.bold('\n--- Cadence Adherence Summary ---'))
        console.log(
          `Cadence assessable: ${facts.adherence.cadenceAssessable ? chalk.green('yes') : chalk.gray('no')}`
        )
        console.log(`Cadence hit rate: ${facts.adherence.cadenceHitRate ?? 'N/A'}%`)
        console.log(
          `Structure matched: ${facts.adherence.structureMatched ? chalk.green('yes') : chalk.yellow('no')}`
        )
        console.log(`Execution classification: ${facts.adherence.executionClassification}`)
      }

      // Peak Efforts
      console.log(chalk.bold('\n--- Peak Efforts ---'))
      if (watts && watts.length > 0) {
        const peaks = findPeakEfforts(time, watts, 'power')
        console.log(chalk.dim('Power Peaks:'))
        peaks.forEach((p) => console.log(`  ${p.duration_label}: ${Math.round(p.value)}W`))
      }

      // Advanced
      if (watts && hr && watts.length > 0 && hr.length > 0) {
        const decoupling = calculateAerobicDecoupling(time, watts, hr)
        console.log(
          `\nAerobic Decoupling: ${decoupling ? (decoupling * 100).toFixed(2) + '%' : 'N/A'}`
        )
      }

      if (hr && hr.length > 0) {
        const recovery = calculateHeartRateRecovery(time, hr)
        if (recovery) {
          console.log(`HR Recovery (1m): ${recovery.drop_1m} bpm`)
          console.log(`HR Recovery (2m): ${recovery.drop_2m} bpm`)
        }
      }
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message)
      if (error.stack) console.error(error.stack)
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })

export default intervalsDebugCommand
