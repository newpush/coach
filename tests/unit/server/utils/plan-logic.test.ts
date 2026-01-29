import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  shiftPlanDates,
  calculateWeekTargets
} from '../../../../server/utils/plan-logic'
import { prisma } from '../../../../server/utils/db'

// Mock prisma
vi.mock('../../../../server/utils/db', () => ({
  prisma: {
    $executeRawUnsafe: vi.fn(),
    trainingBlock: {
      findMany: vi.fn()
    },
    trainingWeek: {
      findMany: vi.fn()
    }
  }
}))

describe('Plan Logic Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('shiftPlanDates', () => {
    it('should do nothing if daysDelta is 0', async () => {
      await shiftPlanDates('plan1', 1, 0)
      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled()
    })

    it('should shift blocks, weeks, and workouts', async () => {
      const planId = 'plan1'
      const fromOrder = 1
      const daysDelta = 7

      vi.mocked(prisma.trainingBlock.findMany).mockResolvedValue([
        { id: 'block1' },
        { id: 'block2' }
      ] as any)

      vi.mocked(prisma.trainingWeek.findMany).mockResolvedValue([
        { id: 'week1' },
        { id: 'week2' }
      ] as any)

      await shiftPlanDates(planId, fromOrder, daysDelta)

      // 1. Shift TrainingBlock
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "TrainingBlock"'),
        planId,
        fromOrder
      )

      // 2. Fetch shifted blocks
      expect(prisma.trainingBlock.findMany).toHaveBeenCalledWith({
        where: {
          trainingPlanId: planId,
          order: { gt: fromOrder }
        },
        select: { id: true }
      })

      // 3. Shift TrainingWeek
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "TrainingWeek"'),
        ['block1', 'block2']
      )

      // 4. Shift PlannedWorkout
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "PlannedWorkout"'),
        ['week1', 'week2']
      )
    })

    it('should not shift weeks if no blocks found', async () => {
      vi.mocked(prisma.trainingBlock.findMany).mockResolvedValue([])

      await shiftPlanDates('plan1', 1, 7)

      // Should call first update on blocks
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1)
      expect(prisma.trainingBlock.findMany).toHaveBeenCalled()
      // Should NOT call update on weeks or workouts
      // The first call is for blocks. Subsequent calls are inside if (shiftedBlockIds.length > 0)
    })
  })

  describe('calculateWeekTargets', () => {
    it('should calculate defaults (MID)', () => {
      const result = calculateWeekTargets('Build', 'MID')
      expect(result.volumeTargetMinutes).toBe(450)
      expect(result.tssTarget).toBe(Math.round((450/60)*50)) // 375
    })

    it('should calculate LOW volume', () => {
      const result = calculateWeekTargets('Base', 'LOW')
      expect(result.volumeTargetMinutes).toBe(240)
      expect(result.tssTarget).toBe(Math.round((240/60)*50)) // 200
    })

    it('should calculate HIGH volume', () => {
      const result = calculateWeekTargets('Base', 'HIGH')
      expect(result.volumeTargetMinutes).toBe(600)
      expect(result.tssTarget).toBe(Math.round((600/60)*50)) // 500
    })

     it('should fallback to MID for unknown preference', () => {
      const result = calculateWeekTargets('Base', 'UNKNOWN')
      expect(result.volumeTargetMinutes).toBe(450)
    })
  })
})
