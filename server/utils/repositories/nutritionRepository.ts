import { prisma } from '../db'
import type { Prisma } from '@prisma/client'

export const nutritionRepository = {
  /**
   * Get nutrition entries for a user
   */
  async getForUser(
    userId: string,
    options: {
      startDate?: Date
      endDate?: Date
      limit?: number
      offset?: number
      orderBy?: Prisma.NutritionOrderByWithRelationInput
      select?: Prisma.NutritionSelect
    } = {}
  ) {
    const where: Prisma.NutritionWhereInput = {
      userId,
      date: {
        gte: options.startDate,
        lte: options.endDate
      }
    }

    return prisma.nutrition.findMany({
      where,
      take: options.limit,
      skip: options.offset,
      orderBy: options.orderBy || { date: 'desc' },
      select: options.select
    })
  },

  /**
   * Get a single nutrition entry by ID, ensuring it belongs to the user
   */
  async getById(nutritionId: string, userId: string) {
    return prisma.nutrition
      .findUnique({
        where: {
          id: nutritionId
        }
      })
      .then((nutrition) => {
        if (nutrition && nutrition.userId === userId) {
          return nutrition
        }
        return null
      })
  },

  /**
   * Get nutrition entry by date for a user
   */
  async getByDate(userId: string, date: Date) {
    return prisma.nutrition.findUnique({
      where: {
        userId_date: {
          userId,
          date
        }
      }
    })
  },

  /**
   * Get total count of nutrition entries for a user
   */
  async count(
    userId: string,
    options: {
      startDate?: Date
      endDate?: Date
    } = {}
  ) {
    const where: Prisma.NutritionWhereInput = {
      userId,
      date: {
        gte: options.startDate,
        lte: options.endDate
      }
    }

    return prisma.nutrition.count({ where })
  },

  /**
   * Get the most recent nutrition entry for a user
   */
  async getMostRecent(userId: string) {
    return prisma.nutrition.findFirst({
      where: {
        userId
      },
      orderBy: { date: 'desc' }
    })
  },

  /**
   * Get nutrition entries pending analysis
   */
  async getPendingAnalysis(userId: string) {
    return prisma.nutrition.findMany({
      where: {
        userId,
        OR: [
          { aiAnalysisStatus: null },
          { aiAnalysisStatus: 'NOT_STARTED' },
          { aiAnalysisStatus: 'PENDING' },
          { aiAnalysisStatus: 'FAILED' }
        ]
      },
      select: {
        id: true,
        date: true,
        aiAnalysisStatus: true
      },
      orderBy: {
        date: 'desc'
      }
    })
  },

  /**
   * Create a new nutrition entry
   */
  async create(data: Prisma.NutritionUncheckedCreateInput) {
    return prisma.nutrition.create({
      data
    })
  },

  /**
   * Update a nutrition entry by ID
   */
  async update(id: string, data: Prisma.NutritionUpdateInput) {
    return prisma.nutrition.update({
      where: { id },
      data
    })
  },

  /**
   * Update analysis status
   */
  async updateStatus(id: string, status: string) {
    return prisma.nutrition.update({
      where: { id },
      data: { aiAnalysisStatus: status }
    })
  },

  /**
   * Update many nutrition entries
   */
  async updateMany(
    where: Prisma.NutritionWhereInput,
    data: Prisma.NutritionUpdateManyMutationInput
  ) {
    return prisma.nutrition.updateMany({
      where,
      data
    })
  },

  /**
   * Upsert a nutrition entry
   */
  async upsert(
    userId: string,
    date: Date,
    createData: Prisma.NutritionUncheckedCreateInput,
    updateData: Prisma.NutritionUncheckedUpdateInput
  ) {
    return prisma.nutrition.upsert({
      where: {
        userId_date: {
          userId,
          date
        }
      },
      create: createData,
      update: updateData
    })
  }
}
