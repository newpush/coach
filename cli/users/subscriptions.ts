import { Command } from 'commander'
import chalk from 'chalk'
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const subscriptionsCommand = new Command('subscriptions')
  .description('List users with active or past Stripe subscriptions')
  .option('--prod', 'Use production database')
  .action(async (options) => {
    const isProd = options.prod
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
      console.log(chalk.blue('Fetching subscription data...'))

      const users = await prisma.user.findMany({
        where: {
          OR: [
            { stripeSubscriptionId: { not: null } },
            { stripeCustomerId: { not: null } },
            { subscriptionStatus: { not: 'NONE' } },
            { subscriptionTier: { not: 'FREE' } }
          ]
        },
        select: {
          id: true,
          email: true,
          name: true,
          subscriptionTier: true,
          subscriptionStatus: true,
          subscriptionPeriodEnd: true,
          stripeSubscriptionId: true,
          stripeCustomerId: true,
          createdAt: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      })

      if (users.length === 0) {
        console.log(chalk.yellow('No users with subscriptions found.'))
      } else {
        console.log(chalk.green(`Found ${users.length} user(s) with subscription data:`))

        const formattedUsers = users.map((u) => ({
          Email: u.email,
          Name: u.name || 'N/A',
          Tier: u.subscriptionTier,
          Status: u.subscriptionStatus,
          'Period End': u.subscriptionPeriodEnd
            ? u.subscriptionPeriodEnd.toISOString().split('T')[0]
            : 'N/A',
          'Sub ID': u.stripeSubscriptionId
            ? `${u.stripeSubscriptionId.substring(0, 12)}...`
            : 'N/A',
          'Cust ID': u.stripeCustomerId || 'N/A'
        }))

        console.table(formattedUsers)
      }
    } catch (e: any) {
      console.error(chalk.red('Error fetching subscriptions:'), e.message)
      process.exit(1)
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })

export default subscriptionsCommand
