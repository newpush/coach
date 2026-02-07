import { workoutTools } from './ai-tools/workouts'
import { planningTools } from './ai-tools/planning'
import { recommendationTools } from './ai-tools/recommendations'
import { analysisTools } from './ai-tools/analysis'
import { profileTools } from './ai-tools/profile'
import { mathTools } from './ai-tools/math'
import { metricTools } from './ai-tools/metric-tools'
import { nutritionTools } from './ai-tools/nutrition'
import { wellnessTools } from './ai-tools/wellness'
import { availabilityTools } from './ai-tools/availability'
import { timeTools } from './ai-tools/time'
import type { AiSettings } from './ai-user-settings'
import { getUserAiSettings } from './ai-user-settings'

export const getToolsWithContext = (userId: string, timezone: string, settings: AiSettings) => {
  return {
    ...workoutTools(userId, timezone),
    ...planningTools(userId, timezone),
    ...recommendationTools(userId, timezone),
    ...analysisTools(userId, timezone, settings),
    ...profileTools(userId, timezone),
    ...mathTools(),
    ...metricTools(userId, timezone),
    ...nutritionTools(userId, timezone),
    ...wellnessTools(userId, timezone),
    ...availabilityTools(userId),
    ...timeTools(timezone)
  }
}
