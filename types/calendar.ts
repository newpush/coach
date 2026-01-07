export interface CalendarActivity {
  id: string
  title: string
  date: string // ISO date string
  type?: string
  source: 'completed' | 'planned'
  status: 'completed' | 'planned' | 'missed' | 'completed_plan'

  // Normalized metrics
  duration?: number // seconds
  distance?: number // meters
  tss?: number
  intensity?: number // 0-1+

  // Completed specific
  rpe?: number
  feel?: number
  averageHr?: number | null // Average heart rate in BPM
  averageWatts?: number | null // Average power in Watts
  plannedWorkoutId?: string | null
  trimp?: number
  trainingLoad?: number
  sessionRpe?: number
  normalizedPower?: number
  weightedAvgWatts?: number
  kilojoules?: number
  calories?: number
  elapsedTime?: number
  deviceName?: string
  commute?: boolean
  isPrivate?: boolean
  gearId?: string

  // Planned specific
  plannedDuration?: number
  plannedDistance?: number
  plannedTss?: number
  linkedPlannedWorkout?: {
    id: string
    title: string
    duration?: number
    tss?: number
    type?: string
  } | null

  // Training Load
  ctl?: number | null // Chronic Training Load (Fitness)
  atl?: number | null // Acute Training Load (Fatigue)

  // Nutrition Data
  nutrition?: {
    calories?: number | null
    protein?: number | null
    carbs?: number | null
    fat?: number | null
    caloriesGoal?: number | null
    proteinGoal?: number | null
    carbsGoal?: number | null
    fatGoal?: number | null
  } | null

  // Wellness Data
  wellness?: {
    hrv?: number | null // Heart Rate Variability (ms)
    restingHr?: number | null // Resting heart rate
    sleepScore?: number | null // Sleep score 0-100
    hoursSlept?: number | null // Hours slept
    recoveryScore?: number | null // Recovery score 0-100
    weight?: number | null // Weight in kg
  } | null

  // UI helpers
  color?: string
  icon?: string
}

export interface CalendarDay {
  date: string
  activities: CalendarActivity[]
  summary?: {
    totalDuration: number
    totalDistance: number
    totalTss: number
  }
}

export interface CalendarWeek {
  startDate: string
  endDate: string
  days: CalendarDay[]
  summary: {
    totalDuration: number
    totalDistance: number
    totalTss: number
    plannedDuration?: number
    plannedTss?: number
  }
}
