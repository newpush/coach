import { describe, it, expect } from 'vitest'
import {
  calculateHrZones,
  calculatePaceZones,
  calculatePowerZones,
  formatZoneRange,
  identifyZone,
  type Zone
} from '../../../../server/utils/zones'
import { resolveZonesForMigration } from '../../../../cli/db/migrate-zones'

/** Bands that contain `value` by their own [min, max] definition. */
function containingBands(value: number, zones: Zone[]): Zone[] {
  return zones.filter((zone) => value >= zone.min && value <= zone.max)
}

/**
 * The CW-416 invariant for integer metrics (bpm, watts): the bands tile
 * 0..lastMax with no hole and no overlap, so every integer belongs to exactly
 * one band and `identifyZone` always resolves.
 */
function expectIntegerSweepCovers(zones: Zone[], label: string) {
  expect(zones.length).toBeGreaterThan(0)
  const top = zones[zones.length - 1]!
  for (let value = 0; value <= top.max; value++) {
    const matches = containingBands(value, zones)
    expect(
      matches.length,
      `${label}: value ${value} matched ${matches.length} bands (${matches
        .map((zone) => zone.name)
        .join(', ')})`
    ).toBe(1)
    expect(identifyZone(value, zones)?.name, `${label}: identifyZone(${value})`).toBe(
      matches[0]!.name
    )
  }
}

