import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['Planned Workouts'],
    summary: 'List planned workouts',
    description: 'Returns upcoming planned workouts for the authenticated user.',
    parameters: [
      {
        name: 'limit',
        in: 'query',
        schema: { type: 'integer', default: 10 }
      },
      {
        name: 'startDate',
        in: 'query',
        schema: { type: 'string', format: 'date-time' }
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
                  description: { type: 'string', nullable: true },
                  durationSec: { type: 'integer', nullable: true },
                  tss: { type: 'number', nullable: true }
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

  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const query = getQuery(event)
  const limit = query.limit ? parseInt(query.limit as string) : 10
  const startDate = query.startDate ? new Date(query.startDate as string) : new Date()

  const where: any = {
    userId: (session.user as any).id,
    date: {
      gte: startDate
    }
  }

  const plannedWorkouts = await prisma.plannedWorkout.findMany({
    where,
    orderBy: { date: 'asc' },
    take: limit
  })

  return plannedWorkouts
})
