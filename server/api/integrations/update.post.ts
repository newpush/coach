import { getServerSession } from '../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Integrations'],
    summary: 'Update integration settings',
    description: 'Updates settings for a specific integration (e.g., toggling workout ingestion).',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['provider'],
            properties: {
              provider: { type: 'string' },
              ingestWorkouts: { type: 'boolean' }
            }
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                integration: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    provider: { type: 'string' },
                    ingestWorkouts: { type: 'boolean' }
                  }
                }
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' },
      404: { description: 'Integration not found' }
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

  const body = await readBody(event)
  const { provider } = body

  if (!provider) {
    throw createError({
      statusCode: 400,
      message: 'Provider is required'
    })
  }

  const integration = await prisma.integration.update({
    where: {
      userId_provider: {
        userId: session.user.id,
        provider
      }
    },
    data: {
      ingestWorkouts: body.ingestWorkouts
    },
    select: {
      id: true,
      provider: true,
      ingestWorkouts: true
    }
  })

  return {
    success: true,
    integration
  }
})
