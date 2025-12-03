import { getServerSession } from '#auth'
import { prisma } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  
  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const query = getQuery(event)
  const days = parseInt(query.days as string) || 30
  
  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  })
  
  if (!user) {
    throw createError({
      statusCode: 404,
      message: 'User not found'
    })
  }

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  
  const workouts = await prisma.workout.findMany({
    where: {
      userId: user.id,
      date: {
        gte: startDate
      },
      overallScore: {
        not: null
      }
    },
    select: {
      id: true,
      date: true,
      title: true,
      type: true,
      overallScore: true,
      technicalScore: true,
      effortScore: true,
      pacingScore: true,
      executionScore: true
    },
    orderBy: {
      date: 'asc'
    }
  })
  
  return {
    workouts,
    summary: {
      total: workouts.length,
      avgOverall: workouts.reduce((sum: number, w) => sum + (w.overallScore || 0), 0) / workouts.length || 0,
      avgTechnical: workouts.reduce((sum: number, w) => sum + (w.technicalScore || 0), 0) / workouts.length || 0,
      avgEffort: workouts.reduce((sum: number, w) => sum + (w.effortScore || 0), 0) / workouts.length || 0,
      avgPacing: workouts.reduce((sum: number, w) => sum + (w.pacingScore || 0), 0) / workouts.length || 0,
      avgExecution: workouts.reduce((sum: number, w) => sum + (w.executionScore || 0), 0) / workouts.length || 0
    }
  }
})