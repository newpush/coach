import { differenceInMinutes, startOfDay, endOfDay } from 'date-fns'
import { fromZonedTime, toZonedTime, format } from 'date-fns-tz'
import { getWorkoutDate } from './nutrition-timeline'
import {
  getProfileForItem,
  getAbsorbedInInterval,
  ABSORPTION_PROFILES,
  type AbsorptionType,
  type AbsorptionProfile
} from './nutrition-absorption'
import { extractWorkoutTemperatureC, getEstimatedSweatRateLph } from './sweat-rate'

const PASSIVE_REHYDRATION_START_HOUR = 7
const PASSIVE_REHYDRATION_END_HOUR = 21
const PASSIVE_REHYDRATION_ML_PER_HOUR = 200
const NO_EXERCISE_DEBT_DECAY_ML_PER_HOUR = 100

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

export function getGramsPerMin(intensity: number): number {
  if (intensity >= 0.9) return 4.5
  if (intensity >= 0.75) return 2.75
  if (intensity < 0.6) return 0.75
  return 1.5
}

function getDateStr(date: any): string {
  if (date instanceof Date) {
    return date.toISOString().split('T')[0]!
  }
  if (typeof date === 'string') {
    return date.split('T')[0]!
  }
  return new Date().toISOString().split('T')[0]!
}

