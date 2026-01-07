import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['Wellness'],
    summary: 'Get wellness by ID or Date',
    description: 'Returns a wellness record by ID or Date.',
    parameters: [
      {
        name: 'param',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'UUID or Date (YYYY-MM-DD)'
      }
    ],
    responses: {
      200: { description: 'Success' },
      400: { description: 'Invalid format' },
      401: { description: 'Unauthorized' },
      403: { description: 'Access denied' },
      404: { description: 'Not found' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  
  if (!session?.user) {
    throw createError({ 
      statusCode: 401,
      message: 'Unauthorized' 
    })
  }
  
  const param = getRouterParam(event, 'param')
  if (!param) {
    throw createError({
      statusCode: 400,
      message: 'Parameter is required'
    })
  }

  const userId = (session.user as any).id
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(param)

  if (isUuid) {
    // --- ID Lookup Logic ---
    const wellness = await prisma.wellness.findUnique({
      where: { id: param }
    })

    if (!wellness) {
      throw createError({
        statusCode: 404,
        message: 'Wellness data not found'
      })
    }

    if (wellness.userId !== userId) {
      throw createError({
        statusCode: 403,
        message: 'Access denied'
      })
    }

    return wellness
  } else {
    // --- Date Lookup Logic ---
    const date = new Date(param)
    if (isNaN(date.getTime())) {
      throw createError({
        statusCode: 400,
        message: 'Invalid date format'
      })
    }
    
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
    
    // Return wellness data with selected fields (preserving original behavior of [date].get.ts)
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
  }
})
