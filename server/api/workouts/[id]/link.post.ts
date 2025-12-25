import { prisma } from '../../../utils/db'
import { z } from 'zod'

const linkSchema = z.object({
  plannedWorkoutId: z.string()
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const workoutId = getRouterParam(event, 'id')
  const body = await readBody(event)
  const { plannedWorkoutId } = linkSchema.parse(body)

  // Verify ownership
  const workout = await prisma.workout.findFirst({
    where: { id: workoutId, userId: session.user.id }
  })

  if (!workout) {
    throw createError({ statusCode: 404, message: 'Workout not found' })
  }

  // Verify planned workout
  const planned = await prisma.plannedWorkout.findFirst({
    where: { id: plannedWorkoutId, userId: session.user.id }
  })

  if (!planned) {
    throw createError({ statusCode: 404, message: 'Planned workout not found' })
  }

  // Perform Link
  await prisma.$transaction([
    prisma.workout.update({
      where: { id: workoutId },
      data: { plannedWorkoutId }
    }),
    prisma.plannedWorkout.update({
      where: { id: plannedWorkoutId },
      data: { completed: true }
    })
  ])

  return { success: true }
})
