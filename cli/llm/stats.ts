import { Command } from 'commander'
import chalk from 'chalk'
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import Table from 'cli-table3'
import { format } from 'date-fns'

const llmStatsCommand = new Command('stats')
  .description('Show LLM cost and usage statistics')
  .option('--days <number>', 'Number of days to look back', '7')
  .option('--prod', 'Use production database')
  .action(async (options) => {
    const days = parseInt(options.days)
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
      console.log(chalk.blue(`\n📊 LLM Cost Summary (Last ${days} days)\n`))

      // 1. Daily Summary
      const dailyStats: any[] = await prisma.$queryRawUnsafe(`
        SELECT 
          DATE("createdAt") as date,
          COUNT(*)::int as count,
          SUM("estimatedCost") as cost,
          SUM("totalTokens")::int as tokens
        FROM "LlmUsage"
        WHERE "createdAt" > NOW() - INTERVAL '${days} days'
        GROUP BY DATE("createdAt")
        ORDER BY date DESC
      `)

      const dailyTable = new Table({
        head: ['Date', 'Requests', 'Tokens', 'Cost (USD)'],
        style: { head: ['cyan'] }
      })

      let totalCost = 0
      let totalRequests = 0

      dailyStats.forEach((s) => {
        const cost = Number(s.cost || 0)
        totalCost += cost
        totalRequests += s.count
        dailyTable.push([
          format(new Date(s.date), 'yyyy-MM-dd'),
          s.count,
          s.tokens?.toLocaleString() || 0,
          `$${cost.toFixed(4)}`
        ])
      })

      console.log(chalk.bold('Daily Totals:'))
      console.log(dailyTable.toString())
      console.log(chalk.cyan(`Total Cost: $${totalCost.toFixed(4)} across ${totalRequests} requests.`))

      // 1.5. Daily Breakdown by Model
      console.log(chalk.bold('\nDaily Breakdown by Model:'))
      const dailyModelStats: any[] = await prisma.$queryRawUnsafe(`
        SELECT 
          DATE("createdAt") as date,
          model,
          COUNT(*)::int as count,
          SUM("totalTokens")::bigint as tokens,
          SUM("cachedTokens")::bigint as cached,
          SUM("estimatedCost") as cost
        FROM "LlmUsage"
        WHERE "createdAt" > NOW() - INTERVAL '${days} days'
        GROUP BY DATE("createdAt"), model
        ORDER BY date DESC, cost DESC
      `)

      const dmTable = new Table({
        head: ['Date', 'Model', 'Requests', 'Tokens', 'Cached', 'Cost (USD)'],
        style: { head: ['blue'] }
      })

      dailyModelStats.forEach((s) => {
        dmTable.push([
          format(new Date(s.date), 'yyyy-MM-dd'),
          s.model,
          s.count,
          Number(s.tokens || 0).toLocaleString(),
          Number(s.cached || 0).toLocaleString(),
          `$${Number(s.cost || 0).toFixed(4)}`
        ])
      })
      console.log(dmTable.toString())

      // 2. Breakdown by Operation
      console.log(chalk.bold('\nBreakdown by Operation:'))
      const opStats: any[] = await prisma.$queryRawUnsafe(`
        SELECT 
          operation,
          COUNT(*)::int as count,
          SUM("estimatedCost") as cost
        FROM "LlmUsage"
        WHERE "createdAt" > NOW() - INTERVAL '${days} days'
        GROUP BY operation
        ORDER BY cost DESC
      `)

      const opTable = new Table({
        head: ['Operation', 'Requests', 'Cost (USD)', '% of Total'],
        style: { head: ['yellow'] }
      })

      opStats.forEach((s) => {
        const cost = Number(s.cost || 0)
        const pct = totalCost > 0 ? ((cost / totalCost) * 100).toFixed(1) : '0'
        opTable.push([s.operation, s.count, `$${cost.toFixed(4)}`, `${pct}%`])
      })

      console.log(opTable.toString())

      // 3. Breakdown by Model
      console.log(chalk.bold('\nBreakdown by Model:'))
      const modelStats: any[] = await prisma.$queryRawUnsafe(`
        SELECT 
          model,
          COUNT(*)::int as count,
          SUM("estimatedCost") as cost
        FROM "LlmUsage"
        WHERE "createdAt" > NOW() - INTERVAL '${days} days'
        GROUP BY model
        ORDER BY cost DESC
      `)

      const modelTable = new Table({
        head: ['Model', 'Requests', 'Cost (USD)'],
        style: { head: ['magenta'] }
      })

      modelStats.forEach((s) => {
        const cost = Number(s.cost || 0)
        modelTable.push([s.model, s.count, `$${cost.toFixed(4)}`])
      })

      console.log(modelTable.toString())

    } catch (e) {
      console.error(chalk.red('Error fetching LLM stats:'), e)
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })

export default llmStatsCommand
