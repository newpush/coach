import { describe, it, expect, vi } from 'vitest'
import { mapNutritionToTimeline } from '../../../app/utils/nutrition-timeline'

describe('Nutrition Timeline Utility', () => {
  const options = {
    preWorkoutWindow: 60,
    postWorkoutWindow: 60,
    baseProteinPerKg: 1.5,
    baseFatPerKg: 1.0,
    weight: 75,
    timezone: 'UTC'
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

    const timeline = mapNutritionToTimeline(nutritionRecord, workouts, options as any)

    // Check if a window representing the workout exists
    const workoutWindow = timeline.find(
      (w) => w.workoutTitle === 'Morning Run' || w.workout?.title === 'Morning Run'
    )
    expect(workoutWindow).toBeDefined()

    // The type might be TRANSITION if merged, or WORKOUT_EVENT if injected
    expect(['INTRA_WORKOUT', 'TRANSITION', 'WORKOUT_EVENT']).toContain(workoutWindow?.type)

    // Check if the start time matches 08:00
    // We use UTC methods because we set timezone to UTC in options
    expect(workoutWindow?.startTime.getUTCHours()).toBe(8)
    expect(workoutWindow?.startTime.getUTCMinutes()).toBe(0)
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

    const timeline = mapNutritionToTimeline(nutritionRecord, workouts, options as any)
    const workoutEvent = timeline.find(
      (w) => w.type === 'WORKOUT_EVENT' && w.description === 'No Time Workout'
    )

    expect(workoutEvent?.startTime.getUTCHours()).toBe(10)
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

    const timeline = mapNutritionToTimeline(nutritionRecord, workouts, options as any)
    const workoutWindow = timeline.find((w) => w.workoutTitle === 'Late Night Workout')

    // Should stay on the 11th
    expect(workoutWindow?.startTime.getUTCDate()).toBe(11)
    expect(workoutWindow?.startTime.getUTCMonth()).toBe(1) // February is 1
    expect(workoutWindow?.startTime.getUTCFullYear()).toBe(2026)
  })
})
