import { Command } from 'commander'
import chalk from 'chalk'
import { prisma } from '../../server/utils/db'
import { getUserNutritionSettings } from '../../server/utils/nutrition/settings'
import { calculateFuelingStrategy } from '../../server/utils/nutrition/fueling'
import {
  buildZonedDateTimeFromUtcDate,
  getUserTimezone,
  formatDateUTC
} from '../../server/utils/date'

const fuelingWorkoutCommand = new Command('fueling-workout')
  .description('Debug fueling plan calculation for a specific planned workout')
  .argument('<planned_workout_id>', 'Planned workout ID')
  .action(async (plannedWorkoutId: string) => {
    try {
      const workout = await prisma.plannedWorkout.findUnique({
        where: { id: plannedWorkoutId }
      })

      if (!workout) {
        console.error(chalk.red(`Planned workout not found: ${plannedWorkoutId}`))
        return
      }

      const [user, settings, timezone] = await Promise.all([
        prisma.user.findUnique({
          where: { id: workout.userId },
          select: { id: true, email: true, weight: true, ftp: true }
        }),
        getUserNutritionSettings(workout.userId),
        getUserTimezone(workout.userId)
      ])

      if (!user) {
        console.error(chalk.red(`Owner user not found for workout: ${plannedWorkoutId}`))
        return
      }

      const profile = {
        weight: user.weight || 75,
        ftp: user.ftp || 250,
        currentCarbMax: settings.currentCarbMax,
        sodiumTarget: settings.sodiumTarget,
        sweatRate: settings.sweatRate ?? undefined,
        preWorkoutWindow: settings.preWorkoutWindow,
        postWorkoutWindow: settings.postWorkoutWindow,
        fuelingSensitivity: settings.fuelingSensitivity,
        fuelState1Trigger: settings.fuelState1Trigger,
        fuelState1Min: settings.fuelState1Min,
        fuelState1Max: settings.fuelState1Max,
        fuelState2Trigger: settings.fuelState2Trigger,
        fuelState2Min: settings.fuelState2Min,
        fuelState2Max: settings.fuelState2Max,
        fuelState3Min: settings.fuelState3Min,
        fuelState3Max: settings.fuelState3Max,
        bmr: settings.bmr ?? 1600,
        activityLevel: settings.activityLevel || 'ACTIVE',
        targetAdjustmentPercent: settings.targetAdjustmentPercent ?? 0
      }

      let startTimeDate: Date | null = null
      if (
        workout.startTime &&
        typeof workout.startTime === 'string' &&
        workout.startTime.includes(':')
      ) {
        startTimeDate = buildZonedDateTimeFromUtcDate(
          workout.date,
          workout.startTime,
          timezone,
          10,
          0
        )
      }

      const context = {
        ...workout,
        startTime: startTimeDate,
        durationHours: (workout.durationSec || 0) / 3600,
        intensity: workout.workIntensity || 0.5,
        strategyOverride: workout.fuelingStrategy || undefined
      }

      const plan = calculateFuelingStrategy(profile, context as any)
      const pre = plan.windows.find((w) => w.type === 'PRE_WORKOUT')
      const intra = plan.windows.find((w) => w.type === 'INTRA_WORKOUT')
      const post = plan.windows.find((w) => w.type === 'POST_WORKOUT')

      console.log(chalk.bold.cyan('\n=== Fueling Workout Debug ==='))
      console.log(`Workout ID: ${workout.id}`)
      console.log(`Title: ${workout.title}`)
      console.log(`User: ${user.email} (${user.id})`)
      console.log(`Date (UTC day): ${formatDateUTC(workout.date)}`)
      console.log(`Timezone: ${timezone}`)
      console.log(`Type: ${workout.type}`)
      console.log(
        `Duration: ${workout.durationSec || 0}s (${((workout.durationSec || 0) / 3600).toFixed(2)}h)`
      )
      console.log(`Intensity: ${workout.workIntensity ?? 0}`)
      console.log(`Start Time (stored): ${workout.startTime || 'NULL'}`)
      console.log(
        `Start Time (resolved): ${startTimeDate ? startTimeDate.toISOString() : 'DEFAULT 10:00 local'}`
      )
      console.log(`Fueling Strategy Override: ${workout.fuelingStrategy || 'NONE'}`)

      console.log(chalk.yellow('\nProfile Inputs'))
      console.log(`Weight: ${profile.weight}kg`)
      console.log(`FTP: ${profile.ftp}W`)
      console.log(`Sensitivity: ${profile.fuelingSensitivity}`)
      console.log(`Adjustment: ${profile.targetAdjustmentPercent}%`)
      console.log(`Carb max cap: ${profile.currentCarbMax} g/h`)
      console.log(`Sweat rate: ${profile.sweatRate ?? 'auto'} L/h`)
      console.log(`Sodium target: ${profile.sodiumTarget} mg/L`)

      console.log(chalk.yellow('\nPrep Card Outputs'))
      console.log(
        `Target Fluid: ${((intra?.targetFluid || 0) / 1000).toFixed(1)} L (${intra?.targetFluid || 0} ml)`
      )
      console.log(`Target Sodium: ${intra?.targetSodium || 0} mg`)
      console.log(
        `Pre-Workout Target: ${pre?.targetCarbs || 0}g carbs / ${pre?.targetProtein || 0}g protein`
      )
      console.log(
        `Post-Workout Recovery: ${post?.targetCarbs || 0}g carbs / ${post?.targetProtein || 0}g protein`
      )

      console.log(chalk.yellow('\nAll Windows'))
      for (const w of plan.windows) {
        console.log(
          `- ${w.type}: ${w.targetCarbs}g C, ${w.targetProtein}g P, ${w.targetFluid}ml fluid, ${w.targetSodium}mg sodium`
        )
      }

      if (plan.notes.length > 0) {
        console.log(chalk.yellow('\nNotes'))
        plan.notes.forEach((note) => console.log(`- ${note}`))
      }
    } catch (error: any) {
      console.error(chalk.red('Failed to debug fueling workout:'), error?.message || error)
      if (error?.stack) console.error(error.stack)
    } finally {
      await prisma.$disconnect()
    }
  })

export default fuelingWorkoutCommand
