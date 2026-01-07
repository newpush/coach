import { getServerSession } from '../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Goals'],
    summary: 'List user goals',
    description: 'Returns all goals for the authenticated user.',
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                goals: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      type: { type: 'string' },
                      title: { type: 'string' },
                      description: { type: 'string', nullable: true },
                      metric: { type: 'string', nullable: true },
                      targetValue: { type: 'number', nullable: true },
                      currentValue: { type: 'number', nullable: true },
                      targetDate: { type: 'string', format: 'date-time', nullable: true },
                      status: { type: 'string' }
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
      statusMessage: 'Unauthorized'
    })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        goals: {
          orderBy: { createdAt: 'desc' },
          include: { events: true }
        }
      }
    })

    if (!user) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found'
      })
    }

    return {
      success: true,
      goals: user.goals
    }
  } catch (error) {
    console.error('Error fetching goals:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch goals'
    })
  }
})
