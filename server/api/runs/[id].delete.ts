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
    const hasUserTag = run.tags?.includes(`user:${session.user.id}`)

    if (!hasUserTag) {
      throw createError({ statusCode: 404, message: 'Run not found' })
    }

    // Cancel the run
    await runs.cancel(runId)

    return { success: true }
  } catch (error: any) {
    if (error.statusCode) throw error

    console.error(`Failed to cancel run ${runId}:`, error)
    throw createError({ statusCode: 500, message: 'Failed to cancel run' })
  }
})
