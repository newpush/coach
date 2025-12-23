import { defineEventHandler, getRouterParam, createError } from 'h3'
import { getServerSession } from '../../../utils/session'
import { prisma } from '../../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['Analytics'],
    summary: 'Get LLM usage detail',
    description: 'Returns detailed information for a specific LLM call.',
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' }
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
                id: { type: 'string' },
                operation: { type: 'string' },
                model: { type: 'string' },
                promptFull: { type: 'string', nullable: true },
                responseFull: { type: 'string', nullable: true }
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' },
      404: { description: 'Usage record not found' }
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

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'ID is required'
    })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  })

  if (!user) {
    throw createError({
      statusCode: 404,
      message: 'User not found'
    })
  }

  // Fetch the LLM usage record
  const usage = await prisma.llmUsage.findFirst({
    where: {
      id,
      userId: user.id
    }
  })

  if (!usage) {
    throw createError({
      statusCode: 404,
      message: 'Usage record not found'
    })
  }

  return {
    id: usage.id,
    operation: usage.operation,
    model: usage.model,
    provider: usage.provider,
    modelType: usage.modelType,
    entityType: usage.entityType,
    entityId: usage.entityId,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    estimatedCost: usage.estimatedCost,
    durationMs: usage.durationMs,
    retryCount: usage.retryCount,
    success: usage.success,
    errorType: usage.errorType,
    errorMessage: usage.errorMessage,
    promptPreview: usage.promptPreview,
    responsePreview: usage.responsePreview,
    promptFull: usage.promptFull,
    responseFull: usage.responseFull,
    createdAt: usage.createdAt
  }
})