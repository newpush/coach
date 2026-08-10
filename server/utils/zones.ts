// Training Zones Utility
// Provides standard definitions for Power (Coggan) and Heart Rate (Friel/Classic) zones

export interface Zone {
  name: string
  min: number
  max: number
  color?: string // For UI display
}

export type PowerZoneModel = 'coggan_classic' | 'coggan_ileveis'
export type HrZoneModel = 'friel_lthr' | 'coggan_hr' | 'karvonen'

/**
 * Band boundary convention (CW-416) - read this before touching any band below.
 *
 * Every model is built by `buildZones` from a single ascending list of UPPER
 * bounds. Each band's `min` is derived from the previous band's `max`, so the
 * two ends of a boundary can never drift apart. Never write a band's `min` as a
 * fresh `Math.round(reference * k)`: that is exactly how the Friel LTHR bands
 * grew holes that belonged to no zone (at LTHR 160, Z4 ended at
 * `Math.round(160 * 0.99)` = 158 while Z5a started at `Math.round(160 * 1.0)` =
 * 160, so 159 bpm matched nothing and `identifyZone` returned undefined).
 *
 * Two domains, one rule - the bands must tile their whole range with no hole:
 *
 * - Integer domains (bpm, watts) use `step: 1`. Bands are inclusive at both
 *   ends and `min = previous.max + 1`, so every integer belongs to exactly one
 *   band and the printed ranges stay non-overlapping ("111-150W", "151-180W").
 * - Continuous domains (pace in m/s) use `step: 0`. Bands are effectively
 *   half-open `[min, max)`: `min = previous.max`, and a value sitting exactly
 *   on a shared boundary resolves to the LOWER band because `identifyZone`
 *   returns the first band whose upper bound covers it. A `+ 0.01` style
 *   separator would reopen a hole for every fractional speed in between.
 */
interface ZoneBound {
  name: string
  /** Inclusive upper bound of the band, in the metric's own unit. */
  upper: number
  color: string
}

function buildZones(bounds: ZoneBound[], step: 0 | 1): Zone[] {
  let min = 0
  return bounds.map(({ name, upper, color }) => {
    // A band never ends below where it starts: guards degenerate references
    // (e.g. a max HR that sits under the top LTHR band's floor) from producing
    // an inverted band that would swallow the boundary.
    const max = Math.max(upper, min)
    const zone: Zone = { name, min, max, color }
    min = max + step
    return zone
  })
}

/**
 * Calculate Power Zones based on FTP (Coggan Classic 5-Zone + 2)
 *
 * Audited for the CW-416 boundary defect: these bands were already contiguous
 * (every `min` was the previous `max + 1`) and the values they produce are
 * unchanged by the shared builder.
 */
export function calculatePowerZones(ftp: number, model: PowerZoneModel = 'coggan_classic'): Zone[] {
  // Classic Coggan Zones - upper bound of each band as a share of FTP.
  return buildZones(
    [
      { name: 'Z1 Active Recovery', upper: Math.round(ftp * 0.55), color: 'gray' },
      { name: 'Z2 Endurance', upper: Math.round(ftp * 0.75), color: 'blue' },
      { name: 'Z3 Tempo', upper: Math.round(ftp * 0.9), color: 'green' },
      { name: 'Z4 Threshold', upper: Math.round(ftp * 1.05), color: 'yellow' },
      { name: 'Z5 VO2 Max', upper: Math.round(ftp * 1.2), color: 'orange' },
      { name: 'Z6 Anaerobic', upper: Math.round(ftp * 1.5), color: 'red' },
      { name: 'Z7 Neuromuscular', upper: 2000, color: 'purple' }
    ],
    1
  )
}

/**
 * Calculate Heart Rate Zones based on LTHR (Friel 7-Zone) or MaxHR
 * Currently implements Friel LTHR as primary recommendation for serious training.
 */
