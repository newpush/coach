import { prisma } from '../../../../utils/db'
import { tasks } from '@trigger.dev/sdk/v3'
import { z } from 'zod'

const adjustSchema = z.object({
  durationMinutes: z.number().optional(),
  intensity: z.string().optional(),
  feedback: z.string().optional()
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const workoutId = getRouterParam(event, 'id')
  const body = await readBody(event)
  const adjustments = adjustSchema.parse(body)

  const workout = await prisma.plannedWorkout.findFirst({
    where: {
      id: workoutId,
      userId: session.user.id
    }
  })

  if (!workout) {
    throw createError({ statusCode: 404, message: 'Workout not found' })
  }

  const handle = await tasks.trigger('adjust-structured-workout', {
    plannedWorkoutId: workout.id,
    adjustments
  })

  return { success: true, jobId: handle.id }
})
