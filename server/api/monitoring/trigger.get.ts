import { runs } from '@trigger.dev/sdk/v3'

export default defineEventHandler(async (event) => {
  // Optional: Simple secret check
  const monitoringSecret = process.env.MONITORING_SECRET
  if (monitoringSecret) {
    const headerSecret = getHeader(event, 'x-monitoring-secret')
    const querySecret = getQuery(event).secret
    if (headerSecret !== monitoringSecret && querySecret !== monitoringSecret) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized'
      })
    }
  }

  try {
    // Fetch last 50 runs
    const limit = 50
    const response = await runs.list({
      limit
    })

    const runList = response.data
    const total = runList.length

    const stats = {
      total,
      completed: 0,
      failed: 0,
      canceled: 0,
      executing: 0,
      queued: 0,
      other: 0
    }

    const recentFailures = []

    for (const run of runList) {
      switch (run.status) {
        case 'COMPLETED':
          stats.completed++
          break
        case 'FAILED':
        case 'CRASHED':
        case 'TIMED_OUT':
        case 'SYSTEM_FAILURE':
          stats.failed++
          recentFailures.push({
            id: run.id,
            taskIdentifier: run.taskIdentifier,
            status: run.status,
            startedAt: run.startedAt,
            finishedAt: run.finishedAt,
            isTest: run.isTest
          })
          break
        case 'CANCELED':
          stats.canceled++
          break
        case 'EXECUTING':
        case 'REATTEMPTING':
        case 'FROZEN':
          stats.executing++
          break
        case 'QUEUED':
        case 'WAITING_FOR_DEPLOY':
          stats.queued++
          break
        default:
          stats.other++
      }
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      period: `Last ${limit} runs`,
      stats,
      recentFailures: recentFailures.slice(0, 5) // Return top 5 recent failures
    }
  } catch (error: any) {
    console.error('Failed to fetch trigger runs:', error)
    throw createError({
      statusCode: 503,
      statusMessage: 'Failed to fetch Trigger.dev stats',
      data: {
        message: error.message
      }
    })
  }
})
