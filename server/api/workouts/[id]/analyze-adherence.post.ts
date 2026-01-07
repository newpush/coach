import { getServerSession } from '../../../utils/session'
import { prisma } from '../../../utils/db'
import { tasks } from '@trigger.dev/sdk/v3'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const workoutId = getRouterParam(event, 'id')
  if (!workoutId) {
    throw createError({ statusCode: 400, message: 'Workout ID is required' })
  }

  const workout = await prisma.workout.findUnique({
    where: {
      id: workoutId,
      userId: (session.user as any).id
    },
    select: { id: true, plannedWorkoutId: true }
  })

  if (!workout) {
    throw createError({ statusCode: 404, message: 'Workout not found' })
  }

  if (!workout.plannedWorkoutId) {
    throw createError({ statusCode: 400, message: 'Workout is not linked to a plan' })
  }

  try {
    const handle = await tasks.trigger('analyze-plan-adherence', {
      workoutId: workout.id,
      plannedWorkoutId: workout.plannedWorkoutId
    })

    return {
      success: true,
      taskId: handle.id,
      status: 'PENDING'
    }
  } catch (error) {
    console.error('Failed to trigger adherence analysis:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to start analysis'
    })
  }
})
