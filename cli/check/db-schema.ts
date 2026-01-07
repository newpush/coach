import { Command } from 'commander'
import chalk from 'chalk'
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const dbSchemaCommand = new Command('db-schema')

dbSchemaCommand.description('Check the database schema').action(async () => {
  console.log(chalk.green('=== Checking Database Schema ==='))

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter })

  try {
    // Check if Goal table exists
    console.log('Checking Goal table...')
    const goals = await prisma.goal.findMany({ take: 1 })
    console.log('Goal table accessible')
  } catch (error: any) {
    console.error('Error accessing Goal table:', error.message)
  }

  try {
    // Check User table columns
    console.log('Checking User table columns...')
    // We can't easily check columns with Prisma Client directly without raw query or introspection
    // But we can try to select a new field
    const user = await prisma.user.findFirst({
      select: {
        id: true,
        aiPersona: true,
        aiAutoAnalyzeNutrition: true
      }
    })
    console.log('User table new columns accessible')
  } catch (error: any) {
    console.error('Error accessing User table columns:', error.message)
  }

  try {
    // Check LlmUsage table columns
    console.log('Checking LlmUsage table columns...')
    const llm = await prisma.llmUsage.findFirst({
      select: {
        id: true,
        promptFull: true
      }
    })
    console.log('LlmUsage table new columns accessible')
  } catch (error: any) {
    console.error('Error accessing LlmUsage table columns:', error.message)
  }

  try {
    // Check Integration table columns - specifically initialSyncCompleted
    console.log('Checking Integration table columns...')
    const integration = await prisma.integration.findFirst({
      select: {
        id: true,
        initialSyncCompleted: true
      }
    })
    console.log('Integration table initialSyncCompleted accessible')
  } catch (error: any) {
    console.error('Error accessing Integration table columns:', error.message)
  }

  await prisma.$disconnect()
})

export default dbSchemaCommand
