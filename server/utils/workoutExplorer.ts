export const workoutExplorerMetricLabels: Record<string, string> = {
  durationSec: 'Duration',
  elapsedTimeSec: 'Elapsed Time',
  distanceMeters: 'Distance',
  elevationGain: 'Elevation Gain',
  trainingLoad: 'Training Load',
  tss: 'TSS',
  kilojoules: 'Kilojoules',
  calories: 'Calories',
  averageWatts: 'Average Power',
  maxWatts: 'Max Power',
  normalizedPower: 'Normalized Power',
  averageHr: 'Average HR',
  maxHr: 'Max HR',
  averageCadence: 'Average Cadence',
  averageSpeed: 'Average Speed',
  intensity: 'Intensity',
  efficiencyFactor: 'Efficiency Factor',
  decoupling: 'Decoupling',
  powerHrRatio: 'Power / HR Ratio',
  variabilityIndex: 'Variability Index',
  trimp: 'TRIMP',
  hrLoad: 'HR Load',
  workAboveFtp: 'Work Above FTP'
}

export const workoutExplorerMetricUnits: Record<string, string> = {
  durationSec: 'duration',
  elapsedTimeSec: 'duration',
  distanceMeters: 'm',
  elevationGain: 'm',
  trainingLoad: 'load',
  tss: 'tss',
  kilojoules: 'kJ',
  calories: 'kcal',
  averageWatts: 'W',
  maxWatts: 'W',
  normalizedPower: 'W',
  averageHr: 'bpm',
  maxHr: 'bpm',
  averageCadence: 'rpm',
  // Correct as-is: `Workout.averageSpeed` is stored in m/s, but
  // `normalizeWorkoutMetricValue` converts it to km/h before it ever reaches a consumer,
  // so the unit that goes with the emitted value really is km/h (CW-382).
  averageSpeed: 'km/h',
  intensity: '',
  efficiencyFactor: '',
  decoupling: '%',
  powerHrRatio: '',
  variabilityIndex: '',
  trimp: 'load',
  hrLoad: 'load',
  workAboveFtp: 'kJ'
}

export const allowedWorkoutExplorerSummaryMetrics = new Set(
  Object.keys(workoutExplorerMetricLabels)
)

export function normalizeWorkoutMetricValue(field: string, value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  if (Number.isNaN(numeric)) return null
  // averageSpeed is persisted in m/s; the explorer charts it in km/h.
  if (field === 'averageSpeed') return Number((numeric * 3.6).toFixed(1))
  return numeric
}
