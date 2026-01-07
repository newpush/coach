import { calculatePowerZones, calculateHrZones, identifyZone } from './zones'

/**
 * Utility for detecting intervals and peak efforts in workout stream data
 */

export interface Interval {
  start_index: number
  end_index: number
  start_time: number
  end_time: number
  duration: number
  avg_power?: number
  avg_heartrate?: number
  avg_pace?: number
  max_power?: number
  max_heartrate?: number
  type: 'WORK' | 'RECOVERY' | 'WARMUP' | 'COOLDOWN'
  intensity_zone?: number // 1-7 for cycling power zones, 1-5 for HR/Pace
}

export interface PeakEffort {
  duration: number
  duration_label: string
  start_time: number
  end_time: number
  value: number
  metric: 'power' | 'heartrate' | 'pace'
}

/**
 * Detect intervals in a workout based on power or heart rate data
 * Uses a moving average and threshold-based approach
 */
export function detectIntervals(
  times: number[],
  values: number[],
  metricType: 'power' | 'heartrate' | 'pace',
  threshold?: number // FTP or Threshold Pace/HR
): Interval[] {
  if (!times || !values || times.length !== values.length || times.length === 0) {
    return []
  }

  // 1. Smooth the data (Exponential Moving Average)
  const smoothed = smoothData(values, 10) // 10-second smoothing

  // 2. Determine threshold for "Work" vs "Recovery"
  // If no manual threshold provided, estimate baseline
  const baseline = threshold || calculateBaseline(smoothed)

  // For power, work is typically > 75% FTP (Zone 2/3 border)
  // For HR, work is > 70% Max (approx Z2)
  const workThreshold = metricType === 'power' ? baseline * 0.75 : baseline * 0.7

  const intervals: Interval[] = []
  let inInterval = false
  let startIndex = 0

  // Minimum duration for an interval (e.g., 30 seconds)
  const minDuration = 30

  // Minimum recovery between intervals (e.g., 15 seconds)
  // Used to merge close intervals
  const minRecovery = 15

  // First pass: Detect candidate intervals
  const candidates: { start: number; end: number }[] = []

  for (let i = 0; i < smoothed.length; i++) {
    const smoothedValue = smoothed[i]
    if (smoothedValue === undefined) continue

    const isWork = smoothedValue >= workThreshold

    if (isWork && !inInterval) {
      // Start of potential interval
      inInterval = true
      startIndex = i
    } else if (!isWork && inInterval) {
      // End of potential interval
      inInterval = false
      const currentTime = times[i]
      const startTime = times[startIndex]

      if (currentTime !== undefined && startTime !== undefined) {
        const duration = currentTime - startTime

        if (duration >= minDuration) {
          candidates.push({ start: startIndex, end: i })
        }
      }
    }
  }

  // Handle case where workout ends during an interval
  const lastTime = times[times.length - 1]
  const startTime = times[startIndex]
  if (inInterval && lastTime !== undefined && startTime !== undefined) {
    const duration = lastTime - startTime
    if (duration >= minDuration) {
      candidates.push({ start: startIndex, end: times.length - 1 })
    }
  }

  // Second pass: Merge close intervals
  const merged: { start: number; end: number }[] = []
  if (candidates.length > 0 && candidates[0]) {
    let current = candidates[0]

    for (let i = 1; i < candidates.length; i++) {
      const next = candidates[i]
      if (!next) continue

      const tNextStart = times[next.start]
      const tCurrentEnd = times[current.end]

      if (tNextStart !== undefined && tCurrentEnd !== undefined) {
        const gap = tNextStart - tCurrentEnd

        if (gap < minRecovery) {
          // Merge
          current.end = next.end
        } else {
          merged.push(current)
          current = next
        }
      } else {
        merged.push(current)
        current = next
      }
    }
    if (current) merged.push(current)
  }

  // Third pass: Classify and calculate stats
  // Identify warmup (first segment before first work interval)
  // Identify cooldown (segment after last work interval)

  let lastEndIndex = 0

  merged.forEach((candidate, index) => {
    // Add recovery/warmup segment before this work interval
    if (candidate.start > lastEndIndex) {
      const type = index === 0 ? 'WARMUP' : 'RECOVERY'
      if (times[lastEndIndex] !== undefined && times[candidate.start] !== undefined) {
        intervals.push(
          createIntervalObj(
            times,
            values,
            lastEndIndex,
            candidate.start,
            type,
            threshold,
            metricType
          )
        )
      }
    }

    // Add the work interval
    if (times[candidate.start] !== undefined && times[candidate.end] !== undefined) {
      intervals.push(
        createIntervalObj(
          times,
          values,
          candidate.start,
          candidate.end,
          'WORK',
          threshold,
          metricType
        )
      )
    }

    lastEndIndex = candidate.end
  })

  // Add cooldown if there's data after the last interval
  if (
    lastEndIndex < times.length - 1 &&
    times[lastEndIndex] !== undefined &&
    times[times.length - 1] !== undefined
  ) {
    intervals.push(
      createIntervalObj(
        times,
        values,
        lastEndIndex,
        times.length - 1,
        'COOLDOWN',
        threshold,
        metricType
      )
    )
  }

  return intervals
}

