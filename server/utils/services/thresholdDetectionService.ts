import { prisma as globalPrisma } from '../db'
import { sportSettingsRepository } from '../repositories/sportSettingsRepository'
import { findPeakEfforts } from '../interval-detection'
import { createUserNotification } from '../notifications'
import { queueThresholdUpdateEmail } from '../workout-insight-email'
import { logger } from '@trigger.dev/sdk/v3'
import { workoutStreamRepository } from '../repositories/workoutStreamRepository'
import { formatPromptPace } from '../ai-prompt-format'
import { calculateHrZones, calculatePaceZones, calculatePowerZones } from '../zones'

/**
 * Threshold pace is taken directly off the best sustained 40 minute effort (no
 * scaling coefficient, unlike the 20 minute HR/power branches).
 *
 * The missing coefficient is deliberate and stays that way (CW-413 reviewed it):
 * the 20 minute buckets are scaled by 0.95 because a maximal 20 minute effort
 * sits *above* threshold, whereas an effort held at threshold intensity for 40
 * minutes is, by definition, threshold pace. What the raw formula needs is not a
 * discount but proof that the 40 minutes really were at threshold intensity —
 * see `corroborateThresholdEffortWithHr`. Scaling instead would have been a
 * blanket pessimism applied equally to real threshold efforts and to easy runs.
 */
export const THRESHOLD_PACE_PEAK_DURATION_SEC = 2400

/**
 * Share of the peak window's samples that must carry a usable reading before the
 * average is treated as evidence. A strap (or a power meter) that dropped out
 * for most of the effort corroborates nothing.
 */
const THRESHOLD_EFFORT_COVERAGE_MIN = 0.8

/**
 * A first-ever detection arrives with no previous value: the field is absent,
 * zero, or non-finite. Framing that as an improvement — "increased from 0" —
 * reads as a bug to the athlete, so every piece of threshold copy branches on
 * this one predicate rather than re-deriving the test (CW-421, CW-420).
 */
function hasPreviousValue(oldValue: number | null | undefined): boolean {
  return typeof oldValue === 'number' && Number.isFinite(oldValue) && oldValue > 0
}

/**
 * Mean of `values` over the closed `[startSec, endSec]` window, or `null` when
 * too few of the window's samples carry a usable reading.
 */
function averageOverWindow(
  times: number[],
  values: readonly number[],
  startSec: number,
  endSec: number,
  isUsable: (value: number) => boolean
): number | null {
  let inWindow = 0
  let usable = 0
  let sum = 0

  for (let i = 0; i < times.length; i++) {
    const t = times[i]
    if (t === undefined || t < startSec || t > endSec) continue
    inWindow++
    const value = values[i]
    if (typeof value === 'number' && Number.isFinite(value) && isUsable(value)) {
      usable++
      sum += value
    }
  }

  if (inWindow === 0 || usable / inWindow < THRESHOLD_EFFORT_COVERAGE_MIN) return null

  return sum / usable
}

export interface ThresholdEffortHrEvidence {
  corroborated: boolean
  /** Machine-readable reason, for logs. */
  reason:
    | 'no_hr_stream'
    | 'no_hr_reference'
    | 'insufficient_hr_coverage'
    | 'below_threshold_band'
    | 'in_threshold_band'
  avgHr?: number
  floorHr?: number
}

/**
 * Does the heart rate recorded over a peak effort's own window show the athlete
 * was actually working at threshold?
 *
 * The bar is the floor of the athlete's Z4 band as `calculateHrZones` already
 * defines it (0.93 x LTHR, or 0.8 x max HR when no LTHR is known) — no new
 * coefficient is invented here. Note this is deliberately *not*
 * `resolveHrWorkThreshold`: that is interval detection's easy/work boundary
 * (0.82 x LTHR / 0.7 x max HR), which a steady easy run clears comfortably.
 *
 * The session's own max HR is likewise not accepted as a reference. On an easy
 * run the session max is itself an easy heart rate, so anything measured
 * relative to it passes — the gate would fail open exactly where it matters.
 *
 * Every "we cannot tell" path returns `corroborated: false`: a missing
 * recommendation is invisible, a wrong one moves the athlete's training zones.
 */
