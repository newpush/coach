import { defineEventHandler, createError } from 'h3'
import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  // Strict admin check
  if (!session?.user?.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden'
    })
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      isAdmin: true,
      createdAt: true,
      integrations: {
        select: {
          provider: true
        }
      },
      _count: {
        select: {
          workouts: true,
          nutrition: true,
          wellness: true,
          chatParticipations: true,
          plannedWorkouts: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  })

  // Calculate LLM usage stats per user
  const llmUsageStats = await prisma.llmUsage.groupBy({
    by: ['userId'],
    _count: {
      _all: true
    },
    _sum: {
      estimatedCost: true
    },
    where: {
      userId: {
        not: null
      }
    }
  })

  // Create a map for faster lookup
  const llmStatsMap = new Map(
    llmUsageStats.map((stat) => [
      stat.userId,
      {
        count: stat._count._all,
        cost: stat._sum.estimatedCost || 0
      }
    ])
  )

  // Merge stats into user objects
  return users.map((user) => ({
    ...user,
    llmUsage: llmStatsMap.get(user.id) || { count: 0, cost: 0 }
  }))
})
