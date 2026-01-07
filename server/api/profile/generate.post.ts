import { getServerSession } from '../../utils/session'
import { tasks } from '@trigger.dev/sdk/v3'
import { prisma } from '../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['Profile'],
    summary: 'Generate athlete profile',
    description: 'Triggers an AI job to analyze data and generate an athlete profile report.',
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                reportId: { type: 'string' },
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

  // Create a report entry for the athlete profile
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const now = new Date()

  const report = await prisma.report.create({
    data: {
      userId,
      type: 'ATHLETE_PROFILE',
      status: 'PENDING',
      dateRangeStart: thirtyDaysAgo,
      dateRangeEnd: now
    }
  })

  // Trigger the background job with per-user concurrency
  const handle = await tasks.trigger(
    'generate-athlete-profile',
    {
      userId,
      reportId: report.id
    },
    {
      concurrencyKey: userId
    }
  )

  return {
    success: true,
    reportId: report.id,
    jobId: handle.id,
    message: 'Generating athlete profile'
  }
})
