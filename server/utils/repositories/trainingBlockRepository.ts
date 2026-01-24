import { prisma } from '../db'
import type { Prisma } from '@prisma/client'

export const trainingBlockRepository = {
  async getById(
    id: string,
    options: {
      include?: Prisma.TrainingBlockInclude
      select?: Prisma.TrainingBlockSelect
    } = {}
  ) {
    if (options.select) {
      return prisma.trainingBlock.findUnique({
        where: { id },
        select: options.select
      })
    }
    return prisma.trainingBlock.findUnique({
      where: { id },
      include: options.include
    })
  },

  async create(
    data: Prisma.TrainingBlockUncheckedCreateInput,
    tx: Prisma.TransactionClient = prisma
  ) {
    return tx.trainingBlock.create({
      data
    })
  },

  async update(
    id: string,
    data: Prisma.TrainingBlockUpdateInput,
    tx: Prisma.TransactionClient = prisma
  ) {
    return tx.trainingBlock.update({
      where: { id },
      data
    })
  },

  async delete(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.trainingBlock.delete({
      where: { id }
    })
  },

  async deleteMany(where: Prisma.TrainingBlockWhereInput, tx: Prisma.TransactionClient = prisma) {
    return tx.trainingBlock.deleteMany({
      where
    })
  },

  async updateMany(
    where: Prisma.TrainingBlockWhereInput,
    data: Prisma.TrainingBlockUpdateManyMutationInput,
    tx: Prisma.TransactionClient = prisma
  ) {
    return tx.trainingBlock.updateMany({
      where,
      data
    })
  },

  async list(
    planId: string,
    options: {
      orderBy?: Prisma.TrainingBlockOrderByWithRelationInput
      include?: Prisma.TrainingBlockInclude
    } = {}
  ) {
    return prisma.trainingBlock.findMany({
      where: { trainingPlanId: planId },
      orderBy: options.orderBy || { order: 'asc' },
      include: options.include
    })
  }
}
