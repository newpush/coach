import { getServerSession } from '../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Goals'],
    summary: 'Delete goal',
    description: 'Deletes a specific goal by ID.',
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
      404: { description: 'Goal not found' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }

  const id = event.context.params?.id

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Goal ID required'
    })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found'
      })
    }

    // Check if goal belongs to user
    const goal = await prisma.goal.findUnique({
      where: { id }
    })

    if (!goal || goal.userId !== user.id) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Goal not found'
      })
    }

    await prisma.goal.delete({
      where: { id }
    })

    return {
      success: true
    }
  } catch (error) {
    console.error('Error deleting goal:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete goal'
    })
  }
})
