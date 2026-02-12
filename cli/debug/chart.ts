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

const debugChartCommand = new Command('chart')
  .description('Debug the exact data points sent to the frontend chart')
  .argument('<email_or_id>', 'User email or ID')
  .argument('[date]', 'Date to analyze (YYYY-MM-DD), defaults to today')
  .action(async (emailOrId, dateStr) => {
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
=== Chart Data Debug: ${user.email} (${formattedDate}) ===`)
      )

      // 2. Fetch Context (Mimicking /api/nutrition/[id] + /api/calendar)
      const [nutrition, workouts, settings] = await Promise.all([
        nutritionRepository.getByDate(user.id, targetDate),
        plannedWorkoutRepository.list(user.id, {
          startDate: targetDate,
          endDate: targetDate
        }),
        getUserNutritionSettings(user.id)
      ])

      // Ensure we have the user weight injected as the API does now
      const fullSettings = {
        ...settings,
        user: { weight: user.weight || 75 }
      }

      const state = await metabolicService.ensureMetabolicState(user.id, targetDate)

      console.log(
        chalk.yellow(`
Starting State:`)
      )
      console.log(`- Weight: ${fullSettings.user.weight}kg`)
      console.log(`- Glycogen: ${chalk.bold(state.startingGlycogen.toFixed(1))}%`)

      // 3. Run Simulation (Mimicking Frontend)
      // Note: Frontend filters workouts.value differently (excludes Rest/Note)
      // Let's mimic that filter
      const validWorkouts = workouts.filter((w) => w.type !== 'Rest')

      const points = calculateEnergyTimeline(
        nutrition || {
          date: targetDate.toISOString(),
          carbsGoal: settings.fuelState1Min * user.weight
        },
        validWorkouts,
        fullSettings,
        timezone,
        undefined,
        {
          startingGlycogenPercentage: state.startingGlycogen,
          startingFluidDeficit: state.startingFluid
        }
      )

      // 4. Inspect Events in Points
      console.log(
        chalk.yellow(`
Chart Event Points:`)
      )
      const eventTable = new Table({
        head: ['Time', 'Type', 'Name', 'Carbs', 'Level', 'Icon'],
        colWidths: [10, 10, 30, 10, 10, 20]
      })

      const eventPoints = points.filter((p) => p.event)

      eventPoints.forEach((p) => {
        eventTable.push([
          p.time,
          p.eventType || 'N/A',
          p.event || 'N/A',
          p.eventCarbs !== undefined ? `${p.eventCarbs}g` : '-',
          `${p.level}%`,
          p.eventIcon || 'N/A'
        ])
      })

      console.log(eventTable.toString())

      // 5. Check Morning Bump
      const morningPoints = points.filter((p) => p.time >= '06:00' && p.time <= '10:00')
      const startLevel = morningPoints[0]?.level
      const endLevel = morningPoints[morningPoints.length - 1]?.level

      console.log(
        chalk.yellow(`
Morning Trend (06:00 - 10:00):`)
      )
      console.log(`- Start: ${startLevel}%`)
      console.log(`- End: ${endLevel}%`)
      console.log(`- Delta: ${chalk.bold((endLevel || 0) - (startLevel || 0))}%`)
    } catch (err) {
      console.error(chalk.red('Error:'), err)
    }
  })

export default debugChartCommand