/**
 * Find peak efforts for standard durations (1min, 5min, 20min, etc.)
 */
export function findPeakEfforts(
  times: number[],
  values: number[],
  metric: 'power' | 'heartrate' | 'pace'
): PeakEffort[] {
  if (!values || values.length === 0) return []

  const durations = [
    { sec: 5, label: '5s' },
    { sec: 30, label: '30s' },
    { sec: 60, label: '1m' },
    { sec: 300, label: '5m' },
    { sec: 600, label: '10m' },
    { sec: 1200, label: '20m' },
    { sec: 3600, label: '60m' }
  ]

  const peaks: PeakEffort[] = []

  // Optimization: Pre-calculate prefix sums for O(1) range sum queries?
  // Since we need max average, a simple sliding window is O(N) per duration.

  for (const dur of durations) {
    const lastTime = times[times.length - 1]
    if (lastTime === undefined || lastTime < dur.sec) continue

    // Find approximate number of data points for this duration
    // Assuming 1Hz sampling for simplicity, or we check timestamps
    // Robust approach: Sliding window on time

    let maxSum = -Infinity
    let bestStartIdx = -1
    let bestEndIdx = -1

    let currentSum = 0
    let startPtr = 0

    for (let endPtr = 0; endPtr < values.length; endPtr++) {
      const val = values[endPtr]
      if (val !== undefined) currentSum += val

      // Shrink window from left until duration is approx correct
      // We want times[endPtr] - times[startPtr] approx dur.sec

      while (times[endPtr] !== undefined && times[startPtr] !== undefined) {
        const tEnd = times[endPtr]
        const tStart = times[startPtr]
        if (tEnd !== undefined && tStart !== undefined && tEnd - tStart > dur.sec) {
          const startVal = values[startPtr]
          if (startVal !== undefined) currentSum -= startVal
          startPtr++
        } else {
          break
        }
      }

      // Check if window is valid duration (close enough)
      const tEnd = times[endPtr]
      const tStart = times[startPtr]

      if (tEnd !== undefined && tStart !== undefined) {
        const windowDuration = tEnd - tStart
        if (windowDuration >= dur.sec * 0.95) {
          // Allow slight tolerance
          const avg = currentSum / (endPtr - startPtr + 1)
          if (avg > maxSum) {
            maxSum = avg
            bestStartIdx = startPtr
            bestEndIdx = endPtr
          }
        }
      }
    }

    if (bestStartIdx !== -1 && bestEndIdx !== -1) {
      const startTimeValue = times[bestStartIdx]
      const endTimeValue = times[bestEndIdx]
      if (startTimeValue !== undefined && endTimeValue !== undefined) {
        peaks.push({
          duration: dur.sec,
          duration_label: dur.label,
          start_time: startTimeValue,
          end_time: endTimeValue,
          value: Math.round(maxSum),
          metric
        })
      }
    }
  }

  return peaks
}

// --- Helper Functions ---

