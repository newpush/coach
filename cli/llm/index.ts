import { Command } from 'commander'
import chalk from 'chalk'
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const llmCommand = new Command('llm').description('LLM management commands')

llmCommand
  .command('update-model')
  .description('Update AI model preference for all users to Flash')
  .option('--prod', 'Use production database')
  .option('--dry', 'Dry run: print changes without applying them')
  .action(async (options) => {
    const isProd = options.prod
    const isDry = options.dry
    const connectionString = isProd ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL

    if (isProd) {
      console.log(chalk.yellow('⚠️  Using PRODUCTION database.'))
    } else {
      console.log(chalk.blue('Using DEVELOPMENT database.'))
    }

    if (!connectionString) {
      console.error(chalk.red('Error: Database connection string is not defined.'))
      if (isProd) {
        console.error(chalk.red('Make sure DATABASE_URL_PROD is set in .env'))
      } else {
        console.error(chalk.red('Make sure DATABASE_URL is set in .env'))
      }
      process.exit(1)
    }

    const pool = new pg.Pool({ connectionString })
    const adapter = new PrismaPg(pool)
    const prisma = new PrismaClient({ adapter })

    try {
      console.log(chalk.blue('Fetching users...'))
      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          aiModelPreference: true
        }
      })

      console.log(chalk.blue(`Found ${users.length} users.`))

      // Defined in server/utils/gemini.ts
      const MODEL_MAPPINGS: Record<string, string> = {
        flash: 'gemini-flash-latest',
        pro: 'gemini-3-pro-preview'
      }

      const TARGET_MODEL = 'flash'
      const TARGET_API_MODEL = MODEL_MAPPINGS[TARGET_MODEL]

      console.log(chalk.cyan('\n--- Configuration ---'))
      console.log(chalk.cyan(`Target DB Value: '${TARGET_MODEL}'`))
      console.log(chalk.cyan(`Maps to API Model: '${TARGET_API_MODEL}'`))
      console.log(chalk.cyan('---------------------\n'))

      let updatedCount = 0
      const currentModels: Record<string, number> = {}

      for (const user of users) {
        const rawValue = user.aiModelPreference || 'null'
        currentModels[rawValue] = (currentModels[rawValue] || 0) + 1

        if (user.aiModelPreference !== TARGET_MODEL) {
          if (isDry) {
            console.log(
              chalk.yellow(
                `[DRY] Would update user ${user.email} (${user.id}) from '${rawValue}' to '${TARGET_MODEL}'`
              )
            )
          } else {
            console.log(
              chalk.blue(
                `Updating user ${user.email} (${user.id}) from '${rawValue}' to '${TARGET_MODEL}'`
              )
            )
            await prisma.user.update({
              where: { id: user.id },
              data: { aiModelPreference: TARGET_MODEL }
            })
          }
          updatedCount++
        }
      }

      console.log('\n--- Current Database Distribution ---')
      for (const [model, count] of Object.entries(currentModels)) {
        const mapping = MODEL_MAPPINGS[model]
        const status = mapping ? `(Maps to: ${mapping})` : chalk.red('(Unknown/Legacy)')
        console.log(`  '${model}': ${count} users ${status}`)
      }
      console.log('-------------------------------------')

      if (isDry) {
        console.log(
          chalk.yellow(`\n[DRY] Would update ${updatedCount} users to '${TARGET_MODEL}'.`)
        )
      } else {
        console.log(chalk.green(`\nUpdated ${updatedCount} users to '${TARGET_MODEL}'.`))
      }
    } catch (e) {
      console.error(chalk.red('Error updating users:'), e)
      process.exit(1)
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })

llmCommand
  .command('recalculate-costs')
  .description('Recalculate AI usage costs for a specific date')
  .option('--date <YYYY-MM-DD>', 'Target date (e.g., 2026-02-04)')
  .option('--prod', 'Use production database')
  .option('--dry', 'Dry run: print changes without applying them')
  .action(async (options) => {
    const isProd = options.prod
    const isDry = options.dry
    const dateStr = options.date

    const connectionString = isProd ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL

    if (isProd) {
      console.log(chalk.yellow('⚠️  Using PRODUCTION database.'))
    } else {
      console.log(chalk.blue('Using DEVELOPMENT database.'))
    }

    if (!connectionString) {
      console.error(chalk.red('Error: Database connection string is not defined.'))
      process.exit(1)
    }

    const pool = new pg.Pool({ connectionString })
    const adapter = new PrismaPg(pool)
    const prisma = new PrismaClient({ adapter })

    try {
      // Import the shared pricing logic
      const { calculateLlmCost } = await import('../../server/utils/ai-config')

      const where: any = {
        success: true,
        promptTokens: { not: null },
        completionTokens: { not: null }
      }

      if (dateStr) {
        const startOfDay = new Date(`${dateStr}T00:00:00Z`)
        const endOfDay = new Date(`${dateStr}T23:59:59Z`)
        where.createdAt = {
          gte: startOfDay,
          lte: endOfDay
        }
      }

      console.log(
        chalk.blue(
          dateStr
            ? `Fetching LLM usage for ${dateStr}...`
            : 'Fetching all successful LLM usage records...'
        )
      )

      const usageRecords = await prisma.llmUsage.findMany({
        where,
        orderBy: { createdAt: 'asc' }
      })

      if (usageRecords.length === 0) {
        console.log(chalk.yellow('No records found.'))
        return
      }

      console.log(chalk.blue(`Found ${usageRecords.length} successful records.`))

      // Group records by date
      const recordsByDate: Record<string, typeof usageRecords> = {}
      for (const record of usageRecords) {
        const d = record.createdAt.toISOString().split('T')[0]
        if (!recordsByDate[d]) recordsByDate[d] = []
        recordsByDate[d].push(record)
      }

      const sortedDates = Object.keys(recordsByDate).sort()

      let overallTotalUpdated = 0
      let overallTotalOldCost = 0
      let overallTotalNewCost = 0

      for (const d of sortedDates) {
        const dayRecords = recordsByDate[d]
        let dayUpdated = 0
        let dayOldCost = 0
        let dayNewCost = 0

        console.log(chalk.bold(`\nProcessing ${d} (${dayRecords.length} records)...`))

        for (const record of dayRecords) {
          const newCost = calculateLlmCost(
            record.model,
            record.promptTokens || 0,
            record.completionTokens || 0,
            record.cachedTokens || 0
          )
          const oldCost = record.estimatedCost || 0

          dayOldCost += oldCost
          dayNewCost += newCost

          if (Math.abs(newCost - oldCost) > 0.000001) {
            if (!isDry) {
              await prisma.llmUsage.update({
                where: { id: record.id },
                data: { estimatedCost: newCost }
              })
            }
            dayUpdated++
          }
        }

        console.log(`  Records checked: ${dayRecords.length}`)
        console.log(`  Records with cost change: ${dayUpdated}`)
        console.log(`  Day Old Cost: $${dayOldCost.toFixed(4)}`)
        console.log(`  Day New Cost: $${dayNewCost.toFixed(4)}`)

        overallTotalUpdated += dayUpdated
        overallTotalOldCost += dayOldCost
        overallTotalNewCost += dayNewCost
      }

      console.log(chalk.cyan('\n--- Recalculation Summary ---'))
      if (dateStr) {
        console.log(chalk.cyan(`Date: ${dateStr}`))
      } else {
        console.log(chalk.cyan(`Dates processed: ${sortedDates.length}`))
      }
      console.log(chalk.cyan(`Total records checked: ${usageRecords.length}`))
      console.log(chalk.cyan(`Total records with cost change: ${overallTotalUpdated}`))
      console.log(chalk.cyan(`Total Old Cost: $${overallTotalOldCost.toFixed(4)}`))
      console.log(chalk.cyan(`Total New Cost: $${overallTotalNewCost.toFixed(4)}`))
      console.log(chalk.cyan('-----------------------------\n'))

      if (isDry) {
        console.log(chalk.yellow(`[DRY] Finished. No changes applied.`))
      } else {
        console.log(chalk.green(`Successfully updated ${overallTotalUpdated} records.`))
      }
    } catch (e) {
      console.error(chalk.red('Error recalculating costs:'), e)
      process.exit(1)
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })

llmCommand
  .command('debug')
  .description('Debug recent LLM usage entries')
  .option('--limit <number>', 'Number of records to show', '10')
  .option('--user <email>', 'Filter by user email')
  .option('--prod', 'Use production database')
  .option('--full', 'Show full prompts and responses if available')
  .action(async (options) => {
    const isProd = options.prod
    const limit = parseInt(options.limit, 10)
    const userEmail = options.user
    const showFull = options.full

    const connectionString = isProd ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL

    if (isProd) {
      console.log(chalk.yellow('⚠️  Using PRODUCTION database.'))
    } else {
      console.log(chalk.blue('Using DEVELOPMENT database.'))
    }

    if (!connectionString) {
      console.error(chalk.red('Error: Database connection string is not defined.'))
      process.exit(1)
    }

    const pool = new pg.Pool({ connectionString })
    const adapter = new PrismaPg(pool)
    const prisma = new PrismaClient({ adapter })

    try {
      let userId = undefined
      if (userEmail) {
        const user = await prisma.user.findUnique({
          where: { email: userEmail },
          select: { id: true }
        })
        if (!user) {
          console.error(chalk.red(`User not found: ${userEmail}`))
          process.exit(1)
        }
        userId = user.id
      }

      const records = await prisma.llmUsage.findMany({
        where: userId ? { userId } : undefined,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              email: true,
              nickname: true
            }
          }
        }
      })

      if (records.length === 0) {
        console.log(chalk.yellow('No LLM usage records found.'))
        return
      }

      console.log(chalk.blue(`\nShowing last ${records.length} LLM usage records:\n`))

      for (const record of records) {
        const status = record.success ? chalk.green('SUCCESS') : chalk.red('FAILED')
        const cost = record.estimatedCost ? `$${record.estimatedCost.toFixed(4)}` : 'N/A'
        const time = record.createdAt.toLocaleString()

        console.log(chalk.bold('--------------------------------------------------'))
        console.log(`${chalk.cyan('ID:')} ${record.id} | ${chalk.cyan('Date:')} ${time}`)
        console.log(
          `${chalk.cyan('User:')} ${record.user?.email || 'System'} | ${chalk.cyan('Op:')} ${record.operation} | ${chalk.cyan('Model:')} ${record.model}`
        )
        console.log(
          `${chalk.cyan('Status:')} ${status} | ${chalk.cyan('Tokens:')} ${record.totalTokens} (In: ${record.promptTokens}, Out: ${record.completionTokens}) | ${chalk.cyan('Cost:')} ${cost}`
        )

        if (record.entityType) {
          console.log(`${chalk.cyan('Entity:')} ${record.entityType}:${record.entityId}`)
        }

        console.log(chalk.yellow('\nPrompt Preview:'))
        console.log(
          showFull && record.promptFull ? record.promptFull : record.promptPreview || 'N/A'
        )

        console.log(chalk.green('\nResponse Preview:'))
        console.log(
          showFull && record.responseFull ? record.responseFull : record.responsePreview || 'N/A'
        )

        if (!record.success && record.errorMessage) {
          console.log(chalk.red(`\nError: [${record.errorType}] ${record.errorMessage}`))
        }
        console.log('')
      }
    } catch (e) {
      console.error(chalk.red('Error fetching LLM usage:'), e)
      process.exit(1)
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })

export default llmCommand
