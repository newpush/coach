import { getServerSession } from '../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Recommendations'],
    summary: 'Get today\'s recommendation',
    description: 'Returns the daily activity recommendation for the current date.',
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
                date: { type: 'string', format: 'date-time' },
                recommendation: { type: 'string' },
                confidence: { type: 'number' },
                reasoning: { type: 'string' },
                status: { type: 'string' },
                userAccepted: { type: 'boolean' },
                analysisJson: { type: 'object' },
                plannedWorkout: { type: 'object' }
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
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  // Find most recent recommendation for today
  const recommendation = await prisma.activityRecommendation.findFirst({
    where: {
      userId,
      date: today
    },
    include: {
      plannedWorkout: true
    },
    orderBy: { createdAt: 'desc' }
  })
  
  return recommendation
})