function smoothData(data: number[], windowSize: number): number[] {
  const result: number[] = []
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2))
    const end = Math.min(data.length, i + Math.ceil(windowSize / 2))
    const subset = data.slice(start, end)
    const avg = subset.reduce((a, b) => a + (b || 0), 0) / subset.length
    result.push(avg)
  }
  return result
}

function calculateBaseline(data: number[]): number {
  // Simple baseline: Median or Mean of non-zero values
  const nonZeros = data.filter((v) => v > 0).sort((a, b) => a - b)
  if (nonZeros.length === 0) return 0
  const median = nonZeros[Math.floor(nonZeros.length / 2)]
  return median !== undefined ? median : 0
}

function createIntervalObj(
  times: number[],
  values: number[],
  startIdx: number,
  endIdx: number,
  type: Interval['type'],
  threshold?: number,
  metricType?: 'power' | 'heartrate' | 'pace'
): Interval {
  const segmentValues = values.slice(startIdx, endIdx + 1)
  const sum = segmentValues.reduce((a, b) => a + (b || 0), 0)
  const avg = sum / segmentValues.length
  const max = Math.max(...segmentValues.map((v) => v || 0))

  let intensity_zone: number | undefined

  if (threshold && metricType) {
    if (metricType === 'power') {
      const zones = calculatePowerZones(threshold)
      const zone = identifyZone(avg, zones)
      if (zone) {
        // Extract zone number from name "Z2 Endurance" -> 2
        const match = zone.name.match(/^Z(\d+)/)
        if (match && match[1]) intensity_zone = parseInt(match[1])
      }
    } else if (metricType === 'heartrate') {
      // Estimate maxHR roughly if threshold is LTHR
      // Or assume threshold passed IS MaxHR? The function signature says "FTP or Threshold Pace/HR"
      // Let's assume for HR detection, threshold passed is usually MaxHR or LTHR.
      // The identifyZone logic expects LTHR for HrZones usually.
      // This is a bit ambiguous in the original code.
      // For now, let's skip zone detection for HR here to avoid breakage,
      // or implement a simple check if we want.
    }
  }

  const startTimeValue = times[startIdx] || 0
  const endTimeValue = times[endIdx] || 0

  return {
    start_index: startIdx,
    end_index: endIdx,
    start_time: startTimeValue,
    end_time: endTimeValue,
    duration: endTimeValue - startTimeValue,
    avg_power: avg, // Assumes 'values' is power/metric
    max_power: max,
    type,
    intensity_zone
    // Add generic average based on what 'values' represents?
    // In real implementation, we'd pass all streams to calculate all averages
  }
}

/**
 * Calculate basic heart rate recovery (HRR)
 * Looks for the biggest drop in HR over 60s after peak effort
 */
export function calculateHeartRateRecovery(
  times: number[],
  hrValues: number[]
): { peakHr: number; peakTime: number; recoveryHr: number; drops: number } | null {
  if (!hrValues || hrValues.length === 0) return null

  // Find max HR index
  let maxHr = -Infinity
  let maxIdx = -1

  for (let i = 0; i < hrValues.length; i++) {
    const val = hrValues[i]
    if (val !== undefined && val > maxHr) {
      maxHr = val
      maxIdx = i
    }
  }

  if (maxIdx === -1) return null

  // Look ahead 60 seconds (or closest available)
  const peakTime = times[maxIdx]
  if (peakTime === undefined) return null

  const targetTime = peakTime + 60

  let recoveryIdx = -1

  for (let i = maxIdx; i < times.length; i++) {
    const currentTime = times[i]
    if (currentTime !== undefined && currentTime >= targetTime) {
      recoveryIdx = i
      break
    }
  }

  // If workout ended before 60s, take last value
  if (recoveryIdx === -1 && maxIdx < times.length - 1) {
    recoveryIdx = times.length - 1
  }

  if (recoveryIdx !== -1) {
    const recoveryHr = hrValues[recoveryIdx]
    if (recoveryHr !== undefined) {
      return {
        peakHr: maxHr,
        peakTime,
        recoveryHr,
        drops: maxHr - recoveryHr
      }
    }
  }

  return null
}

