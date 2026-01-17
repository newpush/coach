import { defineEventHandler, createError } from 'h3'
import { getServerSession } from '../../../utils/session'
import { prisma } from '../../../utils/db'

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
  const dailyToolUsageRaw = await prisma.$queryRaw<
    { date: string; name: string; count: bigint }[]
  >`
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
    topSpenders: topSpendersDetails,
    recentFailures,
    tokens: {
      prompt: tokenStats._sum.promptTokens || 0,
      completion: tokenStats._sum.completionTokens || 0,
      total: tokenStats._sum.totalTokens || 0
    },
    feedback: {
      summary: feedbackStats.map((f) => ({ type: f.feedback, count: f._count.id })),
      history: feedbackByDay
    },
    recentUsage
  }
})
