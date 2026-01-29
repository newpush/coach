import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  calculateCTL,
  calculateATL,
  calculateTSB,
  getStressScore,
  getFormStatus,
  getTSBColorClass,
  calculatePMCForDateRange,
  getInitialPMCValues,
  getCurrentFitnessSummary,
  calculateProjectedPMC,
  PMCMetrics
} from '../../../../server/utils/training-stress'
import { prisma } from '../../../../server/utils/db'

// Mock prisma
vi.mock('../../../../server/utils/db', () => ({
  prisma: {
    workout: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn()
    },
    wellness: {
      findMany: vi.fn(),
      findFirst: vi.fn()
    }
  }
}))

describe('Training Stress Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Pure Functions', () => {
    it('calculateCTL should calculate correct CTL based on time constant of 42', () => {
      // CTL_today = CTL_yesterday + (TSS_today - CTL_yesterday) / 42
      const prevCTL = 50
      const todayTSS = 100
      const expected = 50 + (100 - 50) / 42
      expect(calculateCTL(prevCTL, todayTSS)).toBeCloseTo(expected)
    })

    it('calculateATL should calculate correct ATL based on time constant of 7', () => {
      // ATL_today = ATL_yesterday + (TSS_today - ATL_yesterday) / 7
      const prevATL = 50
      const todayTSS = 100
      const expected = 50 + (100 - 50) / 7
      expect(calculateATL(prevATL, todayTSS)).toBeCloseTo(expected)
    })

    it('calculateTSB should return null if inputs are null', () => {
      expect(calculateTSB(null, 50)).toBeNull()
      expect(calculateTSB(50, null)).toBeNull()
      expect(calculateTSB(null, null)).toBeNull()
    })

    it('calculateTSB should return correct TSB', () => {
      expect(calculateTSB(100, 80)).toBe(20)
      expect(calculateTSB(80, 100)).toBe(-20)
    })

    it('getStressScore should prioritize tss > hrss > trimp', () => {
      expect(getStressScore({ tss: 100, hrss: 50, trimp: 20 })).toBe(100)
      expect(getStressScore({ hrss: 50, trimp: 20 })).toBe(50)
      expect(getStressScore({ trimp: 20 })).toBe(20)
      expect(getStressScore({})).toBe(0)
    })

    it('getFormStatus should return correct status based on TSB', () => {
      expect(getFormStatus(30)).toMatchObject({ status: 'No Fitness', color: 'gray' })
      expect(getFormStatus(10)).toMatchObject({ status: 'Performance', color: 'green' })
      expect(getFormStatus(0)).toMatchObject({ status: 'Maintenance', color: 'yellow' })
      expect(getFormStatus(-15)).toMatchObject({ status: 'Productive', color: 'blue' })
      expect(getFormStatus(-30)).toMatchObject({ status: 'Cautionary', color: 'orange' })
      expect(getFormStatus(-50)).toMatchObject({ status: 'Overreaching', color: 'red' })
    })

    it('getTSBColorClass should return correct color class', () => {
      expect(getTSBColorClass(null)).toBe('text-gray-400')
      expect(getTSBColorClass(10)).toContain('green')
      expect(getTSBColorClass(0)).toContain('yellow')
      expect(getTSBColorClass(-15)).toContain('blue')
      expect(getTSBColorClass(-30)).toContain('red') // Cautionary and Overreaching both red? Let's check impl.
      // Implementation:
      // >= 5 green
      // >= -10 yellow
      // >= -25 blue
      // else red
      expect(getTSBColorClass(-24)).toContain('blue')
      expect(getTSBColorClass(-26)).toContain('red')
    })
  })

  describe('calculatePMCForDateRange', () => {
    it('should calculate PMC correctly merging workouts and wellness', async () => {
      const userId = 'user1'
      const startDate = new Date('2023-01-01T00:00:00Z')
      const endDate = new Date('2023-01-03T00:00:00Z')

      const workouts = [
        { date: new Date('2023-01-01T10:00:00Z'), tss: 100, ctl: null, atl: null },
        { date: new Date('2023-01-02T10:00:00Z'), tss: 50, ctl: null, atl: null }
      ]

      const wellness = [
        { date: new Date('2023-01-02T00:00:00Z'), ctl: 60, atl: 70 } // Truth for day 2
      ]

      vi.mocked(prisma.workout.findMany).mockResolvedValue(workouts as any)
      vi.mocked(prisma.wellness.findMany).mockResolvedValue(wellness as any)

      const result = await calculatePMCForDateRange(startDate, endDate, userId, 50, 50)

      expect(result).toHaveLength(3) // Jan 1, Jan 2, Jan 3

      // Day 1: Calculated from initial (50, 50) + 100 TSS
      // CTL = 50 + (100 - 50)/42 = 51.19
      // ATL = 50 + (100 - 50)/7 = 57.14
      expect(result[0].date).toEqual(new Date('2023-01-01T00:00:00.000Z'))
      expect(result[0].ctl).toBeCloseTo(51.19, 2)
      expect(result[0].atl).toBeCloseTo(57.14, 2)
      expect(result[0].tss).toBe(100)

      // Day 2: Overridden by wellness (60, 70)
      expect(result[1].date).toEqual(new Date('2023-01-02T00:00:00.000Z'))
      expect(result[1].ctl).toBe(60)
      expect(result[1].atl).toBe(70)
      expect(result[1].tss).toBe(50)

      // Day 3: Calculated from Day 2 (60, 70) + 0 TSS
      // CTL = 60 + (0 - 60)/42 = 58.57
      // ATL = 70 + (0 - 70)/7 = 60.00
      expect(result[2].date).toEqual(new Date('2023-01-03T00:00:00.000Z'))
      expect(result[2].ctl).toBeCloseTo(58.57, 2)
      expect(result[2].atl).toBeCloseTo(60.00, 2)
      expect(result[2].tss).toBe(0)
    })
  })

  describe('getInitialPMCValues', () => {
    it('should return 0,0 if no data found', async () => {
      vi.mocked(prisma.workout.findFirst).mockResolvedValue(null)
      vi.mocked(prisma.wellness.findFirst).mockResolvedValue(null)

      const result = await getInitialPMCValues('user1', new Date())
      expect(result).toEqual({ ctl: 0, atl: 0 })
    })

    it('should prefer workout if newer', async () => {
      vi.mocked(prisma.workout.findFirst).mockResolvedValue({
        date: new Date('2023-01-05'),
        ctl: 100,
        atl: 100
      } as any)
      vi.mocked(prisma.wellness.findFirst).mockResolvedValue({
        date: new Date('2023-01-01'),
        ctl: 50,
        atl: 50
      } as any)

      const result = await getInitialPMCValues('user1', new Date())
      expect(result).toEqual({ ctl: 100, atl: 100 })
    })

    it('should prefer wellness if newer', async () => {
      vi.mocked(prisma.workout.findFirst).mockResolvedValue({
        date: new Date('2023-01-01'),
        ctl: 50,
        atl: 50
      } as any)
      vi.mocked(prisma.wellness.findFirst).mockResolvedValue({
        date: new Date('2023-01-05'),
        ctl: 100,
        atl: 100
      } as any)

      const result = await getInitialPMCValues('user1', new Date())
      expect(result).toEqual({ ctl: 100, atl: 100 })
    })
  })

  describe('getCurrentFitnessSummary', () => {
    it('should return default summary if no data', async () => {
      vi.mocked(prisma.workout.findFirst).mockResolvedValue(null)
      vi.mocked(prisma.wellness.findFirst).mockResolvedValue(null)

      const result = await getCurrentFitnessSummary('user1')
      expect(result).toMatchObject({ ctl: 0, atl: 0, tsb: 0 })
    })

    it('should prioritize wellness if same day as workout', async () => {
      const today = new Date('2023-01-01T12:00:00Z')
      vi.mocked(prisma.workout.findFirst).mockResolvedValue({
        date: today,
        ctl: 50,
        atl: 50
      } as any)
      vi.mocked(prisma.wellness.findFirst).mockResolvedValue({
        date: today,
        ctl: 60,
        atl: 60
      } as any)

      const result = await getCurrentFitnessSummary('user1')
      expect(result).toMatchObject({ ctl: 60, atl: 60 })
    })
  })

  describe('calculateProjectedPMC', () => {
    it('should calculate projected metrics', () => {
      const startDate = new Date('2023-01-01T00:00:00Z')
      const endDate = new Date('2023-01-02T00:00:00Z')
      const initialCTL = 50
      const initialATL = 50
      const plannedWorkouts = [
        { date: new Date('2023-01-01T10:00:00Z'), tss: 100 }
      ]

      const result = calculateProjectedPMC(startDate, endDate, initialCTL, initialATL, plannedWorkouts)

      expect(result).toHaveLength(2)

      // Day 1
      expect(result[0].ctl).toBeCloseTo(51.19, 2)
      expect(result[0].atl).toBeCloseTo(57.14, 2)

      // Day 2 (0 TSS)
      expect(result[1].ctl).toBeCloseTo(49.97, 2) // Calculated from Day 1 values
      expect(result[1].atl).toBeCloseTo(48.98, 2)
    })
  })
})