/**
 * Calculate Aerobic Decoupling (Pw:HR)
 * Measures aerobic endurance by comparing Efficiency Factor (Power/HR)
 * in the first half vs second half of the data.
 */
export function calculateAerobicDecoupling(
  times: number[],
  powerValues: number[],
  hrValues: number[]
): number | null {
  if (
    !powerValues ||
    !hrValues ||
    powerValues.length !== hrValues.length ||
    powerValues.length < 600
  ) {
    // Need at least 10 minutes of data
    return null
  }

  // Filter out zeros and non-moving time (simplification: just zeros in power/hr)
  const validData: { p: number; h: number }[] = []
  for (let i = 0; i < powerValues.length; i++) {
    const p = powerValues[i]
    const h = hrValues[i]
    if (p !== undefined && h !== undefined && p > 10 && h > 40) {
      validData.push({ p, h })
    }
  }

  if (validData.length < 300) return null

  // Split into two halves
  const midPoint = Math.floor(validData.length / 2)
  const firstHalf = validData.slice(0, midPoint)
  const secondHalf = validData.slice(midPoint)

  // Calculate Efficiency Factor (EF) = AvgPower / AvgHR
  const getEF = (data: { p: number; h: number }[]) => {
    if (data.length === 0) return 0
    const avgP = data.reduce((sum, d) => sum + d.p, 0) / data.length
    const avgH = data.reduce((sum, d) => sum + d.h, 0) / data.length
    return avgH > 0 ? avgP / avgH : 0
  }

  const ef1 = getEF(firstHalf)
  const ef2 = getEF(secondHalf)

  if (ef1 === 0) return null

  // Decoupling = (EF1 - EF2) / EF1
  // Positive value means EF dropped (HR rose for same power, or Power dropped for same HR)
  return (ef1 - ef2) / ef1
}

/**
 * Calculate Coasting Statistics
 * Measures time spent not pedaling while moving.
 */
export function calculateCoastingStats(
  times: number[],
  powerValues: number[],
  cadenceValues: number[],
  velocityValues?: number[]
): { totalTime: number; percentTime: number; eventCount: number } {
  if (!powerValues || powerValues.length === 0) {
    return { totalTime: 0, percentTime: 0, eventCount: 0 }
  }

  let coastingTime = 0
  let coastingEvents = 0
  let inCoasting = false

  // Thresholds
  const minPower = 10
  const minCadence = 20
  const minVelocity = 2.0 // m/s (~7.2 km/h) - ensuring we are moving, not stopped

  for (let i = 0; i < powerValues.length; i++) {
    const p = powerValues[i]
    const c = cadenceValues ? cadenceValues[i] : 0
    const v = velocityValues ? velocityValues[i] : 5 // Assume moving if no velocity stream

    if (p === undefined || c === undefined || v === undefined) continue

    // Check if moving but not pedaling
    // If cadence data exists, rely on it primarily. If not, use power < 10W.
    const isPedaling = cadenceValues ? c > minCadence : p > minPower
    const isMoving = v > minVelocity

    if (isMoving && !isPedaling) {
      coastingTime++ // Assuming 1s intervals roughly

      if (!inCoasting) {
        inCoasting = true
        coastingEvents++
      }
    } else {
      inCoasting = false
    }
  }

  const firstTime = times[0]
  const lastTime = times[times.length - 1]
  const totalDuration = firstTime !== undefined && lastTime !== undefined ? lastTime - firstTime : 0

  return {
    totalTime: coastingTime,
    percentTime: totalDuration > 0 ? (coastingTime / totalDuration) * 100 : 0,
    eventCount: coastingEvents
  }
}

export interface Surge {
  start_time: number
  duration: number
  avg_power: number
  max_power: number
  cost_avg_power: number // Avg power in the 60s AFTER the surge
}

/**
 * Detect "Matches" (Surges) and their cost
 * Identifies efforts > threshold (e.g. 120% FTP) and analyzes subsequent fade.
 */
