import { getServerSession } from '#auth'
import { prisma } from '../../utils/db'

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
  const startDate = query.startDate ? new Date(query.startDate as string) : new Date()
  
  const where: any = {
    userId: (session.user as any).id,
    date: {
      gte: startDate
    }
  }
  
  const plannedWorkouts = await prisma.plannedWorkout.findMany({
    where,
    orderBy: { date: 'asc' },
    take: limit
  })
  
  return plannedWorkouts
})