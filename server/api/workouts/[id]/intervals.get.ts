import { defineEventHandler, createError, getRouterParam } from 'h3'
import { getServerSession } from '#auth'
import { prisma } from '../../../utils/db'
import {
  detectIntervals,
  findPeakEfforts,
  calculateHeartRateRecovery,
  calculateAerobicDecoupling,
  calculateCoastingStats,
  detectSurgesAndFades,
  calculateRecoveryRateTrend
} from '../../../utils/interval-detection'
import {
  calculateWPrimeBalance,
  calculateEfficiencyFactorDecay,
  calculateQuadrantAnalysis,
  calculateFatigueSensitivity,
  calculateStabilityMetrics
} from '../../../utils/performance-metrics'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const workoutId = getRouterParam(event, 'id')
  if (!workoutId) {
    throw createError({
      statusCode: 400,
      message: 'Workout ID is required'
    })
  }

  // Get user with integration profile settings if needed
  // Note: user.ftp is a direct field on the User model
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      ftp: true,
      maxHr: true,
      email: true
    }
  })

  if (!user) {
    throw createError({
      statusCode: 404,
      message: 'User not found'
    })
  }

  // Get workout with streams
  const workout = await prisma.workout.findFirst({
    where: {
      id: workoutId,
      userId: user.id
    },
    include: {
      streams: true
    }
  })

  if (!workout) {
    throw createError({
      statusCode: 404,
      message: 'Workout not found'
    })
  }

  // Check if workout has stream data
  if (!workout.streams) {
    console.log(`[Intervals API] Workout ${workoutId} has no streams relation`)
    // Return standard object even if no data
    return {
      hasData: false,
      message: 'No timeline data available for this workout',
      intervals: [],
      peaks: { power: [], heartrate: [], pace: [] },
      recovery: null,
      detectionMetric: null
    }
  }

  const streams = workout.streams
  
  // Debug stream availability
  console.log(`[Intervals API] Processing streams for workout ${workoutId}`)
  console.log(`[Intervals API] Stream keys: ${Object.keys(streams).join(', ')}`)

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
    console.log(`[Intervals API] No time stream found or empty.`)
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

  console.log(`[Intervals API] Stream Stats:`)
  console.log(`  - Watts: ${hasWatts ? wattsStream?.length : 'N/A'}`)
  console.log(`  - HR: ${hasHr ? hrStream?.length : 'N/A'}`)
  console.log(`  - Cadence: ${hasCadence ? cadenceStream?.length : 'N/A'}`)
  console.log(`  - Velocity: ${velocityStream?.length || 'N/A'}`)

  // Debug inputs for advanced metrics
  // Advanced metrics heavily rely on FTP
  // We use workout.ftp (snapshot) or user.ftp (current)
  const effectiveFtp = workout.ftp || user.ftp
  
  console.log(`[Intervals API] Advanced Metrics Requirements:`)
  console.log(`  - Workout FTP: ${workout.ftp}`)
  console.log(`  - User FTP: ${user.ftp}`)
  console.log(`  - Effective FTP: ${effectiveFtp}`)
  console.log(`  - Has Watts: ${hasWatts}`)
  console.log(`  - Has Cadence: ${hasCadence}`)

  // 1. Detect Intervals
  // Priority: Power > Pace (Velocity) > HR
  let detectedIntervals: any[] = []
  let detectionMetric = ''

  if (hasWatts) {
    // Detect based on Power
    detectionMetric = 'power'
    // Use FTP as threshold if available, otherwise auto-baseline
    const ftp = workout.ftp || user.ftp
    detectedIntervals = detectIntervals(time, wattsStream!, 'power', ftp || undefined)
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
    const maxHr = workout.maxHr || user.maxHr
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
  const calculationFtp = workout.ftp || user?.ftp || 250

  const surges = (hasWatts && calculationFtp)
    ? detectSurgesAndFades(time, wattsStream!, calculationFtp)
    : []

  // 5. New Advanced Analytics (W' Bal, EF Decay, Quadrants)
  // Fallback: If no FTP set, try to estimate from max power?
  // No, dangerous. Instead, log the missing requirement clearly.
  
  let wPrime = null
  if (hasWatts && calculationFtp) {
    try {
      console.log(`[Intervals API] Calculating W' Balance with FTP ${calculationFtp}...`)
      wPrime = calculateWPrimeBalance(wattsStream!, time, calculationFtp, 20000)
      console.log(`[Intervals API] W' Balance Result:`, wPrime ? 'Success' : 'Null')
    } catch (e) {
      console.error(`[Intervals API] Error calculating W' Bal:`, e)
    }
  } else {
    console.log(`[Intervals API] Skipping W' Balance: hasWatts=${hasWatts}, ftp=${calculationFtp}`)
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
      console.log(`[Intervals API] Calculating Quadrants with FTP ${calculationFtp}...`)
      quadrants = calculateQuadrantAnalysis(wattsStream!, cadenceStream!, calculationFtp)
      console.log(`[Intervals API] Quadrants Result:`, quadrants ? 'Success' : 'Null')
    } catch (e) {
      console.error(`[Intervals API] Error calculating Quadrants:`, e)
    }
  } else {
    console.log(`[Intervals API] Skipping Quadrants: hasWatts=${hasWatts}, hasCadence=${hasCadence}, ftp=${calculationFtp}`)
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

  const response = {
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

  // Debug final structure
  console.log(`[Intervals API] Returning response. Advanced metrics present:`)
  console.log(`  - W' Prime: ${!!response.advanced.wPrime}`)
  console.log(`  - Quadrants: ${!!response.advanced.quadrants}`)
  console.log(`  - Surges: ${response.advanced.surges?.length || 0}`)

  return response
})
