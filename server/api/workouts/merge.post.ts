import { getServerSession } from '#auth'
import { prisma } from '../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Merge workouts',
    description: 'Manually merges two workouts, marking one as a duplicate of the other.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['primaryWorkoutId', 'secondaryWorkoutId'],
            properties: {
              primaryWorkoutId: { type: 'string' },
              secondaryWorkoutId: { type: 'string' }
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
                success: { type: 'boolean' }
              }
            }
          }
        }
      },
      400: { description: 'Invalid input' },
      401: { description: 'Unauthorized' },
      404: { description: 'Workouts not found' }
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

  const body = await readBody(event)
  const { primaryWorkoutId, secondaryWorkoutId } = body

  if (!primaryWorkoutId || !secondaryWorkoutId) {
    throw createError({
      statusCode: 400,
      message: 'Both primaryWorkoutId and secondaryWorkoutId are required'
    })
  }

  // Verify ownership of both workouts
  const workouts = await prisma.workout.findMany({
    where: {
      id: { in: [primaryWorkoutId, secondaryWorkoutId] },
      userId: (session.user as any).id
    }
  })

  if (workouts.length !== 2) {
    throw createError({
      statusCode: 404,
      message: 'One or both workouts not found or access denied'
    })
  }

  const primaryWorkout = workouts.find(w => w.id === primaryWorkoutId)
  const secondaryWorkout = workouts.find(w => w.id === secondaryWorkoutId)

  if (!primaryWorkout || !secondaryWorkout) {
    throw createError({ statusCode: 500, message: 'Error retrieving workouts' })
  }

  // Logic:
  // 1. Mark secondary as duplicate of primary
  // 2. Transfer plannedWorkoutId if primary doesn't have one but secondary does
  // 3. Ensure primary is not marked as duplicate

  try {
    await prisma.$transaction(async (tx) => {
      // If primary needs a planned workout link and secondary has one, take it
      if (!primaryWorkout.plannedWorkoutId && secondaryWorkout.plannedWorkoutId) {
        await tx.workout.update({
          where: { id: primaryWorkoutId },
          data: {
            plannedWorkoutId: secondaryWorkout.plannedWorkoutId
          }
        })
        
        // Remove link from secondary to avoid unique constraint issues if any (though usually one-to-many is fine, but cleaner to move it)
        // Actually, schema says: plannedWorkoutId String? (relation to PlannedWorkout)
        // And PlannedWorkout has completedWorkouts Workout[]
        // So multiple workouts can link to same planned workout.
        // But for clarity, we might want to just ensure primary has it.
      }

      // Mark secondary as duplicate
      await tx.workout.update({
        where: { id: secondaryWorkoutId },
        data: {
          isDuplicate: true,
          duplicateOf: primaryWorkoutId
        }
      })

      // Ensure primary is NOT a duplicate (in case it was previously)
      await tx.workout.update({
        where: { id: primaryWorkoutId },
        data: {
          isDuplicate: false,
          duplicateOf: null
        }
      })
    })

    return { success: true }
  } catch (error) {
    console.error('Error merging workouts:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to merge workouts'
    })
  }
})