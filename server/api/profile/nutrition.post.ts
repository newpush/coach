import { z } from 'zod'
import { nutritionSettingsRepository } from '../../utils/repositories/nutritionSettingsRepository'
import { getServerSession } from '../../utils/session'
import { metabolicService } from '../../utils/services/metabolicService'
import { getUserLocalDate, getUserTimezone } from '../../utils/date'

const updateSchema = z.object({
  nutritionTrackingEnabled: z.boolean().optional(),
  bmr: z.number().min(500).max(5000).optional(),
  activityLevel: z
    .enum([
      'SEDENTARY',
      'LIGHTLY_ACTIVE',
      'ACTIVE',
      'MODERATELY_ACTIVE',
      'VERY_ACTIVE',
      'EXTRA_ACTIVE'
    ])
    .optional(),
  currentCarbMax: z.number().min(0).max(150),
  ultimateCarbGoal: z.number().min(0).max(150),
  baseProteinPerKg: z.number().min(0.5).max(3.0).optional(),
  baseFatPerKg: z.number().min(0.2).max(2.5).optional(),
  sweatRate: z.number().min(0).max(5).optional(),
  sodiumTarget: z.number().min(0).max(2000).optional(),
  preWorkoutWindow: z.number().min(0).max(240).optional(),
  postWorkoutWindow: z.number().min(0).max(240).optional(),
  carbsPerHourLow: z.number().min(0).max(120).optional(),
  carbsPerHourMedium: z.number().min(0).max(120).optional(),
  carbsPerHourHigh: z.number().min(0).max(150).optional(),
  carbScalingFactor: z.number().min(0.5).max(2.0).optional(),
  fuelingSensitivity: z.number().min(0.5).max(1.5).optional(),
  fuelState1Trigger: z.number().min(0).max(1.0).optional(),
  fuelState1Min: z.number().min(0).max(20).optional(),
  fuelState1Max: z.number().min(0).max(20).optional(),
  fuelState2Trigger: z.number().min(0).max(1.0).optional(),
  fuelState2Min: z.number().min(0).max(20).optional(),
  fuelState2Max: z.number().min(0).max(20).optional(),
  fuelState3Min: z.number().min(0).max(25).optional(),
  fuelState3Max: z.number().min(0).max(25).optional(),
  enabledSupplements: z.array(z.string()).optional(),
  goalProfile: z.enum(['LOSE', 'MAINTAIN', 'GAIN']).optional(),
  targetAdjustmentPercent: z.number().min(-50).max(50).optional(),
  mealPattern: z.array(z.object({ name: z.string(), time: z.string() })).optional(),
  dietaryProfile: z.array(z.string()).optional(),
  foodAllergies: z.array(z.string()).optional(),
  foodIntolerances: z.array(z.string()).optional(),
  lifestyleExclusions: z.array(z.string()).optional()
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const userId = session.user.id

  const body = await readBody(event)
  const result = updateSchema.safeParse(body)

  if (!result.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid input',
      data: result.error.issues
    })
  }

  const {
    nutritionTrackingEnabled,
    bmr,
    activityLevel,
    currentCarbMax,
    ultimateCarbGoal,
    baseProteinPerKg,
    baseFatPerKg,
    sweatRate,
    sodiumTarget,
    preWorkoutWindow,
    postWorkoutWindow,
    carbsPerHourLow,
    carbsPerHourMedium,
    carbsPerHourHigh,
    carbScalingFactor,
    fuelingSensitivity,
    fuelState1Trigger,
    fuelState1Min,
    fuelState1Max,
    fuelState2Trigger,
    fuelState2Min,
    fuelState2Max,
    fuelState3Min,
    fuelState3Max,
    enabledSupplements,
    goalProfile,
    targetAdjustmentPercent,
    mealPattern,
    dietaryProfile,
    foodAllergies,
    foodIntolerances,
    lifestyleExclusions
  } = result.data

  // Update user model for global tracking preference
  if (nutritionTrackingEnabled !== undefined) {
    await prisma.user.update({
      where: { id: userId },
      data: { nutritionTrackingEnabled }
    })
  }

  const settings = await nutritionSettingsRepository.upsert(userId, {
    bmr,
    activityLevel,
    currentCarbMax,
    ultimateCarbGoal,
    baseProteinPerKg,
    baseFatPerKg,
    sweatRate,
    sodiumTarget,
    preWorkoutWindow,
    postWorkoutWindow,
    carbsPerHourLow,
    carbsPerHourMedium,
    carbsPerHourHigh,
    carbScalingFactor,
    fuelingSensitivity,
    fuelState1Trigger,
    fuelState1Min,
    fuelState1Max,
    fuelState2Trigger,
    fuelState2Min,
    fuelState2Max,
    fuelState3Min,
    fuelState3Max,
    enabledSupplements,
    goalProfile,
    targetAdjustmentPercent,
    mealPattern,
    dietaryProfile,
    foodAllergies,
    foodIntolerances,
    lifestyleExclusions
  })

  // REACTIVE: Automatically trigger fueling plan regeneration for today
  try {
    const timezone = await getUserTimezone(userId)
    const today = getUserLocalDate(timezone)
    await metabolicService.calculateFuelingPlanForDate(userId, today, {
      persist: true
    })
  } catch (err) {
    console.error('[NutritionSettings] Failed to trigger plan regeneration:', err)
  }

  return {
    settings
  }
})
