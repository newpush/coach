import { prisma } from './db'
import type { GeminiModel } from './ai-config'

export interface AiSettings {
  aiPersona: string
  aiModelPreference: GeminiModel
  aiAutoAnalyzeWorkouts: boolean
  aiAutoAnalyzeNutrition: boolean
  aiAutoAnalyzeReadiness: boolean
  aiRequireToolApproval: boolean
  aiContext?: string | null
  nutritionTrackingEnabled: boolean
  nickname?: string | null
}

const DEFAULT_SETTINGS: AiSettings = {
  aiPersona: 'Supportive',
  aiModelPreference: 'flash',
  aiAutoAnalyzeWorkouts: false,
  aiAutoAnalyzeNutrition: false,
  aiAutoAnalyzeReadiness: false,
  aiRequireToolApproval: false,
  aiContext: null,
  nutritionTrackingEnabled: true,
  nickname: null
}

export async function getUserAiSettings(userId: string): Promise<AiSettings> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      aiPersona: true,
      aiModelPreference: true,
      aiAutoAnalyzeWorkouts: true,
      aiAutoAnalyzeNutrition: true,
      aiAutoAnalyzeReadiness: true,
      aiRequireToolApproval: true,
      aiContext: true,
      nutritionTrackingEnabled: true,
      nickname: true
    }
  })

  if (!user) {
    return DEFAULT_SETTINGS
  }

  return {
    aiPersona: user.aiPersona || DEFAULT_SETTINGS.aiPersona,
    aiModelPreference:
      (user.aiModelPreference as GeminiModel) || DEFAULT_SETTINGS.aiModelPreference,
    aiAutoAnalyzeWorkouts: user.aiAutoAnalyzeWorkouts ?? DEFAULT_SETTINGS.aiAutoAnalyzeWorkouts,
    aiAutoAnalyzeNutrition: user.aiAutoAnalyzeNutrition ?? DEFAULT_SETTINGS.aiAutoAnalyzeNutrition,
    aiAutoAnalyzeReadiness: user.aiAutoAnalyzeReadiness ?? DEFAULT_SETTINGS.aiAutoAnalyzeReadiness,
    aiRequireToolApproval: user.aiRequireToolApproval ?? DEFAULT_SETTINGS.aiRequireToolApproval,
    aiContext: user.aiContext,
    nutritionTrackingEnabled:
      user.nutritionTrackingEnabled ?? DEFAULT_SETTINGS.nutritionTrackingEnabled,
    nickname: user.nickname
  }
}
