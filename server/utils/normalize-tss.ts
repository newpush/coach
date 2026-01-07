/**
 * TSS Normalization Utility
 *
 * Systematically finds, calculates, or estimates TSS for workouts from any source.
 * Priority order:
 * 1. Pre-calculated TSS from source (Intervals.icu, TrainingPeaks, etc.)
 * 2. Strava Suffer Score (proprietary but good proxy)
 * 3. Calculate from power stream data (most accurate for power-based activities)
 * 4. Calculate from heart rate stream data (HRSS)
 * 5. Use TRIMP if already calculated
 * 6. Estimate from duration/intensity if HR data available
 */

import type { Prisma } from '@prisma/client'
import { prisma } from './db'
import { userRepository } from './repositories/userRepository'

export interface TSSNormalizationResult {
  tss: number | null
  source:
    | 'intervals'
    | 'strava_suffer'
    | 'calculated_power'
    | 'calculated_hr'
    | 'trimp'
    | 'estimated'
    | 'none'
  confidence: 'high' | 'medium' | 'low'
  method?: string
}

/**
 * Calculate Normalized Power (NP) from power array
 * Uses 30-second rolling average, then 4th power, then 4th root
 */
function calculateNormalizedPower(wattsArray: number[]): number {
  if (wattsArray.length < 30) {
    // Not enough data for proper NP calculation, use average
    return wattsArray.reduce((a, b) => a + b, 0) / wattsArray.length
  }

  // 30-second rolling average
  const rolling: number[] = []
  for (let i = 0; i <= wattsArray.length - 30; i++) {
    const sum = wattsArray.slice(i, i + 30).reduce((a, b) => a + b, 0)
    rolling.push(sum / 30)
  }

  // 4th power average, then 4th root
  const fourthPower = rolling.reduce((sum, p) => sum + Math.pow(p, 4), 0) / rolling.length
  return Math.pow(fourthPower, 0.25)
}

/**
 * Calculate TSS from power stream data
 */
async function calculateTSSFromPowerStream(
  wattsArray: number[],
  durationSeconds: number,
  userFTP: number
): Promise<number> {
  const np = calculateNormalizedPower(wattsArray)
  const intensityFactor = np / userFTP
  const tss = ((durationSeconds * np * intensityFactor) / (userFTP * 3600)) * 100
  return Math.round(tss)
}

/**
 * Calculate HRSS from heart rate stream data
 * Uses simplified formula without LTHR (estimates LTHR as 90% of maxHR)
 */
async function calculateHRSSFromHRStream(
  hrArray: number[],
  durationSeconds: number,
  maxHR: number,
  restingHR: number,
  lthr?: number
): Promise<number> {
  // Calculate average HR
  const avgHR = hrArray.reduce((a, b) => a + b, 0) / hrArray.length

  // Use LTHR if provided, otherwise estimate as 90% of maxHR
  const thresholdHR = lthr || Math.round(maxHR * 0.9)

  // Calculate Heart Rate Reserve
  const hrr = (avgHR - restingHR) / (maxHR - restingHR)

  // Calculate HRSS
  const hrss = ((durationSeconds * avgHR * hrr) / (thresholdHR * 3600)) * 100
  return Math.round(hrss)
}

/**
 * Estimate TSS from duration and average heart rate
 * Less accurate but better than nothing
 */
function estimateTSSFromDuration(
  durationSeconds: number,
  avgHR: number | null,
  maxHR: number | null
): number {
  const durationHours = durationSeconds / 3600

  // If we have HR data, use a squared intensity model (TSS ~ IF^2)
  if (avgHR && maxHR) {
    const intensity = avgHR / maxHR

    let estimatedIF = intensity

    // For very low intensity (e.g., walking, active recovery < 55% Max HR),
    // physiological stress is disproportionately low. Apply a dampener.
    if (intensity < 0.55) {
      estimatedIF = intensity * 0.75
    }

    // Formula: TSS = Duration(hrs) * 100 * IF^2
    // We use HR Intensity as a proxy for IF
    return Math.round(durationHours * 100 * (estimatedIF * estimatedIF))
  }

  // Fallback if no HR data: Assume moderate activity (IF ~0.6)
  // 0.6^2 = 0.36 -> 36 TSS/hr
  return Math.round(durationHours * 36)
}

