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
  
  const workout = await workoutRepository.getById(id, (session.user as any).id, {
    include: {
      streams: true
    }
  })
  
  if (!workout) {
    throw createError({
      statusCode: 404,
      message: 'Workout not found'
    })
  }
  
  return workout
})