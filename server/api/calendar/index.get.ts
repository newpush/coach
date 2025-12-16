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
  const startDate = query.startDate ? new Date(query.startDate as string) : new Date()
  const endDate = query.endDate ? new Date(query.endDate as string) : new Date()
  
  // Ensure valid dates
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw createError({
      statusCode: 400,
      message: 'Invalid date parameters'
    })
  }
  
  const userId = (session.user as any).id
  
  // Fetch nutrition data for the date range
  const nutrition = await prisma.nutrition.findMany({
    where: {
      userId,
      date: {
        gte: startDate,
        lte: endDate
      }
    },
    orderBy: { date: 'asc' }
  })
  
  // Create a map of nutrition data by date (YYYY-MM-DD)
  const nutritionByDate = new Map()
  for (const n of nutrition) {
    const dateKey = n.date.toISOString().split('T')[0]
    nutritionByDate.set(dateKey, {
      calories: n.calories,
      protein: n.protein,
      carbs: n.carbs,
      fat: n.fat,
      caloriesGoal: n.caloriesGoal,
      proteinGoal: n.proteinGoal,
      carbsGoal: n.carbsGoal,
      fatGoal: n.fatGoal
    })
  }
  
  // Fetch wellness data for the date range
  const wellness = await prisma.wellness.findMany({
    where: {
      userId,
      date: {
        gte: startDate,
        lte: endDate
      }
    },
    orderBy: { date: 'asc' }
  })
  
  // Fetch daily metrics data for the date range
  const dailyMetrics = await prisma.dailyMetric.findMany({
    where: {
      userId,
      date: {
        gte: startDate,
        lte: endDate
      }
    },
    orderBy: { date: 'asc' }
  })
  
  // Create a map of wellness data by date (YYYY-MM-DD)
  // Prefer Wellness data, fallback to DailyMetric
  const wellnessByDate = new Map()
  for (const d of dailyMetrics) {
    const dateKey = d.date.toISOString().split('T')[0]
    wellnessByDate.set(dateKey, {
      hrv: d.hrv,
      restingHr: d.restingHr,
      sleepScore: d.sleepScore,
      hoursSlept: d.hoursSlept,
      recoveryScore: d.recoveryScore,
      weight: null
    })
  }
  for (const w of wellness) {
    const dateKey = w.date.toISOString().split('T')[0]
    const existing = wellnessByDate.get(dateKey) || {}
    wellnessByDate.set(dateKey, {
      hrv: w.hrv ?? existing.hrv,
      restingHr: w.restingHr ?? existing.restingHr,
      sleepScore: w.sleepQuality ?? w.sleepScore ?? existing.sleepScore,
      hoursSlept: w.sleepHours ?? existing.hoursSlept,
      recoveryScore: w.recoveryScore ?? existing.recoveryScore,
      weight: w.weight ?? existing.weight
    })
  }
  
  // Fetch completed workouts
  const workouts = await prisma.workout.findMany({
    where: {
      userId,
      date: {
        gte: startDate,
        lte: endDate
      },
      durationSec: { gt: 0 }, // Filter out empty workouts
      isDuplicate: false
    },
    orderBy: { date: 'asc' }
  })
  
  // Fetch planned workouts
  const plannedWorkouts = await prisma.plannedWorkout.findMany({
    where: {
      userId,
      date: {
        gte: startDate,
        lte: endDate
      }
    },
    orderBy: { date: 'asc' }
  })
  
  // Group activities by date for nutrition injection
  const activitiesByDate = new Map()
  
  // Process Completed Workouts
  for (const w of workouts) {
    const dateKey = w.date.toISOString().split('T')[0]
    if (!activitiesByDate.has(dateKey)) {
      activitiesByDate.set(dateKey, [])
    }
    activitiesByDate.get(dateKey).push({
      id: w.id,
      title: w.title,
      date: w.date.toISOString(),
      type: w.type || 'Activity',
      source: 'completed',
      status: 'completed',
      
      // Metrics
      duration: w.durationSec,
      distance: w.distanceMeters,
      tss: w.tss,
      trainingLoad: w.trainingLoad, // icu_training_load
      trimp: w.trimp,
      intensity: w.intensity,
      averageHr: w.averageHr,
      
      // Power Metrics
      averageWatts: w.averageWatts,
      normalizedPower: w.normalizedPower,
      weightedAvgWatts: w.weightedAvgWatts,
      kilojoules: w.kilojoules,
      
      // Training Stress Metrics
      ctl: w.ctl,
      atl: w.atl,
      
      // Completed specific
      rpe: w.rpe,
      sessionRpe: w.sessionRpe,
      feel: w.feel,
      
      // Energy & Time
      calories: w.calories,
      elapsedTime: w.elapsedTimeSec,
      
      // Device & Metadata
      deviceName: w.deviceName,
      commute: w.commute,
      isPrivate: w.isPrivate,
      gearId: w.gearId,
      
      // Planned workout link
      plannedWorkoutId: w.plannedWorkoutId,
      
      // Original IDs for linking
      originalId: w.id,
      
      // Nutrition data for this date (will be same for all activities on the same day)
      nutrition: nutritionByDate.get(dateKey) || null,
      
      // Wellness data for this date
      wellness: wellnessByDate.get(dateKey) || null
    })
  }
  
  // Process Planned Workouts
  for (const p of plannedWorkouts) {
    // Determine status
    let status = 'planned'
    if (p.completed) status = 'completed_plan'
    
    // Check if missed (in past and not completed)
    const planDate = new Date(p.date)
    const now = new Date()
    // Reset times for comparison
    planDate.setHours(0,0,0,0)
    const today = new Date()
    today.setHours(0,0,0,0)
    
    if (!p.completed && planDate < today) {
      status = 'missed'
    }
    
    const dateKey = p.date.toISOString().split('T')[0]
    if (!activitiesByDate.has(dateKey)) {
      activitiesByDate.set(dateKey, [])
    }
    activitiesByDate.get(dateKey).push({
      id: p.id,
      title: p.title,
      date: p.date.toISOString(),
      type: p.type || 'Workout',
      source: 'planned',
      status: status,
      
      // Metrics (planned)
      duration: p.durationSec || 0,
      distance: p.distanceMeters,
      tss: p.tss,
      intensity: p.workIntensity,
      
      // Planned specific
      plannedDuration: p.durationSec,
      plannedDistance: p.distanceMeters,
      plannedTss: p.tss,
      
      // Nutrition data for this date (will be same for all activities on the same day)
      nutrition: nutritionByDate.get(dateKey) || null,
      
      // Wellness data for this date
      wellness: wellnessByDate.get(dateKey) || null
    })
  }
  
  // Flatten activities array and ensure nutrition and wellness are attached to all activities
  const activities = []
  for (const [dateKey, dateActivities] of activitiesByDate.entries()) {
    const nutritionData = nutritionByDate.get(dateKey) || null
    const wellnessData = wellnessByDate.get(dateKey) || null
    for (const activity of dateActivities) {
      activities.push({
        ...activity,
        nutrition: nutritionData,
        wellness: wellnessData
      })
    }
  }
  
  return activities
})