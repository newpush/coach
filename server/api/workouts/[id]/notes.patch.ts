import { getServerSession } from '#auth'

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
    throw createError({
      statusCode: 400,
      message: 'Workout ID is required'
    })
  }

  const body = await readBody(event)
  const { notes } = body

  if (typeof notes !== 'string' && notes !== null) {
    throw createError({
      statusCode: 400,
      message: 'Notes must be a string or null'
    })
  }

  // Verify the workout belongs to the user
  const workout = await prisma.workout.findUnique({
    where: { id: workoutId },
    select: { userId: true }
  })

  if (!workout) {
    throw createError({
      statusCode: 404,
      message: 'Workout not found'
    })
  }

  if (workout.userId !== (session.user as any).id) {
    throw createError({
      statusCode: 403,
      message: 'You do not have permission to update this workout'
    })
  }

  // Update the workout notes
  const updatedWorkout = await prisma.workout.update({
    where: { id: workoutId },
    data: {
      notes: notes,
      notesUpdatedAt: new Date()
    },
    select: {
      id: true,
      notes: true,
      notesUpdatedAt: true
    }
  })

  return {
    success: true,
    workout: updatedWorkout
  }
})