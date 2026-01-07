import { getServerSession } from '../../utils/session'
import { tasks } from '@trigger.dev/sdk/v3'

defineRouteMeta({
  openAPI: {
    tags: ['Goals'],
    summary: 'Suggest goals',
    description: 'Triggers AI generation of personalized goal suggestions.',
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

  try {
    // Trigger the goal suggestions background job with per-user concurrency
    const handle = await tasks.trigger(
      'suggest-goals',
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
      message: 'Generating goal suggestions based on your athlete profile'
    }
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: `Failed to start goal suggestion generation: ${error instanceof Error ? error.message : 'Unknown error'}`
    })
  }
})
