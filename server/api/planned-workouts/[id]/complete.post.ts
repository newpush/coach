import { getServerSession } from '../../../utils/session'
import { prisma } from '../../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['Planned Workouts'],
    summary: 'Complete planned workout',
    description: 'Marks a planned workout as completed by linking it to an actual workout.',
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' }
      }
    ],
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              workoutId: { type: 'string', nullable: true }
            }
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                plannedWorkout: { type: 'object' },
                workout: { type: 'object', nullable: true }
              }
            }
          }
        }
      },
      400: { description: 'Invalid input' },
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
  const plannedWorkoutId = event.context.params?.id
  const body = await readBody(event)

  if (!plannedWorkoutId) {
    throw createError({
      statusCode: 400,
      message: 'Planned workout ID is required'
    })
  }

  // workoutId is now optional

  try {
    // Check if planned workout exists and belongs to user
    const plannedWorkout = await prisma.plannedWorkout.findUnique({
      where: { id: plannedWorkoutId }
    })

    if (!plannedWorkout) {
      throw createError({
        statusCode: 404,
        message: 'Planned workout not found'
      })
    }

    if (plannedWorkout.userId !== userId) {
      throw createError({
        statusCode: 403,
        message: 'Not authorized to update this planned workout'
      })
    }

    let updatedWorkout = null

    if (body.workoutId) {
      // Check if workout exists and belongs to user
      const workout = await prisma.workout.findUnique({
        where: { id: body.workoutId }
      })

      if (!workout) {
        throw createError({
          statusCode: 404,
          message: 'Workout not found'
        })
      }

      if (workout.userId !== userId) {
        throw createError({
          statusCode: 403,
          message: 'Not authorized to link to this workout'
        })
      }

      // Update workout to link to planned workout
      updatedWorkout = await prisma.workout.update({
        where: { id: body.workoutId },
        data: {
          plannedWorkoutId: plannedWorkoutId
        }
      })
    }

    // Update planned workout to mark as completed
    const updatedPlannedWorkout = await prisma.plannedWorkout.update({
      where: { id: plannedWorkoutId },
      data: {
        completed: true,
        completionStatus: 'COMPLETED'
      }
    })

    return {
      success: true,
      plannedWorkout: updatedPlannedWorkout,
      workout: updatedWorkout
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }
    console.error('Error marking planned workout complete:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to mark planned workout complete'
    })
  }
})
