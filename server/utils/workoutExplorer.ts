import { metresPerSecondToKmh } from '../../shared/units'
import {
  workoutExplorerMetricLabels,
  workoutExplorerMetricUnits
} from '../../shared/workout-explorer-metrics'

// The label/unit maps live in `shared/` so the explorer page can consume the
// same source (`#shared/workout-explorer-metrics`) instead of keeping a copy.
export { workoutExplorerMetricLabels, workoutExplorerMetricUnits }

export const allowedWorkoutExplorerSummaryMetrics = new Set(
  Object.keys(workoutExplorerMetricLabels)
)

export function normalizeWorkoutMetricValue(field: string, value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  if (Number.isNaN(numeric)) return null
  // averageSpeed is persisted in m/s; the explorer charts it in km/h.
  if (field === 'averageSpeed') return Number(metresPerSecondToKmh(numeric).toFixed(1))
  return numeric
}
