import { getServerSession } from '#auth'

export default defineEventHandler({
  openAPI: {
    tags: ['Settings'],
    summary: 'Revoke an API key',
    description: 'Permanently deletes an API key.',
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' }
      }
    ],
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
      401: { description: 'Unauthorized' },
      404: { description: 'Key not found' }
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

    const id = getRouterParam(event, 'id')

    const apiKey = await prisma.apiKey.findFirst({
      where: {
        id,
        userId: session.user.id
      }
    })

    if (!apiKey) {
      throw createError({
        statusCode: 404,
        message: 'API key not found'
      })
    }

    await prisma.apiKey.delete({
      where: {
        id
      }
    })

    return {
      success: true
    }
  }
})