/**
 * Parse stream data safely (handles both JSON strings and arrays)
 */
function parseStreamData(data: any): number[] | null {
  if (!data) return null
  if (Array.isArray(data)) return data
  try {
    const parsed = JSON.parse(data as string)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Main TSS normalization function
 * Call this when ingesting a workout from any source
 */
export async function normalizeTSS(
  workoutId: string,
  userId: string,
  force: boolean = false
): Promise<TSSNormalizationResult> {
  // Get workout with streams
  const workout = await prisma.workout.findUnique({
    where: { id: workoutId },
    include: { streams: true }
  })

  if (!workout) {
    throw new Error(`Workout ${workoutId} not found`)
  }

  // 1. Check if TSS is already set from source
  // If force is true, we ignore existing TSS UNLESS it's from intervals (source of truth)
  if (!force && workout.tss !== null && workout.tss > 0) {
    return {
      tss: workout.tss,
      source: workout.source === 'intervals' ? 'intervals' : 'calculated_power',
      confidence: 'high',
      method: 'Pre-calculated by source'
    }
  }

  // 1b. Check if trainingLoad is available (common for Intervals.icu when TSS field is null)
  // Intervals.icu 'Load' is equivalent to TSS
  if (!force && workout.trainingLoad !== null && workout.trainingLoad > 0) {
    // Save this as the TSS so we don't recalculate next time
    await prisma.workout.update({
      where: { id: workoutId },
      data: { tss: workout.trainingLoad }
    })

    return {
      tss: workout.trainingLoad,
      source: 'intervals',
      confidence: 'high',
      method: 'Mapped from Training Load (Intervals.icu)'
    }
  }

  // If force is true and source is intervals, we still keep it
  if (force && workout.source === 'intervals' && workout.tss !== null) {
    return {
      tss: workout.tss,
      source: 'intervals',
      confidence: 'high',
      method: 'Pre-calculated by source (Intervals.icu)'
    }
  }

  // 2. Check for Strava Suffer Score
  if (workout.source === 'strava' && workout.rawJson) {
    const raw = workout.rawJson as any
    if (raw.suffer_score && raw.suffer_score > 0) {
      // Strava's suffer score is a good TSS proxy
      await prisma.workout.update({
        where: { id: workoutId },
        data: { tss: raw.suffer_score }
      })
      return {
        tss: raw.suffer_score,
        source: 'strava_suffer',
        confidence: 'high',
        method: 'Strava Suffer Score'
      }
    }
  }

  // Get user profile for calculations
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ftp: true, maxHr: true, restingHr: true }
  })

  // 3. Try to calculate from power stream
  if (workout.streams && user?.ftp) {
    const wattsData = parseStreamData((workout.streams as any).watts)
    if (wattsData && wattsData.length > 0) {
      // Calculate Normalized Power with Altitude Adjustment
      // Altitude adjustment: Above 1500m, power output drops.
      // FTP effectively drops, so we should calculate Stress against a LOWER FTP for the same watts.
      // Rule of thumb: FTP drops ~1% per 100m above 1500m (simplified Bassett/Bassett model)

      let effectiveFtp = user.ftp

      // Get home altitude from user profile
      // TODO: Get altitude for workout location if available, otherwise use home altitude
      const altitude = await userRepository.getAltitudeForDate(userId, workout.date)

      if (altitude > 1500) {
        // Adjust FTP down for high altitude to reflect higher physiological stress
        const altitudeFactor = 1 - (altitude - 1500) / 10000 // 1% per 100m is 10% per 1000m -> 0.1/1000 = 0.0001 per m?
        // Bassett et al (1999):
        // 0m: 100%
        // 1000m: 98%
        // 2000m: 92%
        // 3000m: 85%
        // Linear approx for >1500m: 1% drop per 100m elevation gain
        const dropPercent = Math.max(0, (altitude - 1500) / 100)
        effectiveFtp = Math.round(user.ftp * (1 - dropPercent / 100))

        console.log(
          `[normalizeTSS] Altitude ${altitude}m: Adjusted FTP ${user.ftp} -> ${effectiveFtp}W`
        )
      }

      const tss = await calculateTSSFromPowerStream(wattsData, workout.durationSec, effectiveFtp)
      await prisma.workout.update({
        where: { id: workoutId },
        data: { tss }
      })
      return {
        tss,
        source: 'calculated_power',
        confidence: 'high',
        method: `Calculated from power stream (NP/IF) using FTP ${effectiveFtp}W`
      }
    }
  }

  // 4. Try to calculate from heart rate stream
  if (workout.streams && user?.maxHr && user?.restingHr) {
    const hrData = parseStreamData((workout.streams as any).heartrate)
    if (hrData && hrData.length > 0) {
      const hrss = await calculateHRSSFromHRStream(
        hrData,
        workout.durationSec,
        user.maxHr,
        user.restingHr
      )
      await prisma.workout.update({
        where: { id: workoutId },
        data: { tss: hrss }
      })
      return {
        tss: hrss,
        source: 'calculated_hr',
        confidence: 'medium',
        method: 'Calculated from HR stream (HRSS)'
      }
    }
  }

  // 5. Use TRIMP if available
  if (workout.trimp !== null && workout.trimp > 0) {
    // TRIMP can be used as TSS proxy
    await prisma.workout.update({
      where: { id: workoutId },
      data: { tss: workout.trimp }
    })
    return {
      tss: workout.trimp,
      source: 'trimp',
      confidence: 'medium',
      method: 'TRIMP (HR-based training load)'
    }
  }

  // 6. Estimate from duration and average HR
  if (workout.durationSec > 0) {
    const estimatedTSS = estimateTSSFromDuration(
      workout.durationSec,
      workout.averageHr,
      user?.maxHr || null
    )

    // Only save if it's a reasonable value (don't save obviously bad estimates)
    if (estimatedTSS > 0 && estimatedTSS < 500) {
      await prisma.workout.update({
        where: { id: workoutId },
        data: { tss: estimatedTSS }
      })
      return {
        tss: estimatedTSS,
        source: 'estimated',
        confidence: 'low',
        method: 'Estimated from duration and intensity'
      }
    }
  }

  // No TSS available
  return {
    tss: null,
    source: 'none',
    confidence: 'low',
    method: 'Unable to calculate or estimate TSS'
  }
}

/**
 * Backfill TSS for existing workouts
 * Call this to normalize TSS for workouts that don't have it
 */
export async function backfillTSSForWorkouts(
  userId: string,
  limit?: number
): Promise<{ processed: number; normalized: number; failed: number }> {
  const workouts = await prisma.workout.findMany({
    where: {
      userId,
      tss: null,
      isDuplicate: false
    },
    orderBy: { date: 'asc' },
    take: limit,
    select: { id: true, title: true }
  })

  let processed = 0
  let normalized = 0
  let failed = 0

  for (const workout of workouts) {
    try {
      const result = await normalizeTSS(workout.id, userId)
      processed++
      if (result.tss !== null) {
        normalized++
        console.log(`✓ ${workout.title}: TSS=${result.tss} (${result.source})`)
      } else {
        failed++
        console.log(`✗ ${workout.title}: No TSS available`)
      }
    } catch (error) {
      failed++
      console.error(`✗ ${workout.title}: ${error}`)
    }
  }

  return { processed, normalized, failed }
}
