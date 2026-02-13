import { describe, it, expect } from 'vitest'
import { useZoneDistribution, type ZoneDistributionWorkout } from '~/composables/useZoneDistribution'

describe('useZoneDistribution', () => {
  it('should return initial distribution for empty workouts', () => {
    const distribution = useZoneDistribution([])
    expect(distribution.every(z => z.duration === 0)).toBe(true)
    expect(distribution.some(z => z.name === 'Strength')).toBe(true)
  })

  it('should calculate duration for workouts with steps (power)', () => {
    const workouts: ZoneDistributionWorkout[] = [
      {
        structuredWorkout: {
          steps: [
            { duration: 600, power: 0.5 }, // Z1 (0-0.55)
            { duration: 600, power: 0.7 }, // Z2 (0.55-0.75)
          ]
        }
      }
    ]
    const distribution = useZoneDistribution(workouts)
    expect(distribution.find(z => z.name === 'Z1')?.duration).toBe(600)
    expect(distribution.find(z => z.name === 'Z2')?.duration).toBe(600)
  })

  it('should count WeightTraining workouts in Strength zone', () => {
    const workouts: ZoneDistributionWorkout[] = [
      {
        type: 'WeightTraining',
        durationSec: 3600,
        structuredWorkout: {
           exercises: [ { name: 'Squat' }]
        }
      }
    ]
    const distribution = useZoneDistribution(workouts)

    expect(distribution.find(z => z.name === 'Strength')?.duration).toBe(3600)
  })

  it('should count Gym workouts in Strength zone', () => {
      const workouts: ZoneDistributionWorkout[] = [
        {
          type: 'Gym',
          durationSec: 1800,
        }
      ]
      const distribution = useZoneDistribution(workouts)

      expect(distribution.find(z => z.name === 'Strength')?.duration).toBe(1800)
  })

  it('should fallback to structuredWorkout.duration if durationSec is 0', () => {
      const workouts: ZoneDistributionWorkout[] = [
        {
          type: 'WeightTraining',
          durationSec: 0,
          structuredWorkout: {
             duration: 1200 // 20 mins
          }
        }
      ]
      const distribution = useZoneDistribution(workouts)
      expect(distribution.find(z => z.name === 'Strength')?.duration).toBe(1200)
  })
})
