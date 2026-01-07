import { defineEventHandler, createError } from 'h3'
import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'
import { Prisma } from '@prisma/client'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  // Strict admin check
  if (!session?.user?.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden'
    })
  }

  // Basic totals
  const [totalUsers, totalWorkouts] = await Promise.all([
    prisma.user.count(),
    prisma.workout.count()
  ])

  // AI Costs & Usage (last 30 days)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // Efficient Aggregation for AI Usage
  const llmStats = await prisma.llmUsage.aggregate({
    where: {
      createdAt: { gte: thirtyDaysAgo }
    },
    _sum: {
      estimatedCost: true
    },
    _count: {
      _all: true,
      success: true // note: this just counts non-nulls, we need a better way for success rate if 'success' is boolean
    }
  })

  // Prisma aggregate doesn't support "count where success=true" easily in one go with boolean
  // So we do a separate count or accept the small overhead of 2 queries
  const successfulAiCalls = await prisma.llmUsage.count({
    where: {
      createdAt: { gte: thirtyDaysAgo },
      success: true
    }
  })

  const totalAiCost = llmStats._sum.estimatedCost || 0
  const totalAiCalls = llmStats._count._all
  const aiSuccessRate = totalAiCalls > 0 ? (successfulAiCalls / totalAiCalls) * 100 : 100
  const avgAiCostPerCall = totalAiCalls > 0 ? totalAiCost / totalAiCalls : 0

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
    totalAiCost,
    totalAiCalls,
    aiSuccessRate,
    avgAiCostPerCall,
    workoutsByDay,
    avgWorkoutsPerDay,
    aiCostHistory,
    usersByDay,
    activeUsersByDay,
    totalUsersLast30Days,
    activeUsersLast30DaysCount
  }
})
