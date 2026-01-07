import { getServerSession } from '../../utils/session'
import { tasks } from '@trigger.dev/sdk/v3'
import { prisma } from '../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['Profile'],
    summary: 'Delete user account',
    description: 'Permanently deletes the user account and all associated data.',
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                jobId: { type: 'string' },
                message: { type: 'string' }
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

  const userId = (session.user as any).id

  // Trigger the background job to handle the full deletion (cascading, cleanup, etc.)
  const handle = await tasks.trigger(
    'delete-user-account',
    {
      userId
    },
    {
      concurrencyKey: userId
    }
  )

  // Immediately invalidate sessions to prevent further access
  try {
    // Note: This relies on using a database adapter for sessions.
    // If using JWT only, this might not be sufficient without a blacklist,
    // but typically we use PrismaAdapter so sessions are in DB.
    await prisma.session.deleteMany({
      where: { userId }
    })
  } catch (e) {
    console.error('Failed to clear sessions immediately', e)
    // Continue anyway, the job will handle it
  }

  return {
    success: true,
    jobId: handle.id,
    message: 'Account scheduled for deletion'
  }
})
