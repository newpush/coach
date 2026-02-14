import { buildZonedDateTimeFromUtcDate } from '../date'
import { ABSORPTION_PROFILES } from './absorption'
import { calculateFuelingStrategy } from './fueling-plan'

/**
 * Creates synthetic meals based on Fuel State targets for unlogged future windows.
 */
export function synthesizeRefills(
  date: Date,
  workouts: any[],
  profile: any,
  timezone: string
): any[] {
  const syntheticMeals: any[] = []

  // For future days, we look at the PRIMARY workout to determine Fuel State
  const primaryWorkout = workouts.find((w) => w.type !== 'Rest') || {
    type: 'Rest',
    durationSec: 0,
    workIntensity: 0.5
  }

  // Use calculateFuelingStrategy to get targets
  const plan = calculateFuelingStrategy(profile, {
    ...primaryWorkout,
    date,
    startTime: primaryWorkout.startTime
      ? buildZonedDateTimeFromUtcDate(date, primaryWorkout.startTime, timezone)
      : null
  } as any)

  for (const window of plan.windows) {
    if (window.targetCarbs > 0) {
      syntheticMeals.push({
        time: new Date(window.startTime),
        totalCarbs: window.targetCarbs,
        totalKcal: window.targetCarbs * 4,
        profile:
          window.type === 'INTRA_WORKOUT'
            ? ABSORPTION_PROFILES.RAPID
            : ABSORPTION_PROFILES.BALANCED,
        isSynthetic: true
      })
    }
  }

  // Add Daily Base refills if no windows (or in between)
  if (syntheticMeals.length === 0) {
    const pattern = profile.mealPattern || [
      { name: 'Breakfast', time: '08:00' },
      { name: 'Lunch', time: '13:00' },
      { name: 'Dinner', time: '19:00' }
    ]

    const carbPerMeal = (profile.weight * 4) / pattern.length

    for (const p of pattern) {
      syntheticMeals.push({
        time: buildZonedDateTimeFromUtcDate(date, p.time, timezone),
        totalCarbs: carbPerMeal,
        totalKcal: carbPerMeal * 4,
        profile: ABSORPTION_PROFILES.BALANCED,
        isSynthetic: true
      })
    }
  }

  return syntheticMeals
}
