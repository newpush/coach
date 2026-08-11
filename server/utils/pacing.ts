import { resolveSplitPacingVerdictApplicability } from './services/workout-analysis-prompt'
import type { WorkoutAnalysisFactsV2 } from './workout-analysis-facts'

/**
 * Plain-language stand-in shown to the athlete when the split-strategy verdict
 * does not apply to this session shape (CW-436). The machine-readable reason from
 * the shared gate travels alongside it as `verdictWithheldReason`.
 */
export const SPLIT_STRATEGY_NOT_GRADED_DESCRIPTION =
  'Splits are cut at fixed distances, not at your efforts, so a first-half vs second-half comparison would not describe how you paced this session.'

export interface PacingStrategyAnalysis {
  strategy: string
  description: string
  /**
   * Evenness grade (0-100). Withheld together with the rest of the verdict when
   * the session shape makes distance-split halves incomparable.
   */
  evenness?: number
  firstHalfPace?: number
  secondHalfPace?: number
  paceDifference?: number
  /** False when the split-strategy verdict is withheld for this session shape. */
  verdictApplicable: boolean
  /** Why the verdict was withheld, or null when it applies. */
  verdictWithheldReason: string | null
}

/**
 * Calculate lap splits from time and distance streams
 * @param timeData - Array of elapsed time in seconds
 * @param distanceData - Array of cumulative distance in meters
 * @param lapDistance - Distance per lap in meters (default: 1000m = 1km)
 * @returns Array of lap split objects
 */
export function calculateLapSplits(
  timeData: number[],
  distanceData: number[],
  lapDistance: number = 1000
) {
  const splits = []
  let currentLap = 1
  let lastLapDistance = 0
  let lastLapTime = 0

  for (let i = 0; i < distanceData.length; i++) {
    const distance = distanceData[i]
    const time = timeData[i]

    if (distance !== undefined && time !== undefined) {
      if (distance >= currentLap * lapDistance) {
        const lapTime = time - lastLapTime
        const lapDist = distance - lastLapDistance
        const paceSeconds = (lapTime / lapDist) * 1000 // seconds per 1000m
        const paceMinutes = Math.floor(paceSeconds / 60)
        const paceRemainingSeconds = Math.round(paceSeconds % 60)

        splits.push({
          lap: currentLap,
          distance: Math.round(lapDist),
          time: Math.round(lapTime),
          pace: `${paceMinutes}:${paceRemainingSeconds.toString().padStart(2, '0')}/km`,
          paceSeconds: Math.round(paceSeconds)
        })

        lastLapDistance = distance
        lastLapTime = time
        currentLap++
      }
    }
  }

  // Add final partial lap if there's remaining distance
  if (distanceData.length > 0) {
    const finalDistance = distanceData[distanceData.length - 1]
    const finalTime = timeData[timeData.length - 1]

    if (finalDistance !== undefined && finalTime !== undefined) {
      const remainingDistance = finalDistance - lastLapDistance

      if (remainingDistance > 100) {
        // Only add if > 100m remaining
        const lapTime = finalTime - lastLapTime
        const paceSeconds = (lapTime / remainingDistance) * 1000
        const paceMinutes = Math.floor(paceSeconds / 60)
        const paceRemainingSeconds = Math.round(paceSeconds % 60)

        splits.push({
          lap: currentLap,
          distance: Math.round(remainingDistance),
          time: Math.round(lapTime),
          pace: `${paceMinutes}:${paceRemainingSeconds.toString().padStart(2, '0')}/km`,
          paceSeconds: Math.round(paceSeconds)
        })
      }
    }
  }

  return splits
}

/**
 * Calculate pace variability (standard deviation of velocity)
 * @param velocityData - Array of velocity values in m/s
 * @returns Standard deviation of velocity
 */