describe('Zone Utils', () => {
  describe('band boundary invariant (CW-416)', () => {
    it('leaves no integer gap between HR bands for any plausible LTHR', () => {
      for (let lthr = 120; lthr <= 200; lthr++) {
        const zones = calculateHrZones(lthr, 200)
        expect(zones).toHaveLength(7)
        for (let i = 1; i < zones.length; i++) {
          expect(zones[i]!.min, `LTHR ${lthr}: ${zones[i]!.name} floor`).toBe(zones[i - 1]!.max + 1)
        }
        expectIntegerSweepCovers(zones, `LTHR ${lthr}`)
      }
    })

    it('leaves no integer gap between max-HR bands for any plausible max HR', () => {
      for (let maxHr = 140; maxHr <= 220; maxHr++) {
        const zones = calculateHrZones(null, maxHr)
        expect(zones).toHaveLength(5)
        for (let i = 1; i < zones.length; i++) {
          expect(zones[i]!.min, `maxHr ${maxHr}: ${zones[i]!.name} floor`).toBe(
            zones[i - 1]!.max + 1
          )
        }
        expectIntegerSweepCovers(zones, `maxHr ${maxHr}`)
      }
    })

    it('leaves no integer gap between power bands for any plausible FTP', () => {
      for (let ftp = 80; ftp <= 500; ftp += 1) {
        const zones = calculatePowerZones(ftp)
        expect(zones).toHaveLength(7)
        for (let i = 1; i < zones.length; i++) {
          expect(zones[i]!.min, `FTP ${ftp}: ${zones[i]!.name} floor`).toBe(zones[i - 1]!.max + 1)
        }
      }
      // The full 0..2000 W sweep is expensive, so run it on a few references.
      for (const ftp of [150, 200, 233, 250, 317, 400]) {
        expectIntegerSweepCovers(calculatePowerZones(ftp), `FTP ${ftp}`)
      }
    })

    it('leaves no gap between pace bands (continuous, half-open)', () => {
      for (const thresholdPace of [2.5, 3, 3.75, 4, 4.5, 5.2]) {
        const zones = calculatePaceZones(thresholdPace)
        expect(zones).toHaveLength(6)
        for (let i = 1; i < zones.length; i++) {
          // Continuous domain: the next band starts exactly where the previous
          // one ends, and identifyZone resolves the shared point downward.
          expect(zones[i]!.min, `pace ${thresholdPace}: ${zones[i]!.name} floor`).toBe(
            zones[i - 1]!.max
          )
        }
        const top = zones[zones.length - 1]!
        for (let step = 0; step <= 2000; step++) {
          const value = (step * top.max) / 2000
          const zone = identifyZone(value, zones)
          expect(zone, `pace ${thresholdPace}: identifyZone(${value})`).toBeDefined()
        }
      }
    })

    it('resolves the specific bpm values that used to fall through every band', () => {
      // LTHR 160: Z4 ended at round(160 * 0.99) = 158 while Z5a started at
      // round(160 * 1.0) = 160, so 159 matched nothing. Same story at 164.
      const zones = calculateHrZones(160, 195)
      expect(identifyZone(159, zones)?.name).toBe('Z5a SuperThreshold')
      expect(identifyZone(164, zones)?.name).toBe('Z5b Aerobic Capacity')

      // LTHR 150 lost 154 (Z5a/Z5b) and 160 (Z5b/Z5c) the same way.
      const zones150 = calculateHrZones(150, 190)
      expect(identifyZone(154, zones150)?.name).toBe('Z5b Aerobic Capacity')
      expect(identifyZone(160, zones150)?.name).toBe('Z5c Anaerobic')
    })

    it('keeps fractional values (interval averages) inside a band', () => {
      const zones = calculateHrZones(160, 195)
      expect(identifyZone(158.4, zones)?.name).toBe('Z5a SuperThreshold')
      expect(identifyZone(130.5, zones)?.name).toBe('Z2 Aerobic')
      const power = calculatePowerZones(250)
      expect(identifyZone(138.6, power)?.name).toBe('Z2 Endurance')
    })

    it('never inverts a band when max HR sits below the top LTHR band floor', () => {
      const zones = calculateHrZones(180, 150)
      for (const zone of zones) expect(zone.max).toBeGreaterThanOrEqual(zone.min)
      expectIntegerSweepCovers(zones, 'LTHR 180 / maxHr 150')
    })
  })

  describe('zone assignments are unchanged outside the gaps', () => {
    // Golden table captured from the pre-CW-416 implementation. Every one of
    // these resolved to the same band before the fix; if one moves, the zone
    // model has been changed rather than the holes closed.
    it('assigns the same HR zone as before for LTHR 160 / max HR 195', () => {
      const zones = calculateHrZones(160, 195)
      const expected: Array<[number, string]> = [
        [0, 'Z1 Recovery'],
        [100, 'Z1 Recovery'],
        [125, 'Z1 Recovery'],
        [130, 'Z1 Recovery'],
        [140, 'Z2 Aerobic'],
        [145, 'Z3 Tempo'],
        [150, 'Z4 SubThreshold'],
        [155, 'Z4 SubThreshold'],
        [158, 'Z4 SubThreshold'],
        [160, 'Z5a SuperThreshold'],
        [162, 'Z5a SuperThreshold'],
        [165, 'Z5b Aerobic Capacity'],
        [168, 'Z5b Aerobic Capacity'],
        [170, 'Z5b Aerobic Capacity'],
        [175, 'Z5c Anaerobic'],
        [190, 'Z5c Anaerobic'],
        [195, 'Z5c Anaerobic']
      ]
      for (const [value, name] of expected) {
        expect(identifyZone(value, zones)?.name, `bpm ${value}`).toBe(name)
      }
    })

    it('assigns the same max-HR zone as before for max HR 195', () => {
      const zones = calculateHrZones(null, 195)
      const expected: Array<[number, string]> = [
        [0, 'Z1 Recovery'],
        [117, 'Z1 Recovery'],
        [125, 'Z2 Endurance'],
        [136, 'Z2 Endurance'],
        [145, 'Z3 Tempo'],
        [156, 'Z3 Tempo'],
        [170, 'Z4 Threshold'],
        [176, 'Z4 Threshold'],
        [190, 'Z5 Anaerobic'],
        [195, 'Z5 Anaerobic']
      ]
      for (const [value, name] of expected) {
        expect(identifyZone(value, zones)?.name, `bpm ${value}`).toBe(name)
      }
    })

    it('assigns the same power zone as before for FTP 250', () => {
      const zones = calculatePowerZones(250)
      expect(zones.map((zone) => [zone.min, zone.max])).toEqual([
        [0, 138],
        [139, 188],
        [189, 225],
        [226, 263],
        [264, 300],
        [301, 375],
        [376, 2000]
      ])
      const expected: Array<[number, string]> = [
        [0, 'Z1 Active Recovery'],
        [137, 'Z1 Active Recovery'],
        [150, 'Z2 Endurance'],
        [187, 'Z2 Endurance'],
        [200, 'Z3 Tempo'],
        [225, 'Z3 Tempo'],
        [250, 'Z4 Threshold'],
        [262, 'Z4 Threshold'],
        [280, 'Z5 VO2 Max'],
        [300, 'Z5 VO2 Max'],
        [350, 'Z6 Anaerobic'],
        [375, 'Z6 Anaerobic'],
        [400, 'Z7 Neuromuscular'],
        [500, 'Z7 Neuromuscular']
      ]
      for (const [value, name] of expected) {
        expect(identifyZone(value, zones)?.name, `${value}W`).toBe(name)
      }
    })

    it('assigns the same pace zone as before for a 4 m/s threshold', () => {
      const zones = calculatePaceZones(4)
      const expected: Array<[number, string]> = [
        [0.5, 'Z1 Recovery'],
        [2.5, 'Z1 Recovery'],
        [3.0, 'Z1 Recovery'],
        [3.3, 'Z2 Aerobic'],
        [3.5, 'Z2 Aerobic'],
        [3.7, 'Z3 Tempo'],
        [3.9, 'Z4 Threshold'],
        [4.0, 'Z4 Threshold'],
        [4.1, 'Z4 Threshold'],
        [4.3, 'Z5 VO2 Max'],
        [4.5, 'Z5 VO2 Max'],
        [4.7, 'Z6 Speed'],
        [5.0, 'Z6 Speed'],
        [6.0, 'Z6 Speed']
      ]
      for (const [value, name] of expected) {
        expect(identifyZone(value, zones)?.name, `${value} m/s`).toBe(name)
      }
    })
  })

  describe('calculatePowerZones', () => {
    it('calculates Coggan Classic zones correctly for 200W FTP', () => {
      const zones = calculatePowerZones(200, 'coggan_classic')

      expect(zones).toHaveLength(7)
      expect(zones.map((zone) => [zone.name.split(' ')[0], zone.min, zone.max])).toEqual([
        ['Z1', 0, 110],
        ['Z2', 111, 150],
        ['Z3', 151, 180],
        ['Z4', 181, 210],
        ['Z5', 211, 240],
        ['Z6', 241, 300],
        ['Z7', 301, 2000]
      ])
    })
  })

  describe('calculateHrZones', () => {
    it('calculates Friel LTHR zones for 170 BPM LTHR', () => {
      const lthr = 170
      const zones = calculateHrZones(lthr, 190)

      expect(zones).toHaveLength(7)

      // Z1 Recovery: up to 81%
      expect(zones[0]!.name).toContain('Z1')
      expect(zones[0]!.min).toBe(0)
      expect(zones[0]!.max).toBe(Math.round(lthr * 0.81))

      // Z2 Aerobic: up to 89%
      expect(zones[1]!.name).toContain('Z2')
      expect(zones[1]!.min).toBe(zones[0]!.max + 1)
      expect(zones[1]!.max).toBe(Math.round(lthr * 0.89))

      // Z5a SuperThreshold: ceiling stays at 102%; the floor now meets Z4's
      // ceiling instead of jumping to 100% and leaving a hole (CW-416).
      expect(zones[4]!.name).toContain('Z5a')
      expect(zones[4]!.min).toBe(zones[3]!.max + 1)
      expect(zones[4]!.max).toBe(Math.round(lthr * 1.02))

      // Top band is capped by max HR.
      expect(zones[6]!.max).toBe(190)
    })

    it('falls back to MaxHR zones if LTHR is missing', () => {
      const zones = calculateHrZones(null, 200)

      expect(zones).toHaveLength(5)
      expect(zones[0]!.name).toContain('Z1')
      expect(zones[0]!.max).toBe(120)
      expect(zones[4]!.name).toContain('Z5')
      expect(zones[4]!.min).toBe(181)
      expect(zones[4]!.max).toBe(200)
    })

    it('returns empty array if no HR data provided', () => {
      expect(calculateHrZones(null, null)).toHaveLength(0)
    })
  })

  describe('calculatePaceZones', () => {
    it('returns empty array without a threshold pace', () => {
      expect(calculatePaceZones(null)).toHaveLength(0)
      expect(calculatePaceZones(0)).toHaveLength(0)
    })
  })

  describe('formatZoneRange', () => {
    it('formats watts correctly', () => {
      expect(formatZoneRange({ name: 'Z1', min: 100, max: 200 }, 'W')).toBe('100-200W')
    })
  })

  /**
   * CW-431: `cli/db/migrate-zones.ts` used to carry its own copy of the zone
   * maths, with different HR band names and three different percentages. It now
   * imports the canonical helpers; these tests fail the moment anyone
   * reintroduces a second implementation.
   */
  describe('migration tool parity (CW-431)', () => {
    it('derives byte-identical zone definitions to server/utils/zones for any references', () => {
      for (const ftp of [null, 150, 200, 233, 250, 317, 400]) {
        for (const lthr of [null, 140, 150, 160, 170, 185]) {
          for (const maxHr of [null, 175, 190, 195, 200, 220]) {
            const label = `ftp ${ftp} / lthr ${lthr} / maxHr ${maxHr}`
            const resolved = resolveZonesForMigration({ ftp, lthr, maxHr })

            expect(resolved.powerZones, `${label}: power`).toEqual(
              ftp ? calculatePowerZones(ftp) : []
            )
            expect(resolved.hrZones, `${label}: hr`).toEqual(
              lthr || maxHr ? calculateHrZones(lthr, maxHr) : []
            )
          }
        }
      }
    })

    it('emits the canonical Friel band names, not the pre-CW-431 Z5/Z6/Z7 ones', () => {
      const { hrZones } = resolveZonesForMigration({ lthr: 160, maxHr: 195 })
      expect(hrZones.map((zone) => zone.name)).toEqual([
        'Z1 Recovery',
        'Z2 Aerobic',
        'Z3 Tempo',
        'Z4 SubThreshold',
        'Z5a SuperThreshold',
        'Z5b Aerobic Capacity',
        'Z5c Anaerobic'
      ])
    })

    it('uses the five-band max-HR model when LTHR is absent instead of estimating one', () => {
      // The old copy derived `lthr = round(maxHr * 0.85)` and always emitted
      // seven Friel bands, so a max-HR-only athlete saw a different model from
      // the one the app computes for them.
      const { hrZones } = resolveZonesForMigration({ lthr: null, maxHr: 195 })
      expect(hrZones).toEqual(calculateHrZones(null, 195))
      expect(hrZones).toHaveLength(5)
    })

    it('carries existing zones over untouched rather than recomputing them', () => {
      const custom: Zone[] = [{ name: 'My Zone', min: 0, max: 999 }]
      const resolved = resolveZonesForMigration({ ftp: 250, lthr: 160, maxHr: 195 }, custom, custom)

      expect(resolved.hrZones).toBe(custom)
      expect(resolved.powerZones).toBe(custom)
      expect(resolved.computedHrZones).toBe(false)
      expect(resolved.computedPowerZones).toBe(false)
    })

    it('reports nothing to store when the athlete has no references at all', () => {
      const resolved = resolveZonesForMigration({ ftp: null, lthr: null, maxHr: null })
      expect(resolved).toEqual({
        hrZones: [],
        powerZones: [],
        computedHrZones: false,
        computedPowerZones: false
      })
    })
  })

  describe('identifyZone', () => {
    const zones: Zone[] = [
      { name: 'Z1', min: 0, max: 100 },
      { name: 'Z2', min: 101, max: 200 }
    ]

    it('finds correct zone for a value', () => {
      expect(identifyZone(50, zones)?.name).toBe('Z1')
      expect(identifyZone(150, zones)?.name).toBe('Z2')
      expect(identifyZone(100, zones)?.name).toBe('Z1')
      expect(identifyZone(101, zones)?.name).toBe('Z2')
    })

    it('treats anything above the top band as the top zone', () => {
      // Same convention as computeZoneTimesFromSamples() in
      // workout-analysis-facts.ts, which counts `value > lastZone.max` as the
      // last zone rather than dropping the sample.
      expect(identifyZone(5000, zones)?.name).toBe('Z2')
    })

    it('returns undefined below the first band and for an empty zone list', () => {
      expect(identifyZone(-5, zones)).toBeUndefined()
      expect(identifyZone(120, [])).toBeUndefined()
    })
  })
})
