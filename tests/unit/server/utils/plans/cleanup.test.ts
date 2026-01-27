import { describe, it, expect } from 'vitest'
import { buildWorkoutCleanupQuery } from '../../../../server/utils/plans/cleanup'

describe('buildWorkoutCleanupQuery', () => {
  const userId = 'user-123'
  const startDate = new Date('2024-01-01T00:00:00Z')
  const endDate = new Date('2024-01-07T23:59:59Z')

  it('should target workouts within date range when no trainingWeekId is provided', () => {
    const query = buildWorkoutCleanupQuery({
      userId,
      startDate,
      endDate
    })

    expect(query).toEqual({
      userId,
      OR: [
        {
          date: {
            gte: startDate,
            lte: endDate
          }
        }
      ],
      completed: false,
      id: {
        notIn: []
      }
    })
  })

  it('should target workouts within date range OR linked to trainingWeekId', () => {
    const trainingWeekId = 'week-abc'
    const query = buildWorkoutCleanupQuery({
      userId,
      startDate,
      endDate,
      trainingWeekId
    })

    expect(query).toEqual({
      userId,
      OR: [
        {
          date: {
            gte: startDate,
            lte: endDate
          }
        },
        { trainingWeekId }
      ],
      completed: false,
      id: {
        notIn: []
      }
    })
  })

  it('should exclude anchorWorkoutIds', () => {
    const anchorWorkoutIds = ['workout-1', 'workout-2']
    const query = buildWorkoutCleanupQuery({
      userId,
      startDate,
      endDate,
      anchorWorkoutIds
    })

    expect(query.id).toEqual({
      notIn: anchorWorkoutIds
    })
  })

  it('should combine all conditions correctly', () => {
    const trainingWeekId = 'week-xyz'
    const anchorWorkoutIds = ['anchor-1']
    const query = buildWorkoutCleanupQuery({
      userId,
      startDate,
      endDate,
      trainingWeekId,
      anchorWorkoutIds
    })

    expect(query).toEqual({
      userId,
      OR: [
        {
          date: {
            gte: startDate,
            lte: endDate
          }
        },
        { trainingWeekId }
      ],
      completed: false,
      id: {
        notIn: anchorWorkoutIds
      }
    })
  })
})
