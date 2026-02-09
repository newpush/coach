import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'
import { plannedWorkoutRepository } from '../../utils/repositories/plannedWorkoutRepository'
import { getUserLocalDate, getStartOfDayUTC, getEndOfDayUTC } from '../../utils/date'

defineRouteMeta({
  openAPI: {
    tags: ['Nutrition'],
    summary: 'Generate fueling plan',
    description:
      'Finds the primary planned workout for a date and triggers fueling plan generation.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              date: {
                type: 'string',
                format: 'date-time',
                description: 'The date to generate plan for (defaults to today)'
              }
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
                message: { type: 'string' },
                runId: { type: 'string', nullable: true }
              }
            }
          }
        }
      },
      400: { description: 'No planned workout found' },
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
  const body = (await readBody(event)) || {}

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true }
  })
  const timezone = user?.timezone ?? 'UTC'

  // Use UTC Midnight for the targeted calendar day
  const targetDate = body.date ? new Date(body.date) : getUserLocalDate(timezone)
  const normalizedDate = new Date(
    Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate())
  )

  // 1. Find a planned workout for this day
  const plannedWorkouts = await plannedWorkoutRepository.list(userId, {
    startDate: normalizedDate,
    endDate: normalizedDate,
    limit: 1
  })

  if (plannedWorkouts.length === 0) {
    return {
      success: false,
      message: `No planned workout found for ${normalizedDate.toISOString().split('T')[0]}. Please add a workout to generate a fueling plan.`
    }
  }

  const workout = plannedWorkouts[0]
  if (!workout) {
    return {
      success: false,
      message: 'Unexpected error: Workout disappeared.'
    }
  }

  // 2. Trigger the task
  const { tasks } = await import('@trigger.dev/sdk/v3')
  const handle = await tasks.trigger(
    'generate-fueling-plan',
    {
      plannedWorkoutId: workout.id,
      userId,
      date: normalizedDate.toISOString()
    },
    {
      concurrencyKey: userId,
      tags: [`user:${userId}`]
    }
  )

  return {
    success: true,
    message: 'Fueling plan generation started.',
    runId: handle.id
  }
})
