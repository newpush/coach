/**
 * Display metadata for the workout explorer's summary metrics.
 *
 * Lives in `shared/` because both sides need it: the Nitro API labels the
 * series it emits, and `app/pages/analytics/workout-explorer.vue` labels the
 * chart axes. It used to be declared twice — once here (server) and once as a
 * hand-maintained copy in the page — which is exactly how the two drift.
 */

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
  // Correct as-is: `Workout.averageSpeed` is stored in m/s (see
  // `metresPerSecondToKmh` in `shared/units.ts`), but
  // `normalizeWorkoutMetricValue` converts it to km/h before it ever reaches a
  // consumer, so the unit that goes with the emitted value really is km/h
  // (CW-382).
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
