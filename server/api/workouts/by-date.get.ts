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
  const date = query.date as string
  
  if (!date) {
    throw createError({
      statusCode: 400,
      message: 'Date parameter is required'
    })
  }
  
  try {
    const userId = (session.user as any).id
    
    // Parse the date and get start/end of day
    const targetDate = new Date(date)
    const startOfDay = new Date(targetDate)
    startOfDay.setHours(0, 0, 0, 0)
    
    const endOfDay = new Date(targetDate)
    endOfDay.setHours(23, 59, 59, 999)
    
    // Fetch workouts for that day that are not duplicates
    const workouts = await prisma.workout.findMany({
      where: {
        userId,
        date: {
          gte: startOfDay,
          lte: endOfDay
        },
        isDuplicate: false
      },
      orderBy: {
        date: 'asc'
      },
      select: {
        id: true,
        title: true,
        type: true,
        date: true,
        durationSec: true,
        distanceMeters: true,
        tss: true,
        source: true,
        plannedWorkoutId: true
      }
    })
    
    return workouts
  } catch (error: any) {
    console.error('Error fetching workouts by date:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to fetch workouts'
    })
  }
})