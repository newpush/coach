export interface CalendarActivity {
  id: string
  source: 'completed' | 'planned'
  title: string
  type?: string
  date: string
  duration?: number
  plannedDuration?: number
  distance?: number
  plannedDistance?: number
  tss?: number
  plannedTss?: number
  intensity?: number
  rpe?: number
  averageHr?: number | null // Average heart rate in BPM
  status?: 'completed' | 'planned' | 'missed'
  plannedWorkoutId?: string | null // Link to planned workout if this was a planned workout
  ctl?: number | null // Chronic Training Load (Fitness)
  atl?: number | null // Acute Training Load (Fatigue)
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
  wellness?: {
    hrv?: number | null // Heart Rate Variability (ms)
    restingHr?: number | null // Resting heart rate
    sleepScore?: number | null // Sleep score 0-100
    hoursSlept?: number | null // Hours slept
    recoveryScore?: number | null // Recovery score 0-100
    weight?: number | null // Weight in kg
  } | null
}