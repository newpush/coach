import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'
import {
  getUserLocalDate,
  getUserTimezone,
  getStartOfDayUTC,
  getEndOfDayUTC
} from '../../utils/date'

defineRouteMeta({
  openAPI: {
    tags: ['Calendar'],
    summary: 'Get calendar activities',
    description:
      'Returns a combined list of completed and planned workouts, along with nutrition and wellness data.',
    parameters: [
      {
        name: 'startDate',
        in: 'query',
        required: true,
        schema: { type: 'string', format: 'date-time' }
      },
      {
        name: 'endDate',
        in: 'query',
        required: true,
        schema: { type: 'string', format: 'date-time' }
      }
    ],
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  title: { type: 'string' },
                  date: { type: 'string', format: 'date-time' },
                  type: { type: 'string' },
                  source: { type: 'string' },
                  status: { type: 'string' },
                  duration: { type: 'integer' },
                  tss: { type: 'number', nullable: true },
                  nutrition: { type: 'object', nullable: true },
                  wellness: { type: 'object', nullable: true }
                }
              }
            }
          }
        }
      },
      400: { description: 'Invalid date parameters' },
      401: { description: 'Unauthorized' }
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
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true }
  })
  const timezone = user?.timezone ?? 'UTC'
  const today = getUserLocalDate(timezone)

  // Adjust dates to cover the full local days in UTC
  // We assume the input dates (YYYY-MM-DD) represent local calendar days
  // So we convert them to the corresponding UTC range
  const rangeStart = getStartOfDayUTC(timezone, startDate)
  const rangeEnd = getEndOfDayUTC(timezone, endDate)

  // Fetch nutrition data for the date range
  const nutrition = await nutritionRepository.getForUser(userId, {
    startDate: rangeStart,
    endDate: rangeEnd,
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
  const wellness = await wellnessRepository.getForUser(userId, {
    startDate: rangeStart,
    endDate: rangeEnd,
    orderBy: { date: 'asc' }
  })

  // Fetch daily metrics data for the date range
  const dailyMetrics = await prisma.dailyMetric.findMany({
    where: {
      userId,
      date: {
        gte: rangeStart,
        lte: rangeEnd
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
  const workouts = await workoutRepository.getForUser(userId, {
    startDate: rangeStart,
    endDate: rangeEnd,
    orderBy: { date: 'asc' },
    include: {
      plannedWorkout: true,
      streams: {
        select: { id: true }
      }
    }
  })

  // Fetch planned workouts
  const plannedWorkouts = await prisma.plannedWorkout.findMany({
    where: {
      userId,
      date: {
        gte: rangeStart,
        lte: rangeEnd
      }
    },
    orderBy: { date: 'asc' }
  })

  // Fetch calendar notes
  const calendarNotes = await calendarNoteRepository.getForUser(userId, {
    startDate: rangeStart,
    endDate: rangeEnd,
    orderBy: { startDate: 'asc' }
  })

  // Create a set of plannedWorkoutIds that are already represented by completed workouts
  // We'll use this to mark them as linked or hide them if we only want them nested
  const completedPlannedIds = new Set(workouts.map((w) => w.plannedWorkoutId).filter(Boolean))

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
      hasStreams: !!(w as any).streams,

      // Planned workout link
      plannedWorkoutId: w.plannedWorkoutId,
      linkedPlannedWorkout: (w as any).plannedWorkout
        ? {
            id: (w as any).plannedWorkout.id,
            title: (w as any).plannedWorkout.title,
            duration: (w as any).plannedWorkout.durationSec,
            tss: (w as any).plannedWorkout.tss,
            type: (w as any).plannedWorkout.type
          }
        : null,

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
    // Skip planned workouts that are already completed and linked to an actual workout
    if (completedPlannedIds.has(p.id)) continue

    // Determine status
    let status = 'planned'
    if (p.completed) status = 'completed_plan'

    // Use UTC midnight as the source of truth for planned workouts
    const workoutDate = new Date(p.date)
    workoutDate.setUTCHours(0, 0, 0, 0)

    // Check if missed (in past and not completed)
    const planDate = new Date(p.date)
    planDate.setUTCHours(0, 0, 0, 0)

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
      date: workoutDate.toISOString(),
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
      structuredWorkout: p.structuredWorkout,

      // Nutrition data for this date (will be same for all activities on the same day)
      nutrition: nutritionByDate.get(dateKey) || null,

      // Wellness data for this date
      wellness: wellnessByDate.get(dateKey) || null
    })
  }

  // Process Calendar Notes
  for (const n of calendarNotes) {
    const dateKey = n.startDate.toISOString().split('T')[0]
    if (!activitiesByDate.has(dateKey)) {
      activitiesByDate.set(dateKey, [])
    }
    activitiesByDate.get(dateKey).push({
      id: n.id,
      title: n.title,
      date: n.startDate.toISOString(),
      endDate: n.endDate?.toISOString(),
      isWeeklyNote: n.isWeeklyNote,
      type: n.type || 'Note',
      category: n.category,
      source: 'note',
      status: 'note',
      description: n.description,

      // Nutrition data for this date
      nutrition: nutritionByDate.get(dateKey) || null,

      // Wellness data for this date
      wellness: wellnessByDate.get(dateKey) || null
    })
  }

  // Ensure days with only wellness or nutrition data are included
  const allDates = new Set([...wellnessByDate.keys(), ...nutritionByDate.keys()])
  for (const dateKey of allDates) {
    if (!activitiesByDate.has(dateKey)) {
      const date = new Date(dateKey)
      activitiesByDate.set(dateKey, [
        {
          id: dateKey,
          title: 'Wellness',
          date: date.toISOString(),
          type: 'wellness',
          source: 'wellness',
          status: 'completed',
          nutrition: nutritionByDate.get(dateKey) || null,
          wellness: wellnessByDate.get(dateKey) || null
        }
      ])
    }
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
