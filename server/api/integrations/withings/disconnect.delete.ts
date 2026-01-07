import { getServerSession } from '../../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Integrations'],
    summary: 'Disconnect Withings',
    description: 'Disconnects the Withings integration for the authenticated user.',
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

    // Delete the integration
    await prisma.integration.delete({
      where: {
        userId_provider: {
          userId: user.id,
          provider: 'withings'
        }
      }
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to disconnect Withings:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to disconnect Withings'
    })
  }
})
