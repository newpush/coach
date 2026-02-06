import { defineEventHandler, createError } from 'h3'
import { getServerSession } from '../../../utils/session'
import { prisma } from '../../../utils/db'
import { getStartOfDayUTC, getStartOfDaysAgoUTC } from '../../../utils/date'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // 1. Usage by Model
  const usageByModel = await prisma.llmUsage.groupBy({
    by: ['model'],
    _count: { id: true },
    _sum: { estimatedCost: true, totalTokens: true },
    where: { createdAt: { gte: thirtyDaysAgo } }
  })

  // 2. Usage by Operation
  const usageByOperation = await prisma.llmUsage.groupBy({
    by: ['operation'],
    _count: { id: true },
    _sum: { estimatedCost: true },
    where: { createdAt: { gte: thirtyDaysAgo } }
  })

  // 3. Top Spenders
  const topSpendersRaw = await prisma.llmUsage.groupBy({
    by: ['userId'],
    _sum: { estimatedCost: true },
    where: {
      createdAt: { gte: thirtyDaysAgo },
      userId: { not: null }
    },
    orderBy: {
      _sum: {
        estimatedCost: 'desc'
      }
    },
    take: 5
  })

  // Fetch user details for top spenders
  const topSpendersDetails = await Promise.all(
    topSpendersRaw.map(async (item) => {
      const user = await prisma.user.findUnique({
        where: { id: item.userId! },
        select: { name: true, email: true }
      })
      return {
        userId: item.userId,
        name: user?.name,
        email: user?.email,
        cost: item._sum.estimatedCost
      }
    })
  )

  // 3b. Top Spenders Today
  const todayStart = getStartOfDayUTC('UTC')
  const topSpendersTodayRaw = await prisma.llmUsage.groupBy({
    by: ['userId'],
    _sum: { estimatedCost: true },
    where: {
      createdAt: { gte: todayStart },
      userId: { not: null }
    },
    orderBy: {
      _sum: {
        estimatedCost: 'desc'
      }
    },
    take: 5
  })

  const topSpendersToday = await Promise.all(
    topSpendersTodayRaw.map(async (item) => {
      const user = await prisma.user.findUnique({
        where: { id: item.userId! },
        select: { name: true, email: true }
      })
      return {
        userId: item.userId,
        name: user?.name,
        email: user?.email,
        cost: item._sum.estimatedCost
      }
    })
  )

  // 3c. Top Spenders Yesterday
  const yesterdayStart = getStartOfDaysAgoUTC('UTC', 1)
  const topSpendersYesterdayRaw = await prisma.llmUsage.groupBy({
    by: ['userId'],
    _sum: { estimatedCost: true },
    where: {
      createdAt: { gte: yesterdayStart, lt: todayStart },
      userId: { not: null }
    },
    orderBy: {
      _sum: {
        estimatedCost: 'desc'
      }
    },
    take: 5
  })

  const topSpendersYesterday = await Promise.all(
    topSpendersYesterdayRaw.map(async (item) => {
      const user = await prisma.user.findUnique({
        where: { id: item.userId! },
        select: { name: true, email: true }
      })
      return {
        userId: item.userId,
        name: user?.name,
        email: user?.email,
        cost: item._sum.estimatedCost
      }
    })
  )

  // 4. Recent Failures
  const recentFailures = await prisma.llmUsage.findMany({
    where: {
      success: false,
      createdAt: { gte: thirtyDaysAgo }
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      operation: true,
      model: true,
      errorType: true,
      errorMessage: true,
      createdAt: true
    }
  })

  // 5. Total Token Usage Breakdown
  const tokenStats = await prisma.llmUsage.aggregate({
    where: { createdAt: { gte: thirtyDaysAgo } },
    _sum: {
      promptTokens: true,
      completionTokens: true,
      cachedTokens: true,
      totalTokens: true
    }
  })

  // 6. AI Feedback Stats
  const feedbackStats = await prisma.llmUsage.groupBy({
    by: ['feedback'],
    _count: { id: true },
    where: {
      createdAt: { gte: thirtyDaysAgo },
      feedback: { not: null }
    }
  })

  // 7. Daily Feedback Histogram
  const feedbackByDayRaw = await prisma.$queryRaw<{ date: string; count: bigint }[]>`
    SELECT DATE("createdAt") as date, COUNT(*) as count
    FROM "LlmUsage"
    WHERE "createdAt" >= ${thirtyDaysAgo} AND "feedback" IS NOT NULL
    GROUP BY DATE("createdAt")
    ORDER BY date ASC
  `

  const feedbackByDay = feedbackByDayRaw.map((row) => ({
    date: new Date(row.date).toISOString().split('T')[0],
    count: Number(row.count)
  }))

  // 8. Recent Usage Records (Detailed Table)
  const recentUsage = await prisma.llmUsage.findMany({
    where: { createdAt: { gte: thirtyDaysAgo } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      createdAt: true,
      model: true,
      operation: true,
      totalTokens: true,
      cachedTokens: true,
      estimatedCost: true,
      success: true,
      durationMs: true,
      user: {
        select: {
          email: true
        }
      }
    }
  })

  // 9. Tool Usage Stats (from ChatMessage metadata)
  const usageByToolRaw = await prisma.$queryRaw<{ name: string; count: bigint }[]>`
    SELECT
      tool as name,
      COUNT(*) as count
    FROM "ChatMessage",
         jsonb_array_elements_text(metadata->'toolsUsed') as tool
    WHERE "createdAt" >= ${thirtyDaysAgo}
    GROUP BY tool
    ORDER BY count DESC
    LIMIT 20
  `

  const usageByTool = usageByToolRaw.map((row) => ({
    name: row.name,
    count: Number(row.count)
  }))

  // 10. Stacked Daily Costs per Model
  const dailyCostsByModelRaw = await prisma.$queryRaw<
    { date: string; model: string; cost: number }[]
  >`
    SELECT DATE("createdAt") as date, model, SUM("estimatedCost") as cost
    FROM "LlmUsage"
    WHERE "createdAt" >= ${thirtyDaysAgo}
    GROUP BY DATE("createdAt"), model
    ORDER BY date ASC
  `

  const dailyCostsByModel = dailyCostsByModelRaw.map((row) => ({
    date: new Date(row.date).toISOString().split('T')[0],
    model: row.model,
    cost: Number(row.cost || 0)
  }))

  // 11. Daily Users per Model
  const dailyUsersByModelRaw = await prisma.$queryRaw<
    { date: string; model: string; count: bigint }[]
  >`
    SELECT DATE("createdAt") as date, model, COUNT(DISTINCT "userId") as count
    FROM "LlmUsage"
    WHERE "createdAt" >= ${thirtyDaysAgo} AND "userId" IS NOT NULL
    GROUP BY DATE("createdAt"), model
    ORDER BY date ASC
  `

  const dailyUsersByModel = dailyUsersByModelRaw.map((row) => ({
    date: new Date(row.date).toISOString().split('T')[0],
    model: row.model,
    count: Number(row.count)
  }))

  // 12. Daily Tool Calls per Tool
  const dailyToolUsageRaw = await prisma.$queryRaw<{ date: string; name: string; count: bigint }[]>`
    SELECT
      DATE("createdAt") as date,
      tool as name,
      COUNT(*) as count
    FROM "ChatMessage",
         jsonb_array_elements_text(metadata->'toolsUsed') as tool
    WHERE "createdAt" >= ${thirtyDaysAgo}
    GROUP BY DATE("createdAt"), tool
    ORDER BY date ASC
  `

  const dailyToolUsage = dailyToolUsageRaw.map((row) => ({
    date: new Date(row.date).toISOString().split('T')[0],
    name: row.name,
    count: Number(row.count)
  }))

  // 13. Daily Chat Requests
  const dailyChatRequestsRaw = await prisma.$queryRaw<
    { date: string; count: bigint; userCount: bigint }[]
  >`
    SELECT DATE("createdAt") as date, COUNT(*) as count, COUNT(DISTINCT "userId") as "userCount"
    FROM "LlmUsage"
    WHERE "createdAt" >= ${thirtyDaysAgo} AND "operation" = 'chat'
    GROUP BY DATE("createdAt")
    ORDER BY date ASC
  `

  const dailyChatRequests = dailyChatRequestsRaw.map((row) => ({
    date: new Date(row.date).toISOString().split('T')[0],
    count: Number(row.count),
    userCount: Number(row.userCount)
  }))

  // 15. Total Unique Users per Day (All Operations)
  const dailyTotalUsersRaw = await prisma.$queryRaw<{ date: string; count: bigint }[]>`
    SELECT DATE("createdAt") as date, COUNT(DISTINCT "userId") as count
    FROM "LlmUsage"
    WHERE "createdAt" >= ${thirtyDaysAgo} AND "userId" IS NOT NULL
    GROUP BY DATE("createdAt")
    ORDER BY date ASC
  `

  const dailyTotalUsers = dailyTotalUsersRaw.map((row) => ({
    date: new Date(row.date).toISOString().split('T')[0],
    count: Number(row.count)
  }))

  // 15b. Total Requests per Day (All Operations)
  const dailyTotalRequestsRaw = await prisma.$queryRaw<{ date: string; count: bigint }[]>`
    SELECT DATE("createdAt") as date, COUNT(*) as count
    FROM "LlmUsage"
    WHERE "createdAt" >= ${thirtyDaysAgo}
    GROUP BY DATE("createdAt")
    ORDER BY date ASC
  `

  const dailyTotalRequests = dailyTotalRequestsRaw.map((row) => ({
    date: new Date(row.date).toISOString().split('T')[0],
    count: Number(row.count)
  }))

  // 14. Daily Cached Tokens per Model
  const dailyCachedTokensByModelRaw = await prisma.$queryRaw<
    { date: string; model: string; count: bigint }[]
  >`
    SELECT DATE("createdAt") as date, model, SUM(COALESCE("cachedTokens", 0)) as count
    FROM "LlmUsage"
    WHERE "createdAt" >= ${thirtyDaysAgo}
    GROUP BY DATE("createdAt"), model
    ORDER BY date ASC
  `

  const dailyCachedTokensByModel = dailyCachedTokensByModelRaw.map((row) => ({
    date: new Date(row.date).toISOString().split('T')[0],
    model: row.model,
    count: Number(row.count)
  }))

  // 14b. Daily Total Tokens per Model
  const dailyTokensByModelRaw = await prisma.$queryRaw<
    { date: string; model: string; count: bigint }[]
  >`
    SELECT DATE("createdAt") as date, model, SUM(COALESCE("totalTokens", 0)) as count
    FROM "LlmUsage"
    WHERE "createdAt" >= ${thirtyDaysAgo}
    GROUP BY DATE("createdAt"), model
    ORDER BY date ASC
  `

  const dailyTokensByModel = dailyTokensByModelRaw.map((row) => ({
    date: new Date(row.date).toISOString().split('T')[0],
    model: row.model,
    count: Number(row.count)
  }))

  // 14c. Daily Tokens per Operation
  const dailyTokensByOperationRaw = await prisma.$queryRaw<
    { date: string; operation: string; count: bigint }[]
  >`
    SELECT DATE("createdAt") as date, operation, SUM(COALESCE("totalTokens", 0)) as count
    FROM "LlmUsage"
    WHERE "createdAt" >= ${thirtyDaysAgo}
    GROUP BY DATE("createdAt"), operation
    ORDER BY date ASC
  `

  const dailyTokensByOperation = dailyTokensByOperationRaw.map((row) => ({
    date: new Date(row.date).toISOString().split('T')[0],
    operation: row.operation,
    count: Number(row.count)
  }))

  // 14d. Daily Requests per Operation
  const dailyCountsByOperationRaw = await prisma.$queryRaw<
    { date: string; operation: string; count: bigint }[]
  >`
    SELECT DATE("createdAt") as date, operation, COUNT(*) as count
    FROM "LlmUsage"
    WHERE "createdAt" >= ${thirtyDaysAgo}
    GROUP BY DATE("createdAt"), operation
    ORDER BY date ASC
  `

  const dailyCountsByOperation = dailyCountsByOperationRaw.map((row) => ({
    date: new Date(row.date).toISOString().split('T')[0],
    operation: row.operation,
    count: Number(row.count)
  }))

  // 14e. Daily Failures per Operation
  const dailyFailuresByOperationRaw = await prisma.$queryRaw<
    { date: string; operation: string; count: bigint }[]
  >`
    SELECT DATE("createdAt") as date, operation, COUNT(*) as count
    FROM "LlmUsage"
    WHERE "createdAt" >= ${thirtyDaysAgo} AND "success" = false
    GROUP BY DATE("createdAt"), operation
    ORDER BY date ASC
  `

  const dailyFailuresByOperation = dailyFailuresByOperationRaw.map((row) => ({
    date: new Date(row.date).toISOString().split('T')[0],
    operation: row.operation,
    count: Number(row.count)
  }))

  // 16. Daily Input Tokens Breakdown (Cached vs Uncached)
  const dailyTokenBreakdownRaw = await prisma.$queryRaw<
    { date: string; prompt: bigint; cached: bigint }[]
  >`
    SELECT 
      DATE("createdAt") as date, 
      SUM(COALESCE("promptTokens", 0)) as prompt,
      SUM(COALESCE("cachedTokens", 0)) as cached
    FROM "LlmUsage"
    WHERE "createdAt" >= ${thirtyDaysAgo}
    GROUP BY DATE("createdAt")
    ORDER BY date ASC
  `

  const dailyTokenBreakdown = dailyTokenBreakdownRaw.map((row) => ({
    date: new Date(row.date).toISOString().split('T')[0],
    prompt: Number(row.prompt),
    cached: Number(row.cached),
    uncached: Math.max(0, Number(row.prompt) - Number(row.cached))
  }))

  // 17. Hourly Stats (Past 48 Hours)
  const fortyEightHoursAgo = new Date()
  fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48)

  const hourlyStatsRaw = await prisma.$queryRaw<
    { hour: string; model: string; prompt: bigint; cached: bigint; cost: number }[]
  >`
    SELECT 
      DATE_TRUNC('hour', "createdAt") as hour,
      model,
      SUM(COALESCE("promptTokens", 0)) as prompt,
      SUM(COALESCE("cachedTokens", 0)) as cached,
      SUM(COALESCE("estimatedCost", 0)) as cost
    FROM "LlmUsage"
    WHERE "createdAt" >= ${fortyEightHoursAgo}
    GROUP BY hour, model
    ORDER BY hour ASC
  `

  const hourlyStats = hourlyStatsRaw.map((row) => ({
    hour: new Date(row.hour).toISOString(),
    model: row.model,
    prompt: Number(row.prompt),
    cached: Number(row.cached),
    uncached: Math.max(0, Number(row.prompt) - Number(row.cached)),
    cost: Number(row.cost)
  }))

  return {
    usageByModel: usageByModel
      .map((m) => ({
        model: m.model,
        count: m._count.id,
        cost: m._sum.estimatedCost,
        tokens: m._sum.totalTokens
      }))
      .sort((a, b) => b.count - a.count),
    usageByOperation: usageByOperation
      .map((o) => ({
        operation: o.operation,
        count: o._count.id,
        cost: o._sum.estimatedCost
      }))
      .sort((a, b) => b.count - a.count),
    usageByTool,
    dailyCostsByModel,
    dailyUsersByModel,
    dailyToolUsage,
    dailyChatRequests,
    dailyTotalRequests,
    dailyCachedTokensByModel,
    dailyTokensByModel,
    dailyTokensByOperation,
    dailyCountsByOperation,
    dailyFailuresByOperation,
    dailyTotalUsers,
    dailyTokenBreakdown,
    hourlyStats,
    topSpenders: topSpendersDetails,
    topSpendersToday,
    topSpendersYesterday,
    recentFailures,
    tokens: {
      prompt: tokenStats._sum.promptTokens || 0,
      completion: tokenStats._sum.completionTokens || 0,
      cached: tokenStats._sum.cachedTokens || 0,
      total: tokenStats._sum.totalTokens || 0
    },
    feedback: {
      summary: feedbackStats.map((f) => ({ type: f.feedback, count: f._count.id })),
      history: feedbackByDay
    },
    recentUsage
  }
})
