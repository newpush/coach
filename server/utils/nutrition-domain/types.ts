import type { AbsorptionProfile } from './absorption'

export interface GlycogenBreakdown {
  midnightBaseline: number
  replenishment: {
    value: number
    actualCarbs: number
    targetCarbs: number
  }
  depletion: Array<{
    title: string
    value: number
    intensity: number
    durationMin: number
  }>
  restingMetabolism?: number
}

export interface GlycogenResult {
  percentage: number
  advice: string
  state: number
  breakdown: GlycogenBreakdown
}

export interface EnergyPoint {
  time: string
  timestamp: number
  level: number
  kcalBalance: number
  carbBalance: number
  fluidDeficit: number
  isFuture: boolean
  event?: string
  eventType?: 'workout' | 'meal'
  eventIcon?: string
  eventCarbs?: number
  eventFluid?: number
}

export interface MealContext {
  time: Date
  name: string
  totalCarbs: number
  totalKcal: number
  totalFluid: number
  profile: AbsorptionProfile
  isSynthetic?: boolean
  isProbable?: boolean
}

export interface WorkoutEvent {
  start: Date
  end: Date
  drainGramsPerInterval: number
  drainKcalPerInterval: number
  drainFluidPerInterval: number
  title: string
}

export interface MetabolicContext {
  userId: string
  date: Date
  timezone: string
  now: Date
}

export interface FuelingProfile {
  weight: number // kg
  ftp: number // watts
  currentCarbMax: number // g/hr
  sodiumTarget?: number // mg/L
  sweatRate?: number // L/hr
  preWorkoutWindow?: number // min (default 90)
  postWorkoutWindow?: number // min (default 60)
  fuelingSensitivity?: number
  fuelState1Trigger?: number
  fuelState1Min?: number
  fuelState1Max?: number
  fuelState2Trigger?: number
  fuelState2Min?: number
  fuelState2Max?: number
  fuelState3Min?: number
  fuelState3Max?: number
  bmr?: number
  activityLevel?: string
  targetAdjustmentPercent?: number
  goalProfile?: string
}

export interface CalorieBreakdown {
  baseCalories: number
  activityCalories: number
  adjustmentCalories: number
  totalTarget: number
  workouts: {
    title: string
    calories: number
    intensity: number
    durationHours: number
  }[]
}

export interface WorkoutContext {
  id: string
  title: string
  durationSec: number // seconds
  tss?: number | null
  intensityFactor?: number | null
  workIntensity?: number | null // 0-1
  type?: string | null
  startTime?: Date | null
  strategyOverride?: string // e.g. 'TRAIN_LOW', 'HIGH_CARB'
  date: Date
  avgTemp?: number | null
  rawJson?: any
}

export interface SerializedFuelingWindow {
  type:
    | 'PRE_WORKOUT'
    | 'INTRA_WORKOUT'
    | 'POST_WORKOUT'
    | 'general_day'
    | 'DAILY_BASE'
    | 'TRANSITION'
    | 'WORKOUT_EVENT'
  startTime: string // ISO string
  endTime: string // ISO string
  targetCarbs: number // grams
  targetProtein: number // grams
  targetFat: number // grams
  targetFluid: number // ml
  targetSodium: number // mg
  description: string
  status: 'PENDING' | 'HIT' | 'MISSED' | 'PARTIAL'
  supplements?: string[]
  plannedWorkoutId?: string
  workoutTitle?: string
}

export interface SerializedFuelingPlan {
  windows: SerializedFuelingWindow[]
  dailyTotals: {
    calories: number
    carbs: number
    protein: number
    fat: number
    fluid: number
    sodium: number
    baseCalories: number
    activityCalories: number
    adjustmentCalories: number
    fuelState: number
    workoutCalories?: {
      title: string
      calories: number
    }[]
  }
  notes: string[]
}
