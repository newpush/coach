import { Command } from 'commander'
import chalk from 'chalk'
import { Prisma } from '@prisma/client'
import { subDays } from 'date-fns'
import { normalizeOuraWellness } from '../../server/utils/oura'

const backfillOuraCommand = new Command('wellness-oura')

backfillOuraCommand
  .description(
    'Backfill Oura wellness data. Soft (re-normalize local rawJson) or Hard (fetch from API).'
  )
  .option('--prod', 'Use production database')
  .option('--dry-run', 'Run without saving changes', false)
  .option('--hard', 'Fetch fresh data from Oura API (last 90 days)', false)
  .option('--days <number>', 'Number of days to backfill (for hard mode)', '90')
  .option('--user <email>', 'Backfill for a specific user')
  .action(async (options) => {
    const isProd = options.prod
    const isDryRun = options.dryRun
    const isHard = options.hard

    const connectionString = isProd ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL

    if (!connectionString) {
      console.error(
        chalk.red(
          `Database connection string not found for ${isProd ? 'production' : 'development'}.`
        )
      )
      process.exit(1)
    }

    if (isProd) {
      console.log(chalk.yellow('⚠️  Using PRODUCTION database.'))
      process.env.DATABASE_URL = connectionString // Override for global prisma singleton
    } else {
      console.log(chalk.blue('Using DEVELOPMENT database.'))
    }

    // console.log(chalk.gray(`DATABASE_URL: ${process.env.DATABASE_URL?.split('@')[1]}`))

    // Import prisma AFTER setting environment variable
    const { prisma } = await import('../../server/utils/db')

    try {
      if (isHard) {
        await handleHardBackfill(prisma, options)
      } else {
        await handleSoftBackfill(prisma, options)
      }
    } catch (e: any) {
      console.error(chalk.red('Error:'), e.message || e)
    } finally {
      await prisma.$disconnect()
    }
  })

async function handleSoftBackfill(prisma: any, options: any) {
  const { dryRun, user: userEmail } = options
  console.log(chalk.blue('Starting SOFT backfill (re-normalizing local rawJson)...'))
  if (dryRun) console.log(chalk.cyan('🔍 DRY RUN mode enabled.'))

  const where: any = {
    OR: [
      { history: { path: ['$[0]', 'source'], equals: 'oura' } },
      { rawJson: { path: ['dailyReadiness'], not: Prisma.AnyNull } }
    ]
  }

  if (userEmail) {
    const user = await prisma.user.findUnique({ where: { email: userEmail } })
    if (!user) throw new Error(`User not found: ${userEmail}`)
    where.userId = user.id
  }

  const entries = await prisma.wellness.findMany({
    where,
    orderBy: { date: 'desc' }
  })

  console.log(
    chalk.gray(`Found ${entries.length} wellness records matching Oura source heuristics.`)
  )

  let updatedCount = 0
  for (const entry of entries) {
    const raw: any = entry.rawJson
    if (!raw || !raw.dailyReadiness) continue

    // Re-normalize with the new strict logic
    const normalized = normalizeOuraWellness(
      raw.dailySleep,
      raw.dailyActivity,
      raw.dailyReadiness,
      raw.sleepPeriods || [],
      entry.userId,
      entry.date,
      {
        spo2: raw.spo2,
        stress: raw.stress,
        vo2max: raw.vo2max,
        personalInfo: raw.personalInfo
      }
    )

    if (!normalized) continue

    const updateData: any = {
      lastSource: 'oura'
    }

    // Only set fields that are present in the normalized Oura data

    // to avoid nulling out valid data from other sources (like Intervals)

    if (normalized.hrv !== null) updateData.hrv = normalized.hrv

    if (normalized.restingHr !== null) updateData.restingHr = normalized.restingHr

    if (normalized.spO2 !== null) updateData.spO2 = normalized.spO2

    if (normalized.stress !== null) updateData.stress = normalized.stress

    if (normalized.vo2max !== null) updateData.vo2max = normalized.vo2max

    if (normalized.weight !== null) updateData.weight = normalized.weight

    if (normalized.readiness !== null) updateData.readiness = normalized.readiness

    if (normalized.recoveryScore !== null) updateData.recoveryScore = normalized.recoveryScore

    // Only update if something changed (and we're not just setting lastSource)

    const hasActualChanges = Object.entries(updateData).some(([key, val]) => {
      if (key === 'lastSource') return false

      const currentVal = (entry as any)[key]

      return currentVal !== val
    })

    if (hasActualChanges || entry.lastSource !== 'oura') {
      if (dryRun) {
        if (updatedCount < 10) {
          console.log(
            chalk.green(
              `[DRY RUN] Would update ${entry.date.toISOString().split('T')[0]} (${entry.id})`
            )
          )
          console.log(chalk.gray(`  HRV: ${entry.hrv} -> ${normalized.hrv}`))
          console.log(chalk.gray(`  RHR: ${entry.restingHr} -> ${normalized.restingHr}`))
        }
      } else {
        await prisma.wellness.update({
          where: { id: entry.id },
          data: updateData
        })
      }
      updatedCount++
    }
  }

  console.log(chalk.bold('\nSoft Backfill Complete. Updated: ' + updatedCount))
}

async function handleHardBackfill(prisma: any, options: any) {
  const { dryRun, user: userEmail, days: daysStr } = options
  const days = parseInt(daysStr) || 90
  console.log(
    chalk.blue(`Starting HARD backfill (fetching from Oura API for last ${days} days)...`)
  )
  if (dryRun) {
    console.log(
      chalk.red('Error: Hard backfill does not support dry-run as it calls APIs and upserts.')
    )
    return
  }

  const where: any = { provider: 'oura' }
  if (userEmail) {
    const user = await prisma.user.findUnique({ where: { email: userEmail } })
    if (!user) throw new Error(`User not found: ${userEmail}`)
    where.userId = user.id
  }

  const integrations = await prisma.integration.findMany({ where })
  console.log(chalk.gray(`Found ${integrations.length} active Oura integrations.`))

  const { OuraService } = await import('../../server/utils/services/ouraService')

  for (const integration of integrations) {
    console.log(chalk.cyan(`Processing user ${integration.userId}...`))
    // Fetch specified days
    const today = new Date()
    for (let i = 0; i < days; i++) {
      const date = subDays(today, i)
      process.stdout.write(`  Syncing ${date.toISOString().split('T')[0]} (${i + 1}/${days})...`)
      try {
        await OuraService.syncDay(integration.userId, date)
      } catch (e: any) {
        console.error(
          chalk.red(`\n  Error syncing date ${date.toISOString().split('T')[0]}: ${e.message}`)
        )
      }
    }
    console.log(chalk.green('\n  Done.'))
  }
}

export default backfillOuraCommand
