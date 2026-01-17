import { prisma } from '../db'
import { tasks } from '@trigger.dev/sdk/v3'
import { getUserLocalDate, formatUserDate, getStartOfDayUTC, getEndOfDayUTC } from '../date'

/**
 * Training Plan Management Tools
 * Handles planned workouts, availability, and training plan generation
 */

/**
 * Get planned workouts
 */
export async function getPlannedWorkouts(
  userId: string,
  timezone: string,
  args: any
): Promise<any> {
  const startDate = args.start_date
    ? getStartOfDayUTC(timezone, new Date(args.start_date))
    : getUserLocalDate(timezone)

  let endDate: Date
  if (args.end_date) {
    endDate = getEndOfDayUTC(timezone, new Date(args.end_date))
  } else {
    // Default 14 days ahead
    endDate = new Date(startDate)
    endDate.setUTCDate(endDate.getUTCDate() + 14)
    endDate.setUTCHours(23, 59, 59, 999)
  }

  const where: any = {
    userId,
    date: {
      gte: startDate,
      lte: endDate
    }
  }

  if (!args.include_completed) {
    where.completed = false
  }

  const workouts = await prisma.plannedWorkout.findMany({
    where,
    orderBy: { date: 'asc' },
    select: {
      id: true,
      date: true,
      title: true,
      description: true,
      type: true,
      durationSec: true,
      tss: true,
      completed: true,
      syncStatus: true,
      lastSyncedAt: true
    }
  })

  if (workouts.length === 0) {
    return {
      message: 'No planned workouts found for the specified date range',
      date_range: {
        start: formatUserDate(startDate, timezone),
        end: formatUserDate(endDate, timezone)
      }
    }
  }

  return {
    count: workouts.length,
    date_range: {
      start: formatUserDate(startDate, timezone),
      end: formatUserDate(endDate, timezone)
    },
    workouts: workouts.map((w) => ({
      id: w.id,
      date: formatUserDate(w.date, timezone),
      title: w.title,
      description: w.description,
      type: w.type,
      duration_minutes: w.durationSec ? Math.round(w.durationSec / 60) : null,
      tss: w.tss ? Math.round(w.tss) : null,
      completed: w.completed,
      sync_status: w.syncStatus,
      last_synced: w.lastSyncedAt?.toISOString()
    }))
  }
}

/**
 * Create a planned workout
 */
export async function createPlannedWorkout(
  userId: string,
  timezone: string,
  args: any
): Promise<any> {
  const { date, time_of_day, title, description, type, duration_minutes, tss, intensity } = args

  console.log('[createPlannedWorkout] 🚀 Starting with args:', {
    userId,
    date,
    time_of_day,
    title,
    type,
    duration_minutes,
    tss
  })

  if (!date || !title) {
    console.log('[createPlannedWorkout] ❌ Missing required fields')
    return {
      error: 'Date and title are required',
      required_fields: ['date', 'title']
    }
  }

  // Parse date string (YYYY-MM-DD) into UTC midnight for the user's timezone
  // This ensures the workout is stored on the correct calendar day
  const dateParts = date.split('-')
  const localDate = new Date(
    parseInt(dateParts[0]),
    parseInt(dateParts[1]) - 1,
    parseInt(dateParts[2])
  )
  const workoutDate = getStartOfDayUTC(timezone, localDate)

  // Handle time of day logic (set hour on the UTC-aligned date)
  // Note: workoutDate is 00:00 Local (e.g. 05:00 UTC).
  // If we want to set 8am Local, we need to add 8 hours.
  // But wait, getStartOfDayUTC returns the exact timestamp.
  // If user is NY (-5), 00:00 Local = 05:00 UTC.
  // 08:00 Local = 13:00 UTC.
  // So we add 8 hours to the timestamp.
  const timeOfDay = time_of_day || 'morning'
  let hoursToAdd = 8 // Default to 8am

  // Handle different time formats
  if (typeof timeOfDay === 'string') {
    const timeStr = timeOfDay.toLowerCase()

    // Check if it's a specific hour (e.g., "6am", "14", "2pm")
    const hourMatch = timeStr.match(/(\d+)\s*(am|pm)?/)
    if (hourMatch && hourMatch[1]) {
      let hour = parseInt(hourMatch[1])
      const meridiem = hourMatch[2]

      if (meridiem === 'pm' && hour < 12) hour += 12
      if (meridiem === 'am' && hour === 12) hour = 0
      hoursToAdd = hour
    } else {
      // Use preset times
      switch (timeStr) {
        case 'morning':
        case 'early':
          hoursToAdd = 8
          break
        case 'afternoon':
        case 'midday':
        case 'lunch':
          hoursToAdd = 14
          break
        case 'evening':
        case 'night':
          hoursToAdd = 18
          break
      }
    }
  }

  // Apply time offset (in ms)
  workoutDate.setTime(workoutDate.getTime() + hoursToAdd * 3600000)

  console.log('[createPlannedWorkout] ⏰ Scheduled time:', {
    time_of_day: timeOfDay,
    parsed_date: workoutDate.toISOString(),
    hours_added: hoursToAdd
  })

  try {
    // Import sync function
    const { syncPlannedWorkoutToIntervals } = await import('../intervals-sync')
    const { createIntervalsPlannedWorkout } = await import('../intervals')

    // Get Intervals integration
    console.log('[createPlannedWorkout] 🔍 Checking for Intervals.icu integration...')
    const integration = await prisma.integration.findFirst({
      where: { userId, provider: 'intervals' }
    })

    if (!integration) {
      console.log('[createPlannedWorkout] ❌ No Intervals.icu integration found')
      return {
        error: 'No Intervals.icu integration found',
        message: 'Please connect your Intervals.icu account first'
      }
    }

    console.log('[createPlannedWorkout] ✅ Integration found, creating in Intervals.icu...')

    // Create in Intervals.icu first (using parsed workoutDate with time)
    const intervalsWorkout = await createIntervalsPlannedWorkout(integration, {
      date: workoutDate,
      title,
      description: description || '',
      type: type || 'Ride',
      durationSec: duration_minutes ? duration_minutes * 60 : undefined,
      tss,
      managedBy: 'COACH_WATTS'
    })

    console.log('[createPlannedWorkout] ✅ Intervals.icu workout created:', {
      id: intervalsWorkout.id,
      title: intervalsWorkout.name
    })

    // Map intensity string to number
    const intensityMap: Record<string, number> = {
      recovery: 0.5,
      easy: 0.6,
      moderate: 0.75,
      hard: 0.9,
      very_hard: 1.0
    }
    const workIntensity = intensity ? intensityMap[intensity.toLowerCase()] || null : null

    // Create locally (store with time for reference, but Prisma will truncate to date only)
    console.log('[createPlannedWorkout] 💾 Creating in local database...')
    const workout = await prisma.plannedWorkout.create({
      data: {
        userId,
        externalId: intervalsWorkout.id.toString(),
        date: workoutDate,
        title,
        description: description || null,
        type: type || 'Ride',
        category: 'WORKOUT',
        durationSec: duration_minutes ? duration_minutes * 60 : null,
        tss: tss || null,
        workIntensity,
        completed: false,
        syncStatus: 'SYNCED',
        lastSyncedAt: new Date(),
        managedBy: 'COACH_WATTS'
      }
    })

    console.log('[createPlannedWorkout] ✅ SUCCESS: Database record created:', {
      id: workout.id,
      externalId: workout.externalId,
      date: workout.date.toISOString(),
      title: workout.title,
      type: workout.type,
      syncStatus: workout.syncStatus
    })

    const response = {
      success: true,
      message: `Created workout: ${title} for ${date}`,
      workout: {
        id: workout.id,
        date: formatUserDate(workout.date, timezone),
        title: workout.title,
        type: workout.type,
        duration_minutes: workout.durationSec ? Math.round(workout.durationSec / 60) : null,
        tss: workout.tss,
        sync_status: 'SYNCED'
      }
    }

    console.log('[createPlannedWorkout] 📤 Returning success response')
    return response
  } catch (error: any) {
    console.error('[createPlannedWorkout] ❌ ERROR:', {
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join('\n')
    })

    const errorResponse = {
      error: 'Failed to create workout',
      message: error.message,
      details: error.toString()
    }

    console.log('[createPlannedWorkout] 📤 Returning error response:', errorResponse)
    return errorResponse
  }
}

