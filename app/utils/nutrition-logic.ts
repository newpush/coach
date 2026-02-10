import { differenceInMinutes, startOfDay, endOfDay } from 'date-fns'

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
}

export interface GlycogenResult {
  percentage: number
  advice: string
  state: number
  breakdown: GlycogenBreakdown
}

/**
 * Calculates the current glycogen "fuel tank" percentage based on:
 * 1. Base levels (restoration during sleep)
 * 2. Depletion from activities (Planned or Completed)
 * 3. Replenishment from logged nutrition
 */
export function calculateGlycogenState(
  nutritionRecord: any,
  workouts: any[],
  currentTime: Date = new Date()
): GlycogenResult {
  // 1. Establish Baselines
  // We assume the tank starts at 80% at midnight (after overnight restoration)
  const midnightBaseline = 80
  let percentage = midnightBaseline

  // Total daily goals (the "Fill" capacity for the day's demand)
  const targetCarbs = nutritionRecord.carbsGoal || 300
  const actualCarbs = nutritionRecord.carbs || 0

  // 2. Replenishment (The Fill)
  const replenishmentFactor = targetCarbs > 0 ? actualCarbs / targetCarbs : 0
  const replenishmentValue = Math.min(20, replenishmentFactor * 20) // Max 20% addition
  percentage += replenishmentValue

  // 3. Depletion (The Drain)
  const depletionEvents: GlycogenBreakdown['depletion'] = []
  let totalDepletion = 0

  workouts.forEach((workout) => {
    const workoutStart = new Date(workout.startTime || workout.date)
    const isCompleted = workout.source === 'completed'
    const isPlanned = workout.source === 'planned'

    // Intensity factor proxy
    const intensity = workout.intensity || workout.workIntensity || 0.7
    const durationMin = (workout.duration || workout.plannedDuration || 3600) / 60

    let drainPerHour = 20
    if (intensity > 0.85) drainPerHour = 45
    else if (intensity < 0.6) drainPerHour = 10

    const drainAmount = drainPerHour * (durationMin / 60)

    if (isCompleted || (isPlanned && workoutStart <= currentTime)) {
      totalDepletion += drainAmount
      depletionEvents.push({
        title: workout.title,
        value: Math.round(drainAmount),
        intensity,
        durationMin: Math.round(durationMin)
      })
    }
  })

  percentage -= totalDepletion

  // 4. Bounds Check
  percentage = Math.max(5, Math.min(100, Math.round(percentage)))

  // 5. Determine Advice & State
  let advice = ''
  let state = 1 // 1: Good, 2: Warning, 3: Critical

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
      midnightBaseline,
      replenishment: {
        value: Math.round(replenishmentValue),
        actualCarbs,
        targetCarbs
      },
      depletion: depletionEvents
    }
  }
}
