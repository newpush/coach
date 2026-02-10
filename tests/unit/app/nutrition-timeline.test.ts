import { describe, it, expect, vi } from 'vitest'
import { mapNutritionToTimeline } from '../../../app/utils/nutrition-timeline'

describe('Nutrition Timeline Utility', () => {
  const options = {
    preWorkoutWindow: 60,
    postWorkoutWindow: 60,
    baseProteinPerKg: 1.5,
    baseFatPerKg: 1.0,
    weight: 75
  }

  it('should correctly map a workout to timeline windows', () => {
    const nutritionRecord = {
      date: '2026-02-11T00:00:00Z',
      fuelingPlan: null
    }
    const workouts = [
      {
        id: 'w1',
        title: 'Morning Run',
        date: '2026-02-11T00:00:00Z',
        startTime: '08:00',
        durationSec: 3600,
        workIntensity: 0.7
      }
    ]

    const timeline = mapNutritionToTimeline(nutritionRecord, workouts, options)

    // Check if INTRA_WORKOUT window exists for the workout
    const intraWindow = timeline.find((w) => w.type === 'INTRA_WORKOUT')
    expect(intraWindow).toBeDefined()
    expect(intraWindow?.workoutTitle).toBe('Morning Run')

    // Check if the start time matches 08:00 in some timezone context
    // Note: Since the utility uses local Date constructor, we check the clock time
    expect(intraWindow?.startTime.getHours()).toBe(8)
    expect(intraWindow?.startTime.getMinutes()).toBe(0)
  })

  it('should handle workouts without startTime by defaulting to 10:00', () => {
    const nutritionRecord = {
      date: '2026-02-11T00:00:00Z',
      fuelingPlan: null
    }
    const workouts = [
      {
        id: 'w2',
        title: 'No Time Workout',
        date: '2026-02-11T00:00:00Z',
        durationSec: 3600
      }
    ]

    const timeline = mapNutritionToTimeline(nutritionRecord, workouts, options)
    const intraWindow = timeline.find((w) => w.type === 'INTRA_WORKOUT')

    expect(intraWindow?.startTime.getHours()).toBe(10)
  })

  it('should correctly identify the calendar day from a UTC midnight date', () => {
    // This tests the fix where we use UTC components to avoid off-by-one errors
    const nutritionRecord = {
      date: '2026-02-11T00:00:00Z',
      fuelingPlan: null
    }
    const workouts = [
      {
        id: 'w3',
        title: 'Late Night Workout',
        date: '2026-02-11T00:00:00Z',
        startTime: '22:00',
        durationSec: 3600
      }
    ]

    const timeline = mapNutritionToTimeline(nutritionRecord, workouts, options)
    const intraWindow = timeline.find((w) => w.type === 'INTRA_WORKOUT')

    // Should stay on the 11th
    expect(intraWindow?.startTime.getDate()).toBe(11)
    expect(intraWindow?.startTime.getMonth()).toBe(1) // February is 1
    expect(intraWindow?.startTime.getFullYear()).toBe(2026)
  })
})
