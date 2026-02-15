import { Command } from 'commander'
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import Table from 'cli-table3'
import chalk from 'chalk'
import llmStatsCommand from './stats'
import recalculateCostsCommand from './recalculate-costs'

const llmCommand = new Command('llm').description('LLM usage and cost management')

// Register subcommands
llmCommand.addCommand(llmStatsCommand)
llmCommand.addCommand(recalculateCostsCommand)

llmCommand
  .command('token-buckets')
  .description('Analyze token usage distribution for chat operations')
  .option('--operation <name>', 'Operation to analyze', 'chat')
  .option('--days <number>', 'Number of days to look back', '30')
  .option('--prod', 'Use production database')
  .action(async (options) => {
    const days = parseInt(options.days)
    const operation = options.operation
    const isProd = options.prod

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
      console.log(
        chalk.blue(`\n📊 Analyzing token buckets for '${operation}' (last ${days} days)...\n`)
      )

      // 1. Get Aggregate Stats
      const stats: any = await prisma.$queryRawUnsafe(`
        SELECT 
            COUNT(*)::int as total_calls,
            ROUND(AVG("promptTokens"))::int as avg_prompt,
            MAX("promptTokens")::int as max_prompt,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "promptTokens")::int as p50,
            PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY "promptTokens")::int as p90,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "promptTokens")::int as p95,
            PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY "promptTokens")::int as p99
        FROM "LlmUsage"
        WHERE operation = '${operation}' 
        AND "createdAt" > NOW() - INTERVAL '${days} days'
      `)

      const s = stats[0]
      if (!s || s.total_calls === 0) {
        console.log(chalk.yellow('No usage data found for the specified period.'))
        return
      }

      const statsTable = new Table({
        head: ['Metric', 'Value'],
        colWidths: [20, 15]
      })

      statsTable.push(
        ['Total Calls', s.total_calls],
        ['Average Prompt', s.avg_prompt],
        ['Max Prompt', s.max_prompt],
        [chalk.green('P50 (Median)'), s.p50],
        [chalk.yellow('P90'), s.p90],
        [chalk.yellow('P95'), s.p95],
        [chalk.red('P99'), s.p99]
      )

      console.log(statsTable.toString())

      // 2. Get Distribution Buckets
      console.log(chalk.blue('\n📈 Token Distribution (Prompt Tokens):\n'))

      const buckets: any[] = await prisma.$queryRawUnsafe(`
        SELECT 
            bucket,
            COUNT(*)::int as count
        FROM (
            SELECT 
                (width_bucket("promptTokens", 0, 100000, 20) - 1) * 5000 as bucket
            FROM "LlmUsage"
            WHERE operation = '${operation}'
            AND "createdAt" > NOW() - INTERVAL '${days} days'
        ) t
        GROUP BY bucket
        ORDER BY bucket;
      `)

      const maxCount = Math.max(...buckets.map((b) => b.count))
      const chartWidth = 40

      buckets.forEach((b) => {
        const barLength = Math.round((b.count / maxCount) * chartWidth)
        const bar = '█'.repeat(barLength)
        const label = `${b.bucket.toLocaleString().padStart(6)} - ${(b.bucket + 5000).toLocaleString().padStart(6)}`
        console.log(`${chalk.cyan(label)} | ${bar} ${chalk.white(b.count)}`)
      })

      console.log('\n' + chalk.gray('Each bucket represents a range of 5,000 tokens.') + '\n')
    } catch (e) {
      console.error(chalk.red('Error analyzing token buckets:'), e)
      process.exit(1)
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })

llmCommand
  .command('summarize-room')
  .description('Manually trigger summarization for a chat room')
  .argument('<roomId>', 'ID of the chat room')
  .option('--prod', 'Use production environment')
  .action(async (roomId, options) => {
    const isProd = options.prod
    const connectionString = isProd ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL

    const pool = new pg.Pool({ connectionString })
    const adapter = new PrismaPg(pool)
    const prisma = new PrismaClient({ adapter })

    try {
      console.log(chalk.blue(`\n🔄 Triggering manual summarization for room ${roomId}...\n`))

      // 1. Verify room exists and get owner
      const participant = await prisma.chatParticipant.findFirst({
        where: { roomId },
        select: { userId: true }
      })

      if (!participant) {
        console.error(chalk.red(`Error: Room ${roomId} not found or has no participants.`))
        return
      }

      // 2. Trigger the task
      const { summarizeChatTask } = await import('../../trigger/summarize-chat')
      const result = await summarizeChatTask.trigger({ roomId, userId: participant.userId })

      console.log(chalk.green(`✅ Summarization task triggered!`))
      console.log(chalk.gray(`Run ID: ${result.id}`))
      console.log(
        chalk.gray(
          `You can monitor this in the Trigger.dev dashboard or via 'cw:cli trigger get ${result.id}'`
        )
      )
    } catch (e) {
      console.error(chalk.red('Error triggering summarization:'), e)
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })

export default llmCommand
