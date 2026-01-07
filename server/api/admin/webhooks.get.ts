import { defineEventHandler, createError, getQuery } from 'h3'
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

  const query = getQuery(event)
  const page = Math.max(1, parseInt(query.page as string) || 1)
  const limit = Math.max(1, Math.min(100, parseInt(query.limit as string) || 20))
  const skip = (page - 1) * limit

  const [logs, total] = await Promise.all([
    prisma.webhookLog.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      skip,
      take: limit
    }),
    prisma.webhookLog.count()
  ])

  return {
    data: logs,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  }
})
