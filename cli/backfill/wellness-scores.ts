import { Command } from 'commander'
import chalk from 'chalk'
import { PrismaClient, Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { normalizeIntervalsWellness } from '../../server/utils/intervals'

const backfillWellnessScoresCommand = new Command('wellness-scores')

backfillWellnessScoresCommand
  .description('Fix wellness scores (mood/soreness) from rawJson (normalize Intervals 1-4 scale)')
  .option('--prod', 'Use production database')
  .option('--dry-run', 'Run without saving changes', false)
  .option('--limit <number>', 'Limit the number of records to process', '100000')
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
      console.log(chalk.gray('Fetching Wellness entries with rawJson...'))

      const wellnessEntries = await prisma.wellness.findMany({
        where: {
          rawJson: { not: Prisma.JsonNull }
        },
        take: limit,
        orderBy: { date: 'desc' }
      })

      console.log(chalk.gray(`Found ${wellnessEntries.length} wellness entries to process.`))

      let processedCount = 0
      let fixedCount = 0
      let skippedCount = 0

      for (const entry of wellnessEntries) {
        processedCount++

        const raw = entry.rawJson as any
        if (!raw) {
          skippedCount++
          continue
        }

        // Use the updated normalize function to calculate new values
        // Note: We haven't updated the function yet, so we define the logic here for the backfill
        // to ensure it matches what we WILL put in the function.

        // MOOD: Intervals 1-4 (1=Great, 4=Grumpy) -> CW 1-10 (10=Great)
        // 1 -> 10, 2 -> 7, 3 -> 4, 4 -> 1
        const mapMood = (val: number | undefined) => {
          if (!val) return null
          const map: Record<number, number> = { 1: 10, 2: 7, 3: 4, 4: 1 }
          return map[val] || null
        }

        // SORENESS: Intervals 1-4 (1=Low, 4=Extreme) -> CW 1-10 (10=Extreme)
        // 1 -> 1, 2 -> 4, 3 -> 7, 4 -> 10
        const mapSoreness = (val: number | undefined) => {
          if (!val) return null
          const map: Record<number, number> = { 1: 1, 2: 4, 3: 7, 4: 10 }
          return map[val] || null
        }

        const newMood = mapMood(raw.mood)
        const newSoreness = mapSoreness(raw.soreness)

        let needsUpdate = false
        const updateData: any = {}

        if (newMood !== null && newMood !== entry.mood) {
          updateData.mood = newMood
          needsUpdate = true
        }

        if (newSoreness !== null && newSoreness !== entry.soreness) {
          updateData.soreness = newSoreness
          needsUpdate = true
        }

        if (needsUpdate) {
          if (isDryRun) {
            console.log(
              chalk.green(
                `[DRY RUN] Would update Wellness for ${entry.date.toISOString().split('T')[0]}`
              )
            )
            if (updateData.mood) {
              console.log(
                chalk.gray(`  Mood: Raw ${raw.mood} | DB ${entry.mood} -> New ${updateData.mood}`)
              )
            }
            if (updateData.soreness) {
              console.log(
                chalk.gray(
                  `  Soreness: Raw ${raw.soreness} | DB ${entry.soreness} -> New ${updateData.soreness}`
                )
              )
            }
          } else {
            await prisma.wellness.update({
              where: { id: entry.id },
              data: updateData
            })
            if (fixedCount % 50 === 0) {
              process.stdout.write('.')
            }
          }
          fixedCount++
        } else {
          skippedCount++
        }
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
