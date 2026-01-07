/**
 * Performance Metrics Utility
 *
 * Implements advanced analytics for workout analysis:
 * 1. W' Balance (Anaerobic Work Capacity)
 * 2. Efficiency Factor (EF) Decay
 * 3. Cadence/Power Profiling (Quadrants)
 */

interface WPrimeBalanceResult {
  wPrimeBalance: number[]
  minWPrimeBalance: number
}

interface EfficiencyFactorResult {
  efStream: number[]
  totalDecay: number // Percentage decay
  firstHalfAvg: number
  secondHalfAvg: number
}

interface QuadrantAnalysisResult {
  distribution: {
    q1: number // High Power, High Cadence (Neuromuscular)
    q2: number // High Power, Low Cadence (Muscular Force)
    q3: number // Low Power, Low Cadence (Endurance/Recovery)
    q4: number // Low Power, High Cadence (Spinning)
  }
  seconds: {
    q1: number
    q2: number
    q3: number
    q4: number
  }
}

interface FatigueSensitivityResult {
  firstPartAvg: number
  lastPartAvg: number
  decay: number
  isSignificant: boolean
}

interface StabilityMetrics {
  overallCoV: number // Coefficient of Variation
  intervalStability: Array<{
    index: number
    cov: number
    label: string
  }>
}

/**
 * Calculate Fatigue Sensitivity (Late-Workout Fade)
 * Compares Efficiency Factor (Power/HR) in the first 20% vs last 20%
 */
export function calculateFatigueSensitivity(
  powerStream: number[],
  hrStream: number[],
  timeStream: number[]
): FatigueSensitivityResult | null {
  if (powerStream.length !== hrStream.length || powerStream.length < 600) return null

  const efValues: number[] = []
  for (let i = 0; i < powerStream.length; i++) {
    const power = powerStream[i]!
    const hr = hrStream[i]!
    if (hr > 40 && power > 10) {
      efValues.push(power / hr)
    }
  }

  if (efValues.length < 100) return null

  const chunk = Math.floor(efValues.length * 0.2)
  const firstPart = efValues.slice(0, chunk)
  const lastPart = efValues.slice(-chunk)

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
  const firstPartAvg = avg(firstPart)
  const lastPartAvg = avg(lastPart)

  const decay = firstPartAvg > 0 ? ((firstPartAvg - lastPartAvg) / firstPartAvg) * 100 : 0

  return {
    firstPartAvg,
    lastPartAvg,
    decay,
    isSignificant: Math.abs(decay) > 5
  }
}

/**
 * Calculate Stability Metrics (Consistency)
 * Uses Coefficient of Variation (StdDev / Mean)
 */
export function calculateStabilityMetrics(
  stream: number[],
  intervals: any[] = []
): StabilityMetrics | null {
  if (!stream || stream.length === 0) return null

  const getCoV = (data: number[]) => {
    if (data.length < 2) return 0
    const mean = data.reduce((a, b) => a + b, 0) / data.length
    if (mean === 0) return 0
    const variance = data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / data.length
    return (Math.sqrt(variance) / mean) * 100
  }

  const overallCoV = getCoV(stream.filter((v) => v > 10))

  const intervalStability = intervals
    .filter((interval) => interval.type === 'WORK')
    .map((interval, idx) => {
      const segment = stream.slice(interval.start_index, interval.end_index + 1)
      return {
        index: idx,
        cov: getCoV(segment),
        label: `Interval ${idx + 1}`
      }
    })

  return {
    overallCoV,
    intervalStability
  }
}

/**
 * Calculate W' Balance (Anaerobic Battery)
 *
 * Tracks the depletion and replenishment of anaerobic work capacity.
 * Based on the Skiba (2012) model.
 */
export function calculateWPrimeBalance(
  powerStream: number[],
  timeStream: number[],
  ftp: number,
  wPrime: number = 20000 // Default 20kJ if unknown
): WPrimeBalanceResult {
  const wPrimeBalance: number[] = []
  let currentWPrime = wPrime
  let minWPrimeBalance = wPrime

  // Iterate through each data point
  for (let i = 0; i < powerStream.length; i++) {
    const power = powerStream[i]!
    // Default to 1 second interval if time stream is irregular or missing
    const dt = i > 0 ? timeStream[i]! - timeStream[i - 1]! : 1

    // Ensure positive time delta
    const interval = Math.max(0.1, dt)

    if (power > ftp) {
      // Depletion: Linear drain
      // W'bal = W'bal - (Power - CP) * t
      const drain = (power - ftp) * interval
      currentWPrime -= drain
    } else {
      // Recovery: Exponential recharge (Skiba 2012 model)
      // W'bal = W' - (W' - W'bal_prev) * e^(-t/tau)
      // tau = 546 * e^(-0.01 * (CP - Power)) + 316

      const diff = ftp - power
      // Avoid division by zero or extreme values in tau calculation
      const safeDiff = Math.max(0, diff)

      const tau = 546 * Math.exp(-0.01 * safeDiff) + 316

      currentWPrime = wPrime - (wPrime - currentWPrime) * Math.exp(-interval / tau)
    }

    // Clamp to max W' (cannot recover more than full capacity)
    if (currentWPrime > wPrime) currentWPrime = wPrime

    wPrimeBalance.push(currentWPrime)

    if (currentWPrime < minWPrimeBalance) minWPrimeBalance = currentWPrime
  }

  return {
    wPrimeBalance,
    minWPrimeBalance
  }
}

