import { getServerSession } from '../../utils/session'
import { runs } from '@trigger.dev/sdk/v3'

defineRouteMeta({
  openAPI: {
    tags: ['Goals'],
    summary: 'Get goal review result',
    description: 'Retrieves the status and result of a goal review job.',
    parameters: [
      {
        name: 'jobId',
        in: 'query',
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
                status: { type: 'string' },
                output: { type: 'object', nullable: true },
                isCompleted: { type: 'boolean' },
                isFailed: { type: 'boolean' }
              }
            }
          }
        }
      },
      400: { description: 'Job ID required' },
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

  const query = getQuery(event)
  const jobId = query.jobId as string

  if (!jobId) {
    throw createError({
      statusCode: 400,
      message: 'Job ID is required'
    })
  }

  try {
    // Get the run status and output
    const run = await runs.retrieve(jobId)

    return {
      status: run.status,
      output: run.output,
      isCompleted: run.status === 'COMPLETED',
      isFailed: run.status === 'FAILED'
    }
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: `Failed to retrieve review: ${error instanceof Error ? error.message : 'Unknown error'}`
    })
  }
})
