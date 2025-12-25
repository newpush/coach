import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['Events'],
    summary: 'List events',
    description: 'Returns a list of racing events for the authenticated user.',
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
                  subType: { type: 'string' },
                  distance: { type: 'number' },
                  elevation: { type: 'integer' },
                  expectedDuration: { type: 'number' },
                  terrain: { type: 'string' },
                  source: { type: 'string' }
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
  
  try {
    const events = await prisma.event.findMany({
      where: { userId },
      orderBy: { date: 'asc' }
    })
    
    return events
  } catch (error) {
    console.error('Error fetching events:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to fetch events'
    })
  }
})
