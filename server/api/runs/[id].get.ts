import { getServerSession } from '../../utils/session'
import { runs } from '@trigger.dev/sdk/v3'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user?.id) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const runId = getRouterParam(event, 'id')
  if (!runId) {
    throw createError({ statusCode: 400, message: 'Missing run ID' })
  }

  try {
    const run = await runs.retrieve(runId)

    // Security check: Ensure the run belongs to the user via tags
    // This assumes all user-specific runs are tagged with "user:{userId}"
    const hasUserTag = run.tags?.includes(`user:${session.user.id}`)

    // If you have system-wide runs that users need to see but aren't tagged,
    // you might need to relax this or add specific logic.
    // For now, strict ownership is safer.
    if (!hasUserTag) {
      // Return 404 to avoid leaking existence of other users' runs
      throw createError({ statusCode: 404, message: 'Run not found' })
    }

    return {
      id: run.id,
      status: run.status,
      output: run.output,
      error: run.error,
      finishedAt: run.finishedAt,
      startedAt: run.startedAt
    }
  } catch (error: any) {
    if (error.statusCode) throw error

    // Handle 404 from Trigger.dev SDK
    if (error.status === 404 || error.message?.includes('not found')) {
      throw createError({ statusCode: 404, message: 'Run not found' })
    }

    console.error(`Failed to retrieve run ${runId}:`, error)
    throw createError({ statusCode: 500, message: 'Failed to retrieve run status' })
  }
})
