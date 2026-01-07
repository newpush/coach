import { getServerSession } from '../../utils/session'
import { tasks } from '@trigger.dev/sdk/v3'

defineRouteMeta({
  openAPI: {
    tags: ['Plans'],
    summary: 'Generate training plan',
    description: 'Triggers a background job to generate a new training plan.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              startDate: { type: 'string', format: 'date-time' },
              days: { type: 'integer', default: 7 }
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
  const body = await readBody(event)

  // Default to 7 days if not specified
  const daysToPlann = body.days || 7
  const startDate = body.startDate ? new Date(body.startDate) : new Date()

  // Trigger the plan generation job with per-user concurrency
  const handle = await tasks.trigger(
    'generate-weekly-plan',
    {
      userId,
      startDate,
      daysToPlann
    },
    {
      concurrencyKey: userId
    }
  )

  return {
    success: true,
    jobId: handle.id,
    message: `Generating ${daysToPlann}-day training plan`
  }
})
