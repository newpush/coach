import { Command } from 'commander'
import chalk from 'chalk'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const analyzeCommand = new Command('analyze')
  .description('List and manage users with auto-analyze features enabled')
  .option('--prod', 'Use production database')
  .option('--fix', 'Disable auto-analyze for users without active paid subscription')
  .action(async (options) => {
    const isProd = options.prod
    const fix = options.fix
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
      // Find users with any auto-analyze feature enabled
      const users = await prisma.user.findMany({
        where: {
          OR: [
            { aiAutoAnalyzeWorkouts: true },
            { aiAutoAnalyzeNutrition: true },
            { aiAutoAnalyzeReadiness: true },
            { aiProactivityEnabled: true },
            { aiDeepAnalysisEnabled: true }
          ]
        },
        select: {
          id: true,
          email: true,
          name: true,
          subscriptionTier: true,
          subscriptionStatus: true,
          subscriptionPeriodEnd: true,
          aiAutoAnalyzeWorkouts: true,
          aiAutoAnalyzeNutrition: true,
          aiAutoAnalyzeReadiness: true,
          aiProactivityEnabled: true,
          aiDeepAnalysisEnabled: true
        }
      })

      if (users.length === 0) {
        console.log(chalk.green('No users found with auto-analyze features enabled.'))
        return
      }

      console.log(chalk.blue(`Found ${users.length} users with auto-analyze enabled:`))

      const usersToFix: typeof users = []

      // Table output
      console.table(
        users.map((u) => {
          const isPaid = u.subscriptionTier === 'PRO' || u.subscriptionTier === 'SUPPORTER'

          let isActive = u.subscriptionStatus === 'ACTIVE' || u.subscriptionStatus === 'CONTRIBUTOR'

          // Allow CANCELED if they are still within the period
          if (u.subscriptionStatus === 'CANCELED' && u.subscriptionPeriodEnd) {
            if (new Date(u.subscriptionPeriodEnd) > new Date()) {
              isActive = true
            }
          }

          // Check if they should have it enabled.
          const valid = isPaid && isActive

          if (!valid) {
            usersToFix.push(u)
          }

          return {
            email: u.email,
            tier: u.subscriptionTier,
            status: u.subscriptionStatus,
            end: u.subscriptionPeriodEnd
              ? u.subscriptionPeriodEnd.toISOString().split('T')[0]
              : 'N/A',
            workouts: u.aiAutoAnalyzeWorkouts,
            nutrition: u.aiAutoAnalyzeNutrition,
            readiness: u.aiAutoAnalyzeReadiness,
            proactive: u.aiProactivityEnabled,
            deep: u.aiDeepAnalysisEnabled,
            valid_sub: valid ? '✅' : '❌'
          }
        })
      )

      if (fix) {
        if (usersToFix.length === 0) {
          console.log(
            chalk.green('All users with auto-analyze have valid subscriptions. Nothing to fix.')
          )
        } else {
          console.log(
            chalk.yellow(
              `Disabling auto-analyze for ${usersToFix.length} users without active subscription...`
            )
          )

          for (const user of usersToFix) {
            await prisma.user.update({
              where: { id: user.id },
              data: {
                aiAutoAnalyzeWorkouts: false,
                aiAutoAnalyzeNutrition: false,
                aiAutoAnalyzeReadiness: false,
                aiProactivityEnabled: false,
                aiDeepAnalysisEnabled: false
              }
            })
            console.log(chalk.gray(`Updated ${user.email}`))
          }
          console.log(chalk.green('Done.'))
        }
      } else if (usersToFix.length > 0) {
        console.log(
          chalk.yellow(`
${usersToFix.length} users have auto-analyze enabled without an active paid subscription.`)
        )
        console.log(chalk.yellow('Run with --fix to disable these settings.'))
      }
    } catch (e) {
      console.error(chalk.red('Error:'), e)
      process.exit(1)
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })

export default analyzeCommand
