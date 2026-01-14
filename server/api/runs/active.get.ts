import { getServerSession } from '../../utils/session'
import { runs } from '@trigger.dev/sdk/v3'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user?.id) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  try {
    // List active runs for this user
    // @ts-expect-error - SDK v3 types mismatch for filter params but works in runtime
    const activeRuns = await runs.list({
      filter: {
        tags: [`user:${session.user.id}`],
        status: ['EXECUTING', 'QUEUED', 'WAITING_FOR_DEPLOY', 'REATTEMPTING', 'FROZEN']
      },
      limit: 20
    })

    return activeRuns.data.map((run) => ({
      id: run.id,
      taskIdentifier: run.taskIdentifier,
      status: run.status,
      startedAt: run.startedAt,
      isTest: run.isTest
    }))
  } catch (error: any) {
    console.error(`Failed to list active runs for user ${session.user.id}:`, error)
    throw createError({ statusCode: 500, message: 'Failed to retrieve active runs' })
  }
})