export function corroborateThresholdEffortWithHr(args: {
  times: number[]
  heartrate?: number[] | null
  startSec: number
  endSec: number
  lthr?: number | null
  maxHr?: number | null
}): ThresholdEffortHrEvidence {
  const { times, heartrate, startSec, endSec, lthr, maxHr } = args

  if (!Array.isArray(heartrate) || heartrate.length === 0) {
    return { corroborated: false, reason: 'no_hr_stream' }
  }

  const floorHr = calculateHrZones(lthr || null, maxHr || null).find((zone) =>
    zone.name.startsWith('Z4')
  )?.min

  if (!floorHr || floorHr <= 0) {
    return { corroborated: false, reason: 'no_hr_reference' }
  }

  // A zero is a dropped sample, not a resting heart rate, so it is not averaged.
  const avgHr = averageOverWindow(times, heartrate, startSec, endSec, (hr) => hr > 0)

  if (avgHr === null) {
    return { corroborated: false, reason: 'insufficient_hr_coverage', floorHr }
  }

  return {
    corroborated: avgHr >= floorHr,
    reason: avgHr >= floorHr ? 'in_threshold_band' : 'below_threshold_band',
    avgHr,
    floorHr
  }
}

export interface ThresholdEffortWorkEvidence {
  corroborated: boolean
  /** Machine-readable reason, for logs. */
  reason:
    'no_corroborating_axis' | 'insufficient_coverage' | 'below_threshold_band' | 'in_threshold_band'
  /** Which axis produced the verdict. */
  axis?: 'power' | 'pace'
  avgValue?: number
  floorValue?: number
}

/**
 * Was a peak effort's own window worked at threshold *on a non-heart-rate axis*?
 *
 * This is the LTHR counterpart of `corroborateThresholdEffortWithHr`, and it
 * exists because that function cannot serve here: corroborating a heart-rate
 * derived threshold with heart rate is circular — the same 20 minute window
 * would be both the claim and its own evidence. Power and pace are independent
 * measurements of how hard the athlete was actually working, so they can vouch
 * for the effort without begging the question (CW-420).
 *
 * The bar on each axis is that axis's own Z4 floor as the shared zone models
 * already define it — `calculatePowerZones` (0.9 x FTP) and `calculatePaceZones`
 * (0.95 x threshold speed). No new coefficient is invented here, exactly as in
 * the CW-413 heart-rate precedent.
 *
 * Both references are the athlete's *stored* FTP and threshold pace, never a
 * value detected in this same pass, so there is no cross-metric feedback loop.
 *
 * The axes are an OR: a ride corroborated by power and a run corroborated by
 * pace both count, and the first axis that clears its floor wins. When neither
 * axis is available — no stored FTP and no stored threshold pace, or no matching
 * stream — the answer is `no_corroborating_axis` and the caller must not
 * nominate. Preferring no recommendation over a weak one is the whole reason
 * CW-413 works, and a machine-generated LTHR moves every heart rate zone in the
 * app.
 */
export function corroborateThresholdEffortWithWorkRate(args: {
  times: number[]
  watts?: number[] | null
  velocity?: number[] | null
  startSec: number
  endSec: number
  ftp?: number | null
  /** The athlete's stored threshold pace, in seconds per kilometre. */
  thresholdPaceSecPerKm?: number | null
}): ThresholdEffortWorkEvidence {
  const { times, watts, velocity, startSec, endSec, ftp, thresholdPaceSecPerKm } = args

  const axes: Array<{ axis: 'power' | 'pace'; values: number[]; floor: number }> = []

  if (Array.isArray(watts) && watts.length > 0 && ftp && ftp > 0) {
    const floor = calculatePowerZones(ftp).find((zone) => zone.name.startsWith('Z4'))?.min
    if (floor && floor > 0) axes.push({ axis: 'power', values: watts, floor })
  }

  if (
    Array.isArray(velocity) &&
    velocity.length > 0 &&
    thresholdPaceSecPerKm &&
    thresholdPaceSecPerKm > 0
  ) {
    // Zones are built from threshold *speed* in m/s; the profile stores pace in
    // seconds per kilometre.
    const thresholdSpeed = 1000 / thresholdPaceSecPerKm
    const floor = calculatePaceZones(thresholdSpeed).find((zone) => zone.name.startsWith('Z4'))?.min
    if (floor && floor > 0) axes.push({ axis: 'pace', values: velocity, floor })
  }

  if (axes.length === 0) return { corroborated: false, reason: 'no_corroborating_axis' }

  let rejection: ThresholdEffortWorkEvidence | null = null

  for (const { axis, values, floor } of axes) {
    // Unlike heart rate, a zero here is real: coasting and standing still are
    // part of the effort and drag the average down, which fails safe.
    const avgValue = averageOverWindow(times, values, startSec, endSec, (value) => value >= 0)

    if (avgValue === null) {
      rejection ??= {
        corroborated: false,
        reason: 'insufficient_coverage',
        axis,
        floorValue: floor
      }
      continue
    }

    if (avgValue >= floor) {
      return { corroborated: true, reason: 'in_threshold_band', axis, avgValue, floorValue: floor }
    }

    // A measured rejection is more informative than an unmeasurable one.
    rejection = {
      corroborated: false,
      reason: 'below_threshold_band',
      axis,
      avgValue,
      floorValue: floor
    }
  }

  return rejection ?? { corroborated: false, reason: 'no_corroborating_axis' }
}

