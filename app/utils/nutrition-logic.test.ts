import { describe, it, expect, vi } from 'vitest'
import { calculateEnergyTimeline } from './nutrition-logic'

// Mock date-fns-tz
vi.mock('date-fns-tz', () => ({
  fromZonedTime: (date: string | Date, tz: string) => {
    if (typeof date === 'string' && !date.endsWith('Z')) {
      return new Date(date + 'Z')
    }
    return new Date(date)
  },
  toZonedTime: (date: string | Date, tz: string) => new Date(date),
  format: (date: Date, fmt: string, options: any) => {
    const hours = String(date.getUTCHours()).padStart(2, '0')
    const mins = String(date.getUTCMinutes()).padStart(2, '0')
    return `${hours}:${mins}`
  }
}))

describe('calculateEnergyTimeline', () => {
  const mockSettings = {
    bmr: 1800,
    user: { weight: 70 }, // mu = 8 -> 560g capacity
    mealPattern: [{ name: 'Breakfast', time: '08:00' }]
  }

  const mockNutrition = {
    date: '2026-02-10T00:00:00Z',
    carbsGoal: 400,
    breakfast: [
      { name: 'Big Bowl of Porridge', carbs: 100, calories: 500, logged_at: '2026-02-10T08:00:00Z' }
    ],
    lunch: [],
    dinner: [],
    snacks: []
  }

  it('should start at 85% and have a realistic resting drain', () => {
    const points = calculateEnergyTimeline(mockNutrition, [], mockSettings, 'UTC')

    // Start of day
    expect(points[0]?.level).toBe(85)

    // Check at 4:00 AM (after 4 hours)
    const fourAm = points.find((p) => p.time === '04:00')
    // Approx 1-1.5% drop per hour -> 4-6% total
    expect(fourAm?.level).toBeLessThan(82)
    expect(fourAm?.level).toBeGreaterThan(75)
  })

  it('should show replenishment with an S-curve (Sigmoid)', () => {
    const points = calculateEnergyTimeline(mockNutrition, [], mockSettings, 'UTC')

    const atMeal = points.find((p) => p.time === '08:00')
    const peakAbsorption = points.find((p) => p.time === '09:30')

    console.log('[TestDebug] Level at meal:', atMeal?.level)
    console.log('[TestDebug] Level 90m after:', peakAbsorption?.level)

    // replenishment should be positive during the absorption window
    expect(peakAbsorption!.level).toBeGreaterThan(atMeal!.level)
  })

  it('should track carbBalance throughout the day', () => {
    const points = calculateEnergyTimeline(mockNutrition, [], mockSettings, 'UTC')

    const morning = points.find((p) => p.time === '07:00')
    const postMeal = points.find((p) => p.time === '11:00')

    // Baseline drain
    expect(morning?.carbBalance).toBeLessThan(0)
    // Post meal absorption should increase balance
    expect(postMeal?.carbBalance).toBeGreaterThan(morning!.carbBalance)
  })

  it('should show steep depletion for high intensity workout', () => {
    const mockWorkouts = [
      {
        title: 'Threshold Intervals',
        date: '2026-02-10T11:00:00Z',
        startTime: '2026-02-10T11:00:00Z',
        durationSec: 3600, // 1 hour
        workIntensity: 0.95 // Z4
      }
    ]

    const points = calculateEnergyTimeline(mockNutrition, mockWorkouts, mockSettings, 'UTC')

    const workoutRange = points.filter((p) => p.time >= '10:45' && p.time <= '12:15')
    console.log(
      '[TestDebug] Points in workout range:',
      workoutRange.map((p) => `${p.time}: ${p.level}%`).join(', ')
    )

    const beforeWorkout = points.find((p) => p.time === '11:00')
    const afterWorkout = points.find((p) => p.time === '12:00')

    console.log('[TestDebug] Level Before:', beforeWorkout?.level)
    console.log('[TestDebug] Level After:', afterWorkout?.level)
    console.log('[TestDebug] Total Drop:', (beforeWorkout?.level || 0) - (afterWorkout?.level || 0))

    // Expect a major drop for high intensity
    expect(beforeWorkout!.level - afterWorkout!.level).toBeGreaterThan(25)
  })

  it('should show the impact of a ghost meal (Metabolic Ghost)', () => {
    const ghostMeal = {
      totalCarbs: 50,
      totalKcal: 200,
      profile: {
        id: 'RAPID' as any,
        label: 'Rapid',
        delay: 5,
        peak: 15,
        duration: 45,
        k: 2
      },
      time: new Date('2026-02-10T14:00:00Z')
    }

    const baselinePoints = calculateEnergyTimeline(mockNutrition, [], mockSettings, 'UTC')
    const ghostPoints = calculateEnergyTimeline(mockNutrition, [], mockSettings, 'UTC', ghostMeal)

    const atMeal = baselinePoints.find((p) => p.time === '14:00')
    const baselinePeak = baselinePoints.find((p) => p.time === '14:45')
    const ghostPeak = ghostPoints.find((p) => p.time === '14:45')

    console.log('[TestDebug] Baseline level at 14:45:', baselinePeak?.level)
    console.log('[TestDebug] Ghost level at 14:45:', ghostPeak?.level)

    expect(ghostPeak!.level).toBeGreaterThan(baselinePeak!.level)
  })
})
