import { Command } from 'commander'
import { prisma } from '../../server/utils/db'
import {
  getUserTimezone,
  getUserLocalDate,
  formatDateUTC,
  getStartOfDayUTC,
  getEndOfDayUTC
} from '../../server/utils/date'
import { calculateEnergyTimeline } from '../../app/utils/nutrition-logic'
import { workoutRepository } from '../../server/utils/repositories/workoutRepository'
import { plannedWorkoutRepository } from '../../server/utils/repositories/plannedWorkoutRepository'
import { nutritionRepository } from '../../server/utils/repositories/nutritionRepository'
import { getUserNutritionSettings } from '../../server/utils/nutrition/settings'
import { metabolicService } from '../../server/utils/services/metabolicService'
import Table from 'cli-table3'
import chalk from 'chalk'

const chainCommand = new Command('chain')
  .description('Inspect and verify the metabolic fuel chain continuity')
  .argument('[email]', 'User email')
  .option('-d, --days <number>', 'Number of days to look back', '7')
  .option('--fix', 'Attempt to fix discrepancies by recalculating', false)
  .action(async (email, options) => {
    try {
      let user
      if (email) {
        user = await prisma.user.findUnique({ where: { email } })
      } else {
        user = await prisma.user.findFirst()
      }

      if (!user) {
        console.error('User not found')
        return
      }

      console.log(`Inspecting Fuel Chain for: ${user.email} (${user.id})`)
      const timezone = await getUserTimezone(user.id)
      const today = getUserLocalDate(timezone)
      const days = parseInt(options.days)
      const settings = await getUserNutritionSettings(user.id)

      const startDate = new Date(today)
      startDate.setUTCDate(today.getUTCDate() - days)

      const endDate = new Date(today)
      endDate.setUTCDate(today.getUTCDate() + 1) // Include "Tomorrow" to check today's hand-off

      console.log(`Range: ${formatDateUTC(startDate)} to ${formatDateUTC(endDate)}`)

      // Fetch all data
      const nutritionRecords = await nutritionRepository.getForUser(user.id, {
        startDate,
        endDate,
        orderBy: { date: 'asc' }
      })

      const table = new Table({
        head: ['Date', 'Start % (DB)', 'Calc End %', 'End % (DB)', 'Next Start %', 'Status'],
        style: { head: ['cyan'] }
      })

      let previousEnd: number | null = null

      for (let i = 0; i <= days + 1; i++) {
        const date = new Date(startDate)
        date.setUTCDate(startDate.getUTCDate() + i)
        const dateStr = formatDateUTC(date)
        const isToday = dateStr === formatDateUTC(today)

        const record = nutritionRecords.find((n) => formatDateUTC(n.date) === dateStr)
        const rangeStart = getStartOfDayUTC(timezone, date)
        const rangeEnd = getEndOfDayUTC(timezone, date)

        // 1. Fetch Workouts to simulate "Calculated End"
        const dayWorkouts = await Promise.all([
          workoutRepository.getForUser(user.id, { startDate: rangeStart, endDate: rangeEnd }),
          plannedWorkoutRepository.list(user.id, { startDate: date, endDate: date })
        ]).then(([completed, planned]) => {
          // Merge Logic matching metabolicService
          const completedPlannedIds = new Set(
            completed.map((w: any) => w.plannedWorkoutId).filter(Boolean)
          )
          const relevantPlanned = planned.filter(
            (p: any) => !p.completed && !completedPlannedIds.has(p.id)
          )
          return [...completed, ...relevantPlanned]
        })

        // 2. Simulate
        // We use the DB's starting state if available, otherwise default or previous end
        const startingPct = record?.startingGlycogenPercentage ?? previousEnd ?? 85
        const startingFluid = record?.startingFluidDeficit ?? 0

        // Use calculateEnergyTimeline to simulate
        // Note: We need to handle "Actuals Only" for past if we want to match metabolicService logic strictly
        // metabolicService disables synthetic refills for Past.
        const isPast = date < today

        // Check for logs
        const hasLogs = record && (record.breakfast || record.lunch || record.dinner)
        let simulationMeals: any[] = []

        if (!hasLogs && !isPast) {
          simulationMeals = metabolicService.synthesizeRefills(
            date,
            dayWorkouts,
            { weight: user.weight || 75, ftp: user.ftp || 250, ...settings },
            timezone
          )
        }

        const points = calculateEnergyTimeline(
          record || { date: date.toISOString() },
          dayWorkouts,
          settings,
          timezone,
          undefined,
          {
            startingGlycogenPercentage: startingPct,
            startingFluidDeficit: startingFluid,
            crossDayMeals: simulationMeals
          }
        )

        const lastPoint = points[points.length - 1]
        const calculatedEnd = lastPoint ? Math.round(lastPoint.level) : null

        // 3. Compare with DB
        const dbStart =
          record?.startingGlycogenPercentage != null
            ? Math.round(record.startingGlycogenPercentage)
            : 'NULL'
        const dbEnd =
          record?.endingGlycogenPercentage != null
            ? Math.round(record.endingGlycogenPercentage)
            : 'NULL'

        // Check continuity with previous day
        let status = 'OK'
        if (
          previousEnd !== null &&
          dbStart !== 'NULL' &&
          Math.abs(previousEnd - (dbStart as number)) > 1
        ) {
          status = chalk.red('GAP') // Gap between Prev End and Curr Start
        } else if (
          dbEnd !== 'NULL' &&
          calculatedEnd !== null &&
          Math.abs((dbEnd as number) - calculatedEnd) > 1
        ) {
          status = chalk.yellow('DRIFT') // DB End differs from Fresh Calc
        } else if (dbStart === 'NULL') {
          status = chalk.gray('MISSING')
        }

        table.push([
          isToday ? chalk.bold(dateStr) : dateStr,
          dbStart,
          calculatedEnd ?? '-',
          dbEnd,
          '-', // Filled by next iteration
          status
        ])

        // Fill "Next Start" of previous row
        if (i > 0) {
          const prevRow = table[i - 1] as any
          prevRow[4] = dbStart // This row's start is previous row's "Next Start"

          // Re-eval gap status for previous row based on THIS row's start
          const prevEndVal = prevRow[3] // End % (DB) of prev row
          if (
            prevEndVal !== 'NULL' &&
            dbStart !== 'NULL' &&
            Math.abs(prevEndVal - (dbStart as number)) > 1
          ) {
            prevRow[5] = chalk.red('GAP')
          }
        }

        previousEnd = dbEnd !== 'NULL' ? (dbEnd as number) : calculatedEnd

        // Fix if requested
        if (
          options.fix &&
          (status.includes('GAP') || status.includes('MISSING') || status.includes('DRIFT'))
        ) {
          console.log(`Fixing ${dateStr}...`)
          // Force recalculation by clearing the cached starting state
          await prisma.nutrition.updateMany({
            where: { userId: user.id, date: date },
            data: { startingGlycogenPercentage: null, startingFluidDeficit: null }
          })
          await metabolicService.ensureMetabolicState(user.id, date)
        }
      }

      console.log(table.toString())
    } catch (e) {
      console.error(e)
    } finally {
      await prisma.$disconnect()
    }
  })

export default chainCommand
