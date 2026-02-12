export type SweatRateBand = {
  temperatureMinC: number
  temperatureMaxC: number
  ratesLph: {
    low: number
    moderate: number
    high: number
    veryHigh: number
  }
}

export const SWEAT_RATE_LOOKUP_TABLE: SweatRateBand[] = [
  {
    temperatureMinC: -20,
    temperatureMaxC: 9.9,
    ratesLph: { low: 0.45, moderate: 0.6, high: 0.75, veryHigh: 0.9 }
  },
  {
    temperatureMinC: 10,
    temperatureMaxC: 17.9,
    ratesLph: { low: 0.55, moderate: 0.75, high: 0.95, veryHigh: 1.15 }
  },
  {
    temperatureMinC: 18,
    temperatureMaxC: 25.9,
    ratesLph: { low: 0.7, moderate: 0.95, high: 1.2, veryHigh: 1.45 }
  },
  {
    temperatureMinC: 26,
    temperatureMaxC: 60,
    ratesLph: { low: 0.85, moderate: 1.15, high: 1.45, veryHigh: 1.75 }
  }
]

function resolveIntensityBand(intensity: number): keyof SweatRateBand['ratesLph'] {
  if (intensity >= 0.95) return 'veryHigh'
  if (intensity >= 0.8) return 'high'
  if (intensity >= 0.65) return 'moderate'
  return 'low'
}

function getTempBand(temperatureC: number): SweatRateBand {
  return (
    SWEAT_RATE_LOOKUP_TABLE.find(
      (band) => temperatureC >= band.temperatureMinC && temperatureC <= band.temperatureMaxC
    ) || SWEAT_RATE_LOOKUP_TABLE[2]
  )
}

export function getEstimatedSweatRateLph(params: {
  intensity?: number | null
  temperatureC?: number | null
  fallback?: number
}) {
  const intensity = Number.isFinite(params.intensity as number) ? Number(params.intensity) : 0.7
  const temperatureC =
    Number.isFinite(params.temperatureC as number) && params.temperatureC !== null
      ? Number(params.temperatureC)
      : 20

  const tempBand = getTempBand(temperatureC)
  const intensityBand = resolveIntensityBand(Math.max(0, Math.min(1.2, intensity)))
  const rate = tempBand.ratesLph[intensityBand]
  return rate || params.fallback || 0.8
}

export function extractWorkoutTemperatureC(workout: any): number | null {
  const candidates = [
    workout?.avgTempC,
    workout?.avgTemp,
    workout?.temperatureC,
    workout?.tempC,
    workout?.temperature
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate
  }

  const raw = workout?.rawJson
  if (!raw || typeof raw !== 'object') return null

  const rawCandidates = [
    (raw as any).avgTemp,
    (raw as any).tempC,
    (raw as any).temperatureC,
    (raw as any).temperature,
    (raw as any).weather?.temperatureC,
    (raw as any).weather?.tempC,
    (raw as any).weather?.temperature,
    (raw as any).environment?.temperatureC,
    (raw as any).environment?.tempC
  ]
  for (const candidate of rawCandidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate
  }

  return null
}
