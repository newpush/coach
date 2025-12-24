import { getServerSession } from '../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Integrations'],
    summary: 'Get integration status',
    description: 'Returns the status of all connected integrations for the user.',
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                integrations: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      provider: { type: 'string' },
                      lastSyncAt: { type: 'string', format: 'date-time', nullable: true },
                      syncStatus: { type: 'string', nullable: true },
                      externalUserId: { type: 'string', nullable: true },
                      ingestWorkouts: { type: 'boolean' }
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
  
  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      integrations: {
        select: {
          id: true,
          provider: true,
          lastSyncAt: true,
          syncStatus: true,
          externalUserId: true,
          ingestWorkouts: true
        }
      }
    }
  })

  if (!user) {
    throw createError({
      statusCode: 404,
      message: 'User not found'
    })
  }

  return {
    integrations: user.integrations
  }
})