import { getServerSession } from '../../../utils/session'
import { prisma } from '../../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Link workout to planned workout',
    description:
      'Links an existing completed workout to a planned workout, marking the planned workout as completed.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['plannedWorkoutId'],
            properties: {
              plannedWorkoutId: { type: 'string' }
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
      404: { description: 'Workout or planned workout not found' }
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

  const body = await readBody(event)
  const { plannedWorkoutId } = body

  if (!plannedWorkoutId) {
    throw createError({
      statusCode: 400,
      message: 'Planned workout ID is required'
    })
  }

  // Verify ownership
  const [workout, plannedWorkout] = await Promise.all([
    prisma.workout.findUnique({
      where: {
        id: workoutId,
        userId: (session.user as any).id
      }
    }),
    prisma.plannedWorkout.findUnique({
      where: {
        id: plannedWorkoutId,
        userId: (session.user as any).id
      }
    })
  ])

  if (!workout || !plannedWorkout) {
    throw createError({
      statusCode: 404,
      message: 'Workout or planned workout not found'
    })
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Link the workout to the planned workout
      await tx.workout.update({
        where: { id: workoutId },
        data: {
          plannedWorkoutId: plannedWorkoutId
        }
      })

      // Update planned workout status
      await tx.plannedWorkout.update({
        where: { id: plannedWorkoutId },
        data: {
          completed: true,
          completionStatus: 'COMPLETED'
        }
      })
    })

    return { success: true }
  } catch (error) {
    console.error('Error linking workouts:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to link workouts'
    })
  }
})