/**
 * Calculate Efficiency Factor (EF) Decay
 *
 * Measures aerobic decoupling by tracking Power:HR ratio over time.
 * Uses a rolling average to smooth the data.
 */
export function calculateEfficiencyFactorDecay(
  powerStream: number[],
  hrStream: number[],
  timeStream: number[],
  windowSizeSeconds: number = 300 // 5 minute rolling average
): EfficiencyFactorResult | null {
  if (powerStream.length !== hrStream.length || powerStream.length === 0) {
    return null
  }

  const rawEF: number[] = []
  const smoothedEF: number[] = []

  // 1. Calculate raw EF for valid points
  for (let i = 0; i < powerStream.length; i++) {
    const power = powerStream[i]!
    const hr = hrStream[i]!

    // Avoid division by zero and unrealistic HR values (e.g. < 40)
    if (hr > 40) {
      rawEF.push(power / hr)
    } else {
      rawEF.push(0) // or null? keeping 0 for now to maintain array length
    }
  }

  // 2. Apply rolling average
  // Assuming 1 sample per second roughly.
  // For variable recording rates, this simple window might be slightly inaccurate but sufficient for trends.
  const windowSize = windowSizeSeconds // samples

  for (let i = 0; i < rawEF.length; i++) {
    let sum = 0
    let count = 0

    const start = Math.max(0, i - Math.floor(windowSize / 2))
    const end = Math.min(rawEF.length, i + Math.floor(windowSize / 2))

    for (let j = start; j < end; j++) {
      if (rawEF[j]! > 0) {
        sum += rawEF[j]!
        count++
      }
    }

    smoothedEF.push(count > 0 ? sum / count : 0)
  }

  // 3. Calculate Decay (First Half vs Second Half)
  // We use the middle 80% of data to avoid warmup/cooldown artifacts if desired,
  // but standard decoupling uses halves. Let's use first half vs second half excluding first 10 mins warmup if possible.

  // Standard implementation: Split entire smoothed array
  const midpoint = Math.floor(smoothedEF.length / 2)
  const firstHalf = smoothedEF.slice(0, midpoint).filter((v) => v > 0)
  const secondHalf = smoothedEF.slice(midpoint).filter((v) => v > 0)

  const getAvg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0

  const firstHalfAvg = getAvg(firstHalf)
  const secondHalfAvg = getAvg(secondHalf)

  // Decay is percentage drop.
  // If EF drops, efficiency is worsening (higher HR for same Power).
  // Decoupling is typically defined as: (FirstHalf - SecondHalf) / FirstHalf * 100?
  // Actually, aerobic decoupling (Pw:HR) is usually calculated as:
  // (Avg Power 1st Half / Avg HR 1st Half) vs (Avg Power 2nd Half / Avg HR 2nd Half).
  // A positive decoupling means efficiency decreased (EF went down).
  // Standard formula: ((EF1 - EF2) / EF1) * 100

  let totalDecay = 0
  if (firstHalfAvg > 0) {
    totalDecay = ((firstHalfAvg - secondHalfAvg) / firstHalfAvg) * 100
  }

  return {
    efStream: smoothedEF,
    totalDecay,
    firstHalfAvg,
    secondHalfAvg
  }
}

/**
 * Calculate Quadrant Analysis (Cadence vs Power)
 */
export function calculateQuadrantAnalysis(
  powerStream: number[],
  cadenceStream: number[],
  ftp: number,
  targetCadence: number = 90
): QuadrantAnalysisResult | null {
  if (powerStream.length !== cadenceStream.length || powerStream.length === 0) {
    return null
  }

  // Thresholds
  const powerThreshold = ftp // Standard is FTP (or sometimes a % of FTP like 80-100%)
  // Using FTP as the axis split is standard for Quadrant Analysis.
  const cadenceThreshold = targetCadence

  const seconds = {
    q1: 0,
    q2: 0,
    q3: 0,
    q4: 0
  }

  let totalValidSeconds = 0

  for (let i = 0; i < powerStream.length; i++) {
    const power = powerStream[i]!
    const cadence = cadenceStream[i]!

    // Ignore zeros/coasting for quadrant distribution?
    // Usually QA includes everything, but zeros skew Q3/Q4 massively.
    // Let's include everything but maybe note that Q3/Q4 includes coasting.
    // Or filter out non-pedaling?
    // Let's filter out non-pedaling (cadence < 10 or power < 10) to see "Pedaling Style".

    if (cadence < 10 && power < 10) continue // Coasting/Stopping

    totalValidSeconds++

    if (power >= powerThreshold && cadence >= cadenceThreshold) {
      seconds.q1++ // High Power, High Cadence (Sprint)
    } else if (power >= powerThreshold && cadence < cadenceThreshold) {
      seconds.q2++ // High Power, Low Cadence (Grind)
    } else if (power < powerThreshold && cadence < cadenceThreshold) {
      seconds.q3++ // Low Power, Low Cadence (Recovery/Endurance)
    } else {
      seconds.q4++ // Low Power, High Cadence (Spinning)
    }
  }

  if (totalValidSeconds === 0) return null

  return {
    seconds,
    distribution: {
      q1: (seconds.q1 / totalValidSeconds) * 100,
      q2: (seconds.q2 / totalValidSeconds) * 100,
      q3: (seconds.q3 / totalValidSeconds) * 100,
      q4: (seconds.q4 / totalValidSeconds) * 100
    }
  }
}
