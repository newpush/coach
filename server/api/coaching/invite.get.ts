import { getServerSession } from '../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Coaching'],
    summary: 'Get active invite',
    description: 'Returns the currently active coaching invite code for the authenticated athlete.',
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                id: { type: 'string', nullable: true },
                code: { type: 'string', nullable: true },
                expiresAt: { type: 'string', format: 'date-time', nullable: true },
                status: { type: 'string' }
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
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const athleteId = (session.user as any).id
  const invite = await coachingRepository.getActiveInvite(athleteId)

  return invite || { status: 'NONE' }
})
