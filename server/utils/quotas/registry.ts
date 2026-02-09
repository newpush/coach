import type { SubscriptionTier } from '@prisma/client'

export type QuotaOperation =
  | 'chat'
  | 'workout_analysis'
  | 'athlete_profile_generation'
  | 'weekly_plan_generation'
  | 'nutrition_analysis'
  | 'daily_checkin'
  | 'custom_report_generation'
  | 'unified_report_generation'
  | 'activity_recommendation'
  | 'generate_structured_workout'

export type EnforcementType = 'STRICT' | 'MEASURE'

export interface QuotaDefinition {
  limit: number
  window: string // postgres interval string: '4 hours', '7 days', etc.
  enforcement: EnforcementType
}

export const QUOTA_REGISTRY: Record<
  SubscriptionTier,
  Partial<Record<QuotaOperation, QuotaDefinition>>
> = {
  FREE: {
    chat: { limit: 5, window: '4 hours', enforcement: 'MEASURE' },
    workout_analysis: { limit: 10, window: '7 days', enforcement: 'MEASURE' },
    athlete_profile_generation: { limit: 1, window: '24 hours', enforcement: 'MEASURE' },
    daily_checkin: { limit: 1, window: '24 hours', enforcement: 'MEASURE' },
    unified_report_generation: { limit: 1, window: '30 days', enforcement: 'MEASURE' },
    nutrition_analysis: { limit: 5, window: '7 days', enforcement: 'MEASURE' },
    generate_structured_workout: { limit: 5, window: '7 days', enforcement: 'MEASURE' }
  },
  SUPPORTER: {
    chat: { limit: 50, window: '4 hours', enforcement: 'MEASURE' },
    workout_analysis: { limit: 30, window: '7 days', enforcement: 'MEASURE' },
    athlete_profile_generation: { limit: 5, window: '24 hours', enforcement: 'MEASURE' },
    daily_checkin: { limit: 2, window: '24 hours', enforcement: 'MEASURE' },
    unified_report_generation: { limit: 5, window: '30 days', enforcement: 'MEASURE' },
    nutrition_analysis: { limit: 20, window: '7 days', enforcement: 'MEASURE' },
    generate_structured_workout: { limit: 20, window: '7 days', enforcement: 'MEASURE' }
  },
  PRO: {
    chat: { limit: 500, window: '4 hours', enforcement: 'MEASURE' },
    workout_analysis: { limit: 100, window: '7 days', enforcement: 'MEASURE' },
    athlete_profile_generation: { limit: 20, window: '24 hours', enforcement: 'MEASURE' },
    daily_checkin: { limit: 5, window: '24 hours', enforcement: 'MEASURE' },
    unified_report_generation: { limit: 20, window: '30 days', enforcement: 'MEASURE' },
    nutrition_analysis: { limit: 100, window: '7 days', enforcement: 'MEASURE' },
    generate_structured_workout: { limit: 100, window: '7 days', enforcement: 'MEASURE' }
  }
}

/**
 * Maps legacy or variations of operation names to the canonical QuotaOperation
 */
export function mapOperationToQuota(operation: string): QuotaOperation | null {
  const map: Record<string, QuotaOperation> = {
    chat_ws: 'chat',
    chat_title_generation: 'chat',
    last_3_workouts_analysis: 'workout_analysis',
    weekly_report_generation: 'unified_report_generation',
    last_3_nutrition_analysis: 'nutrition_analysis',
    last_7_nutrition_analysis: 'nutrition_analysis'
  }

  if (map[operation]) return map[operation]

  // Check if it's already a valid QuotaOperation
  const validOps: string[] = [
    'chat',
    'workout_analysis',
    'athlete_profile_generation',
    'weekly_plan_generation',
    'nutrition_analysis',
    'daily_checkin',
    'custom_report_generation',
    'unified_report_generation',
    'activity_recommendation',
    'generate_structured_workout'
  ]

  if (validOps.includes(operation)) return operation as QuotaOperation

  return null
}
