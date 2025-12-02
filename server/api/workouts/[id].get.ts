import { getServerSession } from '#auth'

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
    throw createError({
      statusCode: 400,
      message: 'Workout ID is required'
    })
  }
  
  const workout = await prisma.workout.findUnique({
    where: {
      id
    }
  })
  
  if (!workout) {
    throw createError({
      statusCode: 404,
      message: 'Workout not found'
    })
  }
  
  // Ensure the workout belongs to the authenticated user
  if (workout.userId !== (session.user as any).id) {
    throw createError({
      statusCode: 403,
      message: 'Forbidden: You do not have access to this workout'
    })
  }
  
  return workout
})