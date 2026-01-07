import { defineEventHandler, getQuery, createError } from 'h3'
import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['Analytics'],
    summary: 'Get LLM usage stats',
    description: 'Returns usage statistics for AI model calls.',
    parameters: [
      {
        name: 'days',
        in: 'query',
        schema: { type: 'integer', default: 30 }
      },
      {
        name: 'groupBy',
        in: 'query',
        schema: { type: 'string', enum: ['operation', 'date', 'model'], default: 'operation' }
      }
    ],
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                summary: {
                  type: 'object',
                  properties: {
                    totalCalls: { type: 'integer' },
                    successfulCalls: { type: 'integer' },
                    failedCalls: { type: 'integer' },
                    totalCost: { type: 'number' },
                    totalTokens: { type: 'integer' }
                  }
                },
                groupedData: { type: 'array' },
                recentUsage: { type: 'array' },
                dateRange: { type: 'object' }
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const query = getQuery(event)
  const days = parseInt(query.days as string) || 30
  const groupBy = query.groupBy as string || 'operation' // operation, date, model

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  })

  if (!user) {
    throw createError({
      statusCode: 404,
      message: 'User not found'
    })
  }

  // Calculate date range
  const endDate = new Date()
  const startDate = new Date(endDate)
  startDate.setDate(startDate.getDate() - days)

  // Fetch usage data
  const usageData = await prisma.llmUsage.findMany({
    where: {
      userId: user.id,
      createdAt: {
        gte: startDate,
        lte: endDate
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  })

  // Calculate totals
  const totalCalls = usageData.length
  const successfulCalls = usageData.filter((u: any) => u.success).length
  const failedCalls = totalCalls - successfulCalls
  const totalCost = usageData.reduce((sum: number, u: any) => sum + (u.estimatedCost || 0), 0)
  const totalTokens = usageData.reduce((sum: number, u: any) => sum + (u.totalTokens || 0), 0)
  const totalPromptTokens = usageData.reduce((sum: number, u: any) => sum + (u.promptTokens || 0), 0)
  const totalCompletionTokens = usageData.reduce((sum: number, u: any) => sum + (u.completionTokens || 0), 0)
  const avgDuration = usageData.length > 0
    ? usageData.reduce((sum: number, u: any) => sum + (u.durationMs || 0), 0) / usageData.length
    : 0
  const totalRetries = usageData.reduce((sum: number, u: any) => sum + u.retryCount, 0)

  // Group data based on groupBy parameter
  const groupedData: Record<string, any> = {}

  if (groupBy === 'operation') {
    usageData.forEach((usage: any) => {
      const key = usage.operation
      if (!groupedData[key]) {
        groupedData[key] = {
          operation: key,
          calls: 0,
          cost: 0,
          tokens: 0,
          avgDuration: 0,
          durations: []
        }
      }
      groupedData[key].calls++
      groupedData[key].cost += usage.estimatedCost || 0
      groupedData[key].tokens += usage.totalTokens || 0
      groupedData[key].durations.push(usage.durationMs || 0)
    })
    
    // Calculate averages
    Object.values(groupedData).forEach((group: any) => {
      group.avgDuration = group.durations.reduce((a: number, b: number) => a + b, 0) / group.durations.length
      delete group.durations
    })
  } else if (groupBy === 'date') {
    usageData.forEach((usage: any) => {
      const key = usage.createdAt.toISOString().split('T')[0]
      if (!groupedData[key]) {
        groupedData[key] = {
          date: key,
          calls: 0,
          cost: 0,
          tokens: 0
        }
      }
      groupedData[key].calls++
      groupedData[key].cost += usage.estimatedCost || 0
      groupedData[key].tokens += usage.totalTokens || 0
    })
  } else if (groupBy === 'model') {
    usageData.forEach((usage: any) => {
      const key = usage.model
      if (!groupedData[key]) {
        groupedData[key] = {
          model: key,
          calls: 0,
          cost: 0,
          tokens: 0
        }
      }
      groupedData[key].calls++
      groupedData[key].cost += usage.estimatedCost || 0
      groupedData[key].tokens += usage.totalTokens || 0
    })
  }

  return {
    summary: {
      totalCalls,
      successfulCalls,
      failedCalls,
      successRate: totalCalls > 0 ? (successfulCalls / totalCalls) * 100 : 0,
      totalCost: Math.round(totalCost * 10000) / 10000, // Round to 4 decimal places
      totalTokens,
      totalPromptTokens,
      totalCompletionTokens,
      avgDuration: Math.round(avgDuration),
      totalRetries,
      avgRetriesPerCall: totalCalls > 0 ? totalRetries / totalCalls : 0
    },
    groupedData: Object.values(groupedData),
    recentUsage: usageData.slice(0, 50).map((u: any) => ({
      id: u.id,
      operation: u.operation,
      model: u.model,
      entityType: u.entityType,
      entityId: u.entityId,
      tokens: u.totalTokens,
      cost: u.estimatedCost,
      duration: u.durationMs,
      retries: u.retryCount,
      success: u.success,
      errorType: u.errorType,
      createdAt: u.createdAt
    })),
    dateRange: {
      start: startDate,
      end: endDate,
      days
    }
  }
})