/**
 * Update a planned workout
 */
export async function updatePlannedWorkout(
  userId: string,
  timezone: string,
  args: any
): Promise<any> {
  const { workout_id, date, title, description, type, duration_minutes, tss } = args

  if (!workout_id) {
    return {
      error: 'workout_id is required'
    }
  }

  try {
    // Check if workout exists and belongs to user
    const existing = await prisma.plannedWorkout.findFirst({
      where: { id: workout_id, userId }
    })

    if (!existing) {
      return {
        error: 'Workout not found or does not belong to you'
      }
    }

    // Build update data
    const updateData: any = {}
    if (date !== undefined) {
      const dateParts = date.split('-')
      const localDate = new Date(
        parseInt(dateParts[0]),
        parseInt(dateParts[1]) - 1,
        parseInt(dateParts[2])
      )
      // Keep existing time of day if possible, or default to morning (8am) relative to new date
      // We need to know the offset of the existing date from its day-start?
      // Too complex to recalculate offset accurately across timezones.
      // Reset to 8am local time for simplicity, or just use start of day if time doesn't matter.
      // Planned workouts *should* have a time, but date is more important.
      // Let's set to 8am local.
      const startOfDay = getStartOfDayUTC(timezone, localDate)
      startOfDay.setTime(startOfDay.getTime() + 8 * 3600000)
      updateData.date = startOfDay
    }
    if (title !== undefined) updateData.title = title
    if (description !== undefined) updateData.description = description
    if (type !== undefined) updateData.type = type
    if (duration_minutes !== undefined) updateData.durationSec = duration_minutes * 60
    if (tss !== undefined) updateData.tss = tss

    // Import sync function
    const { syncPlannedWorkoutToIntervals } = await import('../intervals-sync')

    // Update locally first
    const workout = await prisma.plannedWorkout.update({
      where: { id: workout_id },
      data: {
        ...updateData,
        modifiedLocally: true
      }
    })

    // Attempt to sync to Intervals
    const syncResult = await syncPlannedWorkoutToIntervals(
      'UPDATE',
      {
        id: workout.id,
        externalId: workout.externalId,
        date: workout.date,
        title: workout.title,
        description: workout.description,
        type: workout.type,
        durationSec: workout.durationSec,
        tss: workout.tss,
        managedBy: workout.managedBy
      },
      userId
    )

    // Update sync status
    await prisma.plannedWorkout.update({
      where: { id: workout_id },
      data: {
        syncStatus: syncResult.synced ? 'SYNCED' : 'PENDING',
        lastSyncedAt: syncResult.synced ? new Date() : undefined,
        modifiedLocally: !syncResult.synced
      }
    })

    return {
      success: true,
      message: `Updated workout: ${workout.title}`,
      workout: {
        id: workout.id,
        date: formatUserDate(workout.date, timezone),
        title: workout.title,
        type: workout.type,
        sync_status: syncResult.synced ? 'SYNCED' : 'PENDING'
      }
    }
  } catch (error: any) {
    console.error('Error updating planned workout:', error)
    return {
      error: 'Failed to update workout',
      message: error.message
    }
  }
}

/**
 * Delete a planned workout
 */
