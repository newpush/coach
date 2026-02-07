import { defineEventHandler, createError, readBody } from 'h3'
import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['Settings'],
    summary: 'Update AI settings',
    description: 'Updates the AI preferences for the authenticated user.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              aiPersona: {
                type: 'string',
                enum: ['Analytical', 'Supportive', 'Drill Sergeant', 'Motivational']
              },
              aiModelPreference: { type: 'string', enum: ['flash', 'pro', 'experimental'] },
              aiAutoAnalyzeWorkouts: { type: 'boolean' },
              aiAutoAnalyzeNutrition: { type: 'boolean' },
              aiAutoAnalyzeReadiness: { type: 'boolean' },
              aiProactivityEnabled: { type: 'boolean' },
              aiDeepAnalysisEnabled: { type: 'boolean' },
              aiContext: { type: 'string', nullable: true },
              nutritionTrackingEnabled: { type: 'boolean' },
              nickname: { type: 'string', nullable: true }
            }
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                settings: {
                  type: 'object',
                  properties: {
                    aiPersona: { type: 'string' },
                    aiModelPreference: { type: 'string' },
                    aiAutoAnalyzeWorkouts: { type: 'boolean' },
                    aiAutoAnalyzeNutrition: { type: 'boolean' },
                    aiContext: { type: 'string', nullable: true },
                    nutritionTrackingEnabled: { type: 'boolean' },
                    nickname: { type: 'string', nullable: true }
                  }
                }
              }
            }
          }
        }
      },
      400: { description: 'Invalid input' },
      401: { description: 'Unauthorized' }
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

  const body = await readBody(event)
  const {
    aiPersona,
    aiModelPreference,
    aiAutoAnalyzeWorkouts,
    aiAutoAnalyzeNutrition,
    aiAutoAnalyzeReadiness,
    aiProactivityEnabled,
    aiDeepAnalysisEnabled,
    aiContext,
    nutritionTrackingEnabled,
    nickname
  } = body

  // Validate inputs
  const validPersonas = ['Analytical', 'Supportive', 'Drill Sergeant', 'Motivational']
  const validModels = ['flash', 'pro', 'experimental']

  if (aiPersona && !validPersonas.includes(aiPersona)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid AI persona'
    })
  }

  if (aiModelPreference && !validModels.includes(aiModelPreference)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid AI model preference'
    })
  }

  const user = await prisma.user.update({
    where: { email: session.user.email },
    data: {
      ...(aiPersona !== undefined && { aiPersona }),
      ...(aiModelPreference !== undefined && { aiModelPreference }),
      ...(aiAutoAnalyzeWorkouts !== undefined && { aiAutoAnalyzeWorkouts }),
      ...(aiAutoAnalyzeNutrition !== undefined && { aiAutoAnalyzeNutrition }),
      ...(aiAutoAnalyzeReadiness !== undefined && { aiAutoAnalyzeReadiness }),
      ...(aiProactivityEnabled !== undefined && { aiProactivityEnabled }),
      ...(aiDeepAnalysisEnabled !== undefined && { aiDeepAnalysisEnabled }),
      ...(aiContext !== undefined && { aiContext }),
      ...(nutritionTrackingEnabled !== undefined && { nutritionTrackingEnabled }),
      ...(nickname !== undefined && { nickname })
    },
    select: {
      aiPersona: true,
      aiModelPreference: true,
      aiAutoAnalyzeWorkouts: true,
      aiAutoAnalyzeNutrition: true,
      aiAutoAnalyzeReadiness: true,
      aiProactivityEnabled: true,
      aiDeepAnalysisEnabled: true,
      aiContext: true,
      nutritionTrackingEnabled: true,
      nickname: true
    }
  })

  return {
    success: true,
    settings: user
  }
})
