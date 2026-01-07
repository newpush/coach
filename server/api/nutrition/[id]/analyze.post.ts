import { getServerSession } from '../../../utils/session'
import { tasks } from '@trigger.dev/sdk/v3'

defineRouteMeta({
  openAPI: {
    tags: ['Nutrition'],
    summary: 'Analyze nutrition',
    description: 'Triggers AI analysis for a specific nutrition record.',
    parameters: [
      {
        name: 'id',
        in: 'path',
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
                success: { type: 'boolean' },
                nutritionId: { type: 'string' },
                jobId: { type: 'string' },
                status: { type: 'string' },
                message: { type: 'string' }
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' },
      404: { description: 'Nutrition record not found' }
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

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Nutrition ID is required'
    })
  }

  // Fetch the nutrition record
  const nutrition = await nutritionRepository.getById(id, (session.user as any).id)

  if (!nutrition) {
    throw createError({
      statusCode: 404,
      message: 'Nutrition record not found'
    })
  }

  // Allow re-analysis regardless of existing data
  if (nutrition.aiAnalysisStatus === 'COMPLETED' && nutrition.aiAnalysisJson) {
    console.log('Re-analyzing nutrition even though analysis exists')
  }

  // Check if already processing
  if (nutrition.aiAnalysisStatus === 'PROCESSING') {
    return {
      success: true,
      nutritionId: id,
      status: 'PROCESSING',
      message: 'Analysis is currently being generated'
    }
  }

  try {
    // Update status to PENDING
    await nutritionRepository.updateStatus(id, 'PENDING')

    // Trigger background job with per-user concurrency
    const handle = await tasks.trigger(
      'analyze-nutrition',
      {
        nutritionId: id
      },
      {
        concurrencyKey: (session.user as any).id
      }
    )

    return {
      success: true,
      nutritionId: id,
      jobId: handle.id,
      status: 'PENDING',
      message: 'Nutrition analysis started'
    }
  } catch (error) {
    // Update status to failed
    await nutritionRepository.updateStatus(id, 'FAILED')

    throw createError({
      statusCode: 500,
      message: `Failed to trigger nutrition analysis: ${error instanceof Error ? error.message : 'Unknown error'}`
    })
  }
})
