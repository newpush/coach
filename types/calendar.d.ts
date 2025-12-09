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
}