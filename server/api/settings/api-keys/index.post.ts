import { getServerSession } from '../../../utils/session'
import { generateApiKey, hashApiKey } from '../../../utils/api-keys'
import { prisma } from '../../../utils/db'
import { logAction } from '../../../utils/audit'

defineRouteMeta({
  openAPI: {
    tags: ['Settings'],
    summary: 'Create an API key',
    description: 'Generates a new API key for the authenticated user.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Friendly name for the API key' }
            },
            required: ['name']
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Success - returns the plain API key (only shown once)',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                prefix: { type: 'string' },
                key: { type: 'string', description: 'The full API key' },
                createdAt: { type: 'string' }
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
  if (!session?.user?.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const body = await readBody(event)
  if (!body.name) {
    throw createError({
      statusCode: 400,
      message: 'Name is required'
    })
  }

  const { key, prefix } = generateApiKey()
  const hashedKey = hashApiKey(key)

  const apiKey = await prisma.apiKey.create({
    data: {
      userId: (session.user as any).id,
      name: body.name,
      key: hashedKey,
      prefix
    }
  })

  await logAction({
    userId: (session.user as any).id,
    action: 'API_KEY_CREATED',
    resourceType: 'ApiKey',
    resourceId: apiKey.id,
    metadata: { name: apiKey.name, prefix: apiKey.prefix },
    event
  })

  return {
    id: apiKey.id,
    name: apiKey.name,
    prefix: apiKey.prefix,
    key, // Return the plain key only once
    createdAt: apiKey.createdAt
  }
})
