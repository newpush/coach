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
  const workout = await workoutRepository.getById(workoutId, (session.user as any).id)

  if (!workout) {
    throw createError({
      statusCode: 404,
      message: 'Workout not found'
    })
  }

  // Update the workout notes
  // Note: Repository update doesn't support 'select' yet, so we use full return or add support
  // Let's assume full object return is fine or we should modify the repo.
  // The client likely expects just the updated fields or the full object.
  // Given the API contract returns { workout: updatedWorkout }, full object is safe.
  const updatedWorkout = await workoutRepository.update(workoutId, {
    notes: notes,
    notesUpdatedAt: new Date()
  })

  return {
    success: true,
    workout: updatedWorkout
  }
})