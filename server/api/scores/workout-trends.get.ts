import { getServerSession } from '#auth'
import { prisma } from '../../utils/db'
import { workoutRepository } from '../../utils/repositories/workoutRepository'
import { defineEventHandler, createError, getQuery } from 'h3'
import { eachDayOfInterval, format, isSameDay } from 'date-fns'

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

  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  
  const workouts = await workoutRepository.getForUser(user.id, {
    startDate,
    orderBy: { date: 'asc' }
  })

  // Fill in missing days for smoother trends
  const filledWorkouts = []
  const allDays = eachDayOfInterval({ start: startDate, end: endDate })
  
  // Initialize with the first available non-zero value to avoid starting at 0
  // If no data exists in the period, it defaults to 0
  let lastOverall = workouts.find(w => w.overallScore)?.overallScore || 0
  let lastTechnical = workouts.find(w => w.technicalScore)?.technicalScore || 0
  let lastEffort = workouts.find(w => w.effortScore)?.effortScore || 0
  let lastPacing = workouts.find(w => w.pacingScore)?.pacingScore || 0
  let lastExecution = workouts.find(w => w.executionScore)?.executionScore || 0

  for (const day of allDays) {
    const workoutOnDay = workouts.find(w => isSameDay(new Date(w.date), day))
    
    if (workoutOnDay) {
      // If the workout has a score, update the running "last" value
      // If it doesn't (null/0), keep the previous value (carry forward)
      lastOverall = workoutOnDay.overallScore || lastOverall
      lastTechnical = workoutOnDay.technicalScore || lastTechnical
      lastEffort = workoutOnDay.effortScore || lastEffort
      lastPacing = workoutOnDay.pacingScore || lastPacing
      lastExecution = workoutOnDay.executionScore || lastExecution
      
      // Push a new object with the potentially backfilled scores
      // limiting to the fields we need to avoid circular refs or massive payloads
      filledWorkouts.push({
        ...workoutOnDay,
        overallScore: lastOverall,
        technicalScore: lastTechnical,
        effortScore: lastEffort,
        pacingScore: lastPacing,
        executionScore: lastExecution
      })
    } else {
      // Create a "ghost" workout entry for charting continuity
      // We only include the scores for the trend line
      filledWorkouts.push({
        date: day,
        overallScore: lastOverall,
        technicalScore: lastTechnical,
        effortScore: lastEffort,
        pacingScore: lastPacing,
        executionScore: lastExecution,
        isGhost: true // Flag to identify synthesized data
      })
    }
  }
  
  return {
    workouts: filledWorkouts,
    summary: {
      total: workouts.length,
      avgOverall: workouts.reduce((sum: number, w: any) => sum + (w.overallScore || 0), 0) / (workouts.length || 1),
      avgTechnical: workouts.reduce((sum: number, w: any) => sum + (w.technicalScore || 0), 0) / (workouts.length || 1),
      avgEffort: workouts.reduce((sum: number, w: any) => sum + (w.effortScore || 0), 0) / (workouts.length || 1),
      avgPacing: workouts.reduce((sum: number, w: any) => sum + (w.pacingScore || 0), 0) / (workouts.length || 1),
      avgExecution: workouts.reduce((sum: number, w: any) => sum + (w.executionScore || 0), 0) / (workouts.length || 1)
    }
  }
})