export function calculateHrZones(lthr: number | null, maxHr: number | null): Zone[] {
  // Prefer LTHR if available (Friel for Cycling)
  if (lthr) {
    return buildZones(
      [
        { name: 'Z1 Recovery', upper: Math.round(lthr * 0.81), color: 'gray' },
        { name: 'Z2 Aerobic', upper: Math.round(lthr * 0.89), color: 'blue' },
        { name: 'Z3 Tempo', upper: Math.round(lthr * 0.93), color: 'green' },
        { name: 'Z4 SubThreshold', upper: Math.round(lthr * 0.99), color: 'yellow' },
        // Friel's published percentages leave 99%..100%, 102%..103% and
        // 106%..107% unnamed. The band above absorbs each of those slivers so
        // no bpm is homeless; the named percentages themselves are unchanged.
        { name: 'Z5a SuperThreshold', upper: Math.round(lthr * 1.02), color: 'orange' },
        { name: 'Z5b Aerobic Capacity', upper: Math.round(lthr * 1.06), color: 'red' },
        { name: 'Z5c Anaerobic', upper: maxHr || 220, color: 'purple' }
      ],
      1
    )
  }

  // Fallback to Max HR (Standard 5-Zone)
  if (maxHr) {
    return buildZones(
      [
        { name: 'Z1 Recovery', upper: Math.round(maxHr * 0.6), color: 'gray' },
        { name: 'Z2 Endurance', upper: Math.round(maxHr * 0.7), color: 'blue' },
        { name: 'Z3 Tempo', upper: Math.round(maxHr * 0.8), color: 'green' },
        { name: 'Z4 Threshold', upper: Math.round(maxHr * 0.9), color: 'yellow' },
        { name: 'Z5 Anaerobic', upper: maxHr, color: 'red' }
      ],
      1
    )
  }

  // Fallback if no data (should effectively be handled by validation elsewhere)
  return []
}

/**
 * Calculate Pace Zones based on Threshold Pace (m/s)
 * Standard 6-zone model for running.
 */
export function calculatePaceZones(thresholdPace: number | null): Zone[] {
  if (!thresholdPace) return []

  // Values are percentages of threshold speed (m/s)
  // Higher speed = faster pace
  // Speed is continuous, so bands are half-open (step 0) - see the boundary
  // convention above. The previous `+ 0.01` separators left every speed in
  // between two bands unmatched.
  return buildZones(
    [
      { name: 'Z1 Recovery', upper: thresholdPace * 0.8, color: 'gray' },
      { name: 'Z2 Aerobic', upper: thresholdPace * 0.89, color: 'blue' },
      { name: 'Z3 Tempo', upper: thresholdPace * 0.95, color: 'green' },
      { name: 'Z4 Threshold', upper: thresholdPace * 1.05, color: 'yellow' },
      { name: 'Z5 VO2 Max', upper: thresholdPace * 1.15, color: 'orange' },
      { name: 'Z6 Speed', upper: 20, color: 'red' }
    ],
    0
  )
}

/**
 * Format zone for display (e.g. "200-250W")
 */
export function formatZoneRange(zone: Zone, unit: 'W' | 'bpm'): string {
  return `${zone.min}-${zone.max}${unit}`
}

/**
 * Identify which zone a value falls into.
 *
 * Bands tile their range (see the boundary convention above), so the first band
 * whose upper bound covers the value is the band that contains it. Matching on
 * `max` alone rather than on `min && max` also keeps fractional inputs - an
 * interval averaging 158.4 bpm - inside a band instead of falling between two
 * integer bands.
 */
export function identifyZone(value: number, zones: Zone[]): Zone | undefined {
  const first = zones[0]
  if (!first || value < first.min) return undefined
  const match = zones.find((zone) => value <= zone.max)
  // Above the top band still counts as the top zone, matching how consumers
  // bucket samples (`computeZoneTimesFromSamples` in workout-analysis-facts.ts
  // treats `value > lastZone.max` as the last zone).
  return match ?? zones[zones.length - 1]
}
