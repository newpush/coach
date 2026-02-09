import { addMinutes, startOfDay, endOfDay } from 'date-fns'

export type WindowType =
  | 'PRE_WORKOUT'
  | 'INTRA_WORKOUT'
  | 'POST_WORKOUT'
  | 'TRANSITION'
  | 'DAILY_BASE'
  | 'WORKOUT_EVENT'

export interface TimelineItem {
  id: string
  name: string
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  logged_at?: string
  source?: string
}

export interface FuelingTimelineWindow {
  type: WindowType
  startTime: Date
  endTime: Date
  targetCarbs: number
  targetProtein: number
  targetFat: number
  targetFluid?: number
  targetSodium?: number
  description: string
  items: any[]
  plannedWorkoutId?: string
  workoutTitle?: string
  workout?: any // The full PlannedWorkout object
  fuelState?: number
  supplements?: string[]
}

export interface TimelineOptions {
  preWorkoutWindow: number // minutes
  postWorkoutWindow: number // minutes
  baseProteinPerKg: number
  baseFatPerKg: number
  weight: number
}

function getWorkoutDate(workout: any): number {
  if (workout.startTime) {
    // If startTime is HH:mm string
    if (typeof workout.startTime === 'string' && workout.startTime.includes(':')) {
      const [h, m] = workout.startTime.split(':').map(Number)
      const d = new Date(workout.date)
      d.setUTCHours(h || 0, m || 0, 0, 0)
      return d.getTime()
    }
    // If it's already a full date
    return new Date(workout.startTime).getTime()
  }
  // Default to 10am UTC for consistency with calculator
  const d = new Date(workout.date)
  d.setUTCHours(10, 0, 0, 0)
  return d.getTime()
}

/**
 * Maps nutrition record and planned workouts to a unified timeline
 */
