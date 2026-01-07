import { getServerSession } from '../../utils/session'
import { fetchIntervalsAthlete } from '../../utils/intervals'

defineRouteMeta({
  openAPI: {
    tags: ['Integrations'],
    summary: 'Connect Intervals.icu',
    description: 'Connects the Intervals.icu integration using an API key and Athlete ID.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['apiKey', 'athleteId'],
            properties: {
              apiKey: { type: 'string' },
              athleteId: { type: 'string' }
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
                athlete: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    email: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      },
      400: { description: 'Invalid API key or athlete ID' },
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
  const { apiKey, athleteId } = body

  if (!apiKey || typeof apiKey !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'API key is required'
    })
  }

  if (!athleteId || typeof athleteId !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'Athlete ID is required'
    })
  }

  try {
    // Verify the API key by fetching athlete data
    const athleteData = await fetchIntervalsAthlete(apiKey, athleteId)

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
        provider: 'intervals'
      }
    })

    // Use provided athlete ID or the one from API
    const finalAthleteId = athleteId || athleteData.id

    if (existing) {
      // Update existing integration
      await prisma.integration.update({
        where: { id: existing.id },
        data: {
          accessToken: apiKey,
          externalUserId: finalAthleteId,
          lastSyncAt: new Date(),
          syncStatus: 'SUCCESS'
          // Don't reset initialSyncCompleted if it's already true
        }
      })
    } else {
      // Create new integration
      await prisma.integration.create({
        data: {
          userId: user.id,
          provider: 'intervals',
          accessToken: apiKey,
          externalUserId: finalAthleteId,
          syncStatus: 'SUCCESS',
          lastSyncAt: new Date(),
          initialSyncCompleted: false // New integration needs initial sync
        }
      })
    }

    return {
      success: true,
      athlete: {
        id: finalAthleteId,
        name: athleteData.name,
        email: athleteData.email
      }
    }
  } catch (error: any) {
    console.error('Failed to connect Intervals.icu:', error)

    // Provide more specific error messages
    let message = 'Failed to connect to Intervals.icu.'

    if (error.message?.includes('403')) {
      message =
        'Invalid API key or athlete ID. Please check your credentials at intervals.icu/settings'
    } else if (error.message?.includes('401')) {
      message = 'Authentication failed. Please verify your API key.'
    } else if (error.message?.includes('404')) {
      message = 'Athlete not found. Please check your athlete ID.'
    } else if (error.message) {
      message = error.message
    }

    throw createError({
      statusCode: 400,
      message
    })
  }
})
