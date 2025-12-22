import { getServerSession } from '#auth'
import { tasks } from '@trigger.dev/sdk/v3'

defineRouteMeta({
  openAPI: {
    tags: ['Recommendations'],
    summary: 'Generate recommendation',
    description: 'Triggers AI generation of a daily activity recommendation.',
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                jobId: { type: 'string' },
                recommendationId: { type: 'string' },
                message: { type: 'string' }
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
  
  // Create a PENDING recommendation record immediately
  const recommendation = await prisma.activityRecommendation.create({
    data: {
      userId,
      date: today,
      recommendation: 'proceed', // Placeholder
      confidence: 0,
      reasoning: 'Analysis in progress...',
      status: 'PROCESSING'
    }
  })
  
  // Trigger background job with the recommendation ID
  const handle = await tasks.trigger('recommend-today-activity', {
    userId,
    date: today,
    recommendationId: recommendation.id
  })
  
  return {
    success: true,
    jobId: handle.id,
    recommendationId: recommendation.id,
    message: 'Generating today\'s recommendation'
  }
})