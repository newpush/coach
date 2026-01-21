import { describe, it, expect, vi, beforeEach } from 'vitest'
import { planningTools } from '../../../../../server/utils/ai-tools/planning'
import { prisma } from '../../../../../server/utils/db'
import { generateStructuredWorkoutTask } from '../../../../../trigger/generate-structured-workout'

// Mock Prisma
vi.mock('../../../../../server/utils/db', () => ({
  prisma: {
    plannedWorkout: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn()
    },
    workout: {
      delete: vi.fn()
    }
  }
}))

// Mock Trigger
vi.mock('../../../../../trigger/generate-structured-workout', () => ({
  generateStructuredWorkoutTask: {
    trigger: vi.fn()
  }
}))

describe('planningTools', () => {
  const userId = 'user-123'
  const timezone = 'UTC'
  const tools = planningTools(userId, timezone)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('create_planned_workout', () => {
    it('should create workout and trigger generation', async () => {
      const mockWorkout = { id: 'pw1' }
      vi.mocked(prisma.plannedWorkout.create).mockResolvedValue(mockWorkout as any)

      const result = await tools.create_planned_workout.execute(
        {
          date: '2023-01-01',
          title: 'New Plan',
          type: 'Ride',
          duration_minutes: 60
        },
        { toolCallId: '1', messages: [] }
      )

      expect(prisma.plannedWorkout.create).toHaveBeenCalled()
      expect(generateStructuredWorkoutTask.trigger).toHaveBeenCalledWith(
        { plannedWorkoutId: 'pw1' },
        expect.any(Object)
      )
      expect(result.success).toBe(true)
    })
  })

  describe('update_planned_workout', () => {
    it('should update workout and trigger generation', async () => {
      vi.mocked(prisma.plannedWorkout.findUnique).mockResolvedValue({ date: new Date() } as any)
      vi.mocked(prisma.plannedWorkout.update).mockResolvedValue({ id: 'pw1' } as any)

      const result = await tools.update_planned_workout.execute(
        { workout_id: 'pw1', title: 'Updated' },
        { toolCallId: '1', messages: [] }
      )

      expect(prisma.plannedWorkout.update).toHaveBeenCalled()
      expect(generateStructuredWorkoutTask.trigger).toHaveBeenCalled()
      expect(result.status).toBe('QUEUED_FOR_SYNC')
    })
  })

  describe('delete_workout', () => {
    it('should delete planned workout if found', async () => {
      vi.mocked(prisma.plannedWorkout.delete).mockResolvedValue({} as any)

      const result = await tools.delete_workout.execute(
        { workout_id: 'pw1' },
        { toolCallId: '1', messages: [] }
      )

      expect(prisma.plannedWorkout.delete).toHaveBeenCalled()
      expect(prisma.workout.delete).not.toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('should fallback to delete workout if planned not found', async () => {
      vi.mocked(prisma.plannedWorkout.delete).mockRejectedValue(new Error('Not found'))
      vi.mocked(prisma.workout.delete).mockResolvedValue({} as any)

      const result = await tools.delete_workout.execute(
        { workout_id: 'w1' },
        { toolCallId: '1', messages: [] }
      )

      expect(prisma.plannedWorkout.delete).toHaveBeenCalled()
      expect(prisma.workout.delete).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })
  })

  describe('delete_planned_workout', () => {
    it('should delete planned workout', async () => {
      vi.mocked(prisma.plannedWorkout.delete).mockResolvedValue({} as any)

      const result = await tools.delete_planned_workout.execute(
        { workout_id: 'pw1' },
        { toolCallId: '1', messages: [] }
      )

      expect(prisma.plannedWorkout.delete).toHaveBeenCalledWith({
        where: { id: 'pw1', userId }
      })
      expect(result.success).toBe(true)
    })
  })
})
