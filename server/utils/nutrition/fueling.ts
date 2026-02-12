import { extractWorkoutTemperatureC, getEstimatedSweatRateLph } from './sweat-rate'

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
  type: 'PRE_WORKOUT' | 'INTRA_WORKOUT' | 'POST_WORKOUT' | 'general_day'
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

export function calculateFuelingStrategy(
  profile: FuelingProfile,
  workout: WorkoutContext
): SerializedFuelingPlan {
  const durationHours = (workout.durationSec || 0) / 3600
  const intensity = workout.intensityFactor || workout.workIntensity || 0.65
  const sensitivity = profile.fuelingSensitivity || 1.0

  // Default Windows
  const windows: SerializedFuelingWindow[] = []
  const notes: string[] = []

  // --- 1. DETERMINE FUEL STATE & DAILY BASELINE ---
  let state = 1
  let carbRange = { min: profile.fuelState1Min || 2.5, max: profile.fuelState1Max || 4.0 }

  if (intensity > (profile.fuelState2Trigger || 0.85)) {
    state = 3
    carbRange = { min: profile.fuelState3Min || 7.0, max: profile.fuelState3Max || 10.0 }
  } else if (intensity > (profile.fuelState1Trigger || 0.7)) {
    state = 2
    carbRange = { min: profile.fuelState2Min || 4.5, max: profile.fuelState2Max || 6.5 }
  }

  // Calculate base carbs (average of range)
  let dailyCarbTargetGrams = profile.weight * ((carbRange.min + carbRange.max) / 2) * sensitivity

  // Apply Goal Adjustment to Carbs as well (e.g. -20% for LOSE)
  // This ensures the Carb Goal doesn't fight the Calorie Goal
  const adjustmentMultiplier = 1 + (profile.targetAdjustmentPercent || 0) / 100
  dailyCarbTargetGrams *= adjustmentMultiplier

  // --- 1b. HANDLE REST DAYS (NO WINDOWS) ---
  if (workout.type === 'Rest' || workout.durationSec === 0) {
    return {
      windows: [],
      dailyTotals: {
        calories: Math.round(
          dailyCarbTargetGrams * 4 + profile.weight * 1.6 * 4 + profile.weight * 1.0 * 9
        ),
        carbs: Math.round(dailyCarbTargetGrams),
        protein: Math.round(profile.weight * 1.6),
        fat: Math.round(profile.weight * 1.0),
        fluid: 2000,
        sodium: 1000,
        baseCalories: Math.round(
          dailyCarbTargetGrams * 4 + profile.weight * 1.6 * 4 + profile.weight * 1.0 * 9
        ),
        activityCalories: 0,
        adjustmentCalories: 0,
        fuelState: 1
      },
      notes: []
    }
  }

  // --- 2. INTRA-WORKOUT STRATEGY ---
  let targetCarbsPerHour = 0
  const workoutTempC = extractWorkoutTemperatureC(workout)
  const effectiveSweatRate =
    profile.sweatRate && profile.sweatRate > 0
      ? profile.sweatRate
      : getEstimatedSweatRateLph({
          intensity,
          temperatureC: workoutTempC,
          fallback: 0.8
        })
  const hydrationPerHour = effectiveSweatRate * 1000 // ml
  const sodiumPerHour = (profile.sodiumTarget || 750) * effectiveSweatRate // mg

  if (workout.strategyOverride === 'TRAIN_LOW') {
    targetCarbsPerHour = 0
    notes.push('TRAIN LOW Protocol: No carb intake during ride to enhance fat oxidation.')
  } else {
    // "Fuel for the Work Required" - Intra is still based on g/hr logic, but influenced by state
    if (durationHours < 1) {
      targetCarbsPerHour = 0
      if (intensity > 0.9) targetCarbsPerHour = 45 // High intensity short
    } else if (durationHours < 2) {
      targetCarbsPerHour = intensity > 0.8 ? 75 : 45
    } else {
      targetCarbsPerHour = intensity > 0.8 ? 90 : 60
    }

    targetCarbsPerHour *= sensitivity
  }

  // Apply Gut Training Cap & Global Physiological Limit (90g/hr)
  const GLOBAL_CAP = 90
  const userCap = profile.currentCarbMax || GLOBAL_CAP
  const effectiveCap = Math.min(GLOBAL_CAP, userCap)

  if (targetCarbsPerHour > effectiveCap) {
    notes.push(
      `Capping intra-ride carbs at ${effectiveCap}g/hr. Ideal for this intensity: ${Math.round(targetCarbsPerHour)}g/hr.`
    )
    targetCarbsPerHour = effectiveCap
  }

  if (!profile.sweatRate) {
    const tempLabel = workoutTempC == null ? 'default temp' : `${Math.round(workoutTempC)}C`
    notes.push(
      `Estimated sweat rate ${effectiveSweatRate.toFixed(2)}L/hr from intensity ${Math.round(intensity * 100)}% and ${tempLabel}.`
    )
  }

  // Apply Goal Adjustment to Intra-Workout as well
  const intraCarbs = Math.round(targetCarbsPerHour * durationHours * adjustmentMultiplier)
  const intraFluid = Math.round(hydrationPerHour * durationHours)
  const intraSodium = Math.round(sodiumPerHour * durationHours)

  // Workout Start Time (default to 10am if not set)
  const workoutStart = workout.startTime
    ? new Date(workout.startTime)
    : new Date(workout.date.getTime() + 10 * 60 * 60 * 1000)
  const workoutEnd = new Date(workoutStart.getTime() + workout.durationSec * 1000)

  windows.push({
    type: 'INTRA_WORKOUT',
    startTime: workoutStart.toISOString(),
    endTime: workoutEnd.toISOString(),
    targetCarbs: intraCarbs,
    targetProtein: 0,
    targetFat: 0,
    targetFluid: intraFluid,
    targetSodium: intraSodium,
    description: `Fuel State ${state} (${state === 1 ? 'Eco' : state === 2 ? 'Steady' : 'Performance'}): ${Math.round(durationHours * 10) / 10}h ride.`,
    status: 'PENDING',
    supplements: extractSupplements(durationHours, intensity),
    plannedWorkoutId: workout.id,
    workoutTitle: workout.title
  })

  // --- 3. PRE-WORKOUT ---
  const preDuration = profile.preWorkoutWindow || 90
  const preStart = new Date(workoutStart.getTime() - preDuration * 60000)

  let preCarbs = profile.weight * 1.0 * sensitivity * adjustmentMultiplier
  if (workout.strategyOverride === 'TRAIN_LOW') {
    preCarbs = 10 // Minimal carbs
    notes.push('TRAIN LOW: Minimal pre-workout carbs (<10g) to maintain low glycogen state.')
  } else if (state === 3 || durationHours > 3) {
    preCarbs = profile.weight * 2.0 * sensitivity * adjustmentMultiplier
  }

  windows.push({
    type: 'PRE_WORKOUT',
    startTime: preStart.toISOString(),
    endTime: workoutStart.toISOString(),
    targetCarbs: Math.round(preCarbs),
    targetProtein: 20,
    targetFat: 10,
    targetFluid: 500,
    targetSodium: 500,
    description: 'Pre-workout fueling window.',
    status: 'PENDING',
    plannedWorkoutId: workout.id,
    workoutTitle: workout.title
  })

  // --- 4. POST-WORKOUT ---
  const postDuration = profile.postWorkoutWindow || 60
  const postEnd = new Date(workoutEnd.getTime() + postDuration * 60000)

  const postCarbs = profile.weight * 1.2 * sensitivity * adjustmentMultiplier
  let postProtein = 30

  if (workout.strategyOverride === 'TRAIN_LOW') {
    postProtein = 45 // Bumping protein for Train Low recovery
    notes.push('TRAIN LOW: Increased post-workout protein to support muscle repair.')
  }

  windows.push({
    type: 'POST_WORKOUT',
    startTime: workoutEnd.toISOString(),
    endTime: postEnd.toISOString(),
    targetCarbs: Math.round(postCarbs),
    targetProtein: postProtein,
    targetFat: 15,
    targetFluid: 750, // Rehydration
    targetSodium: 0,
    description: 'Post-workout recovery window.',
    status: 'PENDING',
    plannedWorkoutId: workout.id,
    workoutTitle: workout.title
  })

  // --- 5. CALORIES & CONSOLIDATION ---
  const breakdown = calculateDailyCalorieBreakdown(profile, [
    { ...workout, durationHours, intensity }
  ])

  return {
    windows,
    dailyTotals: {
      calories: breakdown.totalTarget,
      carbs: Math.round(dailyCarbTargetGrams),
      protein: Math.round(profile.weight * 1.6),
      fat: Math.round(profile.weight * 1.0),
      fluid: intraFluid + 2000,
      sodium: intraSodium + 1000,
      baseCalories: breakdown.baseCalories,
      activityCalories: breakdown.activityCalories,
      adjustmentCalories: breakdown.adjustmentCalories,
      fuelState: state,
      workoutCalories: breakdown.workouts.map((w) => ({ title: w.title, calories: w.calories }))
    },
    notes
  }
}

