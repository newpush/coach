import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['Availability'],
    summary: 'Get training availability',
    description: "Returns the user's weekly training availability preferences.",
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
                  dayOfWeek: { type: 'integer', description: '0=Sunday, 6=Saturday' },
                  morning: { type: 'boolean' },
                  afternoon: { type: 'boolean' },
                  evening: { type: 'boolean' },
                  indoorOnly: { type: 'boolean' },
                  outdoorOnly: { type: 'boolean' }
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

  const userId = (session.user as any).id

  const availability = await prisma.trainingAvailability.findMany({
    where: { userId },
    orderBy: { dayOfWeek: 'asc' }
  })

  return availability
})
