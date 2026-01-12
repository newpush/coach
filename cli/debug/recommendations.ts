import { Command } from 'commander'
import chalk from 'chalk'
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const debugRecommendationsCommand = new Command('recommendations')

debugRecommendationsCommand
  .description('Debug recommendations for a user')
  .option('--prod', 'Use production database')
  .option('--user <email>', 'Filter by user email')
  .option('--status <status>', 'Filter by status (ACTIVE, COMPLETED, DISMISSED, ALL)', 'ACTIVE')
  .option('--category <category>', 'Filter by category')
  .action(async (options) => {
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
      const where: any = {}

      if (options.user) {
        const user = await prisma.user.findUnique({ where: { email: options.user } })
        if (!user) {
          console.error(chalk.red(`User not found: ${options.user}`))
          process.exit(1)
        }
        where.userId = user.id
        console.log(chalk.green(`User found: ${user.email} (${user.id})`))
      }

      if (options.status !== 'ALL') {
        where.status = options.status
      }

      if (options.category) {
        where.category = options.category
      }

      console.log(chalk.gray('Fetching recommendations...'))
      const recommendations = await prisma.recommendation.findMany({
        where,
        orderBy: { generatedAt: 'desc' }
      })

      console.log(chalk.gray(`Found ${recommendations.length} recommendations.`))

      if (recommendations.length > 0) {
        console.log(chalk.bold.cyan('\n=== Recommendations ==='))
        recommendations.forEach((rec) => {
          console.log(chalk.white(`\nID: ${chalk.gray(rec.id)}`))
          console.log(`Title: ${chalk.bold(rec.title)}`)
          console.log(`Category: ${rec.category ? chalk.blue(rec.category) : chalk.gray('None')}`)
          console.log(`Status: ${getStatusColor(rec.status)(rec.status)}`)
          console.log(`Priority: ${getPriorityColor(rec.priority)(rec.priority)}`)
          console.log(`Metric: ${rec.metric}`)
          console.log(`Source Type: ${rec.sourceType}`)
          console.log(`Generated: ${rec.generatedAt.toISOString()}`)
          console.log(`Pinned: ${rec.isPinned ? chalk.green('Yes') : chalk.gray('No')}`)
        })
      } else {
        console.log(chalk.yellow('No recommendations found matching the criteria.'))
      }

      // Check distinct categories for the user if user is selected
      if (where.userId) {
        const categories = await prisma.recommendation.findMany({
          where: { userId: where.userId },
          select: { category: true },
          distinct: ['category']
        })
        const distinctCategories = categories.map((c) => c.category).filter(Boolean)
        console.log(chalk.bold.cyan('\n=== Distinct Categories for User ==='))
        if (distinctCategories.length > 0) {
          distinctCategories.forEach((c) => console.log(chalk.blue(`- ${c}`)))
        } else {
          console.log(chalk.gray('No categories found.'))
        }
      }
    } catch (e: any) {
      console.error(chalk.red('Error:'), e)
    } finally {
      await prisma.$disconnect()
    }
  })

function getStatusColor(status: string) {
  switch (status) {
    case 'ACTIVE':
      return chalk.green
    case 'COMPLETED':
      return chalk.blue
    case 'DISMISSED':
      return chalk.gray
    default:
      return chalk.white
  }
}

function getPriorityColor(priority: string) {
  switch (priority?.toLowerCase()) {
    case 'high':
      return chalk.red
    case 'medium':
      return chalk.yellow
    case 'low':
      return chalk.green
    default:
      return chalk.white
  }
}

export default debugRecommendationsCommand