export async function deletePlannedWorkout(
  userId: string,
  timezone: string,
  args: any
): Promise<any> {
  const { workout_id } = args

  if (!workout_id) {
    return {
      error: 'workout_id is required'
    }
  }

  try {
    const workout = await prisma.plannedWorkout.findFirst({
      where: { id: workout_id, userId }
    })

    if (!workout) {
      return {
        error: 'Workout not found or does not belong to you'
      }
    }

    // Import sync function
    const { syncPlannedWorkoutToIntervals } = await import('../intervals-sync')

    // Attempt to delete from Intervals first
    await syncPlannedWorkoutToIntervals(
      'DELETE',
      {
        id: workout.id,
        externalId: workout.externalId
      },
      userId
    )

    // Delete locally
    await prisma.plannedWorkout.delete({
      where: { id: workout_id }
    })

    return {
      success: true,
      message: `Deleted workout: ${workout.title} (${formatUserDate(workout.date, timezone)})`
    }
  } catch (error: any) {
    console.error('Error deleting planned workout:', error)
    return {
      error: 'Failed to delete workout',
      message: error.message
    }
  }
}

/**
 * Get training availability
 */
export async function getTrainingAvailability(userId: string): Promise<any> {
  const availability = await prisma.trainingAvailability.findMany({
    where: { userId },
    orderBy: { dayOfWeek: 'asc' }
  })

  if (availability.length === 0) {
    return {
      message: 'No training availability set',
      suggestion: 'Use update_training_availability to set your schedule'
    }
  }

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  return {
    availability: availability.map((a) => ({
      day: dayNames[a.dayOfWeek],
      day_of_week: a.dayOfWeek,
      morning: a.morning,
      afternoon: a.afternoon,
      evening: a.evening,
      preferred_types: a.preferredTypes,
      indoor_only: a.indoorOnly,
      outdoor_only: a.outdoorOnly,
      gym_access: a.gymAccess,
      bike_access: a.bikeAccess,
      notes: a.notes
    }))
  }
}

/**
 * Update training availability
 */
export async function updateTrainingAvailability(userId: string, args: any): Promise<any> {
  const {
    day_of_week,
    morning,
    afternoon,
    evening,
    preferred_types,
    indoor_only,
    outdoor_only,
    gym_access,
    bike_access,
    notes
  } = args

  if (day_of_week === undefined || day_of_week < 0 || day_of_week > 6) {
    return {
      error: 'day_of_week must be between 0 (Sunday) and 6 (Saturday)'
    }
  }

  try {
    const updateData: any = {}
    if (morning !== undefined) updateData.morning = morning
    if (afternoon !== undefined) updateData.afternoon = afternoon
    if (evening !== undefined) updateData.evening = evening
    if (preferred_types !== undefined) updateData.preferredTypes = preferred_types
    if (indoor_only !== undefined) updateData.indoorOnly = indoor_only
    if (outdoor_only !== undefined) updateData.outdoorOnly = outdoor_only
    if (gym_access !== undefined) updateData.gymAccess = gym_access
    if (bike_access !== undefined) updateData.bikeAccess = bike_access
    if (notes !== undefined) updateData.notes = notes

    const availability = await prisma.trainingAvailability.upsert({
      where: {
        userId_dayOfWeek: {
          userId,
          dayOfWeek: day_of_week
        }
      },
      create: {
        userId,
        dayOfWeek: day_of_week,
        ...updateData
      },
      update: updateData
    })

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

    return {
      success: true,
      message: `Updated availability for ${dayNames[day_of_week]}`,
      availability: {
        day: dayNames[availability.dayOfWeek],
        morning: availability.morning,
        afternoon: availability.afternoon,
        evening: availability.evening
      }
    }
  } catch (error: any) {
    console.error('Error updating training availability:', error)
    return {
      error: 'Failed to update availability',
      message: error.message
    }
  }
}

/**
 * Generate training plan
 */
