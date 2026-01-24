import { prisma } from '../db'
import type { Prisma } from '@prisma/client'

export const trainingPlanRepository = {
  async getById(
    id: string,
    userId: string,
    options: {
      include?: Prisma.TrainingPlanInclude
      select?: Prisma.TrainingPlanSelect
    } = {}
  ) {
    if (options.select) {
      return prisma.trainingPlan.findFirst({
        where: { id, userId },
        select: options.select
      })
    }
    return prisma.trainingPlan.findFirst({
      where: { id, userId },
      include: options.include
    })
  },

  async getActive(
    userId: string,
    options: {
      include?: Prisma.TrainingPlanInclude
    } = {}
  ) {
    return prisma.trainingPlan.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: options.include,
      orderBy: { createdAt: 'desc' }
    })
  },

  async create(data: Prisma.TrainingPlanUncheckedCreateInput) {
    return prisma.trainingPlan.create({
      data
    })
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

  async list(
    userId: string,
    options: {
      status?: string
      isTemplate?: boolean
      include?: Prisma.TrainingPlanInclude
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
    })
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
  }
}
