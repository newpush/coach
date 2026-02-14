import { addMinutes } from 'date-fns'
import { fromZonedTime } from 'date-fns-tz'

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
  meals?: string[]
}

export interface TimelineOptions {
  preWorkoutWindow: number // minutes
  postWorkoutWindow: number // minutes
  baseProteinPerKg: number
  baseFatPerKg: number
  weight: number
  mealPattern?: { name: string; time: string }[]
  timezone: string
}

export function getWorkoutDate(workout: any, timezone: string): number {
  const d = new Date(workout.date)
  if (isNaN(d.getTime())) {
    return 0
  }

  // If it's a completed workout, it usually has a precise timestamp in 'date'
  // We should trust it unless it's strictly midnight UTC (which implies a date-only field)
  const isCompleted =
    workout.source === 'completed' ||
    workout.source === 'intervals' ||
    workout.status === 'completed'
  const hasTime = d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0 || d.getUTCSeconds() !== 0

  if (isCompleted && hasTime) {
    return d.getTime()
  }

  if (workout.startTime) {
    if (
      workout.startTime instanceof Date ||
      (typeof workout.startTime === 'string' && workout.startTime.includes('T'))
    ) {
      // If it's already a full date, return it
      const sd = new Date(workout.startTime)
      if (!isNaN(sd.getTime())) return sd.getTime()
    }
  }

  let h = 10
  let m = 0

  if (workout.startTime) {
    // If startTime is HH:mm string
    if (typeof workout.startTime === 'string' && workout.startTime.includes(':')) {
      const [sh, sm] = workout.startTime.split(':').map(Number)
      h = sh || 0
      m = sm || 0
    }
  }

  // Use UTC components of the base date to ensure we stay on the intended calendar day
  // This handles dates like "2026-02-11T00:00:00Z" correctly regardless of local timezone
  const dateStr = d.toISOString().split('T')[0]
  const hh = String(h).padStart(2, '0')
  const mm = String(m).padStart(2, '0')

  try {
    return fromZonedTime(`${dateStr}T${hh}:${mm}:00`, timezone).getTime()
  } catch (e) {
    return new Date(`${dateStr}T${hh}:${mm}:00Z`).getTime()
  }
}

/**
 * Maps nutrition record and planned workouts to a unified timeline.
 * Relies on server-provided fuelingPlan for windows and targets.
 */
