import { prisma } from '../db'
import type { Prisma } from '@prisma/client'

export const wellnessRepository = {
  /**
   * Get wellness entries for a user
   */
  async getForUser(
    userId: string,
    options: {
      startDate?: Date
      endDate?: Date
      limit?: number
      offset?: number
      orderBy?: Prisma.WellnessOrderByWithRelationInput
      select?: Prisma.WellnessSelect
    } = {}
  ) {
    const where: Prisma.WellnessWhereInput = {
      userId,
      date: {
        gte: options.startDate,
        lte: options.endDate
      }
    }

    return prisma.wellness.findMany({
      where,
      take: options.limit,
      skip: options.offset,
      orderBy: options.orderBy || { date: 'desc' },
      select: options.select
    })
  },

  /**
   * Get wellness entry by date for a user
   */
  async getByDate(userId: string, date: Date) {
    return prisma.wellness.findUnique({
      where: {
        userId_date: {
          userId,
          date
        }
      }
    })
  },

  /**
   * Get a single wellness entry by ID
   */
  async getById(id: string, userId: string) {
    return prisma.wellness
      .findUnique({
        where: { id }
      })
      .then((wellness) => {
        if (wellness && wellness.userId === userId) {
          return wellness
        }
        return null
      })
  },

  /**
   * Get total count of wellness entries for a user
   */
  async count(
    userId: string,
    options: {
      startDate?: Date
      endDate?: Date
    } = {}
  ) {
    const where: Prisma.WellnessWhereInput = {
      userId,
      date: {
        gte: options.startDate,
        lte: options.endDate
      }
    }

    return prisma.wellness.count({ where })
  },

  /**
   * Get the most recent wellness entry for a user
   */
  async getMostRecent(userId: string) {
    return prisma.wellness.findFirst({
      where: {
        userId
      },
      orderBy: { date: 'desc' }
    })
  },

  /**
   * Find first wellness record matching criteria
   */
  async findFirst(
    userId: string,
    options: {
      date?: Date
      select?: Prisma.WellnessSelect
    } = {}
  ) {
    return prisma.wellness.findFirst({
      where: {
        userId,
        date: options.date
      },
      select: options.select
    })
  },

  /**
   * Upsert a wellness entry with smart merging
   * Only updates fields that are non-null in the updateData to prevent overwriting existing data with nulls
   */
  async upsert(
    userId: string,
    date: Date,
    createData: Prisma.WellnessUncheckedCreateInput,
    updateData: Prisma.WellnessUncheckedUpdateInput
  ) {
    // 1. Fetch existing record
    const existing = await prisma.wellness.findUnique({
      where: {
        userId_date: {
          userId,
          date
        }
      }
    })

    // 2. If it exists, filter updateData to only include non-null values
    let finalUpdateData = updateData

    if (existing) {
      finalUpdateData = {}
      for (const [key, value] of Object.entries(updateData)) {
        if (value !== null && value !== undefined) {
          // Special handling for rawJson: merge instead of replace if possible
          if (
            key === 'rawJson' &&
            typeof value === 'object' &&
            existing.rawJson &&
            typeof existing.rawJson === 'object'
          ) {
            // @ts-expect-error - Prisma JSON types are complex
            finalUpdateData[key] = { ...existing.rawJson, ...value }
          } else {
            // @ts-expect-error - Dynamic assignment
            finalUpdateData[key] = value
          }
        }
      }
    }

    return prisma.wellness.upsert({
      where: {
        userId_date: {
          userId,
          date
        }
      },
      create: createData,
      update: finalUpdateData
    })
  }
}
