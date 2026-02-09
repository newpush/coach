import { prisma } from '../db'
import type { Prisma } from '@prisma/client'

export const workoutRepository = {
  /**
   * Get workouts for a user with standard filters
   * Automatically excludes duplicates unless strictly requested
   */
  async getForUser(
    userId: string,
    options: {
      startDate?: Date
      endDate?: Date
      limit?: number
      offset?: number
      includeDuplicates?: boolean
      orderBy?: Prisma.WorkoutOrderByWithRelationInput
      include?: Prisma.WorkoutInclude
      select?: Prisma.WorkoutSelect
      where?: Prisma.WorkoutWhereInput
    } = {}
  ) {
    const where: Prisma.WorkoutWhereInput = {
      userId,
      // Default to hiding duplicates unless explicitly requested
      // We don't hide duplicates by default here because the UI handles duplication visualization (e.g. merging)
      // And we might want to see all workouts to debug why they are not showing up.
      // Wait, the repository pattern document says "Defaults to hiding duplicates".
      // Let's stick to the pattern but ensure we can see them if we want.
      isDuplicate: options.includeDuplicates ? undefined : false,
      date: {
        gte: options.startDate,
        lte: options.endDate
      },
      ...options.where
    }

    // Prisma doesn't allow both include and select
    if (options.select) {
      return prisma.workout.findMany({
        where,
        take: options.limit,
        skip: options.offset,
        orderBy: options.orderBy || { date: 'desc' },
        select: options.select
      })
    }

    return prisma.workout.findMany({
      where,
      take: options.limit,
      skip: options.offset,
      orderBy: options.orderBy || { date: 'desc' },
      include: options.include
    })
  },

  /**
   * Get a single workout by ID, ensuring it belongs to the user
   */
  async getById(
    workoutId: string,
    userId: string,
    options: {
      include?: Prisma.WorkoutInclude
      select?: Prisma.WorkoutSelect
    } = {}
  ) {
    const where: Prisma.WorkoutWhereInput = {
      id: workoutId,
      userId
    }

    if (options.select) {
      return prisma.workout.findFirst({
        where,
        select: options.select
      })
    }

    return prisma.workout.findFirst({
      where,
      include: options.include
    })
  },

  /**
   * Get total count of workouts for a user
   */
  async count(
    userId: string,
    options: {
      startDate?: Date
      endDate?: Date
      includeDuplicates?: boolean
      where?: Prisma.WorkoutWhereInput
    } = {}
  ) {
    const where: Prisma.WorkoutWhereInput = {
      userId,
      isDuplicate: options.includeDuplicates ? undefined : false,
      date: {
        gte: options.startDate,
        lte: options.endDate
      },
      ...options.where
    }

    return prisma.workout.count({ where })
  },

  /**
   * Get the most recent workout for a user
   */
  async getMostRecent(userId: string) {
    return prisma.workout.findFirst({
      where: {
        userId,
        isDuplicate: false
      },
      orderBy: { date: 'desc' }
    })
  },

  /**
   * Find first workout matching criteria
   */
  async findFirst(
    userId: string,
    options: {
      date?: Date
      select?: Prisma.WorkoutSelect
    } = {}
  ) {
    return prisma.workout.findFirst({
      where: {
        userId,
        date: options.date
      },
      select: options.select
    })
  },

  /**
   * Find a workout by its external ID (source + externalId)
   * Useful for syncing integrations
   */
  async getByExternalId(userId: string, source: string, externalId: string) {
    return prisma.workout.findUnique({
      where: {
        userId_source_externalId: {
          userId,
          source,
          externalId
        }
      }
    })
  },

  /**
   * Get workouts that need AI analysis
   */
  async getPendingAnalysis(userId: string) {
    return prisma.workout.findMany({
      where: {
        userId,
        isDuplicate: false,
        OR: [
          { aiAnalysisStatus: null },
          { aiAnalysisStatus: 'NOT_STARTED' },
          { aiAnalysisStatus: 'PENDING' },
          { aiAnalysisStatus: 'FAILED' }
        ]
      },
      select: {
        id: true,
        title: true,
        date: true,
        aiAnalysisStatus: true
      },
      orderBy: {
        date: 'desc'
      }
    })
  },

  /**
   * Create a new workout
   */
  async create(data: Prisma.WorkoutUncheckedCreateInput) {
    return prisma.workout.create({
      data
    })
  },

  /**
   * Update a workout by ID
   */
  async update(id: string, data: Prisma.WorkoutUpdateInput) {
    return prisma.workout.update({
      where: { id },
      data
    })
  },

  /**
   * Update a workout status (e.g. for analysis)
   */
  async updateStatus(id: string, status: string) {
    return prisma.workout.update({
      where: { id },
      data: { aiAnalysisStatus: status }
    })
  },

  /**
   * Upsert a workout (create if new, update if exists)
   * Uses unique constraint on [userId, source, externalId]
   * Returns the record and a boolean indicating if it was created (isNew)
   */
  async upsert(
    userId: string,
    source: string,
    externalId: string,
    createData: Prisma.WorkoutUncheckedCreateInput,
    updateData: Prisma.WorkoutUncheckedUpdateInput
  ) {
    const existing = await this.getByExternalId(userId, source, externalId)

    const record = await prisma.workout.upsert({
      where: {
        userId_source_externalId: {
          userId,
          source,
          externalId
        }
      },
      create: createData,
      update: updateData
    })

    return {
      record,
      isNew: !existing
    }
  },

  /**
   * Update many workouts based on criteria
   */
  async updateMany(where: Prisma.WorkoutWhereInput, data: Prisma.WorkoutUpdateManyMutationInput) {
    return prisma.workout.updateMany({
      where,
      data
    })
  },

  /**
   * Delete a workout by ID
   */
  async delete(id: string, userId: string) {
    return prisma.workout.delete({
      where: { id, userId }
    })
  }
}
