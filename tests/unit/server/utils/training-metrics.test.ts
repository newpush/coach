import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  calculateTSS,
  getZoneIndex,
  calculateZoneDistribution,
  calculateLoadTrends,
  calculateActivityBreakdown,
  calculateIntensityDistribution,
  generateTrainingContext,
  formatTrainingContextForPrompt,
  DEFAULT_HR_ZONES,
  DEFAULT_POWER_ZONES
} from '../../../../server/utils/training-metrics'
import { prisma } from '../../../../server/utils/db'
import { sportSettingsRepository } from '../../../../server/utils/repositories/sportSettingsRepository'

// Mock prisma
vi.mock('../../../../server/utils/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn()
    },
    workoutStream: {
      findMany: vi.fn()
    },
    workout: {
      findMany: vi.fn()
    },
    wellness: {
      findMany: vi.fn(),
      findFirst: vi.fn()
    }
  }
}))

// Mock sportSettingsRepository
vi.mock('../../../../server/utils/repositories/sportSettingsRepository', () => ({
  sportSettingsRepository: {
    getDefault: vi.fn()
  }
}))

describe('Training Metrics Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('calculateTSS', () => {
    it('should calculate TSS from fields in priority order', () => {
      expect(calculateTSS({ tss: 100, trimp: 50, plannedTss: 20 })).toBe(100)
      expect(calculateTSS({ trimp: 50, plannedTss: 20 })).toBe(50)
      expect(calculateTSS({ plannedTss: 20 })).toBe(20)
      expect(calculateTSS({})).toBe(0)
    })
  })

  describe('getZoneIndex', () => {
    const zones = [
      { name: 'Z1', min: 0, max: 100 },
      { name: 'Z2', min: 101, max: 200 }
    ]

    it('should return correct index for value in zone', () => {
      expect(getZoneIndex(50, zones)).toBe(0)
      expect(getZoneIndex(150, zones)).toBe(1)
    })

    it('should return last zone index if value is above all zones', () => {
      expect(getZoneIndex(300, zones)).toBe(1)
    })

    it('should return -1 if value is not in any zone (e.g. negative if zones start at 0)', () => {
      expect(getZoneIndex(-10, zones)).toBe(-1)
    })
  })

  describe('calculateZoneDistribution', () => {
    const userId = 'user1'
    const workoutIds = ['w1']

    it('should return empty object if no workouts', async () => {
      const result = await calculateZoneDistribution([], userId)
      expect(result).toEqual({})
    })

    it('should calculate distribution using default profile zones', async () => {
      const mockZones = [
        { name: 'Z1', min: 0, max: 100 },
        { name: 'Z2', min: 101, max: 200 }
      ]
      vi.mocked(sportSettingsRepository.getDefault).mockResolvedValue({
        hrZones: mockZones,
        powerZones: mockZones
      } as any)

      vi.mocked(prisma.workoutStream.findMany).mockResolvedValue([
        {
          workoutId: 'w1',
          heartrate: [50, 150], // 1 in Z1, 1 in Z2
          watts: [50, 150], // 1 in Z1, 1 in Z2
          hrZoneTimes: null,
          powerZoneTimes: null
        }
      ] as any)

      const result = await calculateZoneDistribution(workoutIds, userId)

      expect(result.hr).toBeDefined()
      expect(result.hr!.zones[0].percentage).toBe(50)
      expect(result.hr!.zones[1].percentage).toBe(50)
      expect(result.hr!.totalTime).toBe(2)

      expect(result.power).toBeDefined()
      expect(result.power!.zones[0].percentage).toBe(50)
      expect(result.power!.zones[1].percentage).toBe(50)
    })

    it('should use pre-calculated zone times if available', async () => {
       const mockZones = [
        { name: 'Z1', min: 0, max: 100 },
        { name: 'Z2', min: 101, max: 200 }
      ]
      vi.mocked(sportSettingsRepository.getDefault).mockResolvedValue({
        hrZones: mockZones,
        powerZones: mockZones
      } as any)

      vi.mocked(prisma.workoutStream.findMany).mockResolvedValue([
        {
          workoutId: 'w1',
          hrZoneTimes: [100, 300, 0, 0, 0], // 100s in Z1, 300s in Z2, need length >= 5
          powerZoneTimes: [200, 200, 0, 0, 0]
        }
      ] as any)

      const result = await calculateZoneDistribution(workoutIds, userId)

      expect(result.hr!.totalTime).toBe(400)
      expect(result.hr!.zones[0].percentage).toBe(25)
      expect(result.hr!.zones[1].percentage).toBe(75)

      expect(result.power!.totalTime).toBe(400)
      expect(result.power!.zones[0].percentage).toBe(50)
      expect(result.power!.zones[1].percentage).toBe(50)
    })
  })

  describe('calculateLoadTrends', () => {
    it('should merge workout and wellness data correctly', async () => {
      const userId = 'user1'
      const startDate = new Date('2023-01-01')
      const endDate = new Date('2023-01-03')

      vi.mocked(prisma.workout.findMany).mockResolvedValue([
        { date: new Date('2023-01-01'), ctl: 10, atl: 10 },
        { date: new Date('2023-01-02'), ctl: 11, atl: 11 }
      ] as any)

      vi.mocked(prisma.wellness.findMany).mockResolvedValue([
        { date: new Date('2023-01-03'), ctl: 12, atl: 12 }
      ] as any)

      const result = await calculateLoadTrends(userId, startDate, endDate)

      expect(result).toHaveLength(3)
      expect(result[0].ctl).toBe(10)
      expect(result[0].tsb).toBe(0) // 10-10
      expect(result[1].ctl).toBe(11)
      expect(result[2].ctl).toBe(12)
    })
  })

  describe('calculateActivityBreakdown', () => {
    it('should aggregate activity stats', async () => {
      vi.mocked(prisma.workout.findMany).mockResolvedValue([
        { type: 'Run', durationSec: 3600, distanceMeters: 10000, tss: 100 },
        { type: 'Run', durationSec: 1800, distanceMeters: 5000, tss: 50 },
        { type: 'Ride', durationSec: 7200, distanceMeters: 40000, tss: 150 }
      ] as any)

      const result = await calculateActivityBreakdown('user1', new Date(), new Date())

      expect(result).toHaveLength(2)

      const run = result.find(r => r.type === 'Run')
      expect(run).toBeDefined()
      expect(run!.count).toBe(2)
      expect(run!.totalDuration).toBe(5400)
      expect(run!.totalTSS).toBe(150)
      expect(run!.avgTSS).toBe(75)

      const ride = result.find(r => r.type === 'Ride')
      expect(ride).toBeDefined()
      expect(ride!.count).toBe(1)
      expect(ride!.totalTSS).toBe(150)
    })
  })

  describe('calculateIntensityDistribution', () => {
    it('should categorize based on intensity factor', async () => {
      // recovery < 0.7
      // endurance 0.7 - 0.85
      // tempo 0.85 - 0.95
      // threshold 0.95 - 1.05
      // vo2max > 1.05

      vi.mocked(prisma.workout.findMany).mockResolvedValue([
        { intensity: 0.6, durationSec: 1000 }, // recovery
        { intensity: 0.8, durationSec: 1000 }, // endurance
        { intensity: 0.9, durationSec: 1000 }, // tempo
        { intensity: 1.0, durationSec: 1000 }, // threshold
        { intensity: 1.1, durationSec: 1000 }  // vo2max
      ] as any)

      const result = await calculateIntensityDistribution('user1', new Date(), new Date())

      expect(result.recovery).toBe(20)
      expect(result.endurance).toBe(20)
      expect(result.tempo).toBe(20)
      expect(result.threshold).toBe(20)
      expect(result.vo2max).toBe(20)
    })

    it('should calculate intensity from TSS if missing', async () => {
      // IF = sqrt((TSS * 3600) / (Duration * 100))
      // Let TSS = 100, Duration = 3600. IF = sqrt(360000 / 360000) = 1.0 -> Threshold
      vi.mocked(prisma.workout.findMany).mockResolvedValue([
        { intensity: null, tss: 100, durationSec: 3600 }
      ] as any)

      const result = await calculateIntensityDistribution('user1', new Date(), new Date())

      expect(result.threshold).toBe(100)
    })
  })

  describe('generateTrainingContext', () => {
    it('should generate comprehensive context', async () => {
      const userId = 'user1'
      const startDate = new Date('2023-01-01')
      const endDate = new Date('2023-01-07')

      // Mock workouts
      vi.mocked(prisma.workout.findMany).mockResolvedValue([
        {
          id: 'w1',
          date: new Date('2023-01-07'),
          durationSec: 3600,
          distanceMeters: 10000,
          tss: 100,
          ctl: 50,
          atl: 50,
          type: 'Run',
          intensity: 1.0
        },
         {
          id: 'w2',
          date: new Date('2023-01-01'),
          durationSec: 3600,
          distanceMeters: 10000,
          tss: 100,
          ctl: 44,
          atl: 45,
          type: 'Run',
          intensity: 1.0
        }
      ] as any)

      vi.mocked(prisma.wellness.findFirst).mockResolvedValue(null)

      const context = await generateTrainingContext(userId, startDate, endDate, { includeZones: false })

      expect(context.summary.totalWorkouts).toBe(2)
      expect(context.summary.totalTSS).toBe(200)
      expect(context.loadTrend.currentCTL).toBe(50)
      expect(context.loadTrend.trend).toBe('increasing')
    })

    it('should detect increasing trend', async () => {
       vi.mocked(prisma.workout.findMany).mockResolvedValue([
        { id: 'w1', date: new Date('2023-01-07'), ctl: 56, atl: 50, durationSec: 100 },
        { id: 'w2', date: new Date('2023-01-01'), ctl: 50, atl: 45, durationSec: 100 }
      ] as any)

      const context = await generateTrainingContext('user1', new Date(), new Date())
      expect(context.loadTrend.trend).toBe('increasing')
    })
  })

  describe('formatTrainingContextForPrompt', () => {
    it('should format context into string', () => {
      const context = {
        period: 'Test Period',
        summary: {
          totalWorkouts: 5,
          totalDuration: 18000, // 5 hours
          totalDistance: 50000, // 50km
          totalTSS: 300,
          avgTSS: 60
        },
        loadTrend: {
          currentCTL: 50,
          currentATL: 60,
          currentTSB: -10,
          trend: 'stable' as const,
          weeklyTSSAvg: 300
        },
        activityBreakdown: [
          { type: 'Run', count: 5, totalDuration: 18000, totalDistance: 50000, totalTSS: 300, avgTSS: 60 }
        ],
        intensityDistribution: {
          recovery: 0,
          endurance: 80,
          tempo: 20,
          threshold: 0,
          vo2max: 0
        }
      }

      const formatted = formatTrainingContextForPrompt(context)

      expect(formatted).toContain('## Training Context: Test Period')
      expect(formatted).toContain('Total Workouts: 5')
      expect(formatted).toContain('Total Duration: 5.0 hours')
      expect(formatted).toContain('Chronic Training Load (CTL/Fitness): 50.0')
      expect(formatted).toContain('Endurance (70-85% IF): 80.0%')
    })
  })
})
