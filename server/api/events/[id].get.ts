import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['Events'],
    summary: 'Get event details',
    description: 'Returns a single event by ID.',
    parameters: [
      {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string' }
      }
    ]
  }
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const id = getRouterParam(event, 'id')
  const userId = (session.user as any).id

  try {
    const eventData = await prisma.event.findFirst({
      where: {
        id,
        userId
      },
      include: {
        goals: true
      }
    })

    if (!eventData) {
      throw createError({ statusCode: 404, message: 'Event not found' })
    }

    return eventData
  } catch (error: any) {
    console.error('Error fetching event:', error)
    if (error.statusCode === 404) throw error
    throw createError({ statusCode: 500, message: 'Failed to fetch event' })
  }
})
