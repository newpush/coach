import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildAthleteContext } from '../../../../../server/utils/services/chatContextService'
import { prisma } from '../../../../../server/utils/db'

// Mock dependencies
vi.mock('../../../../../server/utils/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    goal: { findMany: vi.fn() },
    plannedWorkout: { findMany: vi.fn(), findFirst: vi.fn() },
    trainingAvailability: { findMany: vi.fn() },
    weeklyTrainingPlan: { findFirst: vi.fn() },
    integration: { findUnique: vi.fn() }
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

describe('chatContextService Timezone Handling', () => {
  const userId = 'user-123'

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock date to Wednesday, Feb 11, 2026, 02:20 UTC
    // In America/New_York, this is Tuesday, Feb 10, 2026, 21:20
    vi.setSystemTime(new Date('2026-02-11T02:20:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should show correct "Today" for New York user when it is late night UTC but still evening in NY', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      name: 'NY Athlete',
      timezone: 'America/New_York',
      aiPersona: 'Supportive'
    } as any)

    vi.mocked(prisma.goal.findMany).mockResolvedValue([])
    vi.mocked(prisma.plannedWorkout.findMany).mockResolvedValue([])
    vi.mocked(prisma.plannedWorkout.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.trainingAvailability.findMany).mockResolvedValue([])
    vi.mocked(prisma.weeklyTrainingPlan.findFirst).mockResolvedValue(null)

    const result = await buildAthleteContext(userId)

    // Expected Today: Tuesday, February 10, 2026
    expect(result.systemInstruction).toContain('**Today (Tuesday)**: Feb 10, 2026')
    expect(result.systemInstruction).toContain("**Today's Date**: Tuesday, February 10, 2026")
    expect(result.systemInstruction).toContain('"Tomorrow" = Wednesday, Feb 11, 2026')
  })

  it('should show correct "Today" for Tokyo user (ahead of UTC)', async () => {
    // Current time: Wednesday, Feb 11, 02:20 UTC
    // Tokyo (UTC+9): Wednesday, Feb 11, 11:20 AM
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      name: 'Tokyo Athlete',
      timezone: 'Asia/Tokyo',
      aiPersona: 'Supportive'
    } as any)

    vi.mocked(prisma.goal.findMany).mockResolvedValue([])
    vi.mocked(prisma.plannedWorkout.findMany).mockResolvedValue([])
    vi.mocked(prisma.plannedWorkout.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.trainingAvailability.findMany).mockResolvedValue([])
    vi.mocked(prisma.weeklyTrainingPlan.findFirst).mockResolvedValue(null)

    const result = await buildAthleteContext(userId)

    // Expected Today: Wednesday, February 11, 2026
    expect(result.systemInstruction).toContain('**Today (Wednesday)**: Feb 11, 2026')
    expect(result.systemInstruction).toContain("**Today's Date**: Wednesday, February 11, 2026")
  })

  it('should correctly format Goal dates without double-shifting', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      name: 'NY Athlete',
      timezone: 'America/New_York',
      aiPersona: 'Supportive'
    } as any)

    // Goal set for Feb 15 (UTC midnight)
    const goalDate = new Date('2026-02-15T00:00:00Z')
    vi.mocked(prisma.goal.findMany).mockResolvedValue([
      {
        priority: 1,
        title: 'Target Goal',
        type: 'STRENGTH',
        targetDate: goalDate,
        createdAt: new Date('2026-01-01T12:00:00Z')
      }
    ] as any)

    vi.mocked(prisma.plannedWorkout.findMany).mockResolvedValue([])
    vi.mocked(prisma.plannedWorkout.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.trainingAvailability.findMany).mockResolvedValue([])
    vi.mocked(prisma.weeklyTrainingPlan.findFirst).mockResolvedValue(null)

    const result = await buildAthleteContext(userId)

    // Should NOT show Feb 14 (which would happen if we shifted Feb 15 00:00 UTC by -5h)
    expect(result.context).toContain('Target: 2026-02-15')
    expect(result.context).not.toContain('Target: 2026-02-14')
  })
})
