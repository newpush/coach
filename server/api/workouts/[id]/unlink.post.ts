import { getServerSession } from '../../../utils/session'
import { prisma } from '../../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Unlink workout from planned workout',
    description:
      'Removes the link between a completed workout and a planned workout, marking the planned workout as pending.',
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

  const workoutId = getRouterParam(event, 'id')
  if (!workoutId) {
    throw createError({ statusCode: 400, message: 'Workout ID is required' })
  }

  // Fetch the workout to get the plannedWorkoutId
  const workout = await prisma.workout.findUnique({
    where: {
      id: workoutId,
      userId: (session.user as any).id
    }
  })

  if (!workout) {
    throw createError({ statusCode: 404, message: 'Workout not found' })
  }

  if (!workout.plannedWorkoutId) {
    // Already unlinked or never linked, just return success
    return { success: true }
  }

  const plannedWorkoutId = workout.plannedWorkoutId

  try {
    await prisma.$transaction(async (tx) => {
      // Unlink the workout
      await tx.workout.update({
        where: { id: workoutId },
        data: {
          plannedWorkoutId: null
        }
      })

      // Update planned workout status back to pending
      // But first check if ANY OTHER workout is linked to it (unlikely but possible in schema)
      const otherLinkedWorkouts = await tx.workout.count({
        where: {
          plannedWorkoutId: plannedWorkoutId,
          id: { not: workoutId }
        }
      })

      if (otherLinkedWorkouts === 0) {
        await tx.plannedWorkout.update({
          where: { id: plannedWorkoutId },
          data: {
            completed: false,
            completionStatus: 'PENDING'
          }
        })
      }
    })

    return { success: true }
  } catch (error) {
    console.error('Error unlinking workouts:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to unlink workouts'
    })
  }
})