export function calculateDailyCalorieBreakdown(
  profile: FuelingProfile,
  workouts: any[]
): CalorieBreakdown {
  const ACTIVITY_MULTIPLIERS: Record<string, number> = {
    SEDENTARY: 1.2,
    LIGHTLY_ACTIVE: 1.375,
    ACTIVE: 1.55,
    MODERATELY_ACTIVE: 1.725,
    VERY_ACTIVE: 1.9,
    EXTRA_ACTIVE: 2.1
  }

  const multiplier = ACTIVITY_MULTIPLIERS[profile.activityLevel || 'ACTIVE'] || 1.55
  const baseCalories = Math.round((profile.bmr || 1600) * multiplier)

  let activityCalories = 0
  const workoutDetails: CalorieBreakdown['workouts'] = []

  for (const w of workouts) {
    // Only add activity calories if it's not a rest day and has duration
    if (w.type !== 'Rest' && w.durationHours > 0) {
      const avgPower = profile.ftp * (w.intensity || 0.5)
      const workoutkJ = avgPower * w.durationHours * 3.6
      const cost = Math.round(workoutkJ)
      activityCalories += cost
      workoutDetails.push({
        title: w.title || 'Workout',
        calories: cost,
        intensity: w.intensity,
        durationHours: w.durationHours
      })
    }
  }

  const subtotalCalories = baseCalories + activityCalories
  const adjustmentCalories = Math.round(
    subtotalCalories * ((profile.targetAdjustmentPercent || 0) / 100)
  )
  const totalTarget = subtotalCalories + adjustmentCalories

  return {
    baseCalories,
    activityCalories,
    adjustmentCalories,
    totalTarget,
    workouts: workoutDetails
  }
}

function extractSupplements(duration: number, intensity: number): string[] {
  const supps: string[] = []
  if (intensity > 0.85) supps.push('Caffeine (3-6mg/kg)')
  if (intensity > 0.9 && duration < 0.5) supps.push('Sodium Bicarbonate')
  if (duration > 3) supps.push('Electrolytes')
  return supps
}
