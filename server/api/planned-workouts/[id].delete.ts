import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'
import { deleteIntervalsPlannedWorkout } from '../../utils/intervals'
import { plannedWorkoutRepository } from '../../utils/repositories/plannedWorkoutRepository'
import { metabolicService } from '../../utils/services/metabolicService'

defineRouteMeta({
  openAPI: {
    tags: ['Planned Workouts'],
    summary: 'Delete planned workout',
    description: 'Deletes a specific planned workout and removes it from Intervals.icu.',
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
                message: { type: 'string' }
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' },
      404: { description: 'Workout not found' }
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
  const workoutId = event.context.params?.id

  if (!workoutId) {
    throw createError({
      statusCode: 400,
      message: 'Workout ID is required'
    })
  }

  try {
    // Check if workout belongs to user
    const workout = await plannedWorkoutRepository.getById(workoutId, userId)

    if (!workout) {
      throw createError({
        statusCode: 404,
        message: 'Workout not found'
      })
    }

    // Get Intervals.icu integration
    const integration = await prisma.integration.findFirst({
      where: {
        userId,
        provider: 'intervals'
      }
    })

    const settings = (integration?.settings as any) || {}
    const importPlannedWorkouts = settings.importPlannedWorkouts !== false // Default to true

    // Delete from Intervals.icu if integration exists and sync is enabled
    if (integration && workout.externalId && importPlannedWorkouts) {
      try {
        await deleteIntervalsPlannedWorkout(integration, workout.externalId)
      } catch (error) {
        console.error('Failed to delete from Intervals.icu:', error)
        // Continue with local deletion even if Intervals.icu deletion fails
      }
    }

    // Delete the workout from our database
    await plannedWorkoutRepository.delete(workoutId, userId)

    // REACTIVE: Trigger fueling plan update for the workout date
    try {
      await metabolicService.calculateFuelingPlanForDate(userId, workout.date, { persist: true })
    } catch (err) {
      console.error('[PlannedWorkoutDelete] Failed to trigger regeneration:', err)
    }

    return {
      success: true,
      message: 'Workout deleted successfully'
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }
    console.error('Error deleting planned workout:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to delete planned workout'
    })
  }
})
