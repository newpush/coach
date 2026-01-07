import { getServerSession } from '../../utils/session'
import { tasks } from '@trigger.dev/sdk/v3'

defineRouteMeta({
  openAPI: {
    tags: ['Nutrition'],
    summary: 'Analyze all nutrition',
    description: 'Triggers AI analysis for all pending nutrition records.',
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
                total: { type: 'integer' },
                triggered: { type: 'integer' },
                failed: { type: 'integer' }
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

  try {
    // Find all nutrition records that need analysis
    const nutritionToAnalyze = await nutritionRepository.getPendingAnalysis(userId)

    if (nutritionToAnalyze.length === 0) {
      return {
        success: true,
        message: 'No nutrition records need analysis',
        total: 0,
        triggered: 0
      }
    }

    // Update all to PENDING status
    await nutritionRepository.updateMany(
      {
        id: { in: nutritionToAnalyze.map((n) => n.id) }
      },
      {
        aiAnalysisStatus: 'PENDING'
      }
    )

    // Trigger analysis jobs for each nutrition record with per-user concurrency
    const triggerPromises = nutritionToAnalyze.map(async (nutrition) => {
      try {
        const handle = await tasks.trigger(
          'analyze-nutrition',
          {
            nutritionId: nutrition.id
          },
          {
            concurrencyKey: userId
          }
        )
        return { success: true, nutritionId: nutrition.id, jobId: handle.id }
      } catch (error) {
        console.error(`Failed to trigger analysis for nutrition ${nutrition.id}:`, error)
        // Mark as failed if trigger fails
        await nutritionRepository.updateStatus(nutrition.id, 'FAILED')
        return {
          success: false,
          nutritionId: nutrition.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    })

    const results = await Promise.all(triggerPromises)
    const successful = results.filter((r) => r.success).length
    const failed = results.filter((r) => !r.success).length

    return {
      success: true,
      message: `Analysis started for ${successful} nutrition records${failed > 0 ? ` (${failed} failed)` : ''}`,
      total: nutritionToAnalyze.length,
      triggered: successful,
      failed,
      results
    }
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: `Failed to trigger nutrition analyses: ${error instanceof Error ? error.message : 'Unknown error'}`
    })
  }
})
