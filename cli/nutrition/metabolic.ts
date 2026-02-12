import { Command } from 'commander'
import { prisma } from '../../server/utils/db'
import { nutritionRepository } from '../../server/utils/repositories/nutritionRepository'
import { plannedWorkoutRepository } from '../../server/utils/repositories/plannedWorkoutRepository'
import { getUserNutritionSettings } from '../../server/utils/nutrition/settings'
import { getUserTimezone, getUserLocalDate, formatDateUTC } from '../../server/utils/date'
import { calculateEnergyTimeline } from '../../app/utils/nutrition-logic'
import { metabolicService } from '../../server/utils/services/metabolicService'
import chalk from 'chalk'
import Table from 'cli-table3'

const metabolicCommand = new Command('metabolic')
  .description('Debug the metabolic engine for a user and date')
  .argument('<email_or_id>', 'User email or ID')
  .argument('[date]', 'Date to analyze (YYYY-MM-DD), defaults to today')
  .option('--prod', 'Use production database')
  .action(async (emailOrId, dateStr, options) => {
    try {
      // 1. Resolve User
      const user = await prisma.user.findFirst({
        where: {
          OR: [{ email: emailOrId }, { id: emailOrId }]
        }
      })

      if (!user) {
        console.error(chalk.red(`User ${emailOrId} not found`))
        return
      }

      const timezone = await getUserTimezone(user.id)
      const targetDate = dateStr ? new Date(`${dateStr}T00:00:00Z`) : getUserLocalDate(timezone)
      const formattedDate = formatDateUTC(targetDate)

      console.log(
        chalk.bold.cyan(`
=== Metabolic Debug: ${user.email} (${formattedDate}) ===`)
      )
      console.log(chalk.gray(`Timezone: ${timezone}`))

      // 2. Fetch Context
      const [nutrition, workouts, settings] = await Promise.all([
        nutritionRepository.getByDate(user.id, targetDate),
        plannedWorkoutRepository.list(user.id, {
          startDate: targetDate,
          endDate: targetDate
        }),
        getUserNutritionSettings(user.id)
      ])

      const state = await metabolicService.ensureMetabolicState(user.id, targetDate)

      console.log(
        chalk.yellow(`
Starting State:`)
      )
      console.log(`- Glycogen: ${chalk.bold(state.startingGlycogen.toFixed(1))}%`)
      console.log(`- Fluid Deficit: ${chalk.bold(state.startingFluid)}ml`)

      // 3. Run Simulation
      const points = calculateEnergyTimeline(
        nutrition || {
          date: targetDate.toISOString(),
          carbsGoal: settings.fuelState1Min * user.weight
        },
        workouts,
        settings,
        timezone,
        undefined,
        {
          startingGlycogenPercentage: state.startingGlycogen,
          startingFluidDeficit: state.startingFluid
        }
      )

      // 4. Dump Events Found by Logic
      console.log(
        chalk.yellow(`
Detected Simulation Events:`)
      )
      const eventTable = new Table({
        head: ['Time', 'Type', 'Name', 'Carbs', 'Fluid', 'Status'],
        colWidths: [10, 15, 30, 10, 10, 15]
      })

      // We need to peek into what logic did. Logic doesn't export the internal meals array,
      // but we can see the 'event' field in points.
      const eventPoints = points.filter((p) => p.event)

      // Let's also output some info about what calculateEnergyTimeline is seeing
      if (nutrition?.fuelingPlan) {
        console.log(
          chalk.gray(
            `Found Fueling Plan with ${(nutrition.fuelingPlan as any).windows?.length || 0} windows.`
          )
        )
      } else {
        console.log(chalk.gray(`No Fueling Plan found. Relying on baseline heuristics.`))
      }

      eventPoints.forEach((p) => {
        eventTable.push([
          p.time,
          p.eventType || 'N/A',
          p.event || 'N/A',
          p.eventCarbs !== undefined ? `${p.eventCarbs > 0 ? '+' : ''}${p.eventCarbs}g` : '-',
          p.eventFluid !== undefined ? `${p.eventFluid}ml` : '-',
          p.isFuture ? 'Future' : 'Past'
        ])
      })

      if (eventPoints.length === 0) {
        console.log(chalk.gray('No specific meal/workout events detected in timeline.'))
      } else {
        console.log(eventTable.toString())
      }

      // 5. Sample the Curve
      console.log(
        chalk.yellow(`
Metabolic Wave (Hourly Samples):`)
      )
      const waveTable = new Table({
        head: ['Time', 'Tank (%)', 'Carb Bal (g)', 'Fluid Def (ml)'],
        colWidths: [10, 15, 15, 15]
      })

      // Sample every 4 points (1 hour)
      for (let i = 0; i < points.length; i += 4) {
        const p = points[i]!
        let color = chalk.green
        if (p.level < 50) color = chalk.yellow
        if (p.level < 25) color = chalk.red

        waveTable.push([
          p.time,
          color(`${p.level}%`),
          `${p.carbBalance > 0 ? '+' : ''}${p.carbBalance}g`,
          `${p.fluidDeficit}ml`
        ])
      }
      console.log(waveTable.toString())

      // 6. Summary Info
      const minPoint = points.reduce((prev, curr) => (prev.level < curr.level ? prev : curr))
      const maxPoint = points.reduce((prev, curr) => (prev.level > curr.level ? prev : curr))

      console.log(
        chalk.yellow(`
Daily Summary:`)
      )
      console.log(`- Peak Energy: ${chalk.bold(maxPoint.level)}% at ${maxPoint.time}`)
      console.log(
        `- Min Energy: ${minPoint.level < 25 ? chalk.red.bold(minPoint.level) : chalk.bold(minPoint.level)}% at ${minPoint.time}`
      )

      if (minPoint.level < 20) {
        console.log(
          chalk.red.bold(`
⚠️  WARNING: Potential Bonk Detected at ${minPoint.time}!`)
        )
      }
    } catch (err) {
      console.error(chalk.red('Error:'), err)
    }
  })

export default metabolicCommand