export function calculatePaceVariability(velocityData: number[]): number {
  if (velocityData.length === 0) return 0

  // Filter out zero or very low velocities (stopped periods)
  const movingVelocities = velocityData.filter((v) => v > 0.5) // > 0.5 m/s

  if (movingVelocities.length === 0) return 0

  const mean = movingVelocities.reduce((sum, v) => sum + v, 0) / movingVelocities.length
  const variance =
    movingVelocities.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / movingVelocities.length

  return Math.sqrt(variance)
}

/**
 * Calculate time spent in different pace zones
 * @param velocityData - Array of velocity values in m/s
 * @param timeData - Array of elapsed time in seconds
 * @param zones - Array of zone definitions with min/max velocity
 * @returns Time in each zone
 */
export function calculateTimeInPaceZones(
  velocityData: number[],
  timeData: number[],
  zones: { min: number; max: number; name: string }[]
) {
  const timeInZones = zones.map((zone) => ({
    zone: zone.name,
    minVelocity: zone.min,
    maxVelocity: zone.max,
    timeInZone: 0,
    percentage: 0
  }))

  let totalMovingTime = 0

  for (let i = 1; i < velocityData.length; i++) {
    const velocity = velocityData[i]
    const currentTime = timeData[i]
    const prevTime = timeData[i - 1]

    if (velocity !== undefined && currentTime !== undefined && prevTime !== undefined) {
      const timeInterval = currentTime - prevTime

      // Only count moving time
      if (velocity > 0.5) {
        totalMovingTime += timeInterval

        for (let j = 0; j < zones.length; j++) {
          const zone = zones[j]
          if (zone && velocity >= zone.min && velocity <= zone.max) {
            const targetZone = timeInZones[j]
            if (targetZone) {
              targetZone.timeInZone += timeInterval
            }
            break
          }
        }
      }
    }
  }

  // Calculate percentages
  timeInZones.forEach((zone) => {
    zone.percentage =
      totalMovingTime > 0 ? Math.round((zone.timeInZone / totalMovingTime) * 100) : 0
  })

  return timeInZones
}

/**
 * Calculate average pace (min/km) from total time and distance
 * @param totalTimeSeconds - Total time in seconds
 * @param totalDistanceMeters - Total distance in meters
 * @returns Average pace in minutes per kilometer
 */
export function calculateAveragePace(
  totalTimeSeconds: number,
  totalDistanceMeters: number
): number {
  if (totalDistanceMeters === 0) return 0
  return totalTimeSeconds / 60 / (totalDistanceMeters / 1000)
}

/**
 * Format pace from min/km to readable string
 * @param paceMinPerKm - Pace in minutes per kilometer
 * @returns Formatted pace string (e.g., "4:30/km")
 */
