import { describe, expect, it } from 'vitest'
import {
  detectIntervals,
  resolveProviderIntervalTypes
} from '../../../../server/utils/interval-detection'

describe('detectIntervals', () => {
  it('preserves the final recovery block before cooldown for plan-guided detection', () => {
    const warmup = Array.from({ length: 1200 }, () => 127)
    const work1 = Array.from({ length: 480 }, () => 153)
    const recovery1 = Array.from({ length: 120 }, () => 113)
    const work2 = Array.from({ length: 480 }, () => 153)
    const recovery2 = Array.from({ length: 120 }, () => 113)
    const work3 = Array.from({ length: 480 }, () => 153)
    const recovery3 = Array.from({ length: 120 }, (_, index) => (index < 100 ? 113 : 110))
    const cooldown = Array.from({ length: 600 }, (_, index) => 108 - index * 0.03)

    const time = Array.from(
      {
        length:
          warmup.length +
          work1.length +
          recovery1.length +
          work2.length +
          recovery2.length +
          work3.length +
          recovery3.length +
          cooldown.length
      },
      (_, index) => index
    )
    const watts = [
      ...warmup,
      ...work1,
      ...recovery1,
      ...work2,
      ...recovery2,
      ...work3,
      ...recovery3,
      ...cooldown
    ]
    const cadence = [
      ...Array.from({ length: 1200 }, () => 90),
      ...Array.from({ length: 480 }, () => 92),
      ...Array.from({ length: 120 }, () => 80),
      ...Array.from({ length: 480 }, () => 92),
      ...Array.from({ length: 120 }, () => 80),
      ...Array.from({ length: 480 }, () => 92),
      ...Array.from({ length: 120 }, () => 80),
      ...Array.from({ length: 600 }, (_, index) => 78 - index * 0.005)
    ]

    const plannedSteps = [
      {
        type: 'WARMUP',
        durationSeconds: 1200,
        power: { range: { start: 0.5, end: 0.7 } },
        cadence: 90
      },
      { type: 'WORK', durationSeconds: 480, power: { value: 0.72 }, cadence: 92 },
      { type: 'RECOVERY', durationSeconds: 120, power: { value: 0.52 }, cadence: 80 },
      { type: 'WORK', durationSeconds: 480, power: { value: 0.72 }, cadence: 92 },
      { type: 'RECOVERY', durationSeconds: 120, power: { value: 0.52 }, cadence: 80 },
      { type: 'WORK', durationSeconds: 480, power: { value: 0.72 }, cadence: 92 },
      { type: 'RECOVERY', durationSeconds: 120, power: { value: 0.52 }, cadence: 80 },
      {
        type: 'COOLDOWN',
        durationSeconds: 600,
        power: { range: { start: 0.5, end: 0.3 } },
        cadence: 75,
        ramp: true
      }
    ]

    const intervals = detectIntervals(time, watts, 'power', 212, plannedSteps, undefined, cadence)

    expect(intervals.map((interval) => interval.type)).toEqual([
      'WARMUP',
      'WORK',
      'RECOVERY',
      'WORK',
      'RECOVERY',
      'WORK',
      'RECOVERY',
      'COOLDOWN'
    ])
    expect(intervals[6]?.duration).toBeGreaterThanOrEqual(100)
    expect(intervals[6]?.avg_cadence).toBeGreaterThanOrEqual(78)
    expect(intervals[7]?.avg_cadence).toBeLessThan(intervals[6]?.avg_cadence || 999)
    expect(intervals[6]?.detection_confidence).toBeGreaterThan(0.35)
  })
})

describe('resolveProviderIntervalTypes', () => {
  // Intervals.icu labels nearly every synced lap WORK, including the recovery
  // jogs of a threshold session.
  const thresholdSession = [
    { type: 'WORK', intensity: 83, avgPower: 220 },
    { type: 'WORK', intensity: 101, avgPower: 270 },
    { type: 'WORK', intensity: 52, avgPower: 139 },
    { type: 'WORK', intensity: 103, avgPower: 275 },
    { type: 'WORK', intensity: 52, avgPower: 138 },
    { type: 'WORK', intensity: 105, avgPower: 280 },
    { type: 'WORK', intensity: 52, avgPower: 139 },
    { type: 'WORK', intensity: 109, avgPower: 291 },
    { type: 'WORK', intensity: 52, avgPower: 140 },
    { type: 'WORK', intensity: 69, avgPower: 184 },
    { type: 'RECOVERY', intensity: 38, avgPower: 103 }
  ]

  it('demotes recovery jogs and end blocks that the provider labelled WORK', () => {
    expect(resolveProviderIntervalTypes(thresholdSession)).toEqual([
      'WARMUP',
      'WORK',
      'RECOVERY',
      'WORK',
      'RECOVERY',
      'WORK',
      'RECOVERY',
      'WORK',
      'RECOVERY',
      'COOLDOWN',
      'RECOVERY'
    ])
  })

  it('falls back to average power when the provider reports no intensity', () => {
    const withoutIntensity = thresholdSession.map(({ type, avgPower }) => ({ type, avgPower }))
    expect(resolveProviderIntervalTypes(withoutIntensity)).toEqual(
      resolveProviderIntervalTypes(thresholdSession)
    )
  })

  it('leaves an evenly paced endurance run untouched', () => {
    const steadyLaps = [62, 64, 63, 65, 64, 63, 66, 64].map((intensity) => ({
      type: 'WORK',
      intensity
    }))
    expect(resolveProviderIntervalTypes(steadyLaps)).toEqual(steadyLaps.map(() => 'WORK'))
  })

  it('never promotes an explicit recovery label to work', () => {
    const laps = [
      { type: 'WARMUP', intensity: 60 },
      { type: 'RECOVERY', intensity: 104 },
      { type: 'WORK', intensity: 105 },
      { type: 'RECOVERY', intensity: 103 },
      { type: 'WORK', intensity: 106 }
    ]
    expect(resolveProviderIntervalTypes(laps)).toEqual([
      'WARMUP',
      'RECOVERY',
      'WORK',
      'RECOVERY',
      'WORK'
    ])
  })

  it('keeps provider types when there is nothing to compare', () => {
    expect(resolveProviderIntervalTypes([{ type: 'WORK' }, { type: 'WORK' }])).toEqual([
      'WORK',
      'WORK'
    ])
    expect(resolveProviderIntervalTypes([])).toEqual([])
  })
})
