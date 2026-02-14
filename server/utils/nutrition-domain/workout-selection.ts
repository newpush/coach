/**
 * Workout Selection Policy
 * Decides which workouts to include in metabolic simulation for a given day.
 */

export function selectRelevantWorkouts(completed: any[], planned: any[]): any[] {
  const completedPlannedIds = new Set(completed.map((w: any) => w.plannedWorkoutId).filter(Boolean))

  return [
    ...completed,
    ...planned.filter((p: any) => !p.completed && !completedPlannedIds.has(p.id))
  ]
}
