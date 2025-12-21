import { defineEventHandler, createError, getRouterParam } from 'h3'
import { prisma } from '../../../../utils/db'
import {
  detectIntervals,
  findPeakEfforts,
  calculateHeartRateRecovery,
  calculateAerobicDecoupling,
  calculateCoastingStats,
  detectSurgesAndFades,
  calculateRecoveryRateTrend
} from '../../../../utils/interval-detection'
import {
  calculateWPrimeBalance,
  calculateEfficiencyFactorDecay,
  calculateQuadrantAnalysis,
  calculateFatigueSensitivity,
  calculateStabilityMetrics
} from '../../../../utils/performance-metrics'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) {
    throw createError({
      statusCode: 400,
      message: 'Share token is required'
    })
  }

  // Get workout with streams by token
  const workout = await (prisma as any).workout.findFirst({
    where: {
      shareToken: token
    },
    include: {
      streams: true,
      user: {
        select: {
          id: true,
          ftp: true,
          maxHr: true
        }
      }
    }
  })

  if (!workout) {
    throw createError({
      statusCode: 404,
      message: 'Workout not found or link is invalid'
    })
  }

  // Check if workout has stream data
  const streams = (workout as any).streams
  if (!streams) {
    return {
      hasData: false,
      message: 'No timeline data available for this workout',
      intervals: [],
      peaks: { power: [], heartrate: [], pace: [] },
      recovery: null,
      detectionMetric: null
    }
  }

  // Parse streams safely
  const getStreamData = (stream: any): number[] | null => {
    if (!stream) return null
    if (Array.isArray(stream)) return stream
    // Handle old format or Prisma Json type wrapping
    if (stream.data && Array.isArray(stream.data)) return stream.data
    return null
  }

  const time = getStreamData(streams.time)
  
  if (!time || time.length === 0) {
    return {
      hasData: false,
      message: 'No time stream available',
      intervals: [],
      peaks: { power: [], heartrate: [], pace: [] },
      recovery: null,
      detectionMetric: null
    }
  }

  const wattsStream = getStreamData(streams.watts)
  const hrStream = getStreamData(streams.heartrate)
  const cadenceStream = getStreamData(streams.cadence)
  const velocityStream = getStreamData(streams.velocity)

  const hasWatts = !!(wattsStream && wattsStream.length > 0)
  const hasHr = !!(hrStream && hrStream.length > 0)
  const hasCadence = !!(cadenceStream && cadenceStream.length > 0)

  // Advanced metrics heavily rely on FTP
  // We use workout.ftp (snapshot) or user.ftp (current)
  const effectiveFtp = workout.ftp || (workout as any).user?.ftp

  // 1. Detect Intervals
  // Priority: Power > Pace (Velocity) > HR
  let detectedIntervals: any[] = []
  let detectionMetric = ''

  if (hasWatts) {
    // Detect based on Power
    detectionMetric = 'power'
    // Use FTP as threshold if available, otherwise auto-baseline
    detectedIntervals = detectIntervals(time, wattsStream!, 'power', effectiveFtp || undefined)
  } else if (velocityStream && velocityStream.length > 0) {
    // Detect based on Pace (Velocity)
    // Only for runs/swims typically
    if (workout.type === 'Run' || workout.type === 'Swim' || workout.type === 'Walk') {
      detectionMetric = 'pace'
      detectedIntervals = detectIntervals(time, velocityStream!, 'pace')
    }
  } else if (hasHr) {
    // Detect based on HR (least reliable for short intervals due to lag, but good for steady state)
    detectionMetric = 'heartrate'
    const maxHr = workout.maxHr || (workout as any).user?.maxHr
    const threshold = maxHr ? maxHr * 0.7 : undefined // approx Z2 border
    detectedIntervals = detectIntervals(time, hrStream!, 'heartrate', threshold)
  }

  // 2. Find Peak Efforts
  const peakPower = hasWatts ? findPeakEfforts(time, wattsStream!, 'power') : []
  const peakHr = hasHr ? findPeakEfforts(time, hrStream!, 'heartrate') : []
  const peakPace = velocityStream ? findPeakEfforts(time, velocityStream!, 'pace') : []

  // 3. Heart Rate Recovery
  const hrRecovery = hasHr ? calculateHeartRateRecovery(time, hrStream!) : null

  // 4. Advanced Metrics (Drift, Coasting, Surges)
  const decoupling = (hasWatts && hasHr)
    ? calculateAerobicDecoupling(time, wattsStream!, hrStream!)
    : null

  const coasting = hasWatts
    ? calculateCoastingStats(time, wattsStream!, cadenceStream || [], velocityStream || [])
    : null

  // Try to use workout-specific FTP if available, else user profile FTP
  // Fallback to 250 for display if both are missing (can be refined later)
  const calculationFtp = workout.ftp || (workout as any).user?.ftp || 250

  const surges = (hasWatts && calculationFtp)
    ? detectSurgesAndFades(time, wattsStream!, calculationFtp)
    : []

  // 5. New Advanced Analytics (W' Bal, EF Decay, Quadrants)
  
  let wPrime = null
  if (hasWatts && calculationFtp) {
    try {
      wPrime = calculateWPrimeBalance(wattsStream!, time, calculationFtp, 20000)
    } catch (e) {
      console.error(`[Intervals API] Error calculating W' Bal:`, e)
    }
  }

  let efDecay = null
  if (hasWatts && hasHr) {
    try {
      efDecay = calculateEfficiencyFactorDecay(wattsStream!, hrStream!, time)
    } catch (e) {
      console.error(`[Intervals API] Error calculating EF Decay:`, e)
    }
  }

  let quadrants = null
  if (hasWatts && hasCadence && calculationFtp) {
    try {
      quadrants = calculateQuadrantAnalysis(wattsStream!, cadenceStream!, calculationFtp)
    } catch (e) {
      console.error(`[Intervals API] Error calculating Quadrants:`, e)
    }
  }

  // 5. New Extended Advanced Metrics (Fatigue sensitivity, Stability, Recovery Trend)
  const fatigueSensitivity = (hasWatts && hasHr)
    ? calculateFatigueSensitivity(wattsStream!, hrStream!, time)
    : null

  const powerStability = hasWatts
    ? calculateStabilityMetrics(wattsStream!, detectedIntervals)
    : null

  const paceStability = (velocityStream && velocityStream.length > 0)
    ? calculateStabilityMetrics(velocityStream!, detectedIntervals)
    : null

  const recoveryTrend = hasHr
    ? calculateRecoveryRateTrend(time, hrStream!, detectedIntervals)
    : []

  // Enrich intervals with stats from other streams
  const enrichedIntervals = detectedIntervals.map(interval => {
    const startIdx = interval.start_index
    const endIdx = interval.end_index
    
    const stats: any = { ...interval }
    
    // Add avg Power if available and not already set
    if (hasWatts && detectionMetric !== 'power') {
      const vals = wattsStream!.slice(startIdx, endIdx + 1)
      stats.avg_power = vals.reduce((a, b) => a + b, 0) / vals.length
      stats.max_power = Math.max(...vals)
    }
    
    // Add avg HR if available
    if (hasHr) {
      const vals = hrStream!.slice(startIdx, endIdx + 1)
      stats.avg_heartrate = vals.reduce((a, b) => a + b, 0) / vals.length
      stats.max_heartrate = Math.max(...vals)
    }
    
    // Add avg Pace if available
    if (velocityStream) {
      const vals = velocityStream!.slice(startIdx, endIdx + 1)
      stats.avg_pace = vals.reduce((a, b) => a + b, 0) / vals.length
    }
    
    // Add avg Cadence if available
    if (hasCadence) {
      const vals = cadenceStream!.slice(startIdx, endIdx + 1)
      stats.avg_cadence = vals.reduce((a, b) => a + b, 0) / vals.length
    }

    return stats
  })
  
  // Sample data for chart (return ~500 points for performance)
  const sampleRate = Math.max(1, Math.floor(time.length / 500))
  const sample = (data: number[]) => data ? data.filter((_, i) => i % sampleRate === 0) : []
  
  const chartData = {
    time: sample(time),
    power: hasWatts ? sample(wattsStream!) : [],
    heartrate: hasHr ? sample(hrStream!) : [],
    pace: velocityStream ? sample(velocityStream!) : [],
    wPrime: wPrime ? sample(wPrime.wPrimeBalance) : [],
    ef: efDecay ? sample(efDecay.efStream) : []
  }

  return {
    hasData: true,
    detectionMetric,
    intervals: enrichedIntervals,
    peaks: {
      power: peakPower,
      heartrate: peakHr,
      pace: peakPace
    },
    recovery: hrRecovery,
    advanced: {
      decoupling,
      coasting,
      surges,
      wPrime,
      efDecay,
      quadrants,
      ftpUsed: calculationFtp,
      fatigueSensitivity,
      powerStability,
      paceStability,
      recoveryTrend
    },
    chartData
  }
})
