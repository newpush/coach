import { prisma } from '../db'
import type { Prisma } from '@prisma/client'

export const plannedWorkoutRepository = {
  /**
   * Get a single planned workout by ID, ensuring it belongs to the user
   */
  async getById(
    id: string,
    userId: string,
    options: {
      include?: Prisma.PlannedWorkoutInclude
      select?: Prisma.PlannedWorkoutSelect
    } = {}
  ) {
    if (options.select) {
      return prisma.plannedWorkout.findFirst({
        where: { id, userId },
        select: options.select
      })
    }
    return prisma.plannedWorkout.findFirst({
      where: { id, userId },
      include: options.include
    })
  },

  /**
   * Create a new planned workout
   */
  async create(data: Prisma.PlannedWorkoutUncheckedCreateInput) {
    return prisma.plannedWorkout.create({
      data
    })
  },

  /**
   * Update a planned workout
   * Enforces userId check if provided
   */
  async update(id: string, userId: string, data: Prisma.PlannedWorkoutUpdateInput) {
    return prisma.plannedWorkout.update({
      where: { id, userId },
      data
    })
  },

  /**
   * Delete a planned workout
   */
  async delete(id: string, userId: string) {
    return prisma.plannedWorkout.delete({
      where: { id, userId }
    })
  },

  /**
   * List planned workouts with filters
   */
  async list(
    userId: string,
    options: {
      startDate?: Date
      endDate?: Date
      limit?: number
      independentOnly?: boolean
      orderBy?:
        | Prisma.PlannedWorkoutOrderByWithRelationInput
        | Prisma.PlannedWorkoutOrderByWithRelationInput[]
      include?: Prisma.PlannedWorkoutInclude
      where?: Prisma.PlannedWorkoutWhereInput
    } = {}
  ) {
    const where: Prisma.PlannedWorkoutWhereInput = {
      userId,
      date: {
        gte: options.startDate
      },
      ...options.where
    }

    if (options.endDate) {
      if (where.date && typeof where.date === 'object') {
        ;(where.date as any).lte = options.endDate
      } else {
        where.date = { lte: options.endDate }
      }
    }

    if (options.independentOnly) {
      where.trainingWeekId = null
    }

    return prisma.plannedWorkout.findMany({
      where,
      orderBy: options.orderBy || [{ date: 'asc' }, { startTime: 'asc' }],
      take: options.limit,
      include: options.include
    })
  }
}
