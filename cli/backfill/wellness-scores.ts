import { Command } from 'commander'
import chalk from 'chalk'
import { PrismaClient, Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { normalizeIntervalsWellness } from '../../server/utils/intervals'
import { normalizeOuraWellness } from '../../server/utils/oura'

const backfillWellnessScoresCommand = new Command('wellness-scores')

backfillWellnessScoresCommand
  .description('Fix wellness scores (mood/soreness) from rawJson (normalize Intervals 1-4 scale)')
  .option('--prod', 'Use production database')
  .option('--dry-run', 'Run without saving changes', false)
  .option('--id <id>', 'Process only a specific record ID')
  .option('--userId <id>', 'Process only records for a specific user ID')
  .option('--user <email>', 'Process only records for a specific user email')
  .option('--limit <number>', 'Limit the number of records to process', '1000000')
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
      console.log(chalk.gray('Fetching Wellness entries count...'))

      const where: any = {
        rawJson: { not: Prisma.JsonNull }
      }
      if (options.id) {
        where.id = options.id
      }
      if (options.userId) {
        where.userId = options.userId
      }
      if (options.user) {
        const user = await prisma.user.findUnique({ where: { email: options.user } })
        if (!user) {
          console.error(chalk.red(`User not found: ${options.user}`))
          process.exit(1)
        }
        where.userId = user.id
        console.log(chalk.green(`Filtering for user: ${user.name || user.email} (${user.id})`))
      }

      const totalCount = await prisma.wellness.count({ where })
      console.log(chalk.gray(`Found ${totalCount} wellness entries for processing.`))

      let cursor: string | undefined
      let processedCount = 0
      let fixedCount = 0
      let skippedCount = 0
      const batchSize = 1000

      while (processedCount < limit) {
        const wellnessEntries = await prisma.wellness.findMany({
          where,
          take: batchSize,
          skip: cursor ? 1 : 0,
          cursor: cursor ? { id: cursor } : undefined,
          orderBy: { id: 'asc' }
        })

        if (wellnessEntries.length === 0) break

        cursor = wellnessEntries[wellnessEntries.length - 1].id

        const updates: Promise<any>[] = []

        for (const entry of wellnessEntries) {
          processedCount++
          const raw = entry.rawJson as any
          if (!raw) {
            skippedCount++
            continue
          }

          let normalized: any = null

          // Detect Source
          const isOuraFormat = raw.dailyReadiness || raw.readiness_score || (entry.lastSource === 'oura')

          if (isOuraFormat && (raw.dailyReadiness || raw.dailySleep)) {
            normalized = normalizeOuraWellness(
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
          } else {
            // Default to Intervals normalization (also handles readiness -> recoveryScore)
            normalized = normalizeIntervalsWellness(raw, entry.userId, entry.date)
          }

          if (!normalized) {
            skippedCount++
            continue
          }

          const updateData: any = {}
          let needsUpdate = false

          // Fields to check for backfill
          const fields = [
            'mood', 'soreness', 'stress', 'fatigue',
            'sleepQuality', 'motivation', 'readiness', 'recoveryScore'
          ]

          for (const field of fields) {
            const newVal = (normalized as any)[field]
            const currentVal = (entry as any)[field]

            // If the field is non-null in normalized data and differs from current DB value
            if (newVal !== null && newVal !== undefined && newVal !== currentVal) {
              updateData[field] = newVal
              needsUpdate = true
            }
          }

          if (needsUpdate) {
            if (isDryRun) {
              if (fixedCount < 10 || options.id) {
                console.log(
                  chalk.green(`[DRY RUN] Update for ${entry.date.toISOString().split('T')[0]} (${entry.id})`)
                )
                for (const [k, v] of Object.entries(updateData)) {
                  console.log(chalk.gray(`  ${k}: ${(entry as any)[k]} -> ${v}`))
                }
              }
            } else {
              updates.push(
                prisma.wellness.update({
                  where: { id: entry.id },
                  data: updateData
                })
              )
            }
            fixedCount++
          } else {
            skippedCount++
          }
        }

        if (updates.length > 0) {
          await Promise.all(updates)
        }

        if (processedCount % 5000 === 0) {
          console.log(chalk.gray(`Processed ${processedCount}/${totalCount}... (Fixed: ${fixedCount})`))
        }

        if (wellnessEntries.length < batchSize) break
      }

      console.log('\n')
      console.log(chalk.bold('Summary:'))
      console.log(`Total Processed: ${processedCount}`)
      console.log(`Fixed:           ${fixedCount}`)
      console.log(`Skipped:         ${skippedCount}`)

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

export default backfillWellnessScoresCommand
