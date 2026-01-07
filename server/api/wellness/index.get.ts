import { getServerSession } from '../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Wellness'],
    summary: 'List wellness data',
    description: 'Returns the last 90 days of wellness data for the authenticated user.',
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
                  date: { type: 'string', format: 'date-time' },
                  hrv: { type: 'number', nullable: true },
                  restingHr: { type: 'integer', nullable: true },
                  sleepScore: { type: 'integer', nullable: true },
                  readiness: { type: 'integer', nullable: true },
                  recoveryScore: { type: 'integer', nullable: true }
                }
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

  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  try {
    const userId = (session.user as any).id

    const wellness = await wellnessRepository.getForUser(userId, {
      limit: 90,
      orderBy: { date: 'desc' }
    })

    return wellness
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: 'Failed to fetch wellness data'
    })
  }
})