export function mapNutritionToTimeline(
  nutritionRecord: any,
  workouts: any[],
  options: TimelineOptions
): FuelingTimelineWindow[] {
  console.log('[TimelineUtil] Mapping started', {
    workoutCount: workouts.length,
    hasPlan: !!nutritionRecord.fuelingPlan
  })

  const dayStart = startOfDay(new Date(nutritionRecord.date))
  const dayEnd = endOfDay(new Date(nutritionRecord.date))
  const fuelingPlan = nutritionRecord.fuelingPlan

  let baseTimeline: FuelingTimelineWindow[] = []

  if (fuelingPlan?.windows?.length > 0) {
    console.log(`[TimelineUtil] Using stored plan with ${fuelingPlan.windows.length} windows`)

    // 1. Use the pre-calculated windows from the API
    baseTimeline = fuelingPlan.windows.map((w: any) => {
      // Find associated workout by ID or by time overlap
      const workout = workouts.find((work) => {
        if (w.plannedWorkoutId && w.plannedWorkoutId === work.id) return true

        // Fallback: If it's INTRA window, match by proximity
        if (w.type === 'INTRA_WORKOUT') {
          const wStart = new Date(w.startTime).getTime()
          const workStart = getWorkoutDate(work)
          const diffMin = Math.abs(wStart - workStart) / 60000

          if (diffMin < 120) {
            // 2 hour tolerance for matching stale plans
            console.log(
              `[TimelineUtil] Matched INTRA window to workout "${work.title}" (diff: ${Math.round(diffMin)}m)`
            )
            return true
          }
        }
        return false
      })

      return {
        ...w,
        startTime: new Date(w.startTime),
        endTime: new Date(w.endTime),
        workout,
        items: []
      }
    })
  } else {
    console.log('[TimelineUtil] No stored plan found, generating manually')
    // 2. Fallback: Manual generation
    const rawWindows: FuelingTimelineWindow[] = []
    workouts.forEach((workout) => {
      const workoutStart = new Date(getWorkoutDate(workout))
      const durationMin = (workout.durationSec || 3600) / 60
      const workoutEnd = addMinutes(workoutStart, durationMin)

      rawWindows.push({
        type: 'PRE_WORKOUT',
        startTime: addMinutes(workoutStart, -options.preWorkoutWindow),
        endTime: workoutStart,
        targetCarbs: Math.round(options.weight * 1.5),
        targetProtein: 20,
        targetFat: 10,
        description: 'Pre-workout fueling',
        items: [],
        workoutTitle: workout.title,
        plannedWorkoutId: workout.id,
        workout
      })

      rawWindows.push({
        type: 'INTRA_WORKOUT',
        startTime: workoutStart,
        endTime: workoutEnd,
        targetCarbs: Math.round((workout.workIntensity > 0.8 ? 90 : 60) * (durationMin / 60)),
        targetProtein: 0,
        targetFat: 0,
        targetFluid: Math.round(800 * (durationMin / 60)),
        targetSodium: Math.round(600 * (durationMin / 60)),
        description: 'During workout',
        items: [],
        workoutTitle: workout.title,
        plannedWorkoutId: workout.id,
        workout
      })

      rawWindows.push({
        type: 'POST_WORKOUT',
        startTime: workoutEnd,
        endTime: addMinutes(workoutEnd, options.postWorkoutWindow),
        targetCarbs: Math.round(options.weight * 1.2),
        targetProtein: 30,
        targetFat: 15,
        description: 'Post-workout recovery',
        items: [],
        workoutTitle: workout.title,
        plannedWorkoutId: workout.id,
        workout
      })
    })

    if (rawWindows.length > 0) {
      rawWindows.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
      let current: FuelingTimelineWindow = { ...rawWindows[0] }
      const merged: FuelingTimelineWindow[] = []
      for (let i = 1; i < rawWindows.length; i++) {
        const next = rawWindows[i]
        if (next.startTime < current.endTime) {
          current.endTime = new Date(Math.max(current.endTime.getTime(), next.endTime.getTime()))
          current.targetCarbs = (current.targetCarbs || 0) + (next.targetCarbs || 0)
          current.targetProtein = (current.targetProtein || 0) + (next.targetProtein || 0)
          current.type = 'TRANSITION'
          current.description = `Transition window`
        } else {
          merged.push({ ...current })
          current = { ...next }
        }
      }
      merged.push({ ...current })
      baseTimeline = merged
    }
  }

  // 3. Inject WORKOUT_EVENT markers
  const timelineWithEvents: FuelingTimelineWindow[] = []

  // Sort base windows
  baseTimeline.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())

  baseTimeline.forEach((window) => {
    // If this is an INTRA window, we want to show the WORKOUT card just before it
    if (window.type === 'INTRA_WORKOUT' && window.workout) {
      console.log(`[TimelineUtil] Adding WORKOUT_EVENT for: ${window.workout.title}`)
      timelineWithEvents.push({
        type: 'WORKOUT_EVENT',
        startTime: window.startTime,
        endTime: window.endTime,
        targetCarbs: 0,
        targetProtein: 0,
        targetFat: 0,
        description: window.workout.title,
        workout: window.workout,
        items: []
      })
    }
    timelineWithEvents.push(window)
  })

  // 4. Final step: Add Daily Base gaps and slot items
  const finalTimeline: FuelingTimelineWindow[] = []
  let lastTime = dayStart

  timelineWithEvents.forEach((window) => {
    if (window.startTime > lastTime) {
      finalTimeline.push({
        type: 'DAILY_BASE',
        startTime: lastTime,
        endTime: window.startTime,
        targetCarbs: 0,
        targetProtein: 0,
        targetFat: 0,
        description: 'Daily baseline',
        items: []
      })
    }
    finalTimeline.push(window)
    lastTime = window.endTime
  })

  if (lastTime < dayEnd) {
    finalTimeline.push({
      type: 'DAILY_BASE',
      startTime: lastTime,
      endTime: dayEnd,
      targetCarbs: 0,
      targetProtein: 0,
      targetFat: 0,
      description: 'Daily baseline',
      items: []
    })
  }

  // 5. Slot logged items
  const meals = ['breakfast', 'lunch', 'dinner', 'snacks']
  const allLoggedItems: any[] = []
  meals.forEach((meal) => {
    if (Array.isArray(nutritionRecord[meal])) {
      allLoggedItems.push(...nutritionRecord[meal].map((item: any) => ({ ...item, meal })))
    }
  })

  allLoggedItems.forEach((item) => {
    const itemTime = item.logged_at ? new Date(item.logged_at) : null

    if (itemTime) {
      const window = finalTimeline.find(
        (w) => w.type !== 'WORKOUT_EVENT' && itemTime >= w.startTime && itemTime < w.endTime
      )
      if (window) window.items.push(item)
    } else {
      // Heuristic for items without timestamps
      if (item.meal === 'breakfast') {
        const first = finalTimeline.find((w) => w.type === 'DAILY_BASE')
        if (first) first.items.push(item)
      } else if (item.meal === 'dinner') {
        const last = [...finalTimeline].reverse().find((w) => w.type === 'DAILY_BASE')
        if (last) last.items.push(item)
      } else {
        const middle = finalTimeline.find(
          (w) => w.type === 'DAILY_BASE' && w.startTime.getHours() > 10
        )
        if (middle) middle.items.push(item)
        else if (finalTimeline[0]) finalTimeline[0].items.push(item)
      }
    }
  })

  console.log(`[TimelineUtil] Final timeline size: ${finalTimeline.length}`)
  return finalTimeline
}
