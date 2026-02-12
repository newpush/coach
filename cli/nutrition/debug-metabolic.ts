import { Command } from 'commander'
import { prisma } from '../../server/utils/db'
import { metabolicService } from '../../server/utils/services/metabolicService'
import { formatDateUTC } from '../../server/utils/date'
import chalk from 'chalk'

const debugMetabolicCommand = new Command('debug-metabolic')
  .description('Debug nutrition metabolic chain hand-offs for a specific date')
  .argument('[email]', 'User email')
  .option('-d, --date <string>', 'Target date (YYYY-MM-DD)')
  .option('-t, --time <string>', 'Simulated current time (HH:mm)')
  .option('--recalculate', 'Force recalculate the chain for this date')
  .action(async (email, options) => {
    try {
      let user
      if (email) {
        user = await prisma.user.findUnique({ where: { email } })
      } else {
        user = await prisma.user.findFirst()
      }

      if (!user) {
        console.error(chalk.red('User not found'))
        return
      }

      const userId = user.id
      const dateStr = options.date || formatDateUTC(new Date())
      const targetDate = new Date(dateStr + 'T00:00:00Z')

      let now = new Date()
      if (options.time) {
        now = new Date(`${dateStr}T${options.time}:00Z`) // Approximate UTC for CLI sync
      }

      if (options.recalculate) {
        console.log(chalk.magenta(`\n!!! Force Recalculating Chain for ${dateStr} ...`))
        await prisma.nutrition.updateMany({
          where: { userId, date: targetDate },
          data: {
            startingGlycogenPercentage: null,
            startingFluidDeficit: null,
            endingGlycogenPercentage: null,
            endingFluidDeficit: null
          }
        })
        // We also need to clear tomorrow's start to force it to re-fetch from today's new end
        const tomorrow = new Date(targetDate)
        tomorrow.setUTCDate(targetDate.getUTCDate() + 1)
        await prisma.nutrition.updateMany({
          where: { userId, date: tomorrow },
          data: { startingGlycogenPercentage: null, startingFluidDeficit: null }
        })
      }

      console.log(chalk.blue.bold(`\n=== Metabolic Debug for ${user.email} on ${dateStr} ===`))

      // 1. Check DB State
      const record = await prisma.nutrition.findFirst({
        where: { userId, date: targetDate }
      })

      console.log(chalk.yellow('\n1. Database State:'))
      if (record) {
        console.log(`- ID: ${record.id}`)
        console.log(`- Starting Glycogen: ${record.startingGlycogenPercentage ?? 'NULL'}`)
        console.log(`- Ending Glycogen: ${record.endingGlycogenPercentage ?? 'NULL'}`)
        console.log(`- Carbs Logged: ${record.carbs}g`)
      } else {
        console.log('- No record found for this date')
      }

      // 2. Check Yesterday
      const yesterday = new Date(targetDate)
      yesterday.setUTCDate(targetDate.getUTCDate() - 1)
      const yesterdayRecord = await prisma.nutrition.findFirst({
        where: { userId, date: yesterday }
      })

      console.log(chalk.yellow('\n2. Yesterday State:'))
      if (yesterdayRecord) {
        console.log(`- Ending Glycogen: ${yesterdayRecord.endingGlycogenPercentage ?? 'NULL'}`)
      } else {
        console.log('- No yesterday record found')
      }

      // 3. Simulation
      console.log(chalk.yellow('\n3. Metabolic Chain Simulation:'))
      const chainState = await metabolicService.ensureMetabolicState(userId, targetDate)
      console.log(
        `- ensureMetabolicState returned: ${chalk.green(chainState.startingGlycogen.toFixed(1))}%`
      )

      // 4. Unified Simulation (Chart + Tank)
      const { points, liveStatus } = await metabolicService.getDailyTimeline(
        userId,
        targetDate,
        chainState.startingGlycogen,
        chainState.startingFluid,
        now
      )

      if (points.length > 0) {
        const start = points[0]
        const end = points[points.length - 1]
        console.log(`- Timeline Start: ${start.level}% (${start.time})`)
        console.log(`- Timeline End: ${end.level}% (${end.time})`)

        // Find "NOW" point in the returned points
        const nowTs = now.getTime()
        const nowIdx = points.findIndex((p) => p.timestamp > nowTs)
        const currentPoint = nowIdx > 0 ? points[nowIdx - 1] : points[points.length - 1]
        if (currentPoint) {
          console.log(
            `- Timeline @ ${options.time || 'NOW'} (${currentPoint.time}): ${chalk.bold(currentPoint.level)}%`
          )
        }
      }

      console.log(chalk.yellow('\n4. Live Status (Used by Fuel Tank):'))
      console.log(`- Percentage: ${chalk.bold(liveStatus.percentage)}%`)
      console.log(`- Advice: ${liveStatus.advice}`)

      // 6. Check Next Day start
      const tomorrow = new Date(targetDate)
      tomorrow.setUTCDate(targetDate.getUTCDate() + 1)
      const tomorrowState = await metabolicService.ensureMetabolicState(userId, tomorrow)
      console.log(
        `\n- Tomorrow Morning Start (Calculated): ${chalk.cyan(tomorrowState.startingGlycogen.toFixed(1))}%`
      )

      if (
        record?.endingGlycogenPercentage !== null &&
        record?.endingGlycogenPercentage !== undefined
      ) {
        console.log(`- Saved Ending Glycogen: ${record.endingGlycogenPercentage}%`)
        if (
          Math.abs((record.endingGlycogenPercentage || 0) - tomorrowState.startingGlycogen) > 0.1
        ) {
          console.log(chalk.red('!!! DISCREPANCY DETECTED between today end and tomorrow start'))
        } else {
          console.log(chalk.green('✓ Today end matches tomorrow start'))
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      await prisma.$disconnect()
    }
  })

export default debugMetabolicCommand