export function detectSurgesAndFades(times: number[], powerValues: number[], ftp: number): Surge[] {
  if (!powerValues || !ftp || ftp === 0) return []

  const surgeThreshold = ftp * 1.2 // 120% FTP
  const minSurgeDuration = 10 // seconds
  const recoveryWindow = 60 // seconds to analyze after surge

  const surges: Surge[] = []
  let inSurge = false
  let startIndex = 0

  // 1. Detect candidate segments
  const candidates: { start: number; end: number }[] = []

  for (let i = 0; i < powerValues.length; i++) {
    const p = powerValues[i]
    if (p === undefined) continue

    if (p >= surgeThreshold) {
      if (!inSurge) {
        inSurge = true
        startIndex = i
      }
    } else {
      if (inSurge) {
        inSurge = false
        // Check duration (assuming 1s intervals for simplicity, or use times)
        const tStart = times[startIndex]
        const tCurrent = times[i]

        if (tStart !== undefined && tCurrent !== undefined) {
          const duration = tCurrent - tStart
          if (duration >= minSurgeDuration) {
            candidates.push({ start: startIndex, end: i })
          }
        }
      }
    }
  }

  // Handle surge at end of workout
  if (inSurge) {
    const tStart = times[startIndex]
    const tLast = times[times.length - 1]

    if (tStart !== undefined && tLast !== undefined) {
      const duration = tLast - tStart
      if (duration >= minSurgeDuration) {
        candidates.push({ start: startIndex, end: times.length - 1 })
      }
    }
  }

  // 2. Process Surges
  // Merge close surges? For now, keep distinct to see repeated attacks.

  candidates.forEach((cand) => {
    const segment = powerValues.slice(cand.start, cand.end + 1)
    const sum = segment.reduce((a, b) => a + (b || 0), 0)
    const avg = sum / segment.length
    const max = Math.max(...segment.map((v) => v || 0))

    // Calculate "Cost" - power in the recovery window
    // Look ahead 60s
    let costSum = 0
    let costCount = 0
    const recoveryEndIndex = Math.min(powerValues.length - 1, cand.end + recoveryWindow)

    for (let k = cand.end + 1; k <= recoveryEndIndex; k++) {
      const val = powerValues[k]
      if (val !== undefined) {
        costSum += val
        costCount++
      }
    }

    const costAvg = costCount > 0 ? costSum / costCount : 0

    const tStart = times[cand.start]
    const tEnd = times[cand.end]

    if (tStart !== undefined && tEnd !== undefined) {
      surges.push({
        start_time: tStart,
        duration: tEnd - tStart,
        avg_power: Math.round(avg),
        max_power: Math.round(max),
        cost_avg_power: Math.round(costAvg)
      })
    }
  })

  return surges
}

interface RecoveryRate {
  intervalIndex: number
  startTime: number
  peakHr: number
  hr30s: number | null
  hr60s: number | null
  hr90s: number | null
  drop30s: number | null
  drop60s: number | null
  drop90s: number | null
}

/**
 * Calculate Recovery Rate Trend across all work intervals
 */
export function calculateRecoveryRateTrend(
  times: number[],
  hrStream: number[],
  intervals: Interval[]
): RecoveryRate[] {
  if (!hrStream || hrStream.length === 0 || !intervals) return []

  const workIntervals = intervals.filter((i) => i.type === 'WORK')
  const results: RecoveryRate[] = []

  workIntervals.forEach((interval, idx) => {
    const endIdx = interval.end_index
    const peakHr = hrStream[endIdx]
    const endTime = times[endIdx]

    if (peakHr === undefined || endTime === undefined) return

    const getHrAtOffset = (offset: number) => {
      const targetTime = endTime + offset
      for (let i = endIdx; i < times.length; i++) {
        const t = times[i]
        if (t !== undefined && t >= targetTime) return hrStream[i] || null
      }
      return null
    }

    const hr30s = getHrAtOffset(30)
    const hr60s = getHrAtOffset(60)
    const hr90s = getHrAtOffset(90)

    results.push({
      intervalIndex: idx,
      startTime: endTime,
      peakHr,
      hr30s,
      hr60s,
      hr90s,
      drop30s: hr30s !== null ? peakHr - hr30s : null,
      drop60s: hr60s !== null ? peakHr - hr60s : null,
      drop90s: hr90s !== null ? peakHr - hr90s : null
    })
  })

  return results
}
