import { auditLogRepository } from '../../utils/repositories/auditLogRepository'
import { getServerSession } from '../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Admin'],
    summary: 'Get Audit Logs',
    description: 'Retrieve system audit logs with pagination and filtering',
    parameters: [
      { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
      { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
      { name: 'userId', in: 'query', schema: { type: 'string' } },
      { name: 'action', in: 'query', schema: { type: 'string' } },
      { name: 'resourceType', in: 'query', schema: { type: 'string' } }
    ],
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                logs: { type: 'array' },
                total: { type: 'integer' },
                pages: { type: 'integer' }
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' },
      403: { description: 'Forbidden' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user?.isAdmin) {
    throw createError({
      statusCode: 403,
      message: 'Forbidden: Admin access required'
    })
  }

  const query = getQuery(event)
  const page = Number(query.page) || 1
  const limit = Number(query.limit) || 50
  const userId = query.userId as string | undefined
  const action = query.action as string | undefined
  const resourceType = query.resourceType as string | undefined

  return auditLogRepository.getAll({
    page,
    limit,
    userId,
    action,
    resourceType
  })
})
