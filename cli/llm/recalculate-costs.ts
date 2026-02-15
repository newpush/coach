import { Command } from 'commander'
import chalk from 'chalk'
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { calculateLlmCost } from '../../server/utils/ai-config'

const recalculateCostsCommand = new Command('recalculate-costs')
  .description('Recalculate estimatedCost for historical LlmUsage records based on current pricing')
  .option('--days <number>', 'Number of days to look back', '30')
  .option('--prod', 'Use production database')
  .option('--dry-run', 'Show what would be updated without actually updating')
  .action(async (options) => {
    const days = parseInt(options.days)
    const isProd = options.prod
    const dryRun = options.dryRun
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
      console.log(chalk.blue(`\n🔄 Recalculating costs for records in the last ${days} days...\n`))

      const records = await prisma.llmUsage.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000)
          },
          success: true,
          promptTokens: { not: null },
          completionTokens: { not: null }
        },
        select: {
          id: true,
          model: true,
          promptTokens: true,
          completionTokens: true,
          cachedTokens: true,
          reasoningTokens: true,
          estimatedCost: true,
          createdAt: true
        }
      })

      if (records.length === 0) {
        console.log(chalk.yellow('No eligible records found.'))
        return
      }

      console.log(chalk.gray(`Found ${records.length} records to process.`))

      let updatedCount = 0
      let totalOldCost = 0
      let totalNewCost = 0

      for (const record of records) {
        const inputTokens = record.promptTokens || 0
        const outputTokens = (record.completionTokens || 0) + (record.reasoningTokens || 0)
        const cachedTokens = record.cachedTokens || 0

        const newCost = calculateLlmCost(record.model, inputTokens, outputTokens, cachedTokens)
        const oldCost = Number(record.estimatedCost || 0)

        totalOldCost += oldCost
        totalNewCost += newCost

        // Check if discrepancy exists (using small epsilon for float comparison)
        if (Math.abs(newCost - oldCost) > 0.0000001) {
          updatedCount++
          
          if (dryRun) {
            if (updatedCount <= 5) {
              console.log(chalk.gray(`[Dry Run] Record ${record.id} (${record.model}): $${oldCost.toFixed(6)} -> $${newCost.toFixed(6)}`))
            }
          } else {
            await prisma.llmUsage.update({
              where: { id: record.id },
              data: { estimatedCost: newCost }
            })
          }
        }
      }

      console.log('\n' + chalk.bold('Summary:'))
      console.log(`Total Records:    ${records.length}`)
      console.log(`Records Changed:  ${updatedCount}`)
      console.log(`Current DB Total: $${totalOldCost.toFixed(4)}`)
      console.log(`New Calc Total:   $${totalNewCost.toFixed(4)}`)
      console.log(`Difference:       ${chalk.cyan(`$${(totalNewCost - totalOldCost).toFixed(4)}`)}`)

      if (dryRun) {
        console.log(chalk.yellow('\nThis was a DRY RUN. No records were updated.'))
      } else {
        console.log(chalk.green(`\nSuccessfully updated ${updatedCount} records!`))
      }

    } catch (e) {
      console.error(chalk.red('Error recalculating LLM costs:'), e)
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })

export default recalculateCostsCommand
