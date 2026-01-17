import { Command } from 'commander'
import chalk from 'chalk'
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import statsCommand from './stats'

const usersCommand = new Command('users').description('User management commands')

usersCommand.addCommand(statsCommand)

usersCommand
  .command('set-admin')
  .description('Set or unset admin privileges for a user')
  .argument('<email>', 'User email address')
  .argument('<state>', 'true/false')
  .option('--prod', 'Use production database')
  .action(async (email, state, options) => {
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

    const isAdmin = state === 'true' || state === '1'

    const pool = new pg.Pool({ connectionString })
    const adapter = new PrismaPg(pool)
    const prisma = new PrismaClient({ adapter })

    try {
      const user = await prisma.user.findUnique({
        where: { email }
      })

      if (!user) {
        console.error(chalk.red(`User with email ${email} not found.`))
        process.exit(1)
      }

      const updatedUser = await prisma.user.update({
        where: { email },
        data: { isAdmin }
      })

      console.log(
        chalk.green(
          `Successfully ${isAdmin ? 'granted' : 'revoked'} admin privileges for ${updatedUser.email}`
        )
      )
    } catch (e) {
      console.error(chalk.red('Error updating user:'), e)
      process.exit(1)
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })

usersCommand
  .command('search')
  .description('Search for users by email or name (partial match)')
  .argument('<query>', 'Search query')
  .option('--prod', 'Use production database')
  .action(async (query, options) => {
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
      const users = await prisma.user.findMany({
        where: {
          OR: [
            { email: { contains: query, mode: 'insensitive' } },
            { name: { contains: query, mode: 'insensitive' } }
          ]
        },
        select: {
          id: true,
          email: true,
          name: true,
          isAdmin: true,
          createdAt: true
        }
      })

      if (users.length === 0) {
        console.log(chalk.yellow(`No users found matching "${query}".`))
      } else {
        console.log(chalk.green(`Found ${users.length} user(s):`))
        console.table(users)
      }
    } catch (e) {
      console.error(chalk.red('Error searching users:'), e)
      process.exit(1)
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })

export default usersCommand
