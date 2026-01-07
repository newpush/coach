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

  // Hourly stats (last 24 hours)
  const hourlyStats = await prisma.$queryRaw`
    SELECT
      date_trunc('hour', "createdAt") as timestamp,
      "eventType",
      COUNT(*)::int as count
    FROM "WebhookLog"
    WHERE "createdAt" > NOW() - INTERVAL '24 hours'
    GROUP BY 1, 2
    ORDER BY 1 ASC
  `

  // Daily stats (last 7 days)
  const dailyStats = await prisma.$queryRaw`
    SELECT
      date_trunc('day', "createdAt") as timestamp,
      "eventType",
      COUNT(*)::int as count
    FROM "WebhookLog"
    WHERE "createdAt" > NOW() - INTERVAL '7 days'
    GROUP BY 1, 2
    ORDER BY 1 ASC
  `

  return {
    hourly: hourlyStats,
    daily: dailyStats
  }
})
