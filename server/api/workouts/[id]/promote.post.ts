import { getServerSession } from '../../../utils/session'
import { prisma } from '../../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Promote workout',
    description:
      'Promotes a duplicate workout to be the primary version, swapping roles with the current primary.',
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
      400: { description: 'Workout is not a duplicate' },
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

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Workout ID is required' })
  }

  // Fetch the workout to be promoted
  const workoutToPromote = await prisma.workout.findUnique({
    where: {
      id,
      userId: (session.user as any).id
    }
  })

  if (!workoutToPromote) {
    throw createError({ statusCode: 404, message: 'Workout not found' })
  }

  if (!workoutToPromote.isDuplicate || !workoutToPromote.duplicateOf) {
    throw createError({
      statusCode: 400,
      message: 'This workout is not a duplicate and cannot be promoted'
    })
  }

  const oldPrimaryId = workoutToPromote.duplicateOf

  // Fetch the current primary workout
  const oldPrimaryWorkout = await prisma.workout.findUnique({
    where: {
      id: oldPrimaryId,
      userId: (session.user as any).id
    }
  })

  if (!oldPrimaryWorkout) {
    throw createError({
      statusCode: 404,
      message: 'Primary workout not found'
    })
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Update the new primary (the one being promoted)
      // If it doesn't have a planned workout link but the old one did, take it
      let plannedWorkoutIdUpdate = undefined
      if (!workoutToPromote.plannedWorkoutId && oldPrimaryWorkout.plannedWorkoutId) {
        plannedWorkoutIdUpdate = oldPrimaryWorkout.plannedWorkoutId
      }

      await tx.workout.update({
        where: { id },
        data: {
          isDuplicate: false,
          duplicateOf: null,
          ...(plannedWorkoutIdUpdate ? { plannedWorkoutId: plannedWorkoutIdUpdate } : {})
        }
      })

      // 2. Update the old primary to be a duplicate of the new one
      await tx.workout.update({
        where: { id: oldPrimaryId },
        data: {
          isDuplicate: true,
          duplicateOf: id
        }
      })

      // 3. Update any OTHER duplicates that were pointing to oldPrimaryId to now point to id
      await tx.workout.updateMany({
        where: {
          duplicateOf: oldPrimaryId,
          id: { not: id } // Exclude the one we just promoted (though we already updated it in step 1, safe to exclude)
        },
        data: {
          duplicateOf: id
        }
      })
    })

    return { success: true }
  } catch (error) {
    console.error('Error promoting workout:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to promote workout'
    })
  }
})
