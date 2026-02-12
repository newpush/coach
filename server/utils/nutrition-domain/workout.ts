import { fromZonedTime } from 'date-fns-tz'

export function getWorkoutDate(workout: any, timezone: string): number {
  const d = new Date(workout.date)
  if (isNaN(d.getTime())) {
    return 0
  }

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
      const sd = new Date(workout.startTime)
      if (!isNaN(sd.getTime())) return sd.getTime()
    }
  }

  let h = 10
  let m = 0

  if (workout.startTime) {
    if (typeof workout.startTime === 'string' && workout.startTime.includes(':')) {
      const [sh, sm] = workout.startTime.split(':').map(Number)
      h = sh || 0
      m = sm || 0
    }
  }

  const dateStr = d.toISOString().split('T')[0]
  const hh = String(h).padStart(2, '0')
  const mm = String(m).padStart(2, '0')

  try {
    return fromZonedTime(`${dateStr}T${hh}:${mm}:00`, timezone).getTime()
  } catch {
    return new Date(`${dateStr}T${hh}:${mm}:00Z`).getTime()
  }
}
