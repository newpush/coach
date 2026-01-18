import { defineEventHandler, createError, getQuery } from 'h3'
import { getServerSession } from '../../../utils/session'
import { prisma } from '../../../utils/db'
import type { Prisma } from '@prisma/client'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const query = getQuery(event)
  const page = parseInt(query.page as string) || 1
  const limit = parseInt(query.limit as string) || 20
  const search = query.search as string
  const feedback = query.feedback as string // 'THUMBS_UP', 'THUMBS_DOWN', 'ANY', 'COMMENT'
  const operation = query.operation as string
  const model = query.model as string
  const status = query.status as string // 'success', 'failure'
  const userId = query.userId as string

  const where: Prisma.LlmUsageWhereInput = {}

  if (userId) {
    where.userId = userId
  }

  if (operation) {
    where.operation = operation
  }

  if (model) {
    where.model = model
  }

  if (status) {
    where.success = status === 'success'
  } else if (status === 'failure') {
    where.success = false
  }

  if (feedback) {
    if (feedback === 'ANY') {
      where.feedback = { not: null }
    } else if (feedback === 'COMMENT') {
      where.feedbackText = { not: null }
    } else {
      where.feedback = feedback
    }
  }

  if (search) {
    where.OR = [
      { user: { email: { contains: search, mode: 'insensitive' } } },
      { user: { name: { contains: search, mode: 'insensitive' } } },
      { promptFull: { contains: search, mode: 'insensitive' } },
      { responseFull: { contains: search, mode: 'insensitive' } },
      { errorMessage: { contains: search, mode: 'insensitive' } },
      { feedbackText: { contains: search, mode: 'insensitive' } }
    ]
  }

  const [total, logs] = await Promise.all([
    prisma.llmUsage.count({ where }),
    prisma.llmUsage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        createdAt: true,
        model: true,
        operation: true,
        totalTokens: true,
        estimatedCost: true,
        success: true,
        durationMs: true,
        feedback: true,
        feedbackText: true,
        errorType: true,
        errorMessage: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            image: true
          }
        }
      }
    })
  ])

  // Fetch unique options for filters
  const [operations, models] = await Promise.all([
    prisma.llmUsage.groupBy({
      by: ['operation'],
      orderBy: { operation: 'asc' }
    }),
    prisma.llmUsage.groupBy({
      by: ['model'],
      orderBy: { model: 'asc' }
    })
  ])

  return {
    logs,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    },
    filters: {
      operations: operations.map((o) => o.operation),
      models: models.map((m) => m.model)
    }
  }
})
