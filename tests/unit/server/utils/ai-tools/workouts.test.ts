import { describe, it, expect, vi, beforeEach } from 'vitest'
import { workoutTools } from '../../../../../server/utils/ai-tools/workouts'
import { workoutRepository } from '../../../../../server/utils/repositories/workoutRepository'

// Mock the repository
vi.mock('../../../../../server/utils/repositories/workoutRepository', () => ({
  workoutRepository: {
    getForUser: vi.fn(),
    getById: vi.fn()
  }
}))

describe('workoutTools', () => {
  const userId = 'user-123'
  const timezone = 'UTC'
  const tools = workoutTools(userId, timezone)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('get_recent_workouts', () => {
    it('should return workouts summary', async () => {
      const mockWorkouts = [
        {
          id: 'w1',
          date: new Date('2023-01-01'),
          title: 'Morning Ride',
          source: 'strava',
          type: 'Ride',
          durationSec: 3600,
          tss: 60,
          intensity: 0.65,
          rpe: 5,
          feel: 3
        }
      ]

      vi.mocked(workoutRepository.getForUser).mockResolvedValue(mockWorkouts as any)

      const result = await tools.get_recent_workouts.execute(
        { limit: 1 },
        { toolCallId: '1', messages: [] }
      )

      expect(workoutRepository.getForUser).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ limit: 1 })
      )
      expect(result).toEqual({
        count: 1,
        workouts: [
          {
            id: 'w1',
            date: expect.any(String), // formatUserDate result
            title: 'Morning Ride',
            sport: 'Ride',
            duration: 3600,
            tss: 60,
            intensity: 0.65,
            rpe: 5,
            feel: 3
          }
        ]
      })
    })
  })

  describe('get_workout_details', () => {
    it('should return workout details when found', async () => {
      const mockWorkout = {
        id: 'w1',
        userId,
        date: new Date('2023-01-01'),
        title: 'Hard Intervals',
        type: 'Ride'
      }

      vi.mocked(workoutRepository.getById).mockResolvedValue(mockWorkout as any)

      const result = await tools.get_workout_details.execute(
        { workout_id: 'w1' },
        { toolCallId: '1', messages: [] }
      )

      expect(workoutRepository.getById).toHaveBeenCalledWith('w1', userId, {
        include: {
          plannedWorkout: true,
          streams: true
        }
      })
      expect(result).toEqual({
        ...mockWorkout,
        date: expect.any(String),
        streams: null
      })
    })

    it('should return error when workout not found', async () => {
      vi.mocked(workoutRepository.getById).mockResolvedValue(null)

      const result = await tools.get_workout_details.execute(
        { workout_id: 'w1' },
        { toolCallId: '1', messages: [] }
      )

      expect(result).toEqual({ error: 'Workout not found' })
    })
  })
})
