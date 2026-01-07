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
 * Calculate Power Zones based on FTP (Coggan Classic 5-Zone + 2)
 */
export function calculatePowerZones(ftp: number, model: PowerZoneModel = 'coggan_classic'): Zone[] {
  // Classic Coggan Zones
  return [
    { name: 'Z1 Active Recovery', min: 0, max: Math.round(ftp * 0.55), color: 'gray' },
    {
      name: 'Z2 Endurance',
      min: Math.round(ftp * 0.55) + 1,
      max: Math.round(ftp * 0.75),
      color: 'blue'
    },
    {
      name: 'Z3 Tempo',
      min: Math.round(ftp * 0.75) + 1,
      max: Math.round(ftp * 0.9),
      color: 'green'
    },
    {
      name: 'Z4 Threshold',
      min: Math.round(ftp * 0.9) + 1,
      max: Math.round(ftp * 1.05),
      color: 'yellow'
    },
    {
      name: 'Z5 VO2 Max',
      min: Math.round(ftp * 1.05) + 1,
      max: Math.round(ftp * 1.2),
      color: 'orange'
    },
    {
      name: 'Z6 Anaerobic',
      min: Math.round(ftp * 1.2) + 1,
      max: Math.round(ftp * 1.5),
      color: 'red'
    },
    { name: 'Z7 Neuromuscular', min: Math.round(ftp * 1.5) + 1, max: 2000, color: 'purple' }
  ]
}

/**
 * Calculate Heart Rate Zones based on LTHR (Friel 7-Zone) or MaxHR
 * Currently implements Friel LTHR as primary recommendation for serious training.
 */
export function calculateHrZones(lthr: number | null, maxHr: number | null): Zone[] {
  // Prefer LTHR if available (Friel for Cycling)
  if (lthr) {
    return [
      { name: 'Z1 Recovery', min: 0, max: Math.round(lthr * 0.81), color: 'gray' },
      {
        name: 'Z2 Aerobic',
        min: Math.round(lthr * 0.81) + 1,
        max: Math.round(lthr * 0.89),
        color: 'blue'
      },
      {
        name: 'Z3 Tempo',
        min: Math.round(lthr * 0.89) + 1,
        max: Math.round(lthr * 0.93),
        color: 'green'
      },
      {
        name: 'Z4 SubThreshold',
        min: Math.round(lthr * 0.93) + 1,
        max: Math.round(lthr * 0.99),
        color: 'yellow'
      },
      {
        name: 'Z5a SuperThreshold',
        min: Math.round(lthr * 1.0),
        max: Math.round(lthr * 1.02),
        color: 'orange'
      },
      {
        name: 'Z5b Aerobic Capacity',
        min: Math.round(lthr * 1.03),
        max: Math.round(lthr * 1.06),
        color: 'red'
      },
      { name: 'Z5c Anaerobic', min: Math.round(lthr * 1.07), max: maxHr || 220, color: 'purple' }
    ]
  }

  // Fallback to Max HR (Standard 5-Zone)
  if (maxHr) {
    return [
      { name: 'Z1 Recovery', min: 0, max: Math.round(maxHr * 0.6), color: 'gray' },
      {
        name: 'Z2 Endurance',
        min: Math.round(maxHr * 0.6) + 1,
        max: Math.round(maxHr * 0.7),
        color: 'blue'
      },
      {
        name: 'Z3 Tempo',
        min: Math.round(maxHr * 0.7) + 1,
        max: Math.round(maxHr * 0.8),
        color: 'green'
      },
      {
        name: 'Z4 Threshold',
        min: Math.round(maxHr * 0.8) + 1,
        max: Math.round(maxHr * 0.9),
        color: 'yellow'
      },
      { name: 'Z5 Anaerobic', min: Math.round(maxHr * 0.9) + 1, max: maxHr, color: 'red' }
    ]
  }

  // Fallback if no data (should effectively be handled by validation elsewhere)
  return []
}

/**
 * Format zone for display (e.g. "200-250W")
 */
export function formatZoneRange(zone: Zone, unit: 'W' | 'bpm'): string {
  return `${zone.min}-${zone.max}${unit}`
}

/**
 * Identify which zone a value falls into
 */
export function identifyZone(value: number, zones: Zone[]): Zone | undefined {
  return zones.find((z) => value >= z.min && value <= z.max)
}
