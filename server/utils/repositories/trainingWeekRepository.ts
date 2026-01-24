import { prisma } from '../db'
import type { Prisma } from '@prisma/client'

export const trainingWeekRepository = {
  async getById(
    id: string,
    options: {
      include?: Prisma.TrainingWeekInclude
      select?: Prisma.TrainingWeekSelect
    } = {}
  ) {
    if (options.select) {
      return prisma.trainingWeek.findUnique({
        where: { id },
        select: options.select
      })
    }
    return prisma.trainingWeek.findUnique({
      where: { id },
      include: options.include
    })
  },

  async create(
    data: Prisma.TrainingWeekUncheckedCreateInput,
    tx: Prisma.TransactionClient = prisma
  ) {
    return tx.trainingWeek.create({
      data
    })
  },

  async update(
    id: string,
    data: Prisma.TrainingWeekUpdateInput,
    tx: Prisma.TransactionClient = prisma
  ) {
    return tx.trainingWeek.update({
      where: { id },
      data
    })
  },

  async delete(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.trainingWeek.delete({
      where: { id }
    })
  },

  async deleteMany(where: Prisma.TrainingWeekWhereInput, tx: Prisma.TransactionClient = prisma) {
    return tx.trainingWeek.deleteMany({
      where
    })
  }
}
