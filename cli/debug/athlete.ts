import { Command } from 'commander'
import chalk from 'chalk'
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const athleteCommand = new Command('athlete')

athleteCommand
  .description('Inspect detailed athlete metrics and AI context')
  .argument('<email_or_id>', 'User Email or UUID')
  .option('--prod', 'Use production database')
  .action(async (identifier, options) => {
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
      console.log(chalk.gray(`Fetching athlete data for: ${identifier}...`))

      // Resolve User
      let user = await prisma.user.findUnique({
        where: { id: identifier },
        include: { integrations: true }
      })

      if (!user) {
        user = await prisma.user.findUnique({
          where: { email: identifier },
          include: { integrations: true }
        })
      }

      if (!user) {
        console.error(chalk.red(`User not found: ${identifier}`))
        process.exit(1)
      }

      const userId = user.id

      // 1. Profile Section
      console.log(chalk.bold.cyan('\n=== Athlete Profile ==='))
      console.log(`Name:      ${chalk.white(user.name || 'N/A')}`)
      console.log(`Email:     ${chalk.white(user.email)}`)
      console.log(`ID:        ${chalk.gray(user.id)}`)
      console.log(`Timezone:  ${chalk.magenta(user.timezone || 'UTC')}`)
      console.log(
        `Metrics:   FTP ${chalk.yellow(user.ftp || 'N/A')}W | Weight ${chalk.yellow(user.weight || 'N/A')}kg | MaxHR ${chalk.yellow(user.maxHr || 'N/A')}bpm`
      )
      if (user.ftp && user.weight) {
        console.log(`W/kg:      ${chalk.green((user.ftp / user.weight).toFixed(2))} W/kg`)
      }
      console.log(`LTHR:      ${chalk.yellow(user.lthr || 'N/A')} bpm`)

      // 2. Current Form (Source of Truth)
      console.log(chalk.bold.cyan('\n=== Current Form (Source of Truth) ==='))

      const latestWellness = await prisma.wellness.findFirst({
        where: { userId },
        orderBy: { date: 'desc' }
      })

      const latestWorkout = await prisma.workout.findFirst({
        where: { userId, isDuplicate: false, ctl: { not: null } },
        orderBy: { date: 'desc' }
      })

      // Determine 'Truth' logic used in app
      let currentCTL = 0
      let currentATL = 0
      let currentTSB = 0
      let lastUpdated = null
      let source = 'None'

      const wDate = latestWellness?.date ? new Date(latestWellness.date).getTime() : 0
      const woDate = latestWorkout?.date ? new Date(latestWorkout.date).getTime() : 0

      if (latestWellness && latestWorkout) {
        if (wDate >= woDate) {
          source = 'Wellness (Latest)'
          currentCTL = latestWellness.ctl || 0
          currentATL = latestWellness.atl || 0
          lastUpdated = latestWellness.date
        } else {
          source = 'Workout (Latest)'
          currentCTL = latestWorkout.ctl || 0
          currentATL = latestWorkout.atl || 0
          lastUpdated = latestWorkout.date
        }
      } else if (latestWellness) {
        source = 'Wellness (Only)'
        currentCTL = latestWellness.ctl || 0
        currentATL = latestWellness.atl || 0
        lastUpdated = latestWellness.date
      } else if (latestWorkout) {
        source = 'Workout (Only)'
        currentCTL = latestWorkout.ctl || 0
        currentATL = latestWorkout.atl || 0
        lastUpdated = latestWorkout.date
      }

      currentTSB = currentCTL - currentATL

      console.log(`Source:    ${chalk.blue(source)}`)
      console.log(`Updated:   ${lastUpdated ? lastUpdated.toISOString().split('T')[0] : 'N/A'}`)
      console.log(`CTL:       ${chalk.bold.white(currentCTL.toFixed(1))} (Fitness)`)
      console.log(`ATL:       ${chalk.bold.white(currentATL.toFixed(1))} (Fatigue)`)

      let tsbColor = chalk.white
      if (currentTSB > 5) tsbColor = chalk.green
      else if (currentTSB > -10) tsbColor = chalk.yellow
      else if (currentTSB > -25) tsbColor = chalk.blue
      else tsbColor = chalk.red

      console.log(`TSB:       ${tsbColor(currentTSB.toFixed(1))} (Form)`)

      // 3. AI Profile Report
      console.log(chalk.bold.cyan('\n=== AI Athlete Profile Report ==='))
      const profileReport = await prisma.report.findFirst({
        where: {
          userId,
          type: 'ATHLETE_PROFILE',
          status: 'COMPLETED'
        },
        orderBy: { createdAt: 'desc' }
      })

      if (profileReport) {
        console.log(`Generated: ${profileReport.createdAt.toISOString()}`)
        const json = profileReport.analysisJson as any
        console.log(`Title:     ${json?.title || 'N/A'}`)

        if (json?.athlete_scores) {
          const scores = json.athlete_scores
          console.log(
            `Scores:    Fitness ${scores.current_fitness}/10 | Recovery ${scores.recovery_capacity}/10 | Consistency ${scores.training_consistency}/10`
          )
        }

        if (json?.executive_summary) {
          console.log(chalk.gray(`Summary:   ${json.executive_summary.substring(0, 150)}...`))
        }
      } else {
        console.log(chalk.yellow('No Athlete Profile report found.'))
      }

      // 4. Recent Training
      console.log(chalk.bold.cyan('\n=== Recent Workouts (Last 5) ==='))
      const recentWorkouts = await prisma.workout.findMany({
        where: { userId, isDuplicate: false },
        orderBy: { date: 'desc' },
        take: 5
      })

      if (recentWorkouts.length === 0) {
        console.log(chalk.yellow('No workouts found.'))
      } else {
        console.log(chalk.gray('Date       | TSS | IF   | Dur  | Title'))
        recentWorkouts.forEach((w) => {
          const date = w.date.toISOString().split('T')[0]
          const tss = w.tss?.toFixed(0).padStart(3, ' ') || '---'
          const intensity = w.intensity?.toFixed(2).padStart(4, ' ') || '----'
          const dur = (w.durationSec / 60).toFixed(0).padStart(3, ' ') + 'm'
          const title = w.title.substring(0, 40)

          console.log(`${date} | ${tss} | ${intensity} | ${dur} | ${title}`)
        })
      }

      // 5. Active Goals
      console.log(chalk.bold.cyan('\n=== Active Goals ==='))
      const goals = await prisma.goal.findMany({
        where: { userId, status: 'ACTIVE' },
        orderBy: { priority: 'desc' }
      })

      if (goals.length === 0) {
        console.log(chalk.yellow('No active goals.'))
      } else {
        goals.forEach((g) => {
          const priority = g.priority === 'HIGH' ? chalk.red('HIGH') : g.priority
          console.log(`[${priority}] ${g.title} (${g.type})`)
          if (g.targetDate) console.log(`  Target: ${g.targetDate.toISOString().split('T')[0]}`)
        })
      }
    } catch (e: any) {
      console.error(chalk.red('Error:'), e)
    } finally {
      await prisma.$disconnect()
    }
  })

export default athleteCommand
