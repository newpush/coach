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

  // Basic totals
  const totalUsers = await prisma.user.count()
  const totalWorkouts = await prisma.workout.count()
  
  // AI Costs & Usage (last 30 days)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  
  const llmUsage = await prisma.llmUsage.findMany({
    where: {
      createdAt: { gte: thirtyDaysAgo }
    }
  })
  
  const totalAiCost = llmUsage.reduce((acc, curr) => acc + (curr.estimatedCost || 0), 0)
  const totalAiCalls = llmUsage.length
  const successfulAiCalls = llmUsage.filter(u => u.success).length
  const aiSuccessRate = totalAiCalls > 0 ? (successfulAiCalls / totalAiCalls) * 100 : 0
  const avgAiCostPerCall = totalAiCalls > 0 ? totalAiCost / totalAiCalls : 0

  // Workouts by day (last 30 days)
  const workoutsLast30Days = await prisma.workout.findMany({
    where: {
      date: { gte: thirtyDaysAgo }
    },
    select: {
      date: true
    }
  })
  
  const workoutsByDayMap = workoutsLast30Days.reduce((acc: Record<string, number>, curr) => {
    const day = curr.date.toISOString().split('T')[0]
    acc[day] = (acc[day] || 0) + 1
    return acc
  }, {})
  
  const workoutsByDay = Object.entries(workoutsByDayMap).map(([date, count]) => ({
    date,
    count
  })).sort((a, b) => a.date.localeCompare(b.date))
  
  const avgWorkoutsPerDay = workoutsLast30Days.length / 30

  // AI Cost by day
  const aiCostByDayMap = llmUsage.reduce((acc: Record<string, number>, curr) => {
    const day = curr.createdAt.toISOString().split('T')[0]
    acc[day] = (acc[day] || 0) + (curr.estimatedCost || 0)
    return acc
  }, {})
  
  const aiCostHistory = Object.entries(aiCostByDayMap).map(([date, cost]) => ({
    date,
    cost
  })).sort((a, b) => a.date.localeCompare(b.date))

  return {
    totalUsers,
    totalWorkouts,
    totalAiCost,
    totalAiCalls,
    aiSuccessRate,
    avgAiCostPerCall,
    workoutsByDay,
    avgWorkoutsPerDay,
    aiCostHistory
  }
})
