import type { Integration } from '@prisma/client'

const HEVY_API_BASE = 'https://api.hevyapp.com/v1'

export interface HevySet {
  index: number
  indicator: string // "normal", "warmup", "dropset", "failure"
  weight_kg: number
  reps: number
  distance_meters?: number
  duration_seconds?: number
  rpe?: number
}

export interface HevyExerciseTemplate {
  id: string
  title: string
  type: string
  primary_muscle_group: string
  secondary_muscle_groups: string[]
}

export interface HevyExercise {
  index: number
  title: string
  notes: string
  exercise_template_id: string
  sets: HevySet[]
  // Some responses might include template details if expanded, otherwise we might need to fetch
}

export interface HevyWorkout {
  id: string
  title: string
  description: string
  start_time: string
  end_time: string
  exercises: HevyExercise[]
}

export interface HevyWorkoutsResponse {
  page_count: number
  workouts: HevyWorkout[]
}

/**
 * Fetch workouts from Hevy API
 */
export async function fetchHevyWorkouts(
  apiKey: string,
  page: number = 1,
  pageSize: number = 10
): Promise<HevyWorkoutsResponse> {
  // Try api-key header
  const response = await fetch(`${HEVY_API_BASE}/workouts?page=${page}&pageSize=${pageSize}`, {
    headers: {
      'api-key': apiKey
    }
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Hevy API Error (${response.status}): ${errorText}`)
  }

  return await response.json()
}

/**
 * Fetch a specific workout details
 */
export async function fetchHevyWorkoutDetails(
  apiKey: string,
  workoutId: string
): Promise<HevyWorkout> {
  const response = await fetch(`${HEVY_API_BASE}/workouts/${workoutId}`, {
    headers: {
      'api-key': apiKey
    }
  })

  if (!response.ok) {
    throw new Error(`Hevy API Error: ${response.status} ${response.statusText}`)
  }

  return await response.json()
}

/**
 * Fetch specific exercise template details
 */
export async function fetchHevyExerciseTemplate(
  apiKey: string,
  templateId: string
): Promise<HevyExerciseTemplate> {
  const response = await fetch(`${HEVY_API_BASE}/exercise_templates/${templateId}`, {
    headers: {
      'api-key': apiKey
    }
  })

  if (!response.ok) {
    // If not found or error, return a placeholder or throw
    throw new Error(`Hevy Template Error: ${response.status}`)
  }

  return await response.json()
}

/**
 * Normalize Hevy workout to our schema
 */
export function normalizeHevyWorkout(hevyWorkout: HevyWorkout, userId: string) {
  const startTime = new Date(hevyWorkout.start_time)
  const endTime = new Date(hevyWorkout.end_time)
  const durationSec = Math.round((endTime.getTime() - startTime.getTime()) / 1000)

  return {
    userId,
    externalId: hevyWorkout.id,
    source: 'hevy',
    date: startTime,
    title: hevyWorkout.title || 'Strength Training',
    description: hevyWorkout.description,
    type: 'WeightTraining',
    durationSec: durationSec > 0 ? durationSec : 0,

    // Metrics that Hevy might calculate (or we calculate from sets)
    // We can sum up volume (tonnage)
    kilojoules: null, // Hevy doesn't provide kJ

    // Raw data
    rawJson: hevyWorkout as any
  }
}
