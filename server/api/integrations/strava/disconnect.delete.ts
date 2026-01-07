import { getServerSession } from '../../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Integrations'],
    summary: 'Disconnect Strava',
    description: 'Disconnects the Strava integration for the authenticated user.',
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                message: { type: 'string' }
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

  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      throw createError({
        statusCode: 404,
        message: 'User not found'
      })
    }

    const integration = await prisma.integration.findFirst({
      where: {
        userId: user.id,
        provider: 'strava'
      }
    })

    if (!integration) {
      throw createError({
        statusCode: 404,
        message: 'Strava integration not found'
      })
    }

    await prisma.integration.delete({
      where: { id: integration.id }
    })

    return {
      success: true,
      message: 'Strava disconnected successfully'
    }
  } catch (error: any) {
    console.error('Failed to disconnect Strava:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to disconnect Strava'
    })
  }
})
