import { getServerSession } from '../../utils/session'
import { tasks } from '@trigger.dev/sdk/v3'

defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Analyze all workouts',
    description: 'Triggers AI analysis for all pending workouts.',
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
    // Find all workouts that need analysis (excluding duplicates)
    const workoutsToAnalyze = await workoutRepository.getPendingAnalysis(userId)

    if (workoutsToAnalyze.length === 0) {
      return {
        success: true,
        message: 'No workouts need analysis',
        total: 0,
        triggered: 0
      }
    }

    // Update all to PENDING status
    await workoutRepository.updateMany(
      {
        id: { in: workoutsToAnalyze.map((w) => w.id) }
      },
      {
        aiAnalysisStatus: 'PENDING'
      }
    )

    // Trigger analysis jobs for each workout with per-user concurrency
    const triggerPromises = workoutsToAnalyze.map(async (workout) => {
      try {
        const handle = await tasks.trigger(
          'analyze-workout',
          {
            workoutId: workout.id
          },
          {
            concurrencyKey: userId
          }
        )
        return { success: true, workoutId: workout.id, jobId: handle.id }
      } catch (error) {
        console.error(`Failed to trigger analysis for workout ${workout.id}:`, error)
        // Mark as failed if trigger fails
        await workoutRepository.updateStatus(workout.id, 'FAILED')
        return {
          success: false,
          workoutId: workout.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    })

    const results = await Promise.all(triggerPromises)
    const successful = results.filter((r) => r.success).length
    const failed = results.filter((r) => !r.success).length

    return {
      success: true,
      message: `Analysis started for ${successful} workouts${failed > 0 ? ` (${failed} failed)` : ''}`,
      total: workoutsToAnalyze.length,
      triggered: successful,
      failed,
      results
    }
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: `Failed to trigger workout analyses: ${error instanceof Error ? error.message : 'Unknown error'}`
    })
  }
})
