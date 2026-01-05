import { getServerSession } from '../../../utils/session'
import { prisma } from '../../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Get today\'s planned workout',
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
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const nextDay = new Date(today)
  nextDay.setDate(nextDay.getDate() + 1)
  
  const workout = await prisma.plannedWorkout.findFirst({
    where: {
      userId,
      date: {
        gte: today,
        lt: nextDay
      }
    },
    orderBy: { createdAt: 'desc' } // Get the most recently created one if duplicates
  })
  
  return workout
})
