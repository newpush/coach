import { getServerSession } from '../../utils/session'
import { tasks } from '@trigger.dev/sdk/v3'

defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Generate ad-hoc workout',
    description: 'Triggers AI generation of a planned workout for today.',
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
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const body = await readBody(event)
  const { type, durationMinutes, intensity, notes } = body

  const userId = (session.user as any).id
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const handle = await tasks.trigger('generate-ad-hoc-workout', {
    userId,
    date: today,
    preferences: {
      type,
      durationMinutes,
      intensity,
      notes
    }
  })

  return {
    success: true,
    jobId: handle.id,
    message: 'Generating workout...'
  }
})
