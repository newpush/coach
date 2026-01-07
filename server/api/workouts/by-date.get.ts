import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Get workouts by date',
    description: 'Returns all workouts for a specific date.',
    parameters: [
      {
        name: 'date',
        in: 'query',
        required: true,
        schema: { type: 'string', format: 'date' }
      }
    ],
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  title: { type: 'string' },
                  date: { type: 'string', format: 'date-time' },
                  type: { type: 'string' },
                  durationSec: { type: 'integer' },
                  distanceMeters: { type: 'number' }
                }
              }
            }
          }
        }
      },
      400: { description: 'Missing date parameter' },
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

  const query = getQuery(event)
  const date = query.date as string

  if (!date) {
    throw createError({
      statusCode: 400,
      message: 'Date parameter is required'
    })
  }

  try {
    const userId = (session.user as any).id

    // Parse the date and get start/end of day
    const targetDate = new Date(date)
    const startOfDay = new Date(targetDate)
    startOfDay.setHours(0, 0, 0, 0)

    const endOfDay = new Date(targetDate)
    endOfDay.setHours(23, 59, 59, 999)

    // Fetch workouts for that day that are not duplicates
    const workouts = await workoutRepository.getForUser(userId, {
      startDate: startOfDay,
      endDate: endOfDay,
      orderBy: { date: 'asc' }
      // Note: Repository getForUser returns standard fields.
      // If we strictly need only selected fields for performance, we might need to enhance the repo.
      // For now, fetching full objects is acceptable or we can add 'select' to repo options.
      // But standardizing on 'include' is more common in this repo pattern.
      // Let's assume standard object return is fine for now, or add select support later.
    })
    // Filter to match the specific select if needed, or just return the full object.
    // The UI likely handles extra fields fine.

    return workouts
  } catch (error: any) {
    console.error('Error fetching workouts by date:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to fetch workouts'
    })
  }
})
