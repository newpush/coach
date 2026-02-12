import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'
import { metabolicService } from '../../utils/services/metabolicService'

defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Delete workout',
    description: 'Deletes a specific workout by ID.',
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
                success: { type: 'boolean' }
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
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Workout ID is required'
    })
  }

  // Ensure workout belongs to user
  const workout = await prisma.workout.findFirst({
    where: {
      id,
      userId: userId
    }
  })

  if (!workout) {
    throw createError({
      statusCode: 404,
      message: 'Workout not found or access denied'
    })
  }

  // Delete associated streams first (though cascade delete might handle this if configured, better to be explicit)
  // Check if streams table exists and has records for this workout (schema check might be needed if streams are JSON on workout)
  // In our schema, streams is a JSON field on Workout, but we also have WorkoutStream table in some versions.
  // Assuming streams is a JSON column based on previous context, but let's check if we need to delete related entities.

  // Actually, we should check if there are other related records like 'PlannedWorkout' links.
  // If this workout completed a planned workout, we might want to un-complete it?
  // For now, let's just delete the workout.

  try {
    // Delete associated FitFile if it exists to allow re-upload
    // Note: We use deleteMany to avoid errors if no FitFile is associated
    await prisma.fitFile.deleteMany({
      where: { workoutId: id }
    })

    // For now, we are doing a hard delete.
    // IMPLICATION: If the activity exists on the external provider (Strava, etc.),
    // it WILL be re-ingested during the next full sync or webhook event.
    await prisma.workout.delete({
      where: { id }
    })

    // REACTIVE: Trigger fueling plan update for the workout date
    try {
      await metabolicService.calculateFuelingPlanForDate(userId, workout.date, { persist: true })
    } catch (err) {
      console.error('[WorkoutDelete] Failed to trigger regeneration:', err)
    }

    return { success: true }
  } catch (error) {
    console.error('Error deleting workout:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to delete workout'
    })
  }
})
