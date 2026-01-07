import { getServerSession } from '../../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Integrations'],
    summary: 'Connect Yazio',
    description: 'Connects the Yazio integration using username and password.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['username', 'password'],
            properties: {
              username: { type: 'string' },
              password: { type: 'string' }
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
                integrationId: { type: 'string' }
              }
            }
          }
        }
      },
      400: { description: 'Missing credentials' },
      401: { description: 'Unauthorized or invalid credentials' }
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

  const body = await readBody(event)
  const { username, password } = body

  if (!username || !password) {
    throw createError({
      statusCode: 400,
      message: 'Username and password are required'
    })
  }

  try {
    // Test credentials by attempting to create client
    const { Yazio } = await import('yazio')
    const yazio = new Yazio({
      credentials: { username, password }
    })

    // Test API call to verify credentials
    const today = new Date().toISOString().split('T')[0]
    await yazio.user.getDailySummary({ date: today })

    // Store integration
    const integration = await prisma.integration.upsert({
      where: {
        userId_provider: {
          userId: (session.user as any).id,
          provider: 'yazio'
        }
      },
      update: {
        accessToken: username,
        refreshToken: password,
        syncStatus: 'SUCCESS',
        lastSyncAt: new Date()
      },
      create: {
        userId: (session.user as any).id,
        provider: 'yazio',
        accessToken: username,
        refreshToken: password,
        syncStatus: 'SUCCESS'
      }
    })

    return {
      success: true,
      integrationId: integration.id
    }
  } catch (error) {
    console.error('Yazio connection error:', error)
    throw createError({
      statusCode: 401,
      message: 'Invalid Yazio credentials or API error'
    })
  }
})
