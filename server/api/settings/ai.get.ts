import { defineEventHandler, createError } from 'h3'
import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['Settings'],
    summary: 'Get AI settings',
    description: 'Returns the AI preferences for the authenticated user.',
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                aiPersona: { type: 'string' },
                aiModelPreference: { type: 'string' },
                aiAutoAnalyzeWorkouts: { type: 'boolean' },
                aiAutoAnalyzeNutrition: { type: 'boolean' },
                aiContext: { type: 'string', nullable: true }
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' },
      404: { description: 'User not found' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      aiPersona: true,
      aiModelPreference: true,
      aiAutoAnalyzeWorkouts: true,
      aiAutoAnalyzeNutrition: true,
      aiContext: true
    }
  })

  if (!user) {
    throw createError({
      statusCode: 404,
      message: 'User not found'
    })
  }

  return {
    aiPersona: user.aiPersona || 'Supportive',
    aiModelPreference: user.aiModelPreference || 'flash',
    aiAutoAnalyzeWorkouts: user.aiAutoAnalyzeWorkouts ?? false,
    aiAutoAnalyzeNutrition: user.aiAutoAnalyzeNutrition ?? false,
    aiContext: user.aiContext
  }
})
