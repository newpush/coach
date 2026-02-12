import { describe, it, expect } from 'vitest'
import { mergeFuelingWindows } from './merging-nutrition'

describe('mergeFuelingWindows', () => {
  it('should merge two overlapping Pre-Workout windows', () => {
    const windows = [
      {
        type: 'PRE_WORKOUT',
        startTime: '2026-02-11T06:30:00Z',
        endTime: '2026-02-11T08:30:00Z',
        targetCarbs: 100,
        targetProtein: 20,
        targetFat: 10,
        description: 'Pre-workout 1',
        workoutTitle: 'Run'
      },
      {
        type: 'PRE_WORKOUT',
        startTime: '2026-02-11T07:00:00Z',
        endTime: '2026-02-11T09:00:00Z',
        targetCarbs: 100,
        targetProtein: 20,
        targetFat: 10,
        description: 'Pre-workout 2',
        workoutTitle: 'Gym'
      }
    ]

    const merged = mergeFuelingWindows(windows as any)
    expect(merged.length).toBe(1)
    expect(merged[0]!.type).toBe('PRE_WORKOUT')
    expect(merged[0]!.targetCarbs).toBe(200)
    expect(new Date(merged[0]!.startTime).toISOString()).toBe('2026-02-11T06:30:00.000Z')
    expect(new Date(merged[0]!.endTime).toISOString()).toBe('2026-02-11T09:00:00.000Z')
  })

  it('should create a TRANSITION window when POST and next PRE overlap', () => {
    const windows = [
      {
        type: 'POST_WORKOUT',
        startTime: '2026-02-11T08:35:00Z',
        endTime: '2026-02-11T09:35:00Z',
        targetCarbs: 80,
        targetProtein: 30,
        targetFat: 15,
        description: 'Post-workout Run'
      },
      {
        type: 'PRE_WORKOUT',
        startTime: '2026-02-11T09:00:00Z',
        endTime: '2026-02-11T10:30:00Z',
        targetCarbs: 100,
        targetProtein: 20,
        targetFat: 10,
        description: 'Pre-workout Gym'
      }
    ]

    const merged = mergeFuelingWindows(windows as any)
    expect(merged.length).toBe(1)
    expect(merged[0]!.type).toBe('TRANSITION')
    expect(merged[0]!.targetCarbs).toBe(180)
  })

  it('should not merge windows far apart', () => {
    const windows = [
      {
        type: 'PRE_WORKOUT',
        startTime: '2026-02-11T06:30:00Z',
        endTime: '2026-02-11T08:30:00Z',
        targetCarbs: 100,
        targetProtein: 20,
        targetFat: 10,
        description: 'Pre-workout 1'
      },
      {
        type: 'PRE_WORKOUT',
        startTime: '2026-02-11T10:00:00Z', // 1.5h gap
        endTime: '2026-02-11T11:30:00Z',
        targetCarbs: 100,
        targetProtein: 20,
        targetFat: 10,
        description: 'Pre-workout 2'
      }
    ]

    const merged = mergeFuelingWindows(windows as any)
    expect(merged.length).toBe(2)
  })
})
