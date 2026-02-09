import type { UserNutritionSettings } from '@prisma/client'
import { nutritionSettingsRepository } from '../repositories/nutritionSettingsRepository'

export const DEFAULT_NUTRITION_SETTINGS: Omit<
  UserNutritionSettings,
  'id' | 'userId' | 'createdAt' | 'updatedAt'
> = {
  bmr: 1600,
  activityLevel: 'ACTIVE',
  baseProteinPerKg: 1.6,
  baseFatPerKg: 1.0,
  currentCarbMax: 60,
  ultimateCarbGoal: 90,
  sweatRate: 0.8,
  sodiumTarget: 750,
  preWorkoutWindow: 120,
  postWorkoutWindow: 60,
  carbsPerHourLow: 30,
  carbsPerHourMedium: 60,
  carbsPerHourHigh: 90,
  carbScalingFactor: 1.0,
  fuelingSensitivity: 1.0,
  fuelState1Trigger: 0.6,
  fuelState1Min: 3.0,
  fuelState1Max: 4.5,
  fuelState2Trigger: 0.85,
  fuelState2Min: 5.0,
  fuelState2Max: 7.5,
  fuelState3Min: 8.0,
  fuelState3Max: 12.0,
  enabledSupplements: [],
  goalProfile: 'MAINTAIN',
  targetAdjustmentPercent: 0.0,
  mealPattern: [
    { name: 'Breakfast', time: '07:00' },
    { name: 'Lunch', time: '12:00' },
    { name: 'Dinner', time: '18:00' },
    { name: 'Snack', time: '15:00' }
  ],
  dietaryProfile: [],
  foodAllergies: [],
  foodIntolerances: [],
  lifestyleExclusions: []
}

export async function getUserNutritionSettings(userId: string): Promise<UserNutritionSettings> {
  const settings = await nutritionSettingsRepository.getByUserId(userId)

  if (!settings) {
    return {
      ...DEFAULT_NUTRITION_SETTINGS,
      id: 'default',
      userId: userId,
      createdAt: new Date(),
      updatedAt: new Date()
    } as UserNutritionSettings
  }

  return settings
}
