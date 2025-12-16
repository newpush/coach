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
  
  const dateParam = getRouterParam(event, 'date')
  if (!dateParam) {
    throw createError({
      statusCode: 400,
      message: 'Date parameter is required'
    })
  }
  
  const date = new Date(dateParam)
  if (isNaN(date.getTime())) {
    throw createError({
      statusCode: 400,
      message: 'Invalid date format'
    })
  }
  
  const userId = (session.user as any).id
  
  // Try to get wellness data first
  const wellness = await wellnessRepository.findFirst(userId, { date })
  
  // Fall back to daily metrics if wellness not found
  if (!wellness) {
    const dailyMetric = await prisma.dailyMetric.findFirst({
      where: {
        userId,
        date
      }
    })
    
    if (dailyMetric) {
      return {
        hrv: dailyMetric.hrv,
        restingHr: dailyMetric.restingHr,
        sleepScore: dailyMetric.sleepScore,
        hoursSlept: dailyMetric.hoursSlept,
        recoveryScore: dailyMetric.recoveryScore,
        weight: null
      }
    }
    
    return null
  }
  
  // Return wellness data
  return {
    hrv: wellness.hrv,
    restingHr: wellness.restingHr,
    sleepScore: wellness.sleepQuality ?? wellness.sleepScore,
    hoursSlept: wellness.sleepHours,
    recoveryScore: wellness.recoveryScore,
    weight: wellness.weight,
    soreness: wellness.soreness,
    fatigue: wellness.fatigue,
    stress: wellness.stress,
    mood: wellness.mood,
    motivation: wellness.motivation,
    readiness: wellness.readiness
  }
})