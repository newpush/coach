import { getServerSession } from '#auth'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  
  if (!session?.user) {
    throw createError({ 
      statusCode: 401,
      message: 'Unauthorized' 
    })
  }
  
  const query = getQuery(event)
  const limit = query.limit ? parseInt(query.limit as string) : undefined
  const startDate = query.startDate ? new Date(query.startDate as string) : undefined
  const endDate = query.endDate ? new Date(query.endDate as string) : undefined
  const includeDuplicates = query.includeDuplicates === 'true'

  const workouts = await workoutRepository.getForUser((session.user as any).id, {
    startDate,
    endDate,
    limit,
    includeDuplicates,
    include: {
      streams: {
        select: {
          id: true
        }
      }
    }
  })
  
  return workouts
})