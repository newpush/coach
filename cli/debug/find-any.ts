import { Command } from 'commander'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import chalk from 'chalk'

const findAnyCommand = new Command('find-any')
  .description('Find ID in key tables')
  .argument('<id>', 'UUID to find')
  .option('--prod', 'Use production database')
  .action(async (id: string, options) => {
    const isProd = options.prod
    const connectionString = isProd ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL

    if (isProd) {
      console.log(chalk.yellow('Using PRODUCTION database.'))
    } else {
      console.log(chalk.blue('Using DEVELOPMENT database.'))
    }

    const pool = new pg.Pool({ connectionString })
    const adapter = new PrismaPg(pool)
    const prisma = new PrismaClient({ adapter })

    try {
      console.log(`Searching for ${id}...`)

      const user = await prisma.user.findUnique({ where: { id } })
      if (user) {
        console.log(chalk.green('Found in User (by ID)'))
        console.log(user)
        return
      }

      const llm = await prisma.llmUsage.findUnique({ where: { id } })
      if (llm) {
        console.log(chalk.green('Found in LlmUsage (by ID)'))
        console.log(llm)
        return
      }

      const llmByEntity = await prisma.llmUsage.findFirst({ where: { entityId: id } })
      if (llmByEntity) {
        console.log(chalk.green(`Found in LlmUsage (by entityId: ${id})`))
        console.log(llmByEntity)
        console.log(
          chalk.blue(`Run 'cw:cli debug llm-request ${llmByEntity.id} --prod' to see full prompt.`)
        )
        return
      }

      const report = await prisma.report.findUnique({ where: { id } })
      if (report) {
        console.log(chalk.green('Found in Report'))
        console.log(report)
        return
      }

      const rec = await prisma.activityRecommendation.findUnique({ where: { id } })
      if (rec) {
        console.log(chalk.green('Found in ActivityRecommendation'))
        console.log(rec)
        return
      }

      const workout = await prisma.workout.findUnique({ where: { id } })
      if (workout) {
        console.log(chalk.green('Found in Workout'))
        console.log(workout)
        return
      }

      const plannedWorkout = await prisma.plannedWorkout.findUnique({ where: { id } })
      if (plannedWorkout) {
        console.log(chalk.green('Found in PlannedWorkout'))
        console.log(plannedWorkout)
        return
      }

      // Also check if it matches a shareToken (unlikely but possible)
      const share = await prisma.shareToken.findFirst({ where: { token: id } })
      if (share) {
        console.log(chalk.green('Found in ShareToken (token value)'))
        console.log(share)
        return
      }

      console.log(chalk.red('Not found in checked tables.'))
    } catch (error) {
      console.error('Error:', error)
    } finally {
      await prisma.$disconnect()
    }
  })

export default findAnyCommand