export function calculateGlycogenState(
  nutritionRecord: any,
  workouts: any[],
  settings: any,
  timezone: string,
  currentTime: Date = new Date(),
  startingPercentage?: number
): GlycogenResult {
  const weight = settings?.weight || settings?.user?.weight || 75
  const C_cap = weight * 8

  // Use provided starting percentage or default to 85
  // IMPORTANT: We trust 0 if explicitly passed!
  const baselinePct = startingPercentage !== undefined ? startingPercentage : 85
  let currentGrams = C_cap * (baselinePct / 100)

  const targetCarbs = nutritionRecord.carbsGoal || 300

  // Only count meals that have occurred/been logged until now
  let absorbedUntilNow = 0
  const mealTypes = ['breakfast', 'lunch', 'dinner', 'snacks']
  const dateStr = getDateStr(nutritionRecord.date)

  mealTypes.forEach((type) => {
    if (Array.isArray(nutritionRecord[type])) {
      nutritionRecord[type].forEach((item: any) => {
        let mealTime: Date | null = null
        const timeVal = item.logged_at || item.date
        if (timeVal) {
          if (typeof timeVal === 'string' && /^\d{2}:\d{2}$/.test(timeVal)) {
            mealTime = fromZonedTime(`${dateStr}T${timeVal}:00`, timezone)
          } else {
            mealTime = new Date(timeVal)
          }
        }

        if (mealTime && mealTime <= currentTime) {
          // Use DIGESTION logic: How much is absorbed from mealTime until currentTime?
          const minsSince = differenceInMinutes(currentTime, mealTime)
          const profile = item.absorptionType
            ? ABSORPTION_PROFILES[item.absorptionType as AbsorptionType] ||
              getProfileForItem(item.name || '')
            : getProfileForItem(item.name || '')

          const absorbed = getAbsorbedInInterval(0, minsSince, item.carbs || 0, profile)
          absorbedUntilNow += absorbed
        }
      })
    }
  })

  // Fallback: If no granular meal logs exist but we have a total 'carbs' count,
  // we assume it's fully absorbed (simplification for missing data)
  const hasGranularLogs = mealTypes.some(
    (t) => Array.isArray(nutritionRecord[t]) && nutritionRecord[t].length > 0
  )
  const actualCarbs = hasGranularLogs ? absorbedUntilNow : nutritionRecord.carbs || 0

  // Add intake to current grams
  currentGrams += actualCarbs

  // Calculate replenishment percentage for breakdown
  const replenishmentPct = (actualCarbs / C_cap) * 100

  // Calculate BMR drain since midnight
  const dayStart = fromZonedTime(`${dateStr}T00:00:00`, timezone)
  const minsSinceMidnight = differenceInMinutes(currentTime, dayStart)
  const dailyBmr = settings?.bmr || 1600
  const gramsDrainedBmr = ((dailyBmr * 0.4) / 4) * (minsSinceMidnight / 1440)

  // Subtract BMR drain
  currentGrams -= gramsDrainedBmr

  const bmrPctDrop = (gramsDrainedBmr / C_cap) * 100

  const depletionEvents: GlycogenBreakdown['depletion'] = []
  let totalDepletionGrams = 0

  workouts.forEach((workout) => {
    if (workout.type === 'Rest') return

    const workoutStart = new Date(getWorkoutDate(workout, timezone))
    const isCompleted = workout.source === 'completed' || workout.completed === true

    const intensity = workout.intensity || workout.workIntensity || 0.7
    const durationMin =
      (workout.duration || workout.durationSec || workout.plannedDuration || 3600) / 60

    const gramsPerMin = getGramsPerMin(intensity) * 1.25
    const drainGramsTotal = gramsPerMin * durationMin
    const drainAmountPct = (drainGramsTotal / C_cap) * 100

    // NEW GRADUAL DEPLETION LOGIC:
    if (isCompleted) {
      // If completed, we assume it's done. But if it was completed TODAY,
      // we should ideally only subtract what has elapsed if "Now" is during the workout.
      // However, 'isCompleted' usually means the file is synced and finished.
      // We'll trust completion for now but handle the 'planned' case more accurately.
      totalDepletionGrams += drainGramsTotal
      depletionEvents.push({
        title: workout.title,
        value: Math.round(drainAmountPct),
        intensity,
        durationMin: Math.round(durationMin)
      })
    } else if (workoutStart <= currentTime) {
      // For planned workouts in progress or passed:
      const minsElapsed = Math.max(0, differenceInMinutes(currentTime, workoutStart))
      const effectiveMins = Math.min(durationMin, minsElapsed)
      const partialDrain = gramsPerMin * effectiveMins

      if (partialDrain > 0) {
        totalDepletionGrams += partialDrain
        depletionEvents.push({
          title: workout.title,
          value: Math.round((partialDrain / C_cap) * 100),
          intensity,
          durationMin: Math.round(effectiveMins)
        })
      }
    }
  })

  // Subtract workout depletion
  currentGrams -= totalDepletionGrams

  // Clamp grams between 0 and C_cap
  currentGrams = Math.max(0, Math.min(C_cap, currentGrams))

  // Calculate final percentage
  const percentage = Math.round((currentGrams / C_cap) * 100)

  let advice = ''
  let state = 1

  if (percentage > 70) {
    advice = 'Energy levels high. Ready for intensity.'
    state = 1
  } else if (percentage > 35) {
    advice = 'Moderate depletion. Focus on replenishment.'
    state = 2
  } else {
    advice = 'CRITICAL: Refuel immediately to avoid metabolic crash.'
    state = 3
  }

  return {
    percentage,
    advice,
    state,
    breakdown: {
      midnightBaseline: baselinePct,
      replenishment: {
        value: Math.round(replenishmentPct),
        actualCarbs,
        targetCarbs
      },
      depletion: depletionEvents,
      restingMetabolism: Math.round(bmrPctDrop)
    }
  }
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

export function calculateEnergyTimeline(
  nutritionRecord: any,
  workouts: any[],
  settings: any,
  timezone: string,
  ghostMeal?: {
    totalCarbs: number
    totalKcal: number
    profile: AbsorptionProfile
    time: Date
  },
  options: {
    startingGlycogenPercentage?: number
    startingFluidDeficit?: number
    crossDayMeals?: Array<{
      time: Date
      totalCarbs: number
      totalKcal: number
      profile: AbsorptionProfile
    }>
  } = {}
): EnergyPoint[] {
  const dateStr = getDateStr(nutritionRecord.date)
  const dayStart = fromZonedTime(`${dateStr}T00:00:00`, timezone)
  const now = new Date()

  const points: EnergyPoint[] = []
  const INTERVAL = 15
  const TOTAL_POINTS = (24 * 60) / INTERVAL

  const weight = settings?.user?.weight || 75
  const C_cap = weight * 8

  // Fallback carbsGoal if missing on record
  const effectiveCarbsGoal =
    nutritionRecord.carbsGoal || (settings?.fuelState1Min ? settings.fuelState1Min * weight : 300)

  // Use carryover percentage if provided, otherwise default to 85%
  let currentGrams =
    C_cap *
    (options.startingGlycogenPercentage !== undefined
      ? options.startingGlycogenPercentage / 100
      : 0.85)
  let currentFluidDeficit = options.startingFluidDeficit || 0

  let cumulativeKcalDelta = 0
  let cumulativeCarbDelta = 0

  const dailyBmr = settings?.bmr || 1600
  const intervalRestDrainGrams = (dailyBmr * 0.4) / (4 * 96)
  const intervalRestDrainKcal = (dailyBmr * 1.2) / 96
  const intervalRestFluidLoss = 50 / 96 // ~50ml/day baseline insensible loss

  const actualMeals: any[] = []
  const mealTypes = ['breakfast', 'lunch', 'dinner', 'snacks']
  const mealPattern = settings?.mealPattern || []

  // Add Cross-Day Meals (consumed yesterday but still absorbing today)
  if (options.crossDayMeals) {
    actualMeals.push(...options.crossDayMeals)
  }

  // 1. Process Actual Logs
  mealTypes.forEach((type) => {
    if (Array.isArray(nutritionRecord[type]) && nutritionRecord[type].length > 0) {
      nutritionRecord[type].forEach((item: any) => {
        let mealTime: Date | null = null
        const timeVal = item.logged_at || item.date

        if (timeVal) {
          if (typeof timeVal === 'string' && /^\d{2}:\d{2}$/.test(timeVal)) {
            mealTime = fromZonedTime(`${dateStr}T${timeVal}:00`, timezone)
          } else {
            mealTime = new Date(timeVal)
          }
        } else {
          const pattern = mealPattern.find((p: any) => p.name.toLowerCase() === type.toLowerCase())
          if (pattern) {
            mealTime = fromZonedTime(`${dateStr}T${pattern.time}:00`, timezone)
          }
        }

        if (mealTime && !isNaN(mealTime.getTime())) {
          actualMeals.push({
            time: mealTime,
            name: item.name,
            totalCarbs: item.carbs || 0,
            totalKcal:
              item.calories ||
              (item.carbs || 0) * 4 + (item.protein || 0) * 4 + (item.fat || 0) * 9,
            totalFluid: item.waterMl || 0,
            profile: item.absorptionType
              ? ABSORPTION_PROFILES[item.absorptionType as AbsorptionType] ||
                getProfileForItem(item.name || '')
              : getProfileForItem(item.name || '')
          })
        }
      })
    }
  })

  const finalMeals = [...actualMeals]
  const todayStr = new Date().toISOString().split('T')[0]!
  const isFutureDay = dateStr > todayStr

  // 2. SYNTHETIC REFILLS & PROBABLE INTAKE:
  // We check each potential "refill period" (from plan AND baseline) and
  // only add a synthetic meal if no actual meal covers that window.

  const syntheticCandidates: any[] = []

  // A. From Fueling Plan (Pre/Intra/Post)
  if (nutritionRecord.fuelingPlan?.windows) {
    nutritionRecord.fuelingPlan.windows.forEach((window: any) => {
      if (window.targetCarbs > 0) {
        syntheticCandidates.push({
          time: new Date(window.startTime),
          name: window.type,
          type: window.type,
          targetCarbs: window.targetCarbs,
          targetFluid: window.targetFluid,
          profile:
            window.type === 'INTRA_WORKOUT'
              ? ABSORPTION_PROFILES.RAPID
              : ABSORPTION_PROFILES.BALANCED
        })
      }
    })
  }

  // B. From Baseline Pattern (Breakfast/Lunch/Dinner)
  // We ALWAYS add these candidates, even if a plan exists, to cover the "Daily Base"
  if (effectiveCarbsGoal > 0) {
    const pattern =
      settings?.mealPattern && settings.mealPattern.length > 0
        ? settings.mealPattern
        : [
            { name: 'Breakfast', time: '08:00' },
            { name: 'Lunch', time: '13:00' },
            { name: 'Dinner', time: '19:00' }
          ]

    // Distribute the "Non-Workout" carbs to these meals
    // If plan exists, we should ideally subtract plan carbs from total goal?
    // For simplicity/robustness, we stick to the daily distribution but maybe scale it?
    // Let's stick to the equal distribution of the Daily Goal for now to ensure visibility.
    const baselineCarbPerMeal = effectiveCarbsGoal / pattern.length

    pattern.forEach((p: any) => {
      syntheticCandidates.push({
        time: fromZonedTime(`${dateStr}T${p.time}:00`, timezone),
        name: p.name,
        type: 'DAILY_BASE',
        targetCarbs: baselineCarbPerMeal,
        targetFluid: 0,
        profile: ABSORPTION_PROFILES.BALANCED
      })
    })
  }

  // C. Process All Candidates
  const sortedCandidates = syntheticCandidates.sort((a, b) => a.time.getTime() - b.time.getTime())

  sortedCandidates.forEach((cand: any, idx: number) => {
    const windowStartTime = cand.time
    const hasPassed = windowStartTime < now

    // 1. Check coverage by ACTUAL logs
    const hasRealLog = actualMeals.some(
      (m) => Math.abs(m.time.getTime() - windowStartTime.getTime()) < 60 * 60 * 1000
    )

    // 2. Check coverage by OTHER synthetic events (e.g. Plan Window overlaps Baseline Meal)
    // If we have a Pre-Workout at 08:00 and a Breakfast at 08:00, we prefer the Pre-Workout
    const hasBetterSynthetic = sortedCandidates.some(
      (other) =>
        other !== cand &&
        other.type !== 'DAILY_BASE' && // Plan windows beat Base windows
        cand.type === 'DAILY_BASE' &&
        Math.abs(other.time.getTime() - windowStartTime.getTime()) < 60 * 60 * 1000
    )

    if (!hasRealLog && !hasBetterSynthetic) {
      // STRICT ACTUALS: If the window has passed and no log exists, assume 0 intake.
      // This ensures the "Fuel Chain" matches between days.
      const factor = isFutureDay || !hasPassed ? 1.0 : 0.0

      if (factor > 0) {
        let mealCarbs = cand.targetCarbs * factor

        // --- DEFICIT-AWARE REFILL LOGIC ---
        // Boost the FIRST synthetic event of the day if tank is low
        const currentTankPct = (currentGrams / C_cap) * 100

        if (idx === 0 && currentTankPct < 40 && (isFutureDay || !hasPassed)) {
          const gramsTo80 = C_cap * 0.8 - currentGrams
          // Aggressive rescue boost to reach 80% if critical
          if (mealCarbs < gramsTo80) {
            const boost = gramsTo80 - mealCarbs
            mealCarbs += boost
            if (process.env.DEBUG_METABOLIC)
              console.log(
                `[MetabolicRefill] CRITICAL RESCUE: Boosting ${cand.name} by ${boost.toFixed(1)}g to reach 80% capacity`
              )
          }
        } else if (idx === 0 && currentTankPct < 85 && (isFutureDay || !hasPassed)) {
          const gramsTo85 = C_cap * 0.85 - currentGrams
          const maxFrontLoad = effectiveCarbsGoal * 0.6
          const recoveryBonus = Math.min(gramsTo85, maxFrontLoad - mealCarbs)
          if (recoveryBonus > 0) mealCarbs += recoveryBonus
        }

        finalMeals.push({
          time: windowStartTime,
          name: factor === 1.0 ? `Synthetic ${cand.name}` : `Probable ${cand.name} (50%)`,
          totalCarbs: mealCarbs,
          totalKcal: mealCarbs * 4,
          totalFluid: (cand.targetFluid || 0) * factor,
          profile: cand.profile,
          isSynthetic: true,
          isProbable: factor < 1.0
        })
      }
    }
  })

  if (process.env.DEBUG_METABOLIC) {
    console.log(`[MetabolicDebug] Day: ${dateStr}, Final meals count: ${finalMeals.length}`)
    finalMeals.forEach((m) =>
      console.log(` - Meal: ${m.name} at ${m.time.toISOString()} (${m.totalCarbs}g carbs)`)
    )
  }

  // Add waterMl from record as generic "Hydration" event if not tied to items
  if (
    nutritionRecord.waterMl &&
    finalMeals.reduce((acc, m) => acc + (m.totalFluid || 0), 0) === 0
  ) {
    finalMeals.push({
      time: dayStart,
      name: 'Hydration',
      totalCarbs: 0,
      totalKcal: 0,
      totalFluid: nutritionRecord.waterMl,
      profile: ABSORPTION_PROFILES.RAPID
    })
  }

  // Add Ghost Meal if provided
  if (ghostMeal) {
    finalMeals.push({
      ...ghostMeal,
      totalFluid: 0,
      name: 'Ghost Recommendation'
    })
  }

  const workoutEvents = workouts
    .filter((w) => w.type !== 'Rest')
    .map((w) => {
      const start = new Date(getWorkoutDate(w, timezone))
      const durationSec = w.durationSec || w.duration || w.plannedDuration || 3600
      const durationMin = durationSec / 60
      const intensity = w.workIntensity || w.intensityFactor || w.intensity || 0.7
      const sweatRateLph =
        settings.sweatRate && settings.sweatRate > 0
          ? settings.sweatRate
          : getEstimatedSweatRateLph({
              intensity,
              temperatureC: extractWorkoutTemperatureC(w),
              fallback: 0.8
            })

      return {
        start,
        end: new Date(start.getTime() + durationMin * 60000),
        drainGramsPerInterval: getGramsPerMin(intensity) * INTERVAL,
        drainKcalPerInterval: ((getGramsPerMin(intensity) * 4) / 0.8) * INTERVAL,
        drainFluidPerInterval: sweatRateLph * 1000 * (INTERVAL / 60),
        title: w.title
      }
    })

  const manualFluidHours = new Set(
    finalMeals
      .filter((meal) => !meal.isSynthetic && (meal.totalFluid || 0) > 0)
      .map((meal) => format(meal.time, 'yyyy-MM-dd-HH', { timeZone: timezone }))
  )

  for (let i = 0; i <= TOTAL_POINTS; i++) {
    const currentTime = new Date(dayStart.getTime() + i * INTERVAL * 60000)

    const intervalEvents: any[] = []

    // Check for workouts in this interval
    workoutEvents.forEach((w) => {
      const msDiff = Math.abs(currentTime.getTime() - w.start.getTime())
      if (msDiff < (INTERVAL * 60000) / 2) {
        intervalEvents.push({
          name: w.title,
          type: 'workout',
          icon: 'i-tabler-bike',
          carbs: -w.drainGramsPerInterval, // For workout, we show negative (burn)
          fluid: w.drainFluidPerInterval
        })
      }
    })

    // Check for meals in this interval
    finalMeals.forEach((m) => {
      const msDiff = Math.abs(currentTime.getTime() - m.time.getTime())
      if (msDiff < (INTERVAL * 60000) / 2) {
        intervalEvents.push({
          name: m.name,
          type: 'meal',
          icon: 'i-tabler-tools-kitchen-2',
          carbs: m.totalCarbs,
          fluid: m.totalFluid || 0
        })
      }
    })

    const activeWorkout = workoutEvents.find((w) => currentTime >= w.start && currentTime < w.end)
    const hasEvents = intervalEvents.length > 0
    const primaryType = intervalEvents.find((e) => e.type === 'workout') ? 'workout' : 'meal'
    const combinedName = intervalEvents.map((e) => e.name).join(' + ')
    const totalEventCarbs = intervalEvents.reduce((sum, e) => sum + (e.carbs || 0), 0)
    const totalEventFluid = intervalEvents.reduce((sum, e) => sum + (e.fluid || 0), 0)

    points.push({
      time: format(currentTime, 'HH:mm', { timeZone: timezone }),
      timestamp: currentTime.getTime(),
      level: Math.round((currentGrams / C_cap) * 100),
      kcalBalance: Math.round(cumulativeKcalDelta),
      carbBalance: Math.round(cumulativeCarbDelta),
      fluidDeficit: Math.round(currentFluidDeficit),
      isFuture: currentTime > now,
      event: hasEvents ? combinedName : undefined,
      eventType: hasEvents ? primaryType : undefined,
      eventCarbs: hasEvents ? Math.round(totalEventCarbs) : undefined,
      eventFluid: hasEvents ? Math.round(totalEventFluid) : undefined,
      eventIcon: hasEvents
        ? intervalEvents.length > 1
          ? 'i-tabler-layers-intersect'
          : intervalEvents[0].icon
        : undefined
    })

    if (i < TOTAL_POINTS) {
      currentGrams -= intervalRestDrainGrams
      cumulativeKcalDelta -= intervalRestDrainKcal
      cumulativeCarbDelta -= intervalRestDrainGrams
      currentFluidDeficit += intervalRestFluidLoss

      if (activeWorkout) {
        const drop = activeWorkout.drainGramsPerInterval * 1.25
        currentGrams -= drop
        cumulativeKcalDelta -= activeWorkout.drainKcalPerInterval
        cumulativeCarbDelta -= drop
        currentFluidDeficit += activeWorkout.drainFluidPerInterval
      }

      let intervalGramsIn = 0
      let intervalKcalIn = 0
      let intervalFluidIn = 0
      const hourKey = format(currentTime, 'yyyy-MM-dd-HH', { timeZone: timezone })
      const localHour = parseInt(format(currentTime, 'H', { timeZone: timezone }), 10)
      const isPassiveWindow =
        localHour >= PASSIVE_REHYDRATION_START_HOUR && localHour < PASSIVE_REHYDRATION_END_HOUR

      finalMeals.forEach((meal) => {
        const minsSince = (currentTime.getTime() - meal.time.getTime()) / 60000
        if (minsSince >= 0) {
          const absorbed = getAbsorbedInInterval(
            minsSince,
            minsSince + INTERVAL,
            meal.totalCarbs,
            meal.profile
          )
          intervalGramsIn += absorbed
          const kcalFactor = meal.totalCarbs > 0 ? absorbed / meal.totalCarbs : 0
          intervalKcalIn += (meal.totalKcal || 0) * kcalFactor

          if (minsSince < INTERVAL) {
            intervalFluidIn += meal.totalFluid || 0
          }
        }
      })

      const cappedGramsIn = Math.min(intervalGramsIn, 22.5)
      currentGrams += cappedGramsIn
      cumulativeKcalDelta += intervalKcalIn
      cumulativeCarbDelta += cappedGramsIn
      if (isPassiveWindow && !manualFluidHours.has(hourKey)) {
        intervalFluidIn += PASSIVE_REHYDRATION_ML_PER_HOUR * (INTERVAL / 60)
      }
      currentFluidDeficit -= intervalFluidIn
      if (workoutEvents.length === 0) {
        currentFluidDeficit -= NO_EXERCISE_DEBT_DECAY_ML_PER_HOUR * (INTERVAL / 60)
      }
      currentFluidDeficit = Math.max(0, currentFluidDeficit)

      currentGrams = Math.max(0, Math.min(C_cap, currentGrams))
    }
  }

  return points
}
