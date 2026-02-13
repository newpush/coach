import { prisma } from '../../../../utils/db'
import { getServerSession } from '../../../../utils/session'
import { getUserNutritionSettings } from '../../../../utils/nutrition/settings'
import { calculateFuelingStrategy } from '../../../../utils/nutrition/fueling'
import { buildZonedDateTimeFromUtcDate, getUserTimezone } from '../../../../utils/date'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const workoutId = getRouterParam(event, 'id')
  if (!workoutId) {
    throw createError({ statusCode: 400, message: 'Workout ID is required' })
  }

  const userId = (session.user as any).id
  const workout = await prisma.plannedWorkout.findFirst({
    where: {
      id: workoutId,
      userId
    }
  })

  if (!workout) {
    throw createError({ statusCode: 404, message: 'Planned workout not found' })
  }

  const [user, settings, timezone] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { weight: true, ftp: true }
    }),
    getUserNutritionSettings(userId),
    getUserTimezone(userId)
  ])

  const profile = {
    weight: user?.weight || 75,
    ftp: user?.ftp || 250,
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
    startTimeDate = buildZonedDateTimeFromUtcDate(workout.date, workout.startTime, timezone, 10, 0)
  }

  const context = {
    ...workout,
    startTime: startTimeDate,
    durationHours: (workout.durationSec || 0) / 3600,
    intensity: workout.workIntensity || 0.5,
    strategyOverride: workout.fuelingStrategy || undefined
  }

  const fuelingPlan = calculateFuelingStrategy(profile, context as any)

  return {
    workoutId,
    fuelingPlan
  }
})
