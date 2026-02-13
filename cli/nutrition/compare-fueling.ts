import { Command } from 'commander'
import chalk from 'chalk'
import { prisma } from '../../server/utils/db'
import { calculateFuelingStrategy } from '../../server/utils/nutrition/fueling'
import { getUserNutritionSettings } from '../../server/utils/nutrition/settings'
import {
  buildZonedDateTimeFromUtcDate,
  formatDateUTC,
  getUserTimezone
} from '../../server/utils/date'

type WindowShape = {
  type: string
  targetCarbs?: number
  targetProtein?: number
  targetFluid?: number
  targetSodium?: number
  plannedWorkoutId?: string
}

function pickWindowSetForWorkout(
  windows: WindowShape[],
  workoutId: string
): { pre?: WindowShape; intra?: WindowShape; post?: WindowShape } {
  const byWorkout = windows.filter((w) => w.plannedWorkoutId === workoutId)
  const source = byWorkout.length > 0 ? byWorkout : windows

  return {
    pre: source.find((w) => w.type === 'PRE_WORKOUT'),
    intra: source.find((w) => w.type === 'INTRA_WORKOUT'),
    post: source.find((w) => w.type === 'POST_WORKOUT')
  }
}

const compareFuelingCommand = new Command('compare-fueling')
  .description('Compare day-level stored fueling plan vs direct workout fueling calculation')
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

      const nutrition = await prisma.nutrition.findFirst({
        where: {
          userId: workout.userId,
          date: workout.date
        },
        select: {
          id: true,
          date: true,
          fuelingPlan: true
        }
      })

      const [user, settings, timezone] = await Promise.all([
        prisma.user.findUnique({
          where: { id: workout.userId },
          select: { weight: true, ftp: true, email: true }
        }),
        getUserNutritionSettings(workout.userId),
        getUserTimezone(workout.userId)
      ])

      if (!user) {
        console.error(chalk.red('Workout owner not found'))
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

      const directPlan = calculateFuelingStrategy(profile, {
        ...workout,
        startTime: startTimeDate,
        durationHours: (workout.durationSec || 0) / 3600,
        intensity: workout.workIntensity || 0.5,
        strategyOverride: workout.fuelingStrategy || undefined
      } as any)

      const dayPlan = nutrition?.fuelingPlan as any
      const dayWindows = Array.isArray(dayPlan?.windows) ? (dayPlan.windows as WindowShape[]) : []

      const day = pickWindowSetForWorkout(dayWindows, workout.id)
      const direct = {
        pre: directPlan.windows.find((w) => w.type === 'PRE_WORKOUT'),
        intra: directPlan.windows.find((w) => w.type === 'INTRA_WORKOUT'),
        post: directPlan.windows.find((w) => w.type === 'POST_WORKOUT')
      }

      const dayFluidMl = day.intra?.targetFluid || 0
      const daySodiumMg = day.intra?.targetSodium || 0
      const directFluidMl = direct.intra?.targetFluid || 0
      const directSodiumMg = direct.intra?.targetSodium || 0

      console.log(chalk.bold.cyan('\n=== Fueling Compare ==='))
      console.log(`Workout: ${workout.title} (${workout.id})`)
      console.log(`User: ${user.email}`)
      console.log(`Date: ${formatDateUTC(workout.date)} | Timezone: ${timezone}`)
      console.log(`Nutrition record: ${nutrition?.id || 'NONE'}`)
      console.log(`Day plan windows: ${dayWindows.length}`)

      console.log(chalk.yellow('\nPrep Card Values Comparison'))
      console.log(
        `Target Fluid: day=${(dayFluidMl / 1000).toFixed(1)}L (${dayFluidMl}ml) | direct=${(directFluidMl / 1000).toFixed(1)}L (${directFluidMl}ml)`
      )
      console.log(`Target Sodium: day=${daySodiumMg}mg | direct=${directSodiumMg}mg`)
      console.log(
        `Pre: day=${day.pre?.targetCarbs || 0}g/${day.pre?.targetProtein || 0}g | direct=${direct.pre?.targetCarbs || 0}g/${direct.pre?.targetProtein || 0}g`
      )
      console.log(
        `Post: day=${day.post?.targetCarbs || 0}g/${day.post?.targetProtein || 0}g | direct=${direct.post?.targetCarbs || 0}g/${direct.post?.targetProtein || 0}g`
      )

      const hasMismatch =
        dayFluidMl !== directFluidMl ||
        daySodiumMg !== directSodiumMg ||
        (day.pre?.targetCarbs || 0) !== (direct.pre?.targetCarbs || 0) ||
        (day.post?.targetCarbs || 0) !== (direct.post?.targetCarbs || 0)

      if (hasMismatch) {
        console.log(
          chalk.red('\nMismatch detected between stored day plan and direct workout calculation.')
        )
      } else {
        console.log(chalk.green('\nNo mismatch detected for prep-card targets.'))
      }
    } catch (error: any) {
      console.error(chalk.red('Failed to compare fueling plans:'), error?.message || error)
      if (error?.stack) console.error(error.stack)
    } finally {
      await prisma.$disconnect()
    }
  })

export default compareFuelingCommand
