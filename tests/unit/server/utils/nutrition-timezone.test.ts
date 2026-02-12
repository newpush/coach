import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildAthleteContext } from '../../../../server/utils/services/chatContextService'
import { prisma } from '../../../../server/utils/db'
import { nutritionRepository } from '../../../../server/utils/repositories/nutritionRepository'
import { nutritionTools } from '../../../../server/utils/ai-tools/nutrition'
import { wellnessTools } from '../../../../server/utils/ai-tools/wellness'

// Mock dependencies
vi.mock('../../../../server/utils/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    goal: { findMany: vi.fn() },
    plannedWorkout: { findMany: vi.fn(), findFirst: vi.fn() },
    trainingAvailability: { findMany: vi.fn() },
    weeklyTrainingPlan: { findFirst: vi.fn() },
    nutrition: { findMany: vi.fn() },
    wellness: { findMany: vi.fn() },
    integration: { findUnique: vi.fn() }
  }
}))

vi.mock('../../../../server/utils/repositories/sportSettingsRepository', () => ({
  sportSettingsRepository: {
    getByUserId: vi.fn().mockResolvedValue([])
  }
}))

vi.mock('../../../../server/utils/repositories/workoutRepository', () => ({
  workoutRepository: {
    getForUser: vi.fn().mockResolvedValue([])
  }
}))

vi.mock('../../../../server/utils/repositories/nutritionRepository', () => ({
  nutritionRepository: {
    getForUser: vi.fn().mockResolvedValue([])
  }
}))

vi.mock('../../../../server/utils/repositories/wellnessRepository', () => ({
  wellnessRepository: {
    getForUser: vi.fn().mockResolvedValue([])
  }
}))

vi.mock('../../../../server/utils/training-metrics', () => ({
  generateTrainingContext: vi.fn().mockResolvedValue({ summary: {} }),
  formatTrainingContextForPrompt: vi.fn().mockReturnValue('Mocked Training Context')
}))

describe('Nutrition Timezone Handling', () => {
  const userId = 'user-123'
  // Central Time is UTC-6
  const timezone = 'America/Chicago'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should display nutrition date correctly for Central USA timezone in chat context', async () => {
    // Today is Jan 29, 2026
    const nutritionDate = new Date('2026-01-29T00:00:00.000Z')

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: userId,
      name: 'Test User',
      timezone,
      nutritionTrackingEnabled: true,
      aiPersona: 'Supportive'
    } as any)

    vi.mocked(nutritionRepository.getForUser).mockResolvedValue([
      {
        id: 'nut-1',
        date: nutritionDate,
        calories: 2000,
        protein: 150,
        carbs: 250,
        fat: 60,
        aiAnalysisJson: null
      }
    ] as any)

    vi.mocked(prisma.goal.findMany).mockResolvedValue([])
    vi.mocked(prisma.plannedWorkout.findMany).mockResolvedValue([])
    vi.mocked(prisma.plannedWorkout.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.trainingAvailability.findMany).mockResolvedValue([])
    vi.mocked(prisma.weeklyTrainingPlan.findFirst).mockResolvedValue(null)

    const result = await buildAthleteContext(userId)

    // PROOF: If it correctly handles timezone, it should show 2026-01-29
    // If it incorrectly shifted (via formatUserDate), it would show 2026-01-28
    expect(result.context).toContain('2026-01-29')
    expect(result.context).not.toContain('2026-01-28')
  })

  it('should return correct date in get_nutrition_log tool for Central USA timezone', async () => {
    const nutritionDate = new Date('2026-01-29T00:00:00.000Z')

    vi.mocked(prisma.nutrition.findMany).mockResolvedValue([
      {
        id: 'nut-1',
        date: nutritionDate,
        calories: 2000,
        protein: 150,
        carbs: 250,
        fat: 60,
        aiAnalysis: null
      }
    ] as any)

    const tools = nutritionTools(userId, timezone)
    const result = await (tools.get_nutrition_log.execute as any)({
      start_date: '2026-01-29',
      end_date: '2026-01-29'
    })

    expect(result.entries[0].date).toBe('2026-01-29')
  })

  it('should return correct date in get_wellness_metrics tool for Central USA timezone', async () => {
    const wellnessDate = new Date('2026-01-29T00:00:00.000Z')

    vi.mocked(prisma.wellness.findMany).mockResolvedValue([
      {
        id: 'wel-1',
        date: wellnessDate,
        recoveryScore: 85,
        hrv: 65,
        restingHr: 52
      }
    ] as any)

    const tools = wellnessTools(userId, timezone)
    const result = await (tools.get_wellness_metrics.execute as any)({
      start_date: '2026-01-29',
      end_date: '2026-01-29'
    })

    expect(result.metrics[0].date).toBe('2026-01-29')
  })
})
