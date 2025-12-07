import { prisma } from '../db'

/**
 * Training Plan Management Tools
 * Handles planned workouts, availability, and training plan generation
 */

/**
 * Get planned workouts
 */
export async function getPlannedWorkouts(userId: string, args: any): Promise<any> {
  const startDate = args.start_date ? new Date(args.start_date) : new Date()
  startDate.setHours(0, 0, 0, 0)
  
  const endDate = args.end_date ? new Date(args.end_date) : new Date(startDate)
  if (!args.end_date) {
    endDate.setDate(endDate.getDate() + 14) // Default 14 days ahead
  }
  endDate.setHours(23, 59, 59, 999)
  
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
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      }
    }
  }
  
  return {
    count: workouts.length,
    date_range: {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0]
    },
    workouts: workouts.map(w => ({
      id: w.id,
      date: w.date.toISOString().split('T')[0],
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
export async function createPlannedWorkout(userId: string, args: any): Promise<any> {
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
  
  // Parse time of day - default to 8am (morning) if not specified
  let workoutDate = new Date(date)
  const timeOfDay = time_of_day || 'morning'
  
  // Handle different time formats
  if (typeof timeOfDay === 'string') {
    const timeStr = timeOfDay.toLowerCase()
    
    // Check if it's a specific hour (e.g., "6am", "14", "2pm")
    const hourMatch = timeStr.match(/(\d+)\s*(am|pm)?/)
    if (hourMatch) {
      let hour = parseInt(hourMatch[1])
      const meridiem = hourMatch[2]
      
      if (meridiem === 'pm' && hour < 12) hour += 12
      if (meridiem === 'am' && hour === 12) hour = 0
      
      workoutDate.setHours(hour, 0, 0, 0)
    } else {
      // Use preset times
      switch (timeStr) {
        case 'morning':
        case 'early':
          workoutDate.setHours(8, 0, 0, 0)
          break
        case 'afternoon':
        case 'midday':
        case 'lunch':
          workoutDate.setHours(14, 0, 0, 0)
          break
        case 'evening':
        case 'night':
          workoutDate.setHours(18, 0, 0, 0)
          break
        default:
          workoutDate.setHours(8, 0, 0, 0) // Default to morning
      }
    }
  } else {
    workoutDate.setHours(8, 0, 0, 0) // Default to morning
  }
  
  console.log('[createPlannedWorkout] ⏰ Scheduled time:', {
    time_of_day: timeOfDay,
    parsed_date: workoutDate.toISOString(),
    hour: workoutDate.getHours()
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
      tss
    })
    
    console.log('[createPlannedWorkout] ✅ Intervals.icu workout created:', {
      id: intervalsWorkout.id,
      title: intervalsWorkout.name
    })
    
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
        workIntensity: intensity || null,
        completed: false,
        syncStatus: 'SYNCED',
        lastSyncedAt: new Date()
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
        date: workout.date.toISOString().split('T')[0],
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
export async function updatePlannedWorkout(userId: string, args: any): Promise<any> {
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
    if (date !== undefined) updateData.date = new Date(date)
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
    const syncResult = await syncPlannedWorkoutToIntervals('UPDATE', {
      id: workout.id,
      externalId: workout.externalId,
      date: workout.date,
      title: workout.title,
      description: workout.description,
      type: workout.type,
      durationSec: workout.durationSec,
      tss: workout.tss
    }, userId)
    
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
        date: workout.date.toISOString().split('T')[0],
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
export async function deletePlannedWorkout(userId: string, args: any): Promise<any> {
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
    await syncPlannedWorkoutToIntervals('DELETE', {
      id: workout.id,
      externalId: workout.externalId
    }, userId)
    
    // Delete locally
    await prisma.plannedWorkout.delete({
      where: { id: workout_id }
    })
    
    return {
      success: true,
      message: `Deleted workout: ${workout.title} (${workout.date.toISOString().split('T')[0]})`
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
    availability: availability.map(a => ({
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
  const { day_of_week, morning, afternoon, evening, preferred_types, indoor_only, outdoor_only, gym_access, bike_access, notes } = args
  
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
export async function generateTrainingPlan(userId: string, args: any): Promise<any> {
  return {
    message: 'Training plan generation requires user confirmation',
    instruction: 'Please ask the user to confirm they want to generate a training plan, then trigger the /api/plans/generate endpoint',
    confirmation_required: true,
    parameters: args
  }
}

/**
 * Get current training plan
 */
export async function getCurrentPlan(userId: string): Promise<any> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  // Get the start of the current week (Monday)
  const currentWeekStart = new Date(today)
  const day = currentWeekStart.getDay()
  const diff = currentWeekStart.getDate() - day + (day === 0 ? -6 : 1)
  currentWeekStart.setDate(diff)
  
  // Get active or most recent plan
  const plan = await prisma.weeklyTrainingPlan.findFirst({
    where: {
      userId,
      weekStartDate: {
        lte: currentWeekStart
      }
    },
    orderBy: [
      { status: 'asc' },
      { weekStartDate: 'desc' }
    ]
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
      week_start: plan.weekStartDate.toISOString().split('T')[0],
      week_end: plan.weekEndDate.toISOString().split('T')[0],
      days_planned: plan.daysPlanned,
      status: plan.status,
      total_tss: plan.totalTSS,
      workout_count: plan.workoutCount,
      summary: planJson?.weekSummary,
      days: planJson?.days || [],
      generated_at: plan.createdAt.toISOString(),
      model_version: plan.modelVersion
    }
  }
}