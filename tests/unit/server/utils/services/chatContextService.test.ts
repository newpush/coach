import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildAthleteContext } from '../../../../../server/utils/services/chatContextService'
import { prisma } from '../../../../../server/utils/db'

// Mock dependencies
vi.mock('../../../../../server/utils/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    goal: { findMany: vi.fn() },
    plannedWorkout: { findMany: vi.fn() },
    trainingAvailability: { findMany: vi.fn() },
    weeklyTrainingPlan: { findFirst: vi.fn() }
  }
}))

vi.mock('../../../../../server/utils/repositories/sportSettingsRepository', () => ({
  sportSettingsRepository: {
    getByUserId: vi.fn().mockResolvedValue([])
  }
}))

vi.mock('../../../../../server/utils/repositories/workoutRepository', () => ({
  workoutRepository: {
    getForUser: vi.fn().mockResolvedValue([])
  }
}))

vi.mock('../../../../../server/utils/repositories/nutritionRepository', () => ({
  nutritionRepository: {
    getForUser: vi.fn().mockResolvedValue([])
  }
}))

vi.mock('../../../../../server/utils/repositories/wellnessRepository', () => ({
  wellnessRepository: {
    getForUser: vi.fn().mockResolvedValue([])
  }
}))

vi.mock('../../../../../server/utils/training-metrics', () => ({
  generateTrainingContext: vi.fn().mockResolvedValue({}),
  formatTrainingContextForPrompt: vi.fn().mockReturnValue('Mocked Training Context')
}))

describe('chatContextService', () => {
  const userId = 'user-123'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should use nickname in system instruction if present', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      name: 'John Doe',
      nickname: 'Johnny',
      timezone: 'UTC',
      aiPersona: 'Supportive'
    } as any)

    vi.mocked(prisma.goal.findMany).mockResolvedValue([])
    vi.mocked(prisma.plannedWorkout.findMany).mockResolvedValue([])
    vi.mocked(prisma.trainingAvailability.findMany).mockResolvedValue([])
    vi.mocked(prisma.weeklyTrainingPlan.findFirst).mockResolvedValue(null)

    const result = await buildAthleteContext(userId)

    expect(result.systemInstruction).toContain('Address the athlete as **Johnny**')
    expect(result.context).toContain('**Nickname**: Johnny')
  })

  it('should use first name in system instruction if nickname is missing', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      name: 'John Doe',
      nickname: null,
      timezone: 'UTC',
      aiPersona: 'Supportive'
    } as any)

    vi.mocked(prisma.goal.findMany).mockResolvedValue([])
    vi.mocked(prisma.plannedWorkout.findMany).mockResolvedValue([])
    vi.mocked(prisma.trainingAvailability.findMany).mockResolvedValue([])
    vi.mocked(prisma.weeklyTrainingPlan.findFirst).mockResolvedValue(null)

    const result = await buildAthleteContext(userId)

    expect(result.systemInstruction).toContain('Address the athlete as **John**')
    expect(result.context).not.toContain('**Nickname**')
  })
})
