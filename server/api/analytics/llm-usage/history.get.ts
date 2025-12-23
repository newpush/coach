import { defineEventHandler, getQuery, createError } from 'h3'
import { getServerSession } from '../../../utils/session'
import { prisma } from '../../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['Analytics'],
    summary: 'Get LLM usage history',
    description: 'Returns a paginated history of AI model calls.',
    parameters: [
      {
        name: 'page',
        in: 'query',
        schema: { type: 'integer', default: 1 }
      },
      {
        name: 'pageSize',
        in: 'query',
        schema: { type: 'integer', default: 20 }
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
                items: { type: 'array' },
                pagination: {
                  type: 'object',
                  properties: {
                    page: { type: 'integer' },
                    pageSize: { type: 'integer' },
                    total: { type: 'integer' },
                    totalPages: { type: 'integer' }
                  }
                }
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
  const page = parseInt(query.page as string) || 1
  const pageSize = parseInt(query.pageSize as string) || 20

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  })

  if (!user) {
    throw createError({
      statusCode: 404,
      message: 'User not found'
    })
  }

  // Calculate pagination
  const skip = (page - 1) * pageSize

  // Fetch total count
  const total = await prisma.llmUsage.count({
    where: {
      userId: user.id
    }
  })

  // Fetch paginated data
  const items = await prisma.llmUsage.findMany({
    where: {
      userId: user.id
    },
    orderBy: {
      createdAt: 'desc'
    },
    skip,
    take: pageSize,
    select: {
      id: true,
      operation: true,
      model: true,
      entityType: true,
      entityId: true,
      totalTokens: true,
      estimatedCost: true,
      durationMs: true,
      retryCount: true,
      success: true,
      errorType: true,
      createdAt: true
    }
  })

  const totalPages = Math.ceil(total / pageSize)

  return {
    items: items.map(item => ({
      id: item.id,
      operation: item.operation,
      model: item.model,
      entityType: item.entityType,
      entityId: item.entityId,
      tokens: item.totalTokens,
      cost: item.estimatedCost,
      duration: item.durationMs,
      retries: item.retryCount,
      success: item.success,
      errorType: item.errorType,
      createdAt: item.createdAt
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
      from: skip + 1,
      to: Math.min(skip + pageSize, total)
    }
  }
})