export function formatPace(paceMinPerKm: number | null): string {
  if (!paceMinPerKm || paceMinPerKm === 0) return 'N/A'
  const minutes = Math.floor(paceMinPerKm)
  const seconds = Math.round((paceMinPerKm - minutes) * 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')}/km`
}

/**
 * Detect if pacing was even or if there was positive/negative split.
 *
 * These are automatic per-distance splits, not laps and not the workout's work
 * intervals. For an intervalled or stochastic session they cut across warmup,
 * work reps, recoveries and cooldown, so their halves are not comparable and the
 * strategy verdict is withheld (CW-436). The gate is the same one CW-389 applied
 * to the AI prompt -- `resolveSplitPacingVerdictApplicability` -- so the pacing
 * card and the AI analysis agree about whether pacing was gradeable.
 *
 * The per-split rows and the raw dispersion measurement are unaffected; only the
 * grading is withheld.
 *
 * @param lapSplits - Array of distance-split objects
 * @param analysisFacts - v2 analysis facts; when omitted the verdict applies, which
 *   keeps ingestion-time callers (which have no facts) on today's behaviour
 * @returns Analysis of pacing strategy
 */
export function analyzePacingStrategy(
  lapSplits: any[],
  analysisFacts?: WorkoutAnalysisFactsV2
): PacingStrategyAnalysis {
  const splitVerdict = resolveSplitPacingVerdictApplicability(analysisFacts)

  if (lapSplits.length < 2) {
    return {
      strategy: 'insufficient_data',
      description: 'Not enough laps to analyze pacing strategy',
      evenness: 0,
      verdictApplicable: splitVerdict.applicable,
      verdictWithheldReason: splitVerdict.reason
    }
  }

  if (!splitVerdict.applicable) {
    return {
      strategy: 'not_graded',
      description: SPLIT_STRATEGY_NOT_GRADED_DESCRIPTION,
      verdictApplicable: false,
      verdictWithheldReason: splitVerdict.reason
    }
  }

  const firstHalfLaps = lapSplits.slice(0, Math.floor(lapSplits.length / 2))
  const secondHalfLaps = lapSplits.slice(Math.floor(lapSplits.length / 2))

  const firstHalfAvgPace =
    firstHalfLaps.reduce((sum, lap) => sum + lap.paceSeconds, 0) / firstHalfLaps.length
  const secondHalfAvgPace =
    secondHalfLaps.reduce((sum, lap) => sum + lap.paceSeconds, 0) / secondHalfLaps.length

  const paceDifference = secondHalfAvgPace - firstHalfAvgPace
  const paceVariation = Math.abs(paceDifference)

  // Calculate coefficient of variation for evenness
  const allPaces = lapSplits.map((lap) => lap.paceSeconds)
  const avgPace = allPaces.reduce((sum, p) => sum + p, 0) / allPaces.length
  const stdDev = Math.sqrt(
    allPaces.reduce((sum, p) => sum + Math.pow(p - avgPace, 2), 0) / allPaces.length
  )
  const coefficientOfVariation = (stdDev / avgPace) * 100
  // Reduced penalty multiplier from 10 to 3 to be more lenient for normal variations
  // CV of 5% = score 85 (Excellent)
  // CV of 10% = score 70 (Good)
  // CV of 20% = score 40 (Fair)
  // CV of 33% = score 0 (Poor)
  const evennessScore = Math.max(0, 100 - coefficientOfVariation * 3) // 0-100 scale

  let strategy: string
  let description: string

  if (paceDifference < -5) {
    strategy = 'negative_split'
    description = 'Started conservative and finished strong (negative split)'
  } else if (paceDifference > 5) {
    strategy = 'positive_split'
    description = 'Started fast and slowed down (positive split)'
  } else {
    strategy = 'even'
    description = 'Excellent even pacing throughout the activity'
  }

  return {
    strategy,
    description,
    evenness: Math.round(evennessScore),
    firstHalfPace: Math.round(firstHalfAvgPace),
    secondHalfPace: Math.round(secondHalfAvgPace),
    paceDifference: Math.round(paceDifference),
    verdictApplicable: true,
    verdictWithheldReason: null
  }
}

/**
 * Detect surges (sudden pace increases) in the activity
 * @param velocityData - Array of velocity values in m/s
 * @param timeData - Array of elapsed time in seconds
 * @param threshold - Velocity increase threshold to count as surge (m/s)
 * @returns Array of surge events
 */
export function detectSurges(
  velocityData: number[],
  timeData: number[],
  threshold: number = 1.0 // 1 m/s increase = ~0:15/km pace increase
) {
  const surges = []

  for (let i = 10; i < velocityData.length - 10; i++) {
    const prevVelocity = velocityData[i - 5]
    const currentVelocity = velocityData[i]
    const currentTime = timeData[i]

    if (prevVelocity !== undefined && currentVelocity !== undefined && currentTime !== undefined) {
      const velocityIncrease = currentVelocity - prevVelocity

      if (velocityIncrease > threshold && currentVelocity > 2.0) {
        // Must be moving
        surges.push({
          time: Math.round(currentTime),
          velocityBefore: Math.round(prevVelocity * 100) / 100,
          velocityAfter: Math.round(currentVelocity * 100) / 100,
          increase: Math.round(velocityIncrease * 100) / 100
        })

        i += 20 // Skip ahead to avoid duplicate detections
      }
    }
  }

  return surges
}

/**
 * Calculate optimal running cadence based on speed (km/h)
 * Formula: Reference Cadence = 124.4 + 3.83 * speed (km/h)
 * Based on research by Cavanagh & Williams (1982) and others.
 * @param speedKmh - Running speed in km/h
 * @param heightCm - Runner's height in cm
 * @param legLengthCm - Runner's leg length in cm (optional, estimated if missing)
 * @param currentCadence - User's current cadence in spm (optional)
 * @param goal - Primary goal: "technique" (efficiency) or "injury_prevention" (+5-10%)
 * @returns Comprehensive cadence analysis
 */
export function calculateOptimalCadence(
  speedKmh: number,
  heightCm?: number,
  legLengthCm?: number,
  currentCadence?: number,
  goal: 'technique' | 'injury_prevention' = 'technique'
) {
  // 1. Base formula from research: 124.4 + 3.83 * speed
  let referenceCadence = 124.4 + 3.83 * speedKmh

  // 2. Anthropometric Adjustment
  // Research shows taller runners/longer legs use slightly lower cadences
  // Estimate leg length (inseam) if missing: roughly 47% of height
  const effectiveHeight = heightCm || 175
  const effectiveLegLength = legLengthCm || effectiveHeight * 0.47
  const legToHeightRatio = effectiveLegLength / effectiveHeight

  // Adjustment heuristic: ±3 spm based on leg-to-height ratio
  // Normal ratio is around 0.47-0.48.
  if (legLengthCm) {
    if (legToHeightRatio > 0.49) {
      referenceCadence -= 3 // Long legs relative to height -> lower cadence
    } else if (legToHeightRatio < 0.45) {
      referenceCadence += 3 // Short legs relative to height -> higher cadence
    }
  } else if (heightCm) {
    // If only height is provided, use height-based thresholds
    if (heightCm > 185) {
      referenceCadence -= 3
    } else if (heightCm < 165) {
      referenceCadence += 3
    }
  }

  // 3. Goal Adjustment (Injury Prevention)
  // Heiderscheit et al. (2011) showed +5-10% reduces joint loading
  if (goal === 'injury_prevention') {
    referenceCadence *= 1.05 // Targeting the lower end of the reduction benefit
  }

  const roundedReference = Math.round(referenceCadence)
  const optimalRange = {
    min: roundedReference - 5,
    max: roundedReference + 5
  }

  // 4. Comparison with current cadence
  let recommendation: string
  let status: 'optimal' | 'low' | 'high'

  if (currentCadence) {
    if (currentCadence < optimalRange.min) {
      status = 'low'
      const diff = Math.round(((roundedReference - currentCadence) / currentCadence) * 100)
      recommendation = `Your cadence is low for this pace. Consider a gradual increase of ~3-5% (${Math.round(currentCadence * 1.05)} spm) to improve efficiency and reduce joint impact.`
    } else if (currentCadence > optimalRange.max) {
      status = 'high'
      recommendation = `Your cadence is higher than typical for this pace. If it feels natural and you are injury-free, no change is needed, but you might be sacrificing some stride power.`
    } else {
      status = 'optimal'
      recommendation = `Your cadence is in the optimal range for this pace. Great job maintaining efficient form!`
    }
  } else {
    status = 'optimal'
    recommendation = `Target a cadence around ${roundedReference} spm for this pace to optimize running economy.`
  }

  return {
    referenceCadence: roundedReference,
    optimalRange,
    currentCadence,
    status,
    recommendation,
    metrics: {
      speedKmh,
      legToHeightRatio: legToHeightRatio.toFixed(2),
      adjustmentApplied: goal === 'injury_prevention' ? '+5% (Injury Prevention)' : 'None'
    }
  }
}
