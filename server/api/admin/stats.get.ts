import { defineEventHandler, createError } from 'h3'
import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'
import { Prisma } from '@prisma/client'
import { webhookQueue, pingQueue } from '../../utils/queue'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  // Strict admin check
  if (!session?.user?.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden'
    })
  }

  // Basic totals & System Status
  const [totalUsers, totalWorkouts, dbCheck] = await Promise.all([
    prisma.user.count(),
    prisma.workout.count(),
    prisma.$queryRaw`SELECT 1`.catch(() => null)
  ])

  // Queue Health
  const [webhookPaused, pingPaused] = await Promise.all([
    webhookQueue.isPaused().catch(() => true),
    pingQueue.isPaused().catch(() => true)
  ])

  const systemStatus = {
    database: dbCheck ? 'Online' : 'Offline',
    trigger: process.env.TRIGGER_SECRET_KEY ? 'Connected' : 'Not Configured',
    queues: !webhookPaused && !pingPaused ? 'Running' : 'Paused'
  }

  // AI Costs & Usage (last 30 days)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  // Efficient Aggregation for AI Usage
  const [llmStats, successfulAiCalls, yesterdayStats, todayStats, mtdStats] = await Promise.all([
    prisma.llmUsage.aggregate({
      where: { createdAt: { gte: thirtyDaysAgo } },
      _sum: { estimatedCost: true },
      _count: { _all: true }
    }),
    prisma.llmUsage.count({
      where: { createdAt: { gte: thirtyDaysAgo }, success: true }
    }),
    prisma.llmUsage.aggregate({
      where: { createdAt: { gte: yesterdayStart, lt: todayStart } },
      _sum: { estimatedCost: true }
    }),
    prisma.llmUsage.aggregate({
      where: { createdAt: { gte: todayStart } },
      _sum: { estimatedCost: true }
    }),
    prisma.llmUsage.aggregate({
      where: { createdAt: { gte: monthStart } },
      _sum: { estimatedCost: true }
    })
  ])

  const totalAiCost30d = llmStats._sum.estimatedCost || 0
  const totalAiCalls = llmStats._count._all
  const aiSuccessRate = totalAiCalls > 0 ? (successfulAiCalls / totalAiCalls) * 100 : 100
  const avgAiCostPerCall = totalAiCalls > 0 ? totalAiCost30d / totalAiCalls : 0

  const aiCostYesterday = yesterdayStats._sum.estimatedCost || 0
  const aiCostToday = todayStats._sum.estimatedCost || 0
  const aiCostMTD = mtdStats._sum.estimatedCost || 0

  // Simple forecast for today
  const hoursPassed = now.getHours() + now.getMinutes() / 60 || 0.1
  const aiCostForecastToday = aiCostToday * (24 / hoursPassed)

  // --- Subscription Stats ---
  const [activeSubscribers, activeTierCounts, recentPremiumUsers] = await Promise.all([
    prisma.user.count({
      where: {
        subscriptionStatus: 'ACTIVE',
        subscriptionTier: { in: ['SUPPORTER', 'PRO'] }
      }
    }),
    prisma.user.groupBy({
      by: ['subscriptionTier'],
      _count: { id: true },
      where: {
        subscriptionStatus: 'ACTIVE',
        subscriptionTier: { in: ['SUPPORTER', 'PRO'] }
      }
    }),
    prisma.user.findMany({
      where: { subscriptionTier: { in: ['SUPPORTER', 'PRO'] } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        name: true,
        email: true,
        subscriptionTier: true,
        subscriptionStatus: true
      }
    })
  ])

  let estimatedMRR = 0
  activeTierCounts.forEach((group) => {
    if (group.subscriptionTier === 'SUPPORTER') {
      estimatedMRR += group._count.id * 8.99
    } else if (group.subscriptionTier === 'PRO') {
      estimatedMRR += group._count.id * 14.99
    }
  })

  // --- Daily Histograms via Raw SQL for Performance ---

  // Users by day
  const usersByDayRaw = await prisma.$queryRaw<{ date: string; count: bigint }[]>`
    SELECT DATE("createdAt") as date, COUNT(*) as count
    FROM "User"
    WHERE "createdAt" >= ${thirtyDaysAgo}
    GROUP BY DATE("createdAt")
    ORDER BY date ASC
  `

  // Workouts by day
  const workoutsByDayRaw = await prisma.$queryRaw<{ date: string; count: bigint }[]>`
    SELECT DATE("date") as date, COUNT(*) as count
    FROM "Workout"
    WHERE "date" >= ${thirtyDaysAgo}
    GROUP BY DATE("date")
    ORDER BY date ASC
  `

  // AI Cost by day
  const aiCostByDayRaw = await prisma.$queryRaw<{ date: string; cost: number }[]>`
    SELECT DATE("createdAt") as date, SUM("estimatedCost") as cost
    FROM "LlmUsage"
    WHERE "createdAt" >= ${thirtyDaysAgo}
    GROUP BY DATE("createdAt")
    ORDER BY date ASC
  `

  // Active users (unique users who logged a workout in last 30 days)
  // Using aggregate with distinct to get the count
  const activeUsersLast30DaysResult = await prisma.workout.groupBy({
    by: ['userId'],
    where: {
      date: { gte: thirtyDaysAgo }
    }
  })
  const activeUsersLast30DaysCount = activeUsersLast30DaysResult.length

  // Also get Active Users by Day (unique users per day)
  const activeUsersByDayRaw = await prisma.$queryRaw<{ date: string; count: bigint }[]>`
    SELECT DATE("date") as date, COUNT(DISTINCT "userId") as count
    FROM "Workout"
    WHERE "date" >= ${thirtyDaysAgo}
    GROUP BY DATE("date")
    ORDER BY date ASC
  `

  // --- Formatting Helpers ---

  interface StatResult {
    date: string
    count?: number
    cost?: number
  }

  const fillMissingDays = (
    data: Record<string, number>,
    type: 'count' | 'cost' = 'count',
    days = 30
  ): StatResult[] => {
    const result: StatResult[] = []
    const today = new Date()
    // Normalize today to start of day for consistent comparison if needed,
    // but here we just need 30 distinct dates ending today

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      if (dateStr) {
        result.push({
          date: dateStr,
          [type]: data[dateStr] || 0
        })
      }
    }
    return result
  }

  const mapToRecord = (rows: any[], valKey: string) => {
    return rows.reduce(
      (acc, row) => {
        // row.date might be a Date object or string depending on driver
        const d = new Date(row.date).toISOString().split('T')[0]
        if (d) {
          acc[d] = Number(row[valKey] || 0) // Convert BigInt/Decimal to Number
        }
        return acc
      },
      {} as Record<string, number>
    )
  }

  const usersByDay = fillMissingDays(mapToRecord(usersByDayRaw, 'count'), 'count')
  const workoutsByDay = fillMissingDays(mapToRecord(workoutsByDayRaw, 'count'), 'count')
  const aiCostHistory = fillMissingDays(mapToRecord(aiCostByDayRaw, 'cost'), 'cost')
  const activeUsersByDay = fillMissingDays(mapToRecord(activeUsersByDayRaw, 'count'), 'count')

  // Calculate totals from the raw counts for consistency
  const totalUsersLast30Days = usersByDay.reduce((sum, d) => sum + (d.count || 0), 0)
  const totalWorkoutsLast30Days = workoutsByDay.reduce((sum, d) => sum + (d.count || 0), 0)
  const avgWorkoutsPerDay = totalWorkoutsLast30Days / 30

  return {
    totalUsers,
    totalWorkouts,
    totalAiCost30d,
    aiCostYesterday,
    aiCostToday,
    aiCostForecastToday,
    aiCostMTD,
    estimatedMRR,
    activeSubscribers,
    recentPremiumUsers,
    totalAiCalls,
    aiSuccessRate,
    avgAiCostPerCall,
    workoutsByDay,
    avgWorkoutsPerDay,
    aiCostHistory,
    usersByDay,
    activeUsersByDay,
    totalUsersLast30Days,
    activeUsersLast30DaysCount,
    systemStatus
  }
})
