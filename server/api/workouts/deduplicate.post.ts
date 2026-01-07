import { defineEventHandler } from 'h3'
import { getServerSession } from '../../utils/session'
import { tasks } from '@trigger.dev/sdk/v3'

defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Deduplicate workouts',
    description: 'Triggers a background job to identify and merge duplicate workouts.',
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                taskId: { type: 'string' }
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

  if (!session || !session.user?.email) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  try {
    const userId = (session.user as any).id || session.user.email
    const handle = await tasks.trigger(
      'deduplicate-workouts',
      { userId },
      { concurrencyKey: userId }
    )

    return {
      success: true,
      taskId: handle.id
    }
  } catch (error) {
    console.error('Error triggering workout deduplication:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to trigger workout deduplication'
    })
  }
})
