import { getServerSession } from '../../../utils/session'
import { prisma } from '../../../utils/db'
import { logAction } from '../../../utils/audit'

defineRouteMeta({
  openAPI: {
    tags: ['Settings'],
    summary: 'Revoke an API key',
    description: 'Permanently deletes an API key.',
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
                success: { type: 'boolean' }
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' },
      404: { description: 'Key not found' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user?.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'ID required'
    })
  }

  const apiKey = await prisma.apiKey.findFirst({
    where: {
      id,
      userId: (session.user as any).id
    }
  })

  if (!apiKey) {
    throw createError({
      statusCode: 404,
      message: 'API key not found'
    })
  }

  await prisma.apiKey.delete({
    where: {
      id
    }
  })

  await logAction({
    userId: (session.user as any).id,
    action: 'API_KEY_REVOKED',
    resourceType: 'ApiKey',
    resourceId: id,
    metadata: { name: apiKey.name },
    event
  })

  return {
    success: true
  }
})