export async function generateTrainingPlan(
  userId: string,
  timezone: string,
  args: any
): Promise<any> {
  const { days, start_date, user_confirmed } = args

  if (!user_confirmed) {
    return {
      message: 'Training plan generation requires user confirmation',
      instruction:
        'Please ask the user to confirm they want to generate a training plan. Once confirmed, call this tool again with user_confirmed=true',
      confirmation_required: true,
      parameters: args
    }
  }

  try {
    const daysToPlann = days || 7
    let startDate: Date

    if (start_date) {
      // Parse YYYY-MM-DD to UTC midnight user time
      const dateParts = start_date.split('-')
      const localDate = new Date(
        parseInt(dateParts[0]),
        parseInt(dateParts[1]) - 1,
        parseInt(dateParts[2])
      )
      startDate = getStartOfDayUTC(timezone, localDate)
    } else {
      // Default: Tomorrow
      startDate = getUserLocalDate(timezone)
      startDate.setUTCDate(startDate.getUTCDate() + 1)
    }

    // Trigger the plan generation job with per-user concurrency
    const handle = await tasks.trigger(
      'generate-weekly-plan',
      {
        userId,
        startDate,
        daysToPlann
      },
      {
        concurrencyKey: userId
      }
    )

    return {
      success: true,
      message: `Training plan generation started! It may take a minute or two to complete.`,
      job_id: handle.id,
      details: {
        days: daysToPlann,
        start_date: formatUserDate(startDate, timezone)
      }
    }
  } catch (error: any) {
    console.error('Failed to trigger training plan generation:', error)
    return {
      error: 'Failed to start plan generation',
      message: error.message
    }
  }
}

/**
 * Get current training plan
 */
export async function getCurrentPlan(userId: string, timezone: string): Promise<any> {
  // Find start of current week relative to user
  const today = getUserLocalDate(timezone)
  const currentWeekStart = new Date(today)

  // getUTCDay() since it's a UTC-aligned date
  const day = currentWeekStart.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day // adjust to Monday
  currentWeekStart.setUTCDate(currentWeekStart.getUTCDate() + diff)

  // Get active or most recent plan
  const plan = await prisma.weeklyTrainingPlan.findFirst({
    where: {
      userId,
      weekStartDate: {
        lte: currentWeekStart
      }
    },
    orderBy: [{ status: 'asc' }, { weekStartDate: 'desc' }]
  })

  if (!plan) {
    return {
      message: 'No training plan found',
      suggestion: 'Use generate_training_plan to create one'
    }
  }

  const planJson = plan.planJson as any

  return {
    plan: {
      id: plan.id,
      week_start: formatUserDate(plan.weekStartDate, timezone),
      week_end: formatUserDate(plan.weekEndDate, timezone),
      days_planned: plan.daysPlanned,
      status: plan.status,
      total_tss: plan.totalTSS,
      workout_count: plan.workoutCount,
      summary: planJson?.weekSummary,
      days: planJson?.days || [],
      generated_at: formatUserDate(plan.createdAt, timezone),
      model_version: plan.modelVersion
    }
  }
}

/**
 * Get detailed information about a specific planned workout
 */
export async function getPlannedWorkoutDetails(
  userId: string,
  timezone: string,
  args: any
): Promise<any> {
  const { workout_id } = args

  if (!workout_id) {
    return { error: 'workout_id is required' }
  }

  const workout = await prisma.plannedWorkout.findFirst({
    where: { id: workout_id, userId },
    include: {
      trainingWeek: {
        include: {
          block: {
            include: {
              plan: {
                include: {
                  goal: true
                }
              }
            }
          }
        }
      }
    }
  })

  if (!workout) {
    return { error: 'Planned workout not found' }
  }

  return {
    id: workout.id,
    date: formatUserDate(workout.date, timezone),
    title: workout.title,
    description: workout.description,
    type: workout.type,
    category: workout.category,
    duration_minutes: workout.durationSec ? Math.round(workout.durationSec / 60) : null,
    tss: workout.tss,
    intensity: workout.workIntensity,
    completed: workout.completed,
    sync_status: workout.syncStatus,
    managed_by: workout.managedBy,
    structured_workout: workout.structuredWorkout,
    context: workout.trainingWeek
      ? {
          plan_name:
            workout.trainingWeek.block.plan.name || workout.trainingWeek.block.plan.goal?.title,
          block_name: workout.trainingWeek.block.name,
          week_number: workout.trainingWeek.weekNumber,
          week_focus: workout.trainingWeek.focus || workout.trainingWeek.block.primaryFocus
        }
      : null
  }
}
