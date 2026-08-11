import { defineEventHandler, createError, getRouterParam, getQuery } from 'h3'
import { getServerSession } from '../../../utils/session'
import { prisma } from '../../../utils/db'
import { attachStreamToWorkout } from '../../../utils/repositories/workoutStreamRepository'
import { sportSettingsRepository } from '../../../utils/repositories/sportSettingsRepository'
import { calculateRollingNormalizedPower } from '../../../utils/power-metrics'
import {
  findPeakEfforts,
  calculateHeartRateRecovery,
  calculateAerobicDecoupling,
  calculateCoastingStats,
  detectSurgesAndFades,
  calculateRecoveryRateTrend,
  resolveProviderIntervalTypes
} from '../../../utils/interval-detection'
import {
  calculateWPrimeBalance,
  calculateEfficiencyFactorDecay,
  calculateQuadrantAnalysis,
  calculateFatigueSensitivity,
  calculateStabilityMetrics
} from '../../../utils/performance-metrics'
import {
  buildDetectedIntervalCandidate,
  getActualIntervalsSourceForAnalysis
} from '../../../utils/workout-analysis-facts'

defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Get workout intervals',
    description:
      'Detects and analyzes intervals within a workout based on power, pace, or heart rate.',
    inputSchema: [
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' }
      },
      {
        name: 'debug',
        in: 'query',
        required: false,
        schema: { type: 'boolean' }
      }
    ],
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                hasData: { type: 'boolean' },
                detectionMetric: { type: 'string', nullable: true },
                intervals: { type: 'array' },
                peaks: { type: 'object' },
                recovery: { type: 'object', nullable: true },
                advanced: { type: 'object' },
                chartData: { type: 'object' },
                audit: { type: 'object', nullable: true },
                message: { type: 'string', nullable: true }
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' },
      404: { description: 'Workout not found' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const workoutId = getRouterParam(event, 'id')
  const query = getQuery(event)
  const isDebug = query.debug === 'true' || query.debug === true

  if (!workoutId) {
    throw createError({
      statusCode: 400,
      message: 'Workout ID is required'
    })
  }

  // Get user with integration profile settings if needed
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      ftp: true,
      maxHr: true,
      lthr: true,
      email: true
    }
  })

  if (!user) {
    throw createError({
      statusCode: 404,
      message: 'User not found'
    })
  }

  const workoutRecord = await prisma.workout.findFirst({
    where: {
      id: workoutId,
      userId: user.id
    },
    include: {
      plannedWorkout: true
    }
  })

  if (!workoutRecord) {
    throw createError({
      statusCode: 404,
      message: 'Workout not found'
    })
  }

  const workout = await attachStreamToWorkout(workoutRecord)

  // Athlete-level reference values (FTP / max HR / threshold pace) for the sport of this
  // workout. Detection needs these so work reps can be separated from recovery blocks.
  const sportSettings = await sportSettingsRepository.getForActivityType(
    user.id,
    workout.type || ''
  )

  // Check if workout has stream data
  if (!workout.streams) {
    console.log(`[Intervals API] Workout ${workoutId} has no streams relation`)
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

  // Parse streams safely
  const getStreamData = (stream: any): number[] | null => {
    if (!stream) return null
    if (Array.isArray(stream)) return stream
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

  const calculationFtp = workout.ftp || sportSettings?.ftp || user?.ftp || 250
  // Threshold pace is stored in m/s (same convention as calculatePaceZones), so it can be
  // handed to the detection engine directly as the pace work/recovery reference.
  const calculationThresholdPace = Number(sportSettings?.thresholdPace || 0) || undefined
  // Source the HR references from the athlete's PROFILE (the `sportSettings` loaded above,
  // then the user record). Using this workout's own max HR would make the bar
  // self-referential and drift session to session, so it is only reached as an explicit last
  // resort inside `resolveHrWorkThreshold` when the profile carries neither LTHR nor max HR.
  const hrRefs = {
    lthr: sportSettings?.lthr ?? user.lthr,
    maxHr: sportSettings?.maxHr ?? user.maxHr
  }

  /**
   * The athlete's real reference values, in the shape the analysis/facts layer expects.
   *
   * These are deliberately the SAME numbers this endpoint hands to its own detection run
   * below, so when the facts layer re-derives its candidates to arbitrate between them it
   * scores the same two segmentations the chart is choosing from. Passing zeroed
   * placeholders here would make the arbitration score blind — that exact bug was CW-384.
   */
  const analysisRefs = {
    ftp: Number(calculationFtp || 0),
    lthr: Number(hrRefs.lthr || 0),
    maxHr: Number(hrRefs.maxHr || 0),
    thresholdPace: Number(calculationThresholdPace || 0),
    hrZones: sportSettings?.hrZones || [],
    powerZones: sportSettings?.powerZones || [],
    paceZones: sportSettings?.paceZones || []
  }

  // 1. INTERVAL DETECTION LOGIC

  // A. Intervals from Sync (Intervals.icu / Strava)
  const raw = workout.rawJson as any
  const icuIntervalsRaw = raw?.icu_intervals || raw?.intervals

  const mapSyncedIntervals = (intervals: any[]) => {
    if (!intervals || !Array.isArray(intervals)) return []
    // Providers (Intervals.icu especially) label almost every lap WORK, so the
    // recovery jogs of an interval session would otherwise render as reps.
    const resolvedTypes = resolveProviderIntervalTypes(
      intervals.map((i: any) => ({
        type: i.type,
        intensity: Number(i.intensity),
        avgPower: Number(i.average_watts),
        avgSpeed: Number(i.average_speed)
      }))
    )
    return intervals.map((i: any, index: number) => ({
      start_index: i.start_index,
      end_index: i.end_index,
      start_time: i.start_time,
      end_time: i.end_time,
      duration: i.duration || i.end_time - i.start_time,
      type: resolvedTypes[index] ?? i.type,
      avg_power: i.average_watts,
      max_power: i.max_watts,
      avg_heartrate: i.average_heartrate,
      max_heartrate: i.max_heartrate,
      avg_pace: i.average_speed,
      avg_cadence: i.average_cadence,
      distance: i.distance,
      label: i.label
    }))
  }

  const syncedIntervals = mapSyncedIntervals(icuIntervalsRaw)

  // Audit-only since CW-434: the detection run gets its planned steps from the shared
  // builder (which flattens them through `toDetectionPlannedSteps`), so this raw list is
  // used purely to report whether a plan was available to arbitrate against.
  const plannedSteps = (workout.plannedWorkout?.structuredWorkout as any)?.steps || []

  // B. Intervals from our engine
  //
  // Built by the shared builder in the facts layer, NOT rebuilt here (CW-434). This
  // endpoint used to have its own copy of the metric-priority rule, and it disagreed
  // with the facts layer's on three points — watts before pace regardless of sport, a
  // raw `type === 'Run' || 'Swim'` string match instead of `getWorkoutFamily`, and no
  // `stream.length === time.length` check. The arbitration below is computed in the
  // facts layer, so it scored ITS candidate while the chart rendered this one: for a
  // power-metered run the verdict described a pace-detected segmentation the athlete
  // never saw. One builder, one candidate, one verdict.
  //
  // `buildDetectedIntervalCandidate` returns engine-shaped `Interval`s, so the
  // `start_index`/`end_index` that enrichment and charting need are already here and
  // nothing is converted between shapes.
  const detectionCandidate = buildDetectedIntervalCandidate(
    workout,
    workout.plannedWorkout,
    analysisRefs
  )
  const detectedEngineIntervals: any[] = detectionCandidate.intervals
  // The metric the shared builder actually segmented on, not a guess re-derived here.
  const autoDetectionMetric = detectionCandidate.metric ?? ''

  // C. Selection Logic
  //
  // Provider laps used to win unconditionally here, while the analysis side arbitrates
  // between the same two candidates (`chooseActualIntervalsSource`) and can pick either.
  // The chart and every AI claim could therefore describe the same session with different
  // reps. The chart now follows the arbitration too (CW-430).
  //
  // The facts layer works in `ActualInterval` shape, which carries no stream indices, so we
  // ask it ONLY which source won and then select between the `Interval`-shaped objects this
  // endpoint has already built. Nothing is converted between the two shapes.
  //
  // Nothing is persisted: the verdict is recomputed on every request, so a chart picks up
  // detection and threshold fixes as soon as they ship (accepted tradeoff: the segmentation
  // of a historical workout can change between two views of it).
  //
  // `arbitratedSource` stays `null` when there is nothing to arbitrate (one side has no
  // candidates at all); the fallback below is then the endpoint's long-standing behaviour.
  let arbitratedSource: 'raw' | 'detected' | 'none' | null = null
  if (syncedIntervals.length > 0 && detectedEngineIntervals.length > 0) {
    arbitratedSource = getActualIntervalsSourceForAnalysis(
      workout,
      workout.plannedWorkout,
      analysisRefs
    )
  }

  // With no linked plan there is nothing to score the two candidates against, and
  // `getActualIntervalsSourceForAnalysis` returns `'raw'` — provider laps win, which is the
  // same answer this endpoint gave before CW-430 and a defensible default: without a plan we
  // have no evidence the engine's segmentation describes the session any better. `'none'`
  // (the facts layer found neither candidate, e.g. streams it cannot read) also falls back to
  // provider laps rather than rendering an empty chart.
  const useDetectedIntervals =
    arbitratedSource === null ? syncedIntervals.length === 0 : arbitratedSource === 'detected'

  const finalIntervals: typeof syncedIntervals = useDetectedIntervals
    ? detectedEngineIntervals
    : syncedIntervals
  // Keep the reported metric meaningful for existing consumers: the provider name when its
  // laps won, the detection metric when our engine did.
  const detectionMetric: string = useDetectedIntervals ? autoDetectionMetric : 'intervals.icu'

  // 2. PEAKS & RECOVERY
  const peakPower = hasWatts ? findPeakEfforts(time, wattsStream!, 'power') : []
  const peakHr = hasHr ? findPeakEfforts(time, hrStream!, 'heartrate') : []
  const peakPace = velocityStream ? findPeakEfforts(time, velocityStream!, 'pace') : []
  const hrRecovery = hasHr ? calculateHeartRateRecovery(time, hrStream!) : null

  // 3. ADVANCED METRICS
  const decoupling =
    workout.decoupling ??
    (hasWatts && hasHr
      ? (calculateAerobicDecoupling(time, wattsStream!, hrStream!) || 0) * 100
      : null)
  const coasting = hasWatts
    ? calculateCoastingStats(time, wattsStream!, cadenceStream || [], velocityStream || [])
    : null
  const surges = hasWatts ? detectSurgesAndFades(time, wattsStream!, calculationFtp) : []

  let wPrime = null
  if (hasWatts) {
    try {
      wPrime = calculateWPrimeBalance(wattsStream!, time, calculationFtp, 20000)
    } catch {
      // Calculation optional
    }
  }

  let efDecay = null
  if (hasWatts && hasHr) {
    try {
      efDecay = calculateEfficiencyFactorDecay(wattsStream!, hrStream!, time)
    } catch {
      // Calculation optional
    }
  }

  let quadrants = null
  if (hasWatts && hasCadence) {
    try {
      quadrants = calculateQuadrantAnalysis(wattsStream!, cadenceStream!, calculationFtp)
    } catch {
      // Calculation optional
    }
  }

  const fatigueSensitivity =
    hasWatts && hasHr ? calculateFatigueSensitivity(wattsStream!, hrStream!, time) : null
  const powerStability = hasWatts ? calculateStabilityMetrics(wattsStream!, finalIntervals) : null
  const paceStability =
    velocityStream && velocityStream.length > 0
      ? calculateStabilityMetrics(velocityStream!, finalIntervals)
      : null
  const recoveryTrend = hasHr ? calculateRecoveryRateTrend(time, hrStream!, finalIntervals) : []

  // 4. ENRICHMENT
  const enrich = (intervals: any[]) => {
    return intervals.map((interval) => {
      const startIdx = interval.start_index
      const endIdx = interval.end_index
      const stats: any = { ...interval }

      if (hasWatts && !stats.avg_power) {
        const vals = wattsStream!.slice(startIdx, endIdx + 1)
        stats.avg_power = vals.reduce((a, b) => a + b, 0) / vals.length
        stats.max_power = Math.max(...vals)
      }
      if (hasHr && !stats.avg_heartrate) {
        const vals = hrStream!.slice(startIdx, endIdx + 1)
        stats.avg_heartrate = vals.reduce((a, b) => a + b, 0) / vals.length
      }
      if (velocityStream && !stats.avg_pace) {
        const vals = velocityStream!.slice(startIdx, endIdx + 1)
        stats.avg_pace = vals.reduce((a, b) => a + b, 0) / vals.length
      }
      if (hasCadence && !stats.avg_cadence) {
        const vals = cadenceStream!.slice(startIdx, endIdx + 1)
        stats.avg_cadence = vals.reduce((a, b) => a + b, 0) / vals.length
      }
      return stats
    })
  }

  const enrichedIntervals = enrich(finalIntervals)

  // 5. CHART DATA
  const sampleRate = Math.max(1, Math.floor(time.length / 500))
  const sample = (data: number[]) => (data ? data.filter((_, i) => i % sampleRate === 0) : [])

  const chartData: {
    time: number[]
    power: number[]
    smoothedPower: number[]
    heartrate: number[]
    pace: number[]
    wPrime: number[]
    ef: number[]
    plannedPower?: number[]
  } = {
    time: sample(time),
    power: hasWatts ? sample(wattsStream!) : [],
    smoothedPower: hasWatts ? sample(calculateRollingNormalizedPower(wattsStream!)) : [],
    heartrate: hasHr ? sample(hrStream!) : [],
    pace: velocityStream ? sample(velocityStream!) : [],
    wPrime: wPrime ? sample(wPrime.wPrimeBalance) : [],
    ef: efDecay ? sample(efDecay.efStream) : []
  }

  // 6. DEBUG AUDIT OBJECT
  let audit = null
  if (isDebug) {
    const planned = workout.plannedWorkout?.structuredWorkout as any
    const plannedIntervals: any[] = []

    if (planned?.steps && Array.isArray(planned.steps)) {
      let cumulativeTime = 0
      planned.steps.forEach((step: any) => {
        const duration = step.durationSeconds || step.duration || 0
        const avg_power = step.power?.value ? step.power.value * calculationFtp : undefined

        plannedIntervals.push({
          type: step.type || 'WORK',
          label: step.name,
          start_time: cumulativeTime,
          end_time: cumulativeTime + duration,
          duration,
          avg_power,
          // Map indices if possible for highlighting, but planned don't have them
          // We can approximate based on 1Hz sampling for the audit view
          start_index: cumulativeTime,
          end_index: cumulativeTime + duration
        })
        cumulativeTime += duration
      })
    }

    audit = {
      detected: enrich(detectedEngineIntervals),
      synced: syncedIntervals, // Already enriched from rawJson usually
      planned: plannedIntervals,
      plannedRaw: planned,
      plannedTitle: workout.plannedWorkout?.title || null,
      calculationFtp,
      calculationThresholdPace: calculationThresholdPace ?? null,
      autoDetectionMetric,
      // Provenance of the segmentation the athlete is actually looking at (CW-430).
      // Debug-only on purpose: divergence between the two candidates is never surfaced to
      // athletes, it is only inspectable here when troubleshooting.
      intervalSource: {
        // What the chart rendered: provider laps ('raw') or our engine ('detected').
        chosen: useDetectedIntervals ? 'detected' : 'raw',
        // What the arbitration returned, or null when there was nothing to arbitrate
        // because one of the two candidate sets was empty.
        arbitrated: arbitratedSource,
        syncedCount: syncedIntervals.length,
        detectedCount: detectedEngineIntervals.length,
        // Arbitration can only score the candidates when a plan is linked; without one it
        // returns 'raw' by definition.
        planAvailable: plannedSteps.length > 0,
        plannedStepCount: plannedSteps.length,
        detectionMetric
      }
    }

    // Generate a planned power stream that matches the recorded time samples
    const plannedPowerStream = new Array(time.length).fill(null)
    if (plannedIntervals.length > 0) {
      plannedIntervals.forEach((p: any) => {
        for (let i = 0; i < time.length; i++) {
          const t = time[i]
          if (t !== undefined && t >= p.start_time && t <= p.end_time) {
            plannedPowerStream[i] = p.avg_power || 0
          }
        }
      })
      chartData.plannedPower = sample(plannedPowerStream)
    }
  }

  return {
    hasData: true,
    detectionMetric,
    timeLength: time.length,
    sampleRate,
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
    chartData,
    audit
  }
})
