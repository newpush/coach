import { Command } from 'commander'
import chalk from 'chalk'
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const debugGoalsCommand = new Command('goals')

debugGoalsCommand.description('Debug goals and events').option('--prod', 'Use production database')

debugGoalsCommand
  .command('list')
  .description('List recent goals')
  .option('-n, --limit <number>', 'Number of goals to list', '10')
  .action(async (options) => {
    const isProd = debugGoalsCommand.opts().prod
    const connectionString = isProd ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL

    if (isProd) {
      console.log(chalk.yellow('Using PRODUCTION database.'))
    } else {
      console.log(chalk.blue('Using DEVELOPMENT database.'))
    }

    if (!connectionString) {
      console.error(chalk.red('Database connection string is not defined.'))
      process.exit(1)
    }

    const pool = new pg.Pool({ connectionString })
    const adapter = new PrismaPg(pool)
    const prisma = new PrismaClient({ adapter })

    try {
      const goals = await prisma.goal.findMany({
        take: parseInt(options.limit),
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { email: true } } }
      })

      console.log(chalk.bold(`\n=== Recent Goals (${goals.length}) ===`))
      goals.forEach((goal) => {
        console.log(
          `${chalk.cyan(goal.id)} | ${goal.title} | ${goal.user.email} | ${goal.createdAt.toISOString().split('T')[0]}`
        )
      })
    } catch (e) {
      console.error(chalk.red('Error listing goals:'), e)
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })

debugGoalsCommand
  .command('show')
  .description('Show full details for a goal')
  .argument('<goalId>', 'Goal ID')
  .action(async (goalId) => {
    const isProd = debugGoalsCommand.opts().prod
    const connectionString = isProd ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL

    if (isProd) {
      console.log(chalk.yellow('Using PRODUCTION database.'))
    } else {
      console.log(chalk.blue('Using DEVELOPMENT database.'))
    }

    if (!connectionString) {
      console.error(chalk.red('Database connection string is not defined.'))
      process.exit(1)
    }

    const pool = new pg.Pool({ connectionString })
    const adapter = new PrismaPg(pool)
    const prisma = new PrismaClient({ adapter })

    try {
      const goal = await prisma.goal.findUnique({
        where: { id: goalId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              timezone: true
            }
          },
          events: true
        }
      })

      if (!goal) {
        // Try to find as Event
        const event = await prisma.event.findUnique({
          where: { id: goalId },
          include: {
            user: { select: { timezone: true } },
            goals: true
          }
        })

        if (event) {
          console.log(chalk.bold(`\n=== Event Found (Not a Goal): ${event.title} ===`))
          console.log(`ID: ${event.id}`)
          console.log(`Date (DB): ${event.date.toISOString()}`)
          if (event.user.timezone) {
            console.log(
              `Local: ${event.date.toLocaleString('en-US', { timeZone: event.user.timezone })}`
            )
          }

          console.log(chalk.bold(`\n-- Linked Goals (${event.goals.length}) --`))
          event.goals.forEach((g) => {
            console.log(`Goal ID: ${g.id}`)
            console.log(`Title:   ${g.title}`)
            console.log(`Target Date: ${g.targetDate?.toISOString()}`)
            console.log(`Event Date:  ${g.eventDate?.toISOString()}`)
          })
          return
        }

        console.error(chalk.red(`Goal (or Event) not found: ${goalId}`))
        return
      }

      console.log(
        chalk.bold(`
=== Goal: ${goal.title} ===`)
      )
      console.log(`ID:        ${chalk.cyan(goal.id)}`)
      console.log(`Type:      ${goal.type}`)
      console.log(`Status:    ${goal.status}`)
      console.log(`User:      ${goal.user.name} (${goal.user.email})`)
      console.log(`Timezone:  ${chalk.green(goal.user.timezone || 'UTC (Default)')}`)

      console.log(chalk.bold('\n-- Dates --'))
      console.log(`Target Date (DB): ${chalk.yellow(goal.targetDate?.toISOString() || 'N/A')}`)
      console.log(`Event Date (DB):  ${chalk.yellow(goal.eventDate?.toISOString() || 'N/A')}`)

      // Display Local Time if Timezone is available
      if (goal.user.timezone) {
        const tz = goal.user.timezone
        console.log(
          chalk.bold(`
-- Local Times (${tz}) --`)
        )
        if (goal.targetDate) {
          console.log(`Target Date: ${goal.targetDate.toLocaleString('en-US', { timeZone: tz })}`)
        }
        if (goal.eventDate) {
          console.log(`Event Date:  ${goal.eventDate.toLocaleString('en-US', { timeZone: tz })}`)
        }
      }

      console.log(
        chalk.bold(`
-- Linked Events (${goal.events.length}) --`)
      )
      goal.events.forEach((event) => {
        console.log(`
Event ID: ${event.id}`)
        console.log(`Title:    ${event.title}`)
        console.log(`Date:     ${event.date.toISOString()}`)
        if (goal.user.timezone) {
          console.log(
            `Local:    ${event.date.toLocaleString('en-US', { timeZone: goal.user.timezone })}`
          )
        }
      })
    } catch (e) {
      console.error(chalk.red('Error fetching goal:'), e)
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })

export default debugGoalsCommand
