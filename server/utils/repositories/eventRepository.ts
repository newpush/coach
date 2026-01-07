import { prisma } from '../db'

export const eventRepository = {
  /**
   * Get all events for a user
   */
  async getForUser(userId: string, options: { includePublic?: boolean } = {}) {
    return prisma.event.findMany({
      where: {
        OR: [{ userId }, options.includePublic ? { isPublic: true } : {}]
      },
      orderBy: {
        date: 'asc'
      },
      include: {
        goals: {
          select: {
            id: true,
            title: true,
            status: true
          }
        }
      }
    })
  },

  /**
   * Get a specific event by ID with ownership check
   */
  async getById(id: string, userId: string) {
    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        goals: true
      }
    })

    if (!event) return null
    if (event.userId !== userId && !event.isPublic) return null

    return event
  },

  /**
   * Create a new event
   */
  async create(userId: string, data: any) {
    const { goalIds, ...eventData } = data

    return prisma.event.create({
      data: {
        ...eventData,
        userId,
        goals: goalIds
          ? {
              connect: goalIds.map((id: string) => ({ id }))
            }
          : undefined
      }
    })
  },

  /**
   * Update an existing event
   */
  async update(id: string, userId: string, data: any) {
    // Verify ownership
    const existing = await prisma.event.findUnique({
      where: { id },
      select: { userId: true }
    })

    if (!existing || existing.userId !== userId) {
      throw new Error('Not authorized to update this event')
    }

    const { goalIds, ...eventData } = data

    return prisma.event.update({
      where: { id },
      data: {
        ...eventData,
        goals: goalIds
          ? {
              set: goalIds.map((id: string) => ({ id }))
            }
          : undefined
      }
    })
  },

  /**
   * Delete an event
   */
  async delete(id: string, userId: string) {
    // Verify ownership
    const existing = await prisma.event.findUnique({
      where: { id },
      select: { userId: true }
    })

    if (!existing || existing.userId !== userId) {
      throw new Error('Not authorized to delete this event')
    }

    return prisma.event.delete({
      where: { id }
    })
  },

  /**
   * Upsert an external event (from Intervals/Strava)
   */
  async upsertExternal(userId: string, source: string, externalId: string, data: any) {
    return prisma.event.upsert({
      where: {
        userId_source_externalId: {
          userId,
          source,
          externalId
        }
      },
      update: data,
      create: {
        ...data,
        userId,
        source,
        externalId
      }
    })
  }
}
