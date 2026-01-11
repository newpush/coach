import { Command } from 'commander'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import chalk from 'chalk'

const llmRequestCommand = new Command('llm-request')
  .description('Inspect LLM usage request details')
  .argument('<id>', 'LlmUsage ID')
  .option('--prod', 'Use production database')
  .action(async (id: string, options) => {
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

    const pool = new pg.Pool({ connectionString })
    const adapter = new PrismaPg(pool)
    const prisma = new PrismaClient({ adapter })

    try {
      const record = await prisma.llmUsage.findUnique({
        where: { id }
      })

      if (!record) {
        console.error(`LlmUsage record with ID ${id} not found.`)
        return
      }

      console.log('--- LlmUsage Record ---')
      console.log(`ID: ${record.id}`)
      console.log(`Operation: ${record.operation}`)
      console.log(`Model: ${record.model}`)
      console.log(`Success: ${record.success}`)
      console.log('-----------------------')
      console.log('--- Prompt Full ---')
      console.log(record.promptFull)
      console.log('-----------------------')
      console.log('--- Response Full ---')
      console.log(record.responseFull)
      console.log('-----------------------')
    } catch (error) {
      console.error('Error fetching LlmUsage record:', error)
    } finally {
      await prisma.$disconnect()
    }
  })

export default llmRequestCommand
