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
  const limit = query.limit ? parseInt(query.limit as string) : 10
  const startDate = query.startDate ? new Date(query.startDate as string) : undefined
  const endDate = query.endDate ? new Date(query.endDate as string) : undefined
  
  const where: any = {
    userId: (session.user as any).id,
    durationSec: { gt: 0 }  // Filter out workouts without duration
  }
  
  if (startDate || endDate) {
    where.date = {}
    if (startDate) where.date.gte = startDate
    if (endDate) where.date.lte = endDate
  }
  
  const workouts = await prisma.workout.findMany({
    where,
    orderBy: { date: 'desc' },
    take: limit
  })
  
  return workouts
})