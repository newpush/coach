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

  // 1. Find a training workout for this day
  const plannedWorkouts = await plannedWorkoutRepository.list(userId, {
    startDate: normalizedDate,
    endDate: normalizedDate,
    limit: 10
  })

  const trainingWorkout = plannedWorkouts.find((w) => w.type !== 'Rest')

  // 2. Trigger the task (even if no workout, to get baseline)
  const { tasks } = await import('@trigger.dev/sdk/v3')
  const handle = await tasks.trigger(
    'generate-fueling-plan',
    {
      plannedWorkoutId: trainingWorkout?.id,
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
    message: trainingWorkout
      ? 'Fueling plan generation started.'
      : 'Rest day baseline calculation started.',
    runId: handle.id
  }
})
