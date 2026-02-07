import { getServerSession } from '../../utils/session'
import { getQuotaSummary } from '../../utils/quotas/engine'
import { QUOTA_REGISTRY, QuotaOperation } from '../../utils/quotas/registry'

defineRouteMeta({
  openAPI: {
    tags: ['Profile'],
    summary: 'Get user LLM quotas',
    description:
      'Returns the current usage and limits for LLM operations based on the user subscription tier.',
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                tier: { type: 'string' },
                quotas: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      operation: { type: 'string' },
                      allowed: { type: 'boolean' },
                      used: { type: 'integer' },
                      limit: { type: 'integer' },
                      remaining: { type: 'integer' },
                      window: { type: 'string' },
                      resetsAt: { type: 'string', format: 'date-time' },
                      enforcement: { type: 'string' }
                    }
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

  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const userId = (session.user as any).id
  const tier = (session.user as any).subscriptionTier || 'FREE'

  const quotas = await getQuotaSummary(userId)

  return {
    tier,
    quotas
  }
})