export const thresholdDetectionService = {
  /**
   * Detect potential new thresholds (LTHR, FTP) from workout data
   */
  async detectThresholdIncreases(
    workoutOrId: string | any,
    options: { dryRun?: boolean; noNotify?: boolean; prismaOverride?: any } = {}
  ) {
    const { dryRun = false, noNotify = false, prismaOverride = null } = options
    const prisma = prismaOverride || globalPrisma

    logger.log('Starting threshold detection', { dryRun, noNotify })

    let workout: any
    if (typeof workoutOrId === 'string') {
      workout = await prisma.workout.findUnique({
        where: { id: workoutOrId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              lthr: true,
              ftp: true,
              maxHr: true,
              distanceUnits: true
            }
          }
        }
      })
      if (workout) {
        workout.streams = await workoutStreamRepository.findByWorkoutId(workoutOrId)
      }
    } else {
      workout = workoutOrId
      // Ensure streams are loaded if passed as object
      if (!workout.streams && workout.id) {
        workout.streams = await workoutStreamRepository.findByWorkoutId(workout.id)
      }
    }

    if (!workout || !workout.streams || (!workout.user && !workout.userId)) {
      logger.log('Threshold detection skipped: missing data or streams', {
        hasWorkout: !!workout,
        hasStreams: !!workout?.streams,
        hasUser: !!workout?.user
      })
      return null
    }

    const castWorkout = workout as any

    const results = {
      lthr: null as { old: number; new: number; detected: boolean } | null,
      ftp: null as { old: number; new: number; detected: boolean } | null,
      maxHr: null as { old: number; new: number; detected: boolean } | null,
      thresholdPace: null as { old: number; new: number; detected: boolean } | null,
      minDurationMet: false,
      workoutDurationSec: workout.durationSec,
      workoutType: workout.type
    }

    // 1. Fetch Sport Settings for this workout type
    const sportSettings = await sportSettingsRepository.getForActivityType(
      workout.userId,
      workout.type || '',
      prisma
    )

    const sportName = sportSettings?.name?.trim() || null
    const currentLthr = sportSettings?.lthr || workout.user?.lthr
    const currentFtp = sportSettings?.ftp || workout.user?.ftp
    const currentMaxHr = sportSettings?.maxHr || (workout.user as any)?.maxHr
    const currentThresholdPace = sportSettings?.thresholdPace

    // 2. Heart Rate Threshold & Max HR Detection
    if (
      workout.streams.heartrate &&
      Array.isArray(workout.streams.heartrate) &&
      Array.isArray(workout.streams.time)
    ) {
      // MAX HR DETECTION
      const workoutMaxHr = workout.maxHr || Math.max(...(workout.streams.heartrate as number[]))
      if (currentMaxHr && workoutMaxHr > currentMaxHr) {
        results.maxHr = { old: currentMaxHr, new: workoutMaxHr, detected: true }
        if (!dryRun && !noNotify) {
          await this.createThresholdRecommendation(
            workout.userId,
            workout.id,
            'MAX_HR',
            currentMaxHr,
            workoutMaxHr,
            workoutMaxHr,
            sportName,
            workout.date,
            prisma,
            noNotify
          )
          await createUserNotification(workout.userId, {
            title: sportName
              ? `New Max Heart Rate Detected (${sportName})`
              : 'New Max Heart Rate Detected',
            message: sportName
              ? `We detected a new peak heart rate of ${workoutMaxHr} bpm for your ${sportName} profile during "${workout.title || workout.type || 'workout'}".`
              : `We detected a new peak heart rate of ${workoutMaxHr} bpm during "${workout.title || workout.type || 'workout'}".`,
            icon: 'i-heroicons-heart',
            link: `/activities/${workout.id}`
          })
        }
      }

      // LTHR DETECTION
      const hrPeaks = findPeakEfforts(
        workout.streams.time as number[],
        workout.streams.heartrate as number[],
        'heartrate'
      )

      const peak20m = hrPeaks.find((p) => p.duration === 1200)
      const peak20mHR = peak20m?.value

      if (peak20m && peak20mHR) {
        // Industry standard (TrainingPeaks): LTHR is estimated as 95% of peak 20m HR
        // unless it's a specific 30m test protocol. For auto-detection, 95% is more accurate.
        const estimatedLthr = Math.round(peak20mHR * 0.95)

        const workoutType = (workout.type || '').toLowerCase()
        const isRun = workoutType.includes('run')
        const isBike =
          workoutType.includes('ride') ||
          workoutType.includes('bike') ||
          workoutType.includes('cycle')

        const minDurationSec = isRun ? 40 * 60 : isBike ? 50 * 60 : 30 * 60
        const minMet = workout.durationSec >= minDurationSec

        results.minDurationMet = minMet

        // Two different questions, so two different tests (CW-420).
        //
        // The athlete who already has an LTHR is vouched for by the improvement
        // test: a 20 minute peak that beats their known threshold is itself the
        // evidence, and the value only ever ratchets upward. That path is
        // deliberately untouched.
        //
        // The athlete who has none had, until CW-420, no path at all — the
        // branch required `currentLthr` to be truthy, so a first-time athlete
        // never received an LTHR and their heart rate zones stayed unset,
        // silently degrading every zone-based analysis and (since CW-383/CW-384)
        // interval detection too. Enabling it naively would be the CW-413 bug
        // inverted: the 0.95 coefficient cannot tell a maximal 20 minutes from
        // the steady middle of an easy ride, and there is nothing to beat.
        //
        // Decision (product, 2026-08-10): nominate, but only on corroborated
        // effort — and on an axis other than heart rate, because corroborating
        // an HR-derived threshold with HR is circular. Power or pace must show
        // the same window was worked at threshold. If neither is available we do
        // not nominate at all; a missing recommendation is invisible, a wrong one
        // moves every training zone the athlete has. The result is a
        // recommendation the athlete confirms, never a write to their profile.
        let accepted: boolean

        if (currentLthr) {
          accepted = estimatedLthr > currentLthr && minMet
        } else {
          const evidence = corroborateThresholdEffortWithWorkRate({
            times: workout.streams.time as number[],
            watts: workout.streams.watts as number[] | null,
            velocity: workout.streams.velocity as number[] | null,
            startSec: peak20m.start_time,
            endSec: peak20m.end_time,
            ftp: currentFtp,
            thresholdPaceSecPerKm: currentThresholdPace
          })
          accepted = minMet && evidence.corroborated

          if (!accepted) {
            logger.log('LTHR nomination rejected: no threshold-intensity evidence', {
              workoutId: workout.id,
              reason: evidence.reason,
              axis: evidence.axis,
              avgValue: evidence.avgValue,
              floorValue: evidence.floorValue,
              minMet,
              estimatedLthr
            })
          }
        }

        if (accepted) {
          results.lthr = { old: currentLthr || 0, new: estimatedLthr, detected: true }

          if (!dryRun) {
            await this.createThresholdRecommendation(
              workout.userId,
              workout.id,
              'LTHR',
              currentLthr || 0,
              estimatedLthr,
              peak20mHR,
              sportName,
              workout.date,
              prisma,
              noNotify
            )

            if (!noNotify) {
              await createUserNotification(workout.userId, {
                title: sportName
                  ? `New Heart Rate Threshold Detected (${sportName})`
                  : 'New Heart Rate Threshold Detected',
                message: hasPreviousValue(currentLthr)
                  ? sportName
                    ? `Congratulations! Your ${sportName} profile threshold heart rate increased to ${estimatedLthr} bpm (previous: ${currentLthr} bpm) based on "${workout.title}".`
                    : `Congratulations! Your threshold heart rate increased to ${estimatedLthr} bpm (previous: ${currentLthr} bpm) based on "${workout.title}".`
                  : sportName
                    ? `We detected your ${sportName} profile threshold heart rate: ${estimatedLthr} bpm, based on "${workout.title}".`
                    : `We detected your threshold heart rate: ${estimatedLthr} bpm, based on "${workout.title}".`,
                icon: 'i-heroicons-bolt',
                link: `/activities/${workout.id}`
              })
            }
          }
        } else {
          results.lthr = { old: currentLthr || 0, new: estimatedLthr, detected: false }
        }
      }
    }

    // 3. Power Threshold (FTP) & Power Peaks Detection
    if (
      workout.streams.watts &&
      Array.isArray(workout.streams.watts) &&
      Array.isArray(workout.streams.time)
    ) {
      const powerPeaks = findPeakEfforts(
        workout.streams.time as number[],
        workout.streams.watts as number[],
        'power'
      )

      const peak20m = powerPeaks.find((p) => p.duration === 1200)
      const peak20mPower = peak20m?.value

      if (peak20m && peak20mPower) {
        const estimatedFtp = Math.round(peak20mPower * 0.95)

        // Same two questions as the LTHR branch above, and the same decision
        // (CW-420). The improvement path is untouched: beating a known FTP over
        // 20 minutes is its own evidence.
        //
        // The first nomination has nothing to beat, so the 0.95 coefficient
        // alone would happily mint an FTP off the strongest 20 minutes of an
        // easy ride. FTP is the tractable half of this ticket: heart rate is an
        // independent axis here, so the CW-413 corroboration applies directly —
        // the same window must also sit in the athlete's Z4 heart rate band.
        // `corroborateThresholdEffortWithHr` fails safe on every "we cannot
        // tell" path (no strap, no HR reference, dropouts), so an athlete with
        // no HR data gets no nomination rather than a guessed one.
        let accepted: boolean

        if (currentFtp) {
          accepted = estimatedFtp > currentFtp
        } else {
          const evidence = corroborateThresholdEffortWithHr({
            times: workout.streams.time as number[],
            heartrate: workout.streams.heartrate as number[] | null,
            startSec: peak20m.start_time,
            endSec: peak20m.end_time,
            lthr: currentLthr,
            maxHr: currentMaxHr
          })
          accepted = evidence.corroborated

          if (!accepted) {
            logger.log('FTP nomination rejected: no threshold-intensity evidence', {
              workoutId: workout.id,
              reason: evidence.reason,
              avgHr: evidence.avgHr,
              floorHr: evidence.floorHr,
              estimatedFtp
            })
          }
        }

        if (accepted) {
          results.ftp = { old: currentFtp || 0, new: estimatedFtp, detected: true }

          if (!dryRun) {
            await this.createThresholdRecommendation(
              workout.userId,
              workout.id,
              'FTP',
              currentFtp || 0,
              estimatedFtp,
              peak20mPower,
              sportName,
              workout.date,
              prisma,
              noNotify
            )

            if (!noNotify) {
              await createUserNotification(workout.userId, {
                title: sportName ? `New ${sportName} FTP Detected` : 'New FTP Detected',
                message: hasPreviousValue(currentFtp)
                  ? sportName
                    ? `Great job! Your ${sportName} profile FTP increased to ${estimatedFtp}W (previous: ${currentFtp}W) based on "${workout.title || 'your workout'}".`
                    : `Great job! Your FTP increased to ${estimatedFtp}W (previous: ${currentFtp}W) based on "${workout.title || 'your workout'}".`
                  : sportName
                    ? `We detected your ${sportName} profile FTP: ${estimatedFtp}W, based on "${workout.title || 'your workout'}".`
                    : `We detected your FTP: ${estimatedFtp}W, based on "${workout.title || 'your workout'}".`,
                icon: 'i-heroicons-fire',
                link: `/activities/${workout.id}`
              })
            }
          }
        } else {
          results.ftp = { old: currentFtp || 0, new: estimatedFtp, detected: false }
        }
      }

      // LOG POWER PEAKS (5s, 1m, 5m)
      const peak5s = powerPeaks.find((p) => p.duration === 5)?.value
      const peak1m = powerPeaks.find((p) => p.duration === 60)?.value
      const peak5m = powerPeaks.find((p) => p.duration === 300)?.value

      if (!dryRun) {
        const peakLogs = []
        if (peak5s)
          peakLogs.push({
            userId: workout.userId,
            type: 'PEAK_POWER_5S',
            value: peak5s,
            oldValue: null,
            workoutId: workout.id,
            date: workout.date,
            source: 'AUTOMATIC'
          })
        if (peak1m)
          peakLogs.push({
            userId: workout.userId,
            type: 'PEAK_POWER_1M',
            value: peak1m,
            oldValue: null,
            workoutId: workout.id,
            date: workout.date,
            source: 'AUTOMATIC'
          })
        if (peak5m)
          peakLogs.push({
            userId: workout.userId,
            type: 'PEAK_POWER_5M',
            value: peak5m,
            oldValue: null,
            workoutId: workout.id,
            date: workout.date,
            source: 'AUTOMATIC'
          })
        if (peakLogs.length > 0) {
          await prisma.metricHistory.createMany({ data: peakLogs })
        }
      }
    }

    // 4. Threshold Pace Detection (Running)
    const workoutType = (workout.type || '').toLowerCase()
    if (
      workoutType.includes('run') &&
      workout.streams.velocity &&
      Array.isArray(workout.streams.velocity) &&
      Array.isArray(workout.streams.time)
    ) {
      // Threshold pace is read off a 40 minute effort, which is deliberately not
      // one of the shared DEFAULT_PEAK_DURATIONS buckets: adding it there would
      // mint a POWER_40M personal-best type and a "40m" row in the UI peaks
      // table. Ask for the one bucket this branch consumes instead.
      const pacePeaks = findPeakEfforts(
        workout.streams.time as number[],
        workout.streams.velocity as number[],
        'pace',
        [{ sec: THRESHOLD_PACE_PEAK_DURATION_SEC, label: '40m' }]
      )
      const peak40m = pacePeaks.find((p) => p.duration === THRESHOLD_PACE_PEAK_DURATION_SEC) // 40m
      const peak40mPace = peak40m?.value

      if (peak40m && peak40mPace) {
        const detectedPacePerKm = 1000 / peak40mPace // s/km
        const effectiveOldPace =
          currentThresholdPace || (castWorkout.thresholdPace ? castWorkout.thresholdPace : null)

        // Two different questions, so two different tests.
        //
        // The athlete who already has a threshold pace is vouched for by the
        // improvement test: 40 minutes held faster than their known threshold is
        // itself the evidence, and the value only ever ratchets upward.
        //
        // The first nomination has nothing to beat, so that test degenerates to
        // "any 40 minute stretch qualifies" — and the longest steady stretch of a
        // long *easy* run qualifies just as readily as a threshold effort. Since
        // CW-384/CW-401 that would also drag interval detection's pace work bar
        // (0.8 x thresholdPace) down with it. Make the first nomination prove the
        // effort was near threshold before it counts (CW-413).
        let accepted: boolean

        if (effectiveOldPace) {
          accepted = detectedPacePerKm < effectiveOldPace - 2 // 2s improvement
        } else {
          const evidence = corroborateThresholdEffortWithHr({
            times: workout.streams.time as number[],
            heartrate: workout.streams.heartrate as number[] | null,
            startSec: peak40m.start_time,
            endSec: peak40m.end_time,
            lthr: currentLthr,
            maxHr: currentMaxHr
          })
          accepted = evidence.corroborated

          if (!accepted) {
            logger.log('Threshold pace nomination rejected: no threshold-intensity evidence', {
              workoutId: workout.id,
              reason: evidence.reason,
              avgHr: evidence.avgHr,
              floorHr: evidence.floorHr,
              detectedPacePerKm
            })
          }
        }

        if (accepted) {
          results.thresholdPace = {
            old: effectiveOldPace || 0,
            new: detectedPacePerKm,
            detected: true
          }
          if (!dryRun) {
            await this.createThresholdRecommendation(
              workout.userId,
              workout.id,
              'THRESHOLD_PACE',
              effectiveOldPace || 0,
              detectedPacePerKm,
              peak40mPace,
              sportName,
              workout.date,
              prisma,
              noNotify,
              workout.user?.distanceUnits
            )
          }
        } else {
          results.thresholdPace = {
            old: effectiveOldPace || 0,
            new: detectedPacePerKm,
            detected: false
          }
        }
      }
    }

    return results
  },

  /**
   * Create a recommendation record for a threshold update
   */
  async createThresholdRecommendation(
    userId: string,
    workoutId: string,
    metric: 'LTHR' | 'FTP' | 'MAX_HR' | 'THRESHOLD_PACE',
    oldValue: number,
    newValue: number,
    peakValue: number,
    sportName: string | null,
    workoutDate: Date,
    prismaOverride?: any,
    noNotify: boolean = false,
    distanceUnits?: string | null
  ) {
    const prisma = prismaOverride || globalPrisma
    let title = `New ${metric} Threshold Detected`
    let description = ''
    const unit = metric === 'FTP' ? 'W' : metric === 'THRESHOLD_PACE' ? 's/km' : ' bpm'

    // See `hasPreviousValue`: the copy branches on whether there is a real
    // previous value to compare against, never on the raw number.
    const hasPrevious = hasPreviousValue(oldValue)

    if (metric === 'LTHR') {
      title = sportName ? `New ${sportName} LTHR Detected` : 'New LTHR Detected'
      if (hasPrevious) {
        description = sportName
          ? `Your ${sportName} LTHR has increased from ${oldValue} to ${newValue} bpm.`
          : `Your LTHR has increased from ${oldValue} to ${newValue} bpm.`
      } else {
        description = sportName
          ? `We detected your ${sportName} LTHR: ${newValue} bpm.`
          : `We detected your LTHR: ${newValue} bpm.`
      }
    } else if (metric === 'FTP') {
      title = sportName ? `New ${sportName} FTP Detected` : 'New FTP Detected'
      if (hasPrevious) {
        description = sportName
          ? `Your ${sportName} FTP has increased from ${oldValue}W to ${newValue}W.`
          : `Your FTP has increased from ${oldValue}W to ${newValue}W.`
      } else {
        description = sportName
          ? `We detected your ${sportName} FTP: ${newValue}W.`
          : `We detected your FTP: ${newValue}W.`
      }
    } else if (metric === 'MAX_HR') {
      title = sportName
        ? `New Max Heart Rate Detected (${sportName})`
        : 'New Max Heart Rate Detected'
      description = hasPrevious
        ? `We detected a new max heart rate of ${newValue} bpm (previous: ${oldValue} bpm).`
        : `We detected your max heart rate: ${newValue} bpm.`
    } else if (metric === 'THRESHOLD_PACE') {
      title = sportName
        ? `New Threshold Pace Detected (${sportName})`
        : 'New Threshold Pace Detected'
      const formattedPace = formatPromptPace(newValue, distanceUnits)
      if (hasPrevious) {
        description = sportName
          ? `Your ${sportName} threshold pace has improved to ${formattedPace}.`
          : `Your threshold pace has improved to ${formattedPace}.`
      } else {
        description = sportName
          ? `We detected your ${sportName} threshold pace: ${formattedPace}.`
          : `We detected your threshold pace: ${formattedPace}.`
      }
    }

    // Check if an active recommendation for this metric already exists to avoid spamming
    const existing = await prisma.recommendation.findFirst({
      where: {
        userId,
        metric,
        status: 'ACTIVE',
        sourceType: 'workout'
      }
    })

    if (existing) {
      // Update existing recommendation
      await prisma.recommendation.update({
        where: { id: existing.id },
        data: {
          title,
          description,
          generatedAt: new Date(),
          history: {
            oldValue,
            newValue,
            workoutId,
            sportName,
            workoutDate
          }
        }
      })
    } else {
      // Create new
      await prisma.recommendation.create({
        data: {
          userId,
          sourceType: 'workout',
          metric,
          period: 0, // Current/Immediate
          title,
          description,
          priority: 'HIGH',
          category: 'Metrics',
          status: 'ACTIVE',
          history: {
            oldValue,
            newValue,
            workoutId,
            sportName,
            workoutDate
          }
        }
      })
    }

    // Always log to history table for permanent record
    await prisma.metricHistory.create({
      data: {
        userId,
        type: metric,
        value: newValue,
        oldValue,
        workoutId,
        source: 'AUTOMATIC',
        date: workoutDate,
        sportProfileName: sportName || undefined,
        notes: sportName ? `Detected for ${sportName} profile.` : 'Detected from workout analysis.'
      }
    })

    // Queue email notification
    if (!noNotify) {
      try {
        await queueThresholdUpdateEmail({
          userId,
          workoutId,
          metric,
          oldValue,
          newValue,
          unit,
          peakValue,
          sportProfileName: sportName || undefined
        })
      } catch (err) {
        logger.warn('Failed to queue threshold email', { userId, workoutId, metric, error: err })
      }
    }
  }
}
