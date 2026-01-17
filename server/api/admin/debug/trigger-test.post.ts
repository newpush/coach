import { defineEventHandler, createError, readBody } from 'h3'
import { getServerSession } from '../../../utils/session'
import { helloWorldTask } from '../../../../trigger/hello-world'
import { sentryErrorTest } from '../../../../trigger/sentry-error-test'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const body = await readBody(event)
  const { taskName } = body

  if (!taskName) {
    throw createError({ statusCode: 400, statusMessage: 'taskName is required' })
  }

  try {
    let runHandle
    if (taskName === 'hello-world') {
      runHandle = await helloWorldTask.trigger({ message: 'Debug Test from Admin' })
    } else if (taskName === 'sentry-error-test') {
      runHandle = await sentryErrorTest.trigger()
    } else {
      throw createError({ statusCode: 400, statusMessage: 'Invalid task name' })
    }

    return {
      success: true,
      runId: runHandle.id,
      runUrl: `https://cloud.trigger.dev/projects/${process.env.TRIGGER_PROJECT_REF}/runs/${runHandle.id}`
    }
  } catch (error: any) {
    console.error('Failed to trigger task:', error)
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to trigger task',
      data: error
    })
  }
})
