import { getServerSession } from '../../../utils/session'
import { getUserTimezone, getUserLocalDate } from '../../../utils/date'
import { plannedWorkoutRepository } from '../../../utils/repositories/plannedWorkoutRepository'

defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: "Get today's planned workout",
    description: 'Returns the planned workout for the current date.',
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              nullable: true,
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
                durationSec: { type: 'number' },
                tss: { type: 'number' },
                type: { type: 'string' },
                structuredWorkout: { type: 'object' }
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

  const userId = (session.user as any).id

  // Get user's timezone-aware "today" (UTC midnight of their local date)
  const timezone = await getUserTimezone(userId)
  const today = getUserLocalDate(timezone)

  const workouts = await plannedWorkoutRepository.list(userId, {
    where: { date: today },
    orderBy: [{ startTime: 'asc' }, { tss: 'desc' }]
  })

  return workouts
})