export function mapNutritionToTimeline(
  nutritionRecord: any,
  workouts: any[],
  options: TimelineOptions
): FuelingTimelineWindow[] {
  const trainingWorkouts = workouts.filter((w) => w.type !== 'Rest')
  const dateStr =
    nutritionRecord.date instanceof Date
      ? nutritionRecord.date.toISOString().split('T')[0]
      : nutritionRecord.date.split('T')[0]
  const dayStart = fromZonedTime(`${dateStr}T00:00:00`, options.timezone)
  const dayEnd = fromZonedTime(`${dateStr}T23:59:59`, options.timezone)
  const fuelingPlan = nutritionRecord.fuelingPlan

  let baseTimeline: FuelingTimelineWindow[] = []

  if (fuelingPlan?.windows?.length > 0) {
    // 1. Use the pre-calculated windows from the API
    baseTimeline = fuelingPlan.windows.map((w: any) => {
      // Find associated workout by ID or by time overlap
      const workout = trainingWorkouts.find((work) => {
        if (w.plannedWorkoutId && w.plannedWorkoutId === work.id) return true

        // Fallback: If it's INTRA window, match by proximity
        if (w.type === 'INTRA_WORKOUT') {
          const wStart = new Date(w.startTime).getTime()
          const workStart = getWorkoutDate(work, options.timezone)
          const diffMin = Math.abs(wStart - workStart) / 60000

          if (diffMin < 120) {
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
        workoutTitle: w.workoutTitle || workout?.title,
        items: []
      }
    })
  }

  // 2. Inject WORKOUT_EVENT markers
  const timelineWithEvents: FuelingTimelineWindow[] = []
  const representedWorkoutIds = new Set<string>()
  baseTimeline.forEach((w) => {
    if (w.plannedWorkoutId) representedWorkoutIds.add(w.plannedWorkoutId)
    if (w.workout?.id) representedWorkoutIds.add(w.workout.id)
  })

  baseTimeline.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())

  baseTimeline.forEach((window) => {
    if ((window.type === 'INTRA_WORKOUT' || window.type === 'TRANSITION') && window.workout) {
      const workoutStartTime = new Date(getWorkoutDate(window.workout, options.timezone))
      timelineWithEvents.push({
        type: 'WORKOUT_EVENT',
        startTime: workoutStartTime,
        endTime: addMinutes(workoutStartTime, (window.workout.durationSec || 3600) / 60),
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

  // 3. Inject "orphaned" workouts
  trainingWorkouts.forEach((workout) => {
    if (!representedWorkoutIds.has(workout.id)) {
      const workoutStart = new Date(getWorkoutDate(workout, options.timezone))
      const insertIdx = timelineWithEvents.findIndex((w) => w.startTime > workoutStart)
      const eventWindow: FuelingTimelineWindow = {
        type: 'WORKOUT_EVENT',
        startTime: workoutStart,
        endTime: addMinutes(workoutStart, (workout.durationSec || 3600) / 60),
        targetCarbs: 0,
        targetProtein: 0,
        targetFat: 0,
        description: workout.title,
        workout: workout,
        items: []
      }

      if (insertIdx === -1) {
        timelineWithEvents.push(eventWindow)
      } else {
        timelineWithEvents.splice(insertIdx, 0, eventWindow)
      }
    }
  })

  // 4. Add Daily Base gaps and slot items
  const finalTimeline: FuelingTimelineWindow[] = []
  let lastTime = dayStart

  timelineWithEvents.forEach((window) => {
    if (window.startTime > lastTime) {
      const gapMeals = (options.mealPattern || []).filter((m) => {
        try {
          const mTime = fromZonedTime(`${dateStr}T${m.time}:00`, options.timezone)
          return mTime >= lastTime && mTime < window.startTime
        } catch (e) {
          return false
        }
      })

      const description =
        gapMeals.length > 0 ? gapMeals.map((m) => m.name).join(' & ') : 'Daily baseline'

      finalTimeline.push({
        type: 'DAILY_BASE',
        startTime: lastTime,
        endTime: window.startTime,
        targetCarbs: 0,
        targetProtein: 0,
        targetFat: 0,
        description,
        items: [],
        meals: gapMeals.map((m) => m.name)
      })
    }
    finalTimeline.push(window)
    lastTime = window.endTime
  })

  if (lastTime < dayEnd) {
    const gapMeals = (options.mealPattern || []).filter((m) => {
      try {
        const mTime = fromZonedTime(`${dateStr}T${m.time}:00`, options.timezone)
        return mTime >= lastTime && mTime < dayEnd
      } catch (e) {
        return false
      }
    })

    const description =
      gapMeals.length > 0 ? gapMeals.map((m) => m.name).join(' & ') : 'Daily baseline'

    finalTimeline.push({
      type: 'DAILY_BASE',
      startTime: lastTime,
      endTime: dayEnd,
      targetCarbs: 0,
      targetProtein: 0,
      targetFat: 0,
      description,
      items: [],
      meals: gapMeals.map((m) => m.name)
    })
  }

  // 5. Slot logged items
  const meals = ['breakfast', 'lunch', 'dinner', 'snacks']
  const allLoggedItems: any[] = []

  meals.forEach((meal) => {
    if (Array.isArray(nutritionRecord[meal])) {
      allLoggedItems.push(
        ...nutritionRecord[meal].map((item: any) => ({ ...item, meal, isSynthetic: false }))
      )
    }
  })

  // Synthetic logs from plan (if no real logs)
  if (fuelingPlan?.windows && allLoggedItems.length === 0) {
    fuelingPlan.windows.forEach((w: any) => {
      if (w.targetCarbs > 0) {
        allLoggedItems.push({
          name: `Synthetic ${w.type}`,
          carbs: w.targetCarbs,
          logged_at: w.startTime,
          isSynthetic: true
        })
      }
    })
  } else if (allLoggedItems.length === 0 && (nutritionRecord.carbsGoal || 0) > 0) {
    const pattern =
      options.mealPattern && options.mealPattern.length > 0
        ? options.mealPattern
        : [
            { name: 'Breakfast', time: '08:00' },
            { name: 'Lunch', time: '13:00' },
            { name: 'Dinner', time: '19:00' }
          ]
    pattern.forEach((p: any) => {
      allLoggedItems.push({
        name: `Synthetic ${p.name}`,
        carbs: Math.round((nutritionRecord.carbsGoal || 300) / pattern.length),
        logged_at: fromZonedTime(`${dateStr}T${p.time}:00`, options.timezone).toISOString(),
        isSynthetic: true
      })
    })
  }

  allLoggedItems.forEach((item) => {
    let itemTime: Date | null = null
    const timeVal = item.logged_at || item.date

    if (timeVal) {
      try {
        if (typeof timeVal === 'string' && /^\d{2}:\d{2}$/.test(timeVal)) {
          itemTime = fromZonedTime(`${dateStr}T${timeVal}:00`, options.timezone)
        } else {
          const normalized = typeof timeVal === 'string' ? timeVal.replace(' ', 'T') : timeVal
          itemTime = new Date(normalized)
        }
      } catch (e) {
        // ignore error
      }
    }

    if (itemTime && !isNaN(itemTime.getTime())) {
      const window = finalTimeline.find(
        (w) => w.type !== 'WORKOUT_EVENT' && itemTime! >= w.startTime && itemTime! < w.endTime
      )
      if (window) window.items.push({ ...item, _heuristic_time: itemTime.toISOString() })
    } else {
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

  return finalTimeline
}
