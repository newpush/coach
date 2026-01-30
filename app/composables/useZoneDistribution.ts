export interface Zone {
  name: string
  min: number
  max: number
  duration: number
  color: string
}

export interface ZoneDistributionWorkout {
  type?: string | null
  durationSec?: number | null
  structuredWorkout?: {
    steps?: Array<{
      power?: number | { value: number }
      heartRate?: number | { value: number }
      durationSeconds?: number
      duration?: number
    }>
    exercises?: Array<{
      sets?: Array<{
        durationSec?: number
        reps?: number
      }>
    }>
    duration?: number
  } | null
}

export function useZoneDistribution(workouts: ZoneDistributionWorkout[] | undefined | null) {
  const distribution: Zone[] = [
    { name: 'Strength', min: -1, max: -1, duration: 0, color: '#a855f7' }, // Purple
    { name: 'Z1', min: 0, max: 0.55, duration: 0, color: '#9ca3af' }, // gray-400
    { name: 'Z2', min: 0.55, max: 0.75, duration: 0, color: '#3b82f6' }, // blue-500
    { name: 'Z3', min: 0.75, max: 0.9, duration: 0, color: '#22c55e' }, // green-500
    { name: 'Z4', min: 0.9, max: 1.05, duration: 0, color: '#eab308' }, // yellow-500
    { name: 'Z5', min: 1.05, max: 1.2, duration: 0, color: '#f97316' }, // orange-500
    { name: 'Z6', min: 1.2, max: 9.99, duration: 0, color: '#ef4444' } // red-500
  ]

  if (!workouts) return distribution

  workouts.forEach((w) => {
    // Strength Logic
    if (w.type === 'WeightTraining' || w.type === 'Gym') {
      let duration = w.durationSec || 0

      if (duration === 0 && w.structuredWorkout) {
        if (typeof w.structuredWorkout.duration === 'number' && w.structuredWorkout.duration > 0) {
          duration = w.structuredWorkout.duration
        } else if (Array.isArray(w.structuredWorkout.exercises)) {
           // Calculate from exercises
           // sets * reps * time per rep + rest
           // Let's assume some defaults if not explicit
           const REP_DURATION = 5 // seconds
           const REST_BETWEEN_SETS = 60 // seconds - simplified assumption if not in data

           let calculatedDuration = 0
           w.structuredWorkout.exercises.forEach((ex: any) => {
             if (Array.isArray(ex.sets)) {
               ex.sets.forEach((set: any) => {
                 const setDuration = set.durationSec || (set.reps ? set.reps * REP_DURATION : 0)
                 calculatedDuration += setDuration + REST_BETWEEN_SETS
               })
             }
           })
           if (calculatedDuration > 0) {
             duration = calculatedDuration
           }
        }
      }

      if (duration > 0) {
        const zone = distribution.find((z) => z.name === 'Strength')
        if (zone) {
          zone.duration += duration
        }
      }

      // If we counted it as strength, we stop here
      return
    }

    // Existing Cardio Logic
    if (w.structuredWorkout?.steps && Array.isArray(w.structuredWorkout.steps)) {
      w.structuredWorkout.steps.forEach((step: any) => {
        let intensity = 0

        // Priority 1: Power (Cycling / Running Power)
        // Usually provided as a decimal ratio (0.75 = 75% FTP) or a 'value' object
        if (typeof step.power === 'number') {
          intensity = step.power
        } else if (step.power?.value) {
          intensity = step.power.value
        }
        // Priority 2: Heart Rate (Running / Cardio)
        // Usually provided as decimal ratio of LTHR/MaxHR
        else if (typeof step.heartRate === 'number') {
          intensity = step.heartRate
        } else if (step.heartRate?.value) {
          intensity = step.heartRate.value
        }

        // Intensity 0 means rest or undefined, often Z1

        const duration = step.durationSeconds || step.duration || 0

        // Find matching zone based on intensity
        // Filter out Strength zone
        const intensityZones = distribution.filter(z => z.name !== 'Strength')

        // Z1: 0 - 0.55
        // ...
        // Z6: 1.20+
        const zone =
          intensityZones.find((z) => intensity <= z.max) || intensityZones[intensityZones.length - 1]
        if (zone) {
          zone.duration += duration
        }
      })
    }
  })

  return distribution
}
