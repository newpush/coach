import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { calculateLoadTrends } from '../../../../server/utils/training-metrics'
import { buildMetricsSummary } from '../../../../server/utils/gemini'
import { workoutTools } from '../../../../server/utils/ai-tools/workouts'
import { prisma } from '../../../../server/utils/db'
import { workoutRepository } from '../../../../server/utils/repositories/workoutRepository'

// Mock dependencies
vi.mock('../../../../server/utils/db', () => ({
  prisma: {
    workout: { findMany: vi.fn() },
    wellness: { findMany: vi.fn() },
    plannedWorkout: { findFirst: vi.fn() }
  }
}))

vi.mock('../../../../server/utils/repositories/workoutRepository', () => ({
  workoutRepository: {
    getForUser: vi.fn(),
    getById: vi.fn()
  }
}))

vi.mock('../../../../server/utils/repositories/plannedWorkoutRepository', () => ({
  plannedWorkoutRepository: {
    list: vi.fn(),
    getById: vi.fn()
  }
}))

describe('Timezone Integrity across Utilities', () => {
  const userId = 'user-123'
  const timezone = 'America/New_York' // UTC-5

  beforeEach(() => {
    vi.clearAllMocks()
    // Tuesday, Feb 10, 2026, 21:20 NY Time = Wednesday, Feb 11, 2026, 02:20 UTC
    vi.setSystemTime(new Date('2026-02-11T02:20:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('calculateLoadTrends', () => {
    it('should align wellness (UTC midnight) and workouts (timestamps) on the same local day', async () => {
      // Wellness record for Feb 10 (stored as UTC midnight)
      const wellnessDate = new Date('2026-02-10T00:00:00Z')
      // Workout record for Feb 10, 10:00 AM NY time = 15:00 UTC
      const workoutDate = new Date('2026-02-10T15:00:00Z')

      vi.mocked(prisma.wellness.findMany).mockResolvedValue([
        { date: wellnessDate, ctl: 50, atl: 40 }
      ] as any)
      vi.mocked(prisma.workout.findMany).mockResolvedValue([
        { date: workoutDate, ctl: 55, atl: 45 }
      ] as any)

      const trends = await calculateLoadTrends(
        userId,
        new Date('2026-02-01'),
        new Date('2026-02-11'),
        timezone
      )

      // Both should be keyed to "2026-02-10"
      // Preferred source is workout (overwrites wellness if on same day)
      expect(trends).toHaveLength(1)
      expect(trends[0].ctl).toBe(55)
    })
  })

  describe('buildMetricsSummary (Gemini)', () => {
    it('should format wellness dates in UTC to avoid shifting back to previous day', () => {
      const wellnessDate = new Date('2026-02-10T00:00:00Z')
      const metrics = [
        {
          date: wellnessDate,
          recoveryScore: 85,
          hrv: 70,
          restingHr: 50,
          sleepHours: 8,
          sleepScore: 90
        }
      ]

      const summary = buildMetricsSummary(metrics, timezone)

      // Should show Feb 10, NOT Feb 9
      expect(summary).toContain('Feb 10, 2026')
      expect(summary).not.toContain('Feb 9, 2026')
    })
  })

  describe('workoutTools (AI SDK)', () => {
    it('get_workout_details should return correct date for planned workout without double-shift', async () => {
      const tools = workoutTools(userId, timezone)
      const plannedDate = new Date('2026-02-10T00:00:00Z')

      vi.mocked(workoutRepository.getById).mockResolvedValue(null)
      vi.mocked(prisma.plannedWorkout.findFirst).mockResolvedValue({
        id: 'pw1',
        userId,
        date: plannedDate,
        title: 'Planned Ride',
        trainingWeek: null
      } as any)

      const result = await tools.get_workout_details.execute(
        { workout_id: 'pw1' },
        { toolCallId: '1', messages: [] }
      )

      // Should be 2026-02-10, NOT 2026-02-09
      expect(result.date).toBe('2026-02-10')
    })
  })

  describe('planningTools (AI SDK)', () => {
    it('get_planned_workouts should use correct date range and formatting', async () => {
      const { planningTools } = await import('../../../../server/utils/ai-tools/planning')
      const tools = planningTools(userId, timezone)

      const mockWorkouts = [
        {
          id: 'pw1',
          date: new Date('2026-02-10T00:00:00Z'),
          title: 'Planned Ride',
          type: 'Ride',
          startTime: '10:00'
        }
      ]

      const { plannedWorkoutRepository } =
        await import('../../../../server/utils/repositories/plannedWorkoutRepository')
      vi.mocked(plannedWorkoutRepository.list).mockResolvedValue(mockWorkouts as any)

      const result = await (tools.get_planned_workouts.execute as any)(
        {
          start_date: '2026-02-10',
          limit: 1
        },
        { toolCallId: '1', messages: [] }
      )

      expect(result.workouts[0].date).toBe('2026-02-10')
      // Ensure the repository was called with the correct UTC range for the local day
      // 2026-02-10 NY Start = 2026-02-10 05:00 UTC
      expect(vi.mocked(plannedWorkoutRepository.list)).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          startDate: new Date('2026-02-10T05:00:00.000Z')
        })
      )
    })
  })
})
