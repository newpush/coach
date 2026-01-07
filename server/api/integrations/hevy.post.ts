import { getServerSession } from '../../utils/session'
import { fetchHevyWorkouts } from '../../utils/hevy'
import { prisma } from '../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['Integrations'],
    summary: 'Connect Hevy',
    description: 'Connects the Hevy integration using an API key.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['apiKey'],
            properties: {
              apiKey: { type: 'string' }
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
                success: { type: 'boolean' }
              }
            }
          }
        }
      },
      400: { description: 'Invalid API key' },
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
  const { apiKey } = body

  if (!apiKey || typeof apiKey !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'API key is required'
    })
  }

  try {
    // Verify the API key by fetching workouts (limit 1)
    // This will throw if the key is invalid
    await fetchHevyWorkouts(apiKey, 1, 1)

    // Find the user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      throw createError({
        statusCode: 404,
        message: 'User not found'
      })
    }

    // Check if integration already exists
    const existing = await prisma.integration.findFirst({
      where: {
        userId: user.id,
        provider: 'hevy'
      }
    })

    if (existing) {
      // Update existing integration
      await prisma.integration.update({
        where: { id: existing.id },
        data: {
          accessToken: apiKey,
          lastSyncAt: new Date(),
          syncStatus: 'SUCCESS'
        }
      })
    } else {
      // Create new integration
      await prisma.integration.create({
        data: {
          userId: user.id,
          provider: 'hevy',
          accessToken: apiKey,
          syncStatus: 'SUCCESS',
          lastSyncAt: new Date(),
          initialSyncCompleted: false
        }
      })
    }

    return {
      success: true
    }
  } catch (error: any) {
    console.error('Failed to connect Hevy:', error)

    let message = 'Failed to connect to Hevy.'

    if (error.message?.includes('401') || error.message?.includes('403')) {
      message = 'Invalid API key. Please check your credentials.'
    } else if (error.message) {
      message = error.message
    }

    throw createError({
      statusCode: 400,
      message
    })
  }
})
