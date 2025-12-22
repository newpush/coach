import { getServerSession } from '#auth'

export default defineEventHandler({
  openAPI: {
    tags: ['Settings'],
    summary: 'List API keys',
    description: 'Returns a list of API keys associated with the authenticated user.',
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  prefix: { type: 'string' },
                  lastUsedAt: { type: 'string', nullable: true },
                  expiresAt: { type: 'string', nullable: true },
                  createdAt: { type: 'string' }
                }
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

    const keys = await prisma.apiKey.findMany({
      where: {
        userId: session.user.id
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return keys
  }
})
