import { prisma } from '../db'
import type { Prisma } from '@prisma/client'

export const trainingPlanRepository = {
  async getById<T extends Prisma.TrainingPlanInclude>(
    id: string,
    userId: string,
    options: {
      include?: T
      select?: Prisma.TrainingPlanSelect
    } = {}
  ) {
    if (options.select) {
      return prisma.trainingPlan.findFirst({
        where: { id, userId },
        select: options.select
      })
    }
    // We cast the return to allow T to drive the result type, leveraging Prisma's automatic inference
    return prisma.trainingPlan.findFirst({
      where: { id, userId },
      include: options.include
    }) as unknown as Promise<Prisma.TrainingPlanGetPayload<{ include: T }> | null>
  },

  async getActive<T extends Prisma.TrainingPlanInclude>(
    userId: string,
    options: {
      include?: T
    } = {}
  ) {
    return prisma.trainingPlan.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: options.include,
      orderBy: { createdAt: 'desc' }
    }) as unknown as Promise<Prisma.TrainingPlanGetPayload<{ include: T }> | null>
  },

  async create<T extends Prisma.TrainingPlanInclude>(
    data: Prisma.TrainingPlanUncheckedCreateInput,
    include?: T
  ) {
    return prisma.trainingPlan.create({
      data,
      include
    }) as unknown as Promise<Prisma.TrainingPlanGetPayload<{ include: T }>>
  },

  async update(id: string, userId: string, data: Prisma.TrainingPlanUpdateInput) {
    return prisma.trainingPlan.update({
      where: { id, userId },
      data
    })
  },

  async delete(id: string, userId: string) {
    return prisma.trainingPlan.delete({
      where: { id, userId }
    })
  },

  async list<T extends Prisma.TrainingPlanInclude>(
    userId: string,
    options: {
      status?: string
      isTemplate?: boolean
      include?: T
    } = {}
  ) {
    return prisma.trainingPlan.findMany({
      where: {
        userId,
        status: options.status,
        isTemplate: options.isTemplate
      },
      include: options.include,
      orderBy: { createdAt: 'desc' }
    }) as unknown as Promise<Array<Prisma.TrainingPlanGetPayload<{ include: T }>>>
  },

  async archiveAllExcept(userId: string, exceptId: string) {
    return prisma.trainingPlan.updateMany({
      where: {
        userId,
        status: 'ACTIVE',
        id: { not: exceptId }
      },
      data: {
        status: 'ARCHIVED'
      }
    })
  },

  async cleanupWorkouts(userId: string, planId: string, minDate: Date) {
    const planScope = {
      userId,
      date: { gte: minDate },
      trainingWeek: {
        block: {
          trainingPlanId: planId
        }
      },
      completed: false
    }

    // A. Unlink User-Managed Workouts (preserve them)
    await prisma.plannedWorkout.updateMany({
      where: {
        ...planScope,
        managedBy: 'USER'
      },
      data: {
        trainingWeekId: null
      }
    })

    // B. Delete AI-Managed Workouts
    return prisma.plannedWorkout.deleteMany({
      where: {
        ...planScope,
        managedBy: { not: 'USER' }
      }
    })
  }
}
