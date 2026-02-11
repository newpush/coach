import { describe, it, expect, vi, beforeEach } from 'vitest'
import { plannedWorkoutRepository } from '../../../../../server/utils/repositories/plannedWorkoutRepository'
import { prisma } from '../../../../../server/utils/db'

vi.mock('../../../../../server/utils/db', () => ({
  prisma: {
    plannedWorkout: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn()
    }
  }
}))

describe('plannedWorkoutRepository', () => {
  const userId = 'user-123'
  const workoutId = 'pw-1'
  const mockWorkout = {
    id: workoutId,
    userId,
    title: 'Test Workout',
    date: new Date()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getById', () => {
    it('should return a workout when found', async () => {
      vi.mocked(prisma.plannedWorkout.findFirst).mockResolvedValue(mockWorkout as any)

      const result = await plannedWorkoutRepository.getById(workoutId, userId)

      expect(prisma.plannedWorkout.findFirst).toHaveBeenCalledWith({
        where: { id: workoutId, userId },
        include: undefined
      })
      expect(result).toEqual(mockWorkout)
    })

    it('should return null when not found', async () => {
      vi.mocked(prisma.plannedWorkout.findFirst).mockResolvedValue(null)

      const result = await plannedWorkoutRepository.getById(workoutId, userId)

      expect(result).toBeNull()
    })

    it('should support select options', async () => {
      vi.mocked(prisma.plannedWorkout.findFirst).mockResolvedValue({ title: 'Test' } as any)

      await plannedWorkoutRepository.getById(workoutId, userId, {
        select: { title: true }
      })

      expect(prisma.plannedWorkout.findFirst).toHaveBeenCalledWith({
        where: { id: workoutId, userId },
        select: { title: true }
      })
    })
  })

  describe('create', () => {
    it('should create a workout', async () => {
      const data = {
        userId,
        title: 'New Workout',
        date: new Date(),
        externalId: 'ext-1'
      }
      vi.mocked(prisma.plannedWorkout.create).mockResolvedValue(mockWorkout as any)

      await plannedWorkoutRepository.create(data as any)

      expect(prisma.plannedWorkout.create).toHaveBeenCalledWith({
        data
      })
    })
  })

  describe('update', () => {
    it('should update a workout with userId check', async () => {
      const updateData = { title: 'Updated' }
      vi.mocked(prisma.plannedWorkout.update).mockResolvedValue({
        ...mockWorkout,
        ...updateData
      } as any)

      await plannedWorkoutRepository.update(workoutId, userId, updateData)

      expect(prisma.plannedWorkout.update).toHaveBeenCalledWith({
        where: { id: workoutId, userId },
        data: updateData
      })
    })
  })

  describe('delete', () => {
    it('should delete a workout with userId check', async () => {
      vi.mocked(prisma.plannedWorkout.delete).mockResolvedValue(mockWorkout as any)

      await plannedWorkoutRepository.delete(workoutId, userId)

      expect(prisma.plannedWorkout.delete).toHaveBeenCalledWith({
        where: { id: workoutId, userId }
      })
    })
  })

  describe('list', () => {
    it('should list workouts with default options', async () => {
      vi.mocked(prisma.plannedWorkout.findMany).mockResolvedValue([mockWorkout] as any)

      await plannedWorkoutRepository.list(userId)

      expect(prisma.plannedWorkout.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          date: { gte: undefined }
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        take: undefined,
        include: undefined
      })
    })

    it('should filter by date range', async () => {
      const start = new Date('2023-01-01')
      const end = new Date('2023-01-31')

      await plannedWorkoutRepository.list(userId, {
        startDate: start,
        endDate: end
      })

      expect(prisma.plannedWorkout.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId,
            date: {
              gte: start,
              lte: end
            }
          }
        })
      )
    })

    it('should filter independent workouts', async () => {
      await plannedWorkoutRepository.list(userId, {
        independentOnly: true
      })

      expect(prisma.plannedWorkout.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId,
            trainingWeekId: null
          })
        })
      )
    })
  })
})
