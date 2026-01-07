import { getServerSession } from '../../utils/session'
import { tasks } from '@trigger.dev/sdk/v3'
import { prisma } from '../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['Goals'],
    summary: 'Review goals',
    description: 'Triggers an AI review of all active goals.',
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                jobId: { type: 'string' },
                message: { type: 'string' }
              }
            }
          }
        }
      },
      400: { description: 'No active goals' },
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

  // Check if user has active goals
  const activeGoalsCount = await prisma.goal.count({
    where: {
      userId,
      status: 'ACTIVE'
    }
  })

  if (activeGoalsCount === 0) {
    throw createError({
      statusCode: 400,
      message: 'No active goals to review. Create some goals first.'
    })
  }

  try {
    // Trigger the goal review background job with per-user concurrency
    const handle = await tasks.trigger(
      'review-goals',
      {
        userId
      },
      {
        concurrencyKey: userId
      }
    )

    return {
      success: true,
      jobId: handle.id,
      message: `Reviewing your ${activeGoalsCount} active goal${activeGoalsCount > 1 ? 's' : ''}`
    }
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: `Failed to start goal review: ${error instanceof Error ? error.message : 'Unknown error'}`
    })
  }
})
