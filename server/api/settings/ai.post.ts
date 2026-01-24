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
              aiModelPreference: { type: 'string', enum: ['flash', 'pro'] },
              aiAutoAnalyzeWorkouts: { type: 'boolean' },
              aiAutoAnalyzeNutrition: { type: 'boolean' },
              aiContext: { type: 'string', nullable: true }
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
                    aiContext: { type: 'string', nullable: true }
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
    aiContext
  } = body

  // Validate inputs
  const validPersonas = ['Analytical', 'Supportive', 'Drill Sergeant', 'Motivational']
  const validModels = ['flash', 'pro']

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
      ...(aiContext !== undefined && { aiContext })
    },
    select: {
      aiPersona: true,
      aiModelPreference: true,
      aiAutoAnalyzeWorkouts: true,
      aiAutoAnalyzeNutrition: true,
      aiContext: true
    }
  })

  return {
    success: true,
    settings: user
  }
})
