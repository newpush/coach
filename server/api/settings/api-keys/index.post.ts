import { getServerSession } from '#auth'

export default defineEventHandler({
  openAPI: {
    tags: ['Settings'],
    summary: 'Create an API key',
    description: 'Generates a new API key for the authenticated user.',
    body: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Friendly name for the API key' }
      },
      required: ['name']
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
  },
  async handler(event) {
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
        userId: session.user.id,
        name: body.name,
        key: hashedKey,
        prefix
      }
    })

    return {
      id: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.prefix,
      key, // Return the plain key only once
      createdAt: apiKey.createdAt
    }
  }
})
