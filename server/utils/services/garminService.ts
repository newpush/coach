import { registerTaskHandler } from '../task-registry'
import { prisma } from '../db'
import { toPrismaInputJsonValue } from '../prisma-json'
import { wellnessRepository } from '../repositories/wellnessRepository'
import { workoutRepository } from '../repositories/workoutRepository'
import { workoutStreamRepository } from '../repositories/workoutStreamRepository'
import {
  fetchGarminActivityFile,
  fetchGarminActivityFileByCallbackUrl,
  fetchGarminActivities,
  fetchGarminBodyComps,
  fetchGarminDailies,
  fetchGarminHRV,
  fetchGarminSleeps,
  fetchGarminUserMetrics,
  buildGarminTimeSlices,
  isGarminDownloadTokenError,
  refreshGarminIntegrationPermissions,
  requestGarminBackfill,
  type GarminBackfillType
} from '../garmin'
import {
  parseFitFile,
  normalizeFitSession,
  reconstructSessionFromRecords,
  extractFitStreams,
  extractFitExtrasMeta,
  type FitData
} from '../fit'
import { triggerWorkoutDeduplicationIfEnabled } from '../trigger-workout-deduplication'
import { shouldIngestActivities, shouldIngestWellness } from '../integration-settings'
import { normalizeGarminActivityType } from '../activity-mapping'
import { bodyMeasurementService } from './bodyMeasurementService'
import { normalizeReadinessScore, normalizeStressScoreForStorage } from '../wellness'
import { parseCalendarDate } from '../date'
import crypto from 'crypto'

function normalizeDeviceName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const trimmed = name.trim()
  if (!trimmed) return null
  if (trimmed.toLowerCase() === 'unknown') return null
  return trimmed
}

function inferDeviceNameFromFitData(fitData: any): string | null {
  const infos = Array.isArray(fitData?.device_infos) ? fitData.device_infos : []
  for (const info of infos) {
    const candidate =
      normalizeDeviceName(info?.product_name) ||
      normalizeDeviceName(info?.productName) ||
      normalizeDeviceName(info?.name) ||
      normalizeDeviceName(info?.device_name) ||
      normalizeDeviceName(info?.deviceName)

    if (candidate) return candidate
  }
  return null
}

/** Drop large FIT arrays so V8 can reclaim memory after stream upsert. */
function releaseFitData(fitData: FitData | null | undefined) {
  if (!fitData) return
  for (const key of ['records', 'sessions', 'laps', 'events', 'device_infos'] as const) {
    const value = fitData[key]
    if (Array.isArray(value)) value.length = 0
  }
}

function normalizeUtcDateFromTimestamp(
  timestampSeconds: number,
  offsetSeconds?: number | null
): Date | null {
  if (!Number.isFinite(timestampSeconds)) return null

  const effectiveMs =
    typeof offsetSeconds === 'number' && Number.isFinite(offsetSeconds)
      ? (timestampSeconds + offsetSeconds) * 1000
      : timestampSeconds * 1000

  const date = new Date(effectiveMs)
  if (Number.isNaN(date.getTime())) return null

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function extractGarminNumericMetric(
  record: Record<string, unknown>,
  keys: string[]
): number | null {
  for (const key of keys) {
    const candidate = record[key]
    const direct = toFiniteNumber(candidate)
    if (direct !== null) return direct

    if (candidate && typeof candidate === 'object') {
      const nestedValue = toFiniteNumber((candidate as Record<string, unknown>).value)
      if (nestedValue !== null) return nestedValue
    }
  }

  return null
}

/**
 * Detects whether a Prisma error is a P2002 unique-constraint violation on
 * the Integration(provider, externalUserId) index added in CW-99 to close a
 * race where two concurrent Garmin OAuth callbacks could both pass the
 * application-level "is this externalUserId already linked?" check and then
 * both write an Integration row for the same externalUserId.
 *
 * The shape of `PrismaClientKnownRequestError.meta` differs by query engine:
 * - Classic engine: `error.meta.target` is the field list directly, e.g.
 *   `["provider", "externalUserId"]`.
 * - Driver adapter engine (this app uses `@prisma/adapter-pg`, see
 *   server/utils/db.ts): `meta.target` does not exist. Prisma instead
 *   constructs the error as `new PrismaClientKnownRequestError(message, code,
 *   { driverAdapterError: originalError })`, so the field list is nested at
 *   `meta.driverAdapterError.cause.constraint.fields` (same finding used in
 *   emailDeliveryService.ts's getUniqueConstraintFields for CW-227).
 *
 * One extra wrinkle discovered while building this, verified against a live
 * Postgres 16 + @prisma/adapter-pg 7.8.0 instance: for a *multi-column*
 * unique index, the driver adapter's field list is derived from Postgres's
 * own rendering of the index definition, which quotes camelCase identifiers
 * but not lowercase ones. A real violation of this exact constraint reported
 * `constraint.fields: ["provider", "\"externalUserId\""]` - note the second
 * entry carries literal embedded double-quote characters that a naive
 * `.includes('externalUserId')` check would silently fail to match. We strip
 * surrounding quotes from every field before comparing to stay correct
 * regardless of which shape/quoting shows up.
 */
export function isGarminExternalUserIdConflict(error: any): boolean {
  if (!error || error.code !== 'P2002') return false
  const rawFields: unknown =
    error?.meta?.target ?? error?.meta?.driverAdapterError?.cause?.constraint?.fields
  if (!Array.isArray(rawFields)) return false
  const fields = rawFields.map((f) => (typeof f === 'string' ? f.replace(/^"+|"+$/g, '') : f))
  return fields.includes('provider') && fields.includes('externalUserId')
}

/**
 * Garmin Push list keys per Health API (preferred first), plus legacy aliases we
 * historically looked for so existing payloads keep working.
 */
export function extractGarminPushList(payload: unknown, ...keys: string[]): any[] {
  if (!payload || typeof payload !== 'object') return []
  const record = payload as Record<string, unknown>

  for (const key of keys) {
    const value = record[key]
    if (Array.isArray(value) && value.length > 0) return value
  }
  for (const key of keys) {
    const value = record[key]
    if (Array.isArray(value)) return value
  }
  return []
}

export function extractGarminSpO2Percentage(record: Record<string, unknown> | null | undefined) {
  if (!record || typeof record !== 'object') return null

  const directSpO2 = extractGarminNumericMetric(record, [
    'averagePulseOx',
    'averageSpo2',
    'avgPulseOx',
    'avgSpo2',
    'pulseOx',
    'spo2'
  ])

  if (directSpO2 !== null) {
    return Math.round(directSpO2 * 10) / 10
  }

  const sleepSamples = record.timeOffsetSleepSpo2
  if (!sleepSamples || typeof sleepSamples !== 'object' || Array.isArray(sleepSamples)) {
    return null
  }

  const values = Object.values(sleepSamples)
    .map((value) => toFiniteNumber(value))
    .filter((value): value is number => value !== null)

  if (values.length === 0) return null

  const average = values.reduce((sum, value) => sum + value, 0) / values.length
  return Math.round(average * 10) / 10
}

export function extractGarminReadinessScore(record: Record<string, unknown> | null | undefined) {
  if (!record || typeof record !== 'object') return null

  const readiness = extractGarminNumericMetric(record, [
    'trainingReadinessScore',
    'trainingReadiness',
    'readinessScore',
    'readiness',
    'training_ready_score'
  ])

  if (readiness === null) return null

  return normalizeReadinessScore(clampPercentage(readiness))
}

/**
 * Garmin's Activity summary exposes distinct average/max cadence fields per sport family:
 * cycling (`...BikeCadenceInRoundsPerMinute`), running (`...RunCadenceInStepsPerMinute`), and
 * swimming (`...SwimCadenceInStrokesPerMinute`). Our Workout model only stores one generic
 * averageCadence/maxCadence pair, so pick the source field pair based on the activity's
 * normalized sport (see `normalizeGarminActivityType`). Cycling (including virtual/mountain
 * biking) keeps the original bike-field-only behavior; anything else that isn't running or
 * swimming has no documented cadence fields and yields null, same as before this fix.
 */
export function extractGarminActivityCadence(
  record: Record<string, unknown> | null | undefined,
  normalizedType: string
): { average: number | null; max: number | null } {
  if (!record || typeof record !== 'object') return { average: null, max: null }

  if (normalizedType === 'Run') {
    return {
      average: extractGarminNumericMetric(record, ['averageRunCadenceInStepsPerMinute']),
      max: extractGarminNumericMetric(record, ['maxRunCadenceInStepsPerMinute'])
    }
  }

  if (normalizedType === 'Swim') {
    return {
      average: extractGarminNumericMetric(record, ['averageSwimCadenceInStrokesPerMinute']),
      max: extractGarminNumericMetric(record, ['maxSwimCadenceInStrokesPerMinute'])
    }
  }

  return {
    average: extractGarminNumericMetric(record, ['averageBikeCadenceInRoundsPerMinute']),
    max: extractGarminNumericMetric(record, ['maxBikeCadenceInRoundsPerMinute'])
  }
}

/**
 * Garmin's Stress Details schema exposes an absolute Body Battery *level* sampled
 * throughout the day via `timeOffsetBodyBatteryValues` (a map of seconds-since-start-of-day
 * to a 0-100 battery reading), the same shape as `timeOffsetSleepSpo2`. Body Battery is
 * highest right after sleep/rest and drains through the day with activity and stress, so the
 * peak sampled value is the best documented proxy for "how recovered" the user was that day.
 */
function extractGarminBodyBatteryPeakFromTimeSeries(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const values = Object.values(value as Record<string, unknown>)
    .map((entry) => toFiniteNumber(entry))
    .filter((entry): entry is number => entry !== null)

  if (values.length === 0) return null

  return Math.max(...values)
}

export function extractGarminBodyBatteryScore(record: Record<string, unknown> | null | undefined) {
  if (!record || typeof record !== 'object') return null

  // Preferred source: Garmin Stress Details' documented time-series field. This carries an
  // absolute Body Battery level (not a delta), so it maps directly onto our 0-100 recovery scale.
  const timeSeriesPeak = extractGarminBodyBatteryPeakFromTimeSeries(
    record.timeOffsetBodyBatteryValues
  )
  if (timeSeriesPeak !== null) {
    return clampPercentage(timeSeriesPeak)
  }

  // Garmin Daily Summary's documented fields only expose the amount of Body Battery charged
  // and drained over the day (deltas), not an absolute level. Derive a recovery percentage
  // centered on a neutral 50: a net-positive day (charged > drained) moves the score up toward
  // 100, a net-negative day moves it down toward 0. Charged/drained are each roughly 0-100, so
  // halving the net keeps the result within the 0-100 recovery range before clamping.
  const chargedValue = extractGarminNumericMetric(record, ['bodyBatteryChargedValue'])
  const drainedValue = extractGarminNumericMetric(record, ['bodyBatteryDrainedValue'])
  if (chargedValue !== null || drainedValue !== null) {
    const netChange = (chargedValue ?? 0) - (drainedValue ?? 0)
    return clampPercentage(50 + netChange / 2)
  }

  // Legacy/non-standard field names some earlier payload shapes used before this extractor was
  // aligned with the documented Garmin Health API models. Kept as a fallback so any
  // already-integrated data source that only ever sent these keeps working (CW-96).
  const legacyBodyBattery = extractGarminNumericMetric(record, [
    'bodyBatteryMostRecentValue',
    'bodyBatteryCurrentValue',
    'bodyBatteryEndingValue',
    'bodyBatteryValue',
    'bodyBattery',
    'bodyBatteryHighestValue',
    'bodyBatteryMaxValue'
  ])

  if (legacyBodyBattery !== null) {
    return clampPercentage(legacyBodyBattery)
  }

  // Some Garmin devices surface readiness-style recovery metrics without a body battery field.
  // Use that score as the best available recovery proxy so REC does not stay empty.
  const readinessFallback = extractGarminNumericMetric(record, [
    'trainingReadinessScore',
    'trainingReadiness',
    'recoveryScore',
    'readinessScore',
    'readiness'
  ])

  return readinessFallback !== null ? clampPercentage(readinessFallback) : null
}

/**
 * Outcome of a `startBackfill` run (CW-95).
 * - `no-integration`: the user has no Garmin integration, nothing was requested.
 * - `failed`: every backfill request failed.
 * - `partial`: at least one type succeeded and at least one failed.
 * - `success`: every type was accepted by Garmin.
 */
export type GarminBackfillStatus = 'success' | 'partial' | 'failed' | 'no-integration'

export interface GarminBackfillTypeFailure {
  type: GarminBackfillType
  error: string
}

export interface GarminBackfillResult {
  status: GarminBackfillStatus
  /** Types Garmin accepted a backfill request for (409 "already requested" counts as accepted). */
  requested: GarminBackfillType[]
  /** Types whose backfill request failed, with the error message per type. */
  failed: GarminBackfillTypeFailure[]
}

export const GarminService = {
  /**
   * Process a single webhook payload (Push API).
   */
  async processWebhookEvent(
    payload: any,
    context?: { query?: Record<string, any> | null; headers?: Record<string, any> | null }
  ) {
    console.log('[GarminService] Processing webhook payload:', Object.keys(payload))
    const pullToken = this.extractPullToken(payload, context)

    const deregistrations = Array.isArray(payload?.deregistrations) ? payload.deregistrations : []
    const userPermissionsChange = Array.isArray(payload?.userPermissionsChange)
      ? payload.userPermissionsChange
      : []

    // Garmin Push API sends lists of records. Prefer Health API keys, keep legacy aliases.
    const dailies = extractGarminPushList(payload, 'dailies')
    const sleeps = extractGarminPushList(payload, 'sleeps')
    const hrv = extractGarminPushList(payload, 'hrv')
    const activities = extractGarminPushList(payload, 'activities', 'manuallyUpdatedActivities')
    const activityFiles = extractGarminPushList(payload, 'activityFiles')
    const bodyComps = extractGarminPushList(payload, 'bodyComps', 'bodyComposition')
    const pulseOx = extractGarminPushList(payload, 'pulseox', 'pulseOx')
    const respiration = extractGarminPushList(payload, 'allDayRespiration', 'respiration')
    const stress = extractGarminPushList(payload, 'stressDetails', 'stress')
    const userMetrics = extractGarminPushList(payload, 'userMetrics')
    const moveIQ = extractGarminPushList(payload, 'moveIQActivities', 'moveiq')
    const hasSummaryData =
      dailies.length > 0 ||
      sleeps.length > 0 ||
      hrv.length > 0 ||
      activities.length > 0 ||
      activityFiles.length > 0 ||
      bodyComps.length > 0 ||
      pulseOx.length > 0 ||
      respiration.length > 0 ||
      stress.length > 0 ||
      userMetrics.length > 0 ||
      moveIQ.length > 0

    let deregisteredCount = 0
    let permissionUpdatedCount = 0

    if (deregistrations.length > 0) {
      deregisteredCount = await this.processDeregistrations(deregistrations)
    }
    if (userPermissionsChange.length > 0) {
      permissionUpdatedCount = await this.processUserPermissionChanges(userPermissionsChange)
    }

    if (!hasSummaryData) {
      if (deregistrations.length > 0 || userPermissionsChange.length > 0) {
        return {
          handled: true,
          message: `Processed Garmin admin events: ${deregisteredCount} deregistrations, ${permissionUpdatedCount} permission updates`
        }
      }
      return { handled: false, message: 'No recognized Garmin summary/admin event in payload' }
    }

    // Resolve User ID from the first record that has one
    const externalUserId =
      dailies[0]?.userId ||
      sleeps[0]?.userId ||
      hrv[0]?.userId ||
      activities[0]?.userId ||
      activityFiles[0]?.userId ||
      bodyComps[0]?.userId ||
      pulseOx[0]?.userId ||
      respiration[0]?.userId ||
      stress[0]?.userId ||
      userMetrics[0]?.userId

    if (!externalUserId) {
      return { handled: false, message: 'No userId found in payload' }
    }

    const integrations = await prisma.integration.findMany({
      where: { externalUserId, provider: 'garmin' }
    })

    if (integrations.length === 0) {
      return { handled: false, message: `No integration found for Garmin ID: ${externalUserId}` }
    }

    if (integrations.length > 1) {
      const mappedUserIds = integrations.map((integration) => integration.userId)
      console.error('[GarminService] Duplicate Garmin external user mapping detected', {
        externalUserId,
        mappedUserIds
      })
      throw new Error(
        `Duplicate Garmin externalUserId mapping for ${externalUserId}: ${mappedUserIds.join(', ')}`
      )
    }

    const integration = integrations[0]
    if (!integration) {
      console.warn('[GarminService] No integration found for externalUserId', { externalUserId })
      return
    }

    const userId = integration.userId
    const settings = (integration.settings as Record<string, any> | null) || {}
    const wellnessEnabled = shouldIngestWellness(settings)
    const activitiesEnabled = shouldIngestActivities('garmin', integration.ingestWorkouts, settings)

    // Process all metrics immediately in the worker
    try {
      if (wellnessEnabled && dailies.length > 0) await this.processWellness(userId, dailies)
      if (wellnessEnabled && sleeps.length > 0) await this.processSleep(userId, sleeps)
      if (wellnessEnabled && hrv.length > 0) await this.processHRV(userId, hrv)
      if (wellnessEnabled && stress.length > 0) await this.processStressDetails(userId, stress)
      if (activitiesEnabled && activities.length > 0)
        await this.processActivities(userId, activities, integration, pullToken)
      if (activitiesEnabled && activityFiles.length > 0) {
        await this.processActivityFiles(userId, activityFiles, integration)
      }

      // Handle additional health types
      if (wellnessEnabled && bodyComps.length > 0) await this.processBodyComp(userId, bodyComps)
      if (wellnessEnabled && userMetrics.length > 0) {
        await this.processUserMetrics(userId, userMetrics)
      }

      return {
        handled: true,
        message: `Processed: ${activities.length} activities, ${activityFiles.length} activity files, ${dailies.length} dailies, ${sleeps.length} sleeps, ${hrv.length} hrv`
      }
    } catch (error: any) {
      console.error('[GarminService] Error processing webhook:', error)
      throw error
    }
  },

  async processDeregistrations(records: any[]) {
    const userIds = Array.from(
      new Set(
        records
          .map((record) => (typeof record?.userId === 'string' ? record.userId.trim() : ''))
          .filter(Boolean)
      )
    )

    if (userIds.length === 0) return 0

    const result = await prisma.integration.deleteMany({
      where: {
        provider: 'garmin',
        externalUserId: { in: userIds }
      }
    })

    return result.count
  },

  async processUserPermissionChanges(records: any[]) {
    let updatedCount = 0

    for (const record of records) {
      const userId = typeof record?.userId === 'string' ? record.userId.trim() : ''
      if (!userId) continue

      const permissions = Array.isArray(record?.permissions)
        ? record.permissions.filter((permission: unknown) => typeof permission === 'string')
        : []
      const scope = permissions.length > 0 ? permissions.join(' ') : null
      const permissionsRemoved = permissions.length === 0

      const result = await prisma.integration.updateMany({
        where: {
          provider: 'garmin',
          externalUserId: userId
        },
        data: {
          scope,
          errorMessage: permissionsRemoved
            ? 'Garmin permissions were removed by the user in Garmin Connect.'
            : null
        }
      })

      updatedCount += result.count
    }

    return updatedCount
  },

  /**
   * Start historical backfill for a user.
   *
   * Returns a machine-readable summary instead of throwing (CW-95): the caller decides
   * what an incomplete backfill means. `runIngestGarmin`'s InvalidPullTokenException
   * fallback below treats any outcome as best-effort, while the `garmin-backfill`
   * Trigger task fails the run on `no-integration` / `failed` so an incomplete backfill
   * can no longer be reported to the platform as a success.
   */
  async startBackfill(userId: string): Promise<GarminBackfillResult> {
    const integration = await prisma.integration.findUnique({
      where: { userId_provider: { userId, provider: 'garmin' } }
    })

    if (!integration) {
      console.error(`[GarminService] Backfill skipped: no Garmin integration for user ${userId}`)
      return { status: 'no-integration', requested: [], failed: [] }
    }

    const now = Math.floor(Date.now() / 1000) - 60
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60

    // Request backfill for core + thin wellness extras (bodyComps / userMetrics).
    // Other Health types stay out of scope — see docs/issues/309.
    const types: GarminBackfillType[] = [
      'activities',
      'dailies',
      'sleeps',
      'hrv',
      'bodyComps',
      'userMetrics'
    ]

    const requested: GarminBackfillType[] = []
    const failed: GarminBackfillTypeFailure[] = []

    for (const type of types) {
      try {
        await requestGarminBackfill(integration, type, thirtyDaysAgo, now)
        requested.push(type)
        console.log(`[GarminService] Backfill requested for ${type}`)
      } catch (error) {
        failed.push({ type, error: error instanceof Error ? error.message : String(error) })
        console.error(`[GarminService] Backfill failed for ${type}:`, error)
      }
    }

    const status: GarminBackfillStatus =
      failed.length === 0 ? 'success' : requested.length === 0 ? 'failed' : 'partial'

    return { status, requested, failed }
  },

  /**
   * Process Garmin Wellness data
   */
  async processWellness(userId: string, data: any[]) {
    for (const record of data) {
      const utcDate = this.resolveWellnessDate(record, {
        timestampField: 'startTimeInSeconds',
        offsetField: 'startTimeOffsetInSeconds'
      })
      if (!utcDate) continue

      const wellnessData: any = {
        userId,
        date: utcDate,
        restingHr: record.restingHeartRateInBeatsPerMinute || null,
        recoveryScore: extractGarminBodyBatteryScore(record),
        readiness: extractGarminReadinessScore(record),
        stress: normalizeStressScoreForStorage(record.averageStressLevel),
        spO2: extractGarminSpO2Percentage(record),
        respiration: record.averageRespiration || null,
        rawJson: record
      }

      await wellnessRepository.upsert(userId, utcDate, wellnessData, wellnessData, 'garmin')
    }
  },

  /**
   * Process Garmin Sleep data
   */
  async processSleep(userId: string, data: any[]) {
    for (const record of data) {
      const utcDate = this.resolveWellnessDate(record, {
        timestampField: 'startTimeInSeconds',
        offsetField: 'startTimeOffsetInSeconds'
      })
      if (!utcDate) continue

      const sleepData: any = {
        userId,
        date: utcDate,
        sleepSecs: record.durationInSeconds || null,
        sleepScore: record.overallSleepScore?.value || null,
        spO2: extractGarminSpO2Percentage(record),
        sleepDeepSecs: record.deepSleepDurationInSeconds || null,
        sleepRemSecs: record.remSleepInSeconds || null,
        sleepLightSecs: record.lightSleepDurationInSeconds || null,
        rawJson: record
      }

      await wellnessRepository.upsert(userId, utcDate, sleepData, sleepData, 'garmin')
    }
  },

  /**
   * Process Garmin HRV data
   */
  async processHRV(userId: string, data: any[]) {
    for (const record of data) {
      const utcDate = this.resolveWellnessDate(record, {
        timestampField: 'startTimeInSeconds',
        offsetField: 'startTimeOffsetInSeconds'
      })
      if (!utcDate) continue

      const hrvData: any = {
        userId,
        date: utcDate,
        hrv: record.lastNightAvg || null,
        rawJson: record
      }

      await wellnessRepository.upsert(userId, utcDate, hrvData, hrvData, 'garmin')
    }
  },

  /**
   * Process Garmin Stress Details push records.
   *
   * These carry the `timeOffsetBodyBatteryValues` time series (and, in the future, stress
   * level samples) that Dailies alone cannot provide an absolute Body Battery reading from.
   * Previously these records were counted toward `hasSummaryData` but never persisted -
   * recognized recovery-bearing summaries were silently discarded (CW-96). Only recoveryScore
   * is written here; the wellnessRepository upsert only overwrites non-null fields, so this
   * merges into whatever Dailies/Sleep/HRV already wrote for the same day without clobbering it.
   */
  async processStressDetails(userId: string, data: any[]) {
    for (const record of data) {
      const utcDate = this.resolveWellnessDate(record, {
        timestampField: 'startTimeInSeconds',
        offsetField: 'startTimeOffsetInSeconds'
      })
      if (!utcDate) continue

      const recoveryScore = extractGarminBodyBatteryScore(record)
      if (recoveryScore === null) continue

      const stressDetailsData: any = {
        userId,
        date: utcDate,
        recoveryScore,
        rawJson: record
      }

      await wellnessRepository.upsert(
        userId,
        utcDate,
        stressDetailsData,
        stressDetailsData,
        'garmin'
      )
    }
  },

  /**
   * Process Garmin Body Composition (Weight)
   */
  async processBodyComp(userId: string, data: any[]) {
    for (const record of data) {
      const utcDate = this.resolveWellnessDate(record, {
        timestampField: 'measurementTimeInSeconds',
        offsetField: 'measurementTimeOffsetInSeconds'
      })
      if (!utcDate) continue

      const weightData: any = {
        userId,
        date: utcDate,
        weight: record.weightInGrams ? record.weightInGrams / 1000 : null,
        bodyFat: record.bodyFatInPercent || null,
        rawJson: record
      }

      const { record: savedRecord } = await wellnessRepository.upsert(
        userId,
        utcDate,
        weightData,
        weightData,
        'garmin'
      )
      await bodyMeasurementService.recordWellnessMetrics(
        userId,
        {
          id: savedRecord.id,
          date: savedRecord.date,
          weight: savedRecord.weight,
          bodyFat: savedRecord.bodyFat,
          rawJson: savedRecord.rawJson
        },
        'garmin'
      )
    }
  },

  /**
   * Process Garmin User Metrics (VO2 Max, etc.)
   */
  async processUserMetrics(userId: string, data: any[]) {
    for (const record of data) {
      const utcDate = this.resolveWellnessDate(record, {
        dateFields: ['calendarDate'],
        timestampField: 'measurementTimeInSeconds',
        offsetField: 'measurementTimeOffsetInSeconds'
      })
      if (!utcDate) continue

      const metricsData: any = {
        userId,
        date: utcDate,
        vo2max: record.vo2Max || record.vo2MaxCycling || null,
        rawJson: record
      }

      await wellnessRepository.upsert(userId, utcDate, metricsData, metricsData, 'garmin')
    }
  },

  /**
   * Process Garmin Activities
   */
  async processActivities(
    userId: string,
    data: any[],
    integration: any,
    pullToken?: string | null
  ) {
    for (const record of data) {
      const startDate = new Date(record.startTimeInSeconds * 1000)
      const externalId = record.summaryId
        ? String(record.summaryId)
        : String(record.activityId || '')

      if (!externalId) {
        console.warn('[GarminService] Skipping activity without summaryId/activityId', {
          userId,
          record
        })
        continue
      }

      const activityType = normalizeGarminActivityType(record.activityType)
      const cadence = extractGarminActivityCadence(record, activityType)

      const workoutData: any = {
        userId,
        externalId,
        source: 'garmin',
        date: startDate,
        title: record.activityName || `Garmin ${record.activityType}`,
        type: activityType,
        durationSec: record.durationInSeconds,
        elapsedTimeSec: record.durationInSeconds || null,
        distanceMeters: record.distanceInMeters || null,
        elevationGain: record.totalElevationGainInMeters
          ? Math.round(record.totalElevationGainInMeters)
          : null,
        averageCadence: cadence.average !== null ? Math.round(cadence.average) : null,
        maxCadence: cadence.max !== null ? Math.round(cadence.max) : null,
        averageSpeed: record.averageSpeedInMetersPerSecond || null,
        averageHr: record.averageHeartRateInBeatsPerMinute || null,
        maxHr: record.maxHeartRateInBeatsPerMinute || null,
        calories: record.activeKilocalories ? Math.round(record.activeKilocalories) : null,
        kilojoules: record.activeKilocalories
          ? Math.round(record.activeKilocalories * 4.184)
          : null,
        deviceName: normalizeDeviceName(record.deviceName),
        isPrivate: null,
        commute: null,
        rawJson: record
      }

      const upserted = await workoutRepository.upsert(
        userId,
        'garmin',
        externalId,
        workoutData,
        workoutData
      )

      // Try to fetch streams (FIT file) if not already present
      if (upserted.record) {
        const existingStream = await workoutStreamRepository.existsByWorkoutId(upserted.record.id)
        const existingFitFile = await prisma.fitFile.findUnique({
          where: { workoutId: upserted.record.id },
          select: { id: true }
        })

        if (!existingStream || !existingFitFile) {
          // Direct /activityFile REST endpoint requires a valid download token parameter.
          // Only attempt direct REST pull if pullToken is present; summary push notifications usually do not include it.
          if (pullToken) {
            try {
              const buffer = await fetchGarminActivityFile(integration, externalId, pullToken)
              await this.ingestFitArtifactsForWorkout(
                userId,
                upserted.record.id,
                externalId,
                buffer
              )
            } catch (e) {
              if (isGarminDownloadTokenError(e)) {
                await this.handleExpiredActivityFileDownloadToken({
                  workoutId: upserted.record.id,
                  externalId,
                  integration,
                  startTimeInSeconds:
                    typeof record.startTimeInSeconds === 'number'
                      ? record.startTimeInSeconds
                      : null,
                  error: e
                })
              } else {
                console.error(`[GarminService] Failed to ingest streams for ${externalId}`, e)
              }
            }
          }
        }
      }
    }

    if (data.length > 0) {
      await triggerWorkoutDeduplicationIfEnabled(userId)
    }
  },

  async processActivityFiles(userId: string, data: any[], integration: any) {
    for (const record of data) {
      const callbackUrl =
        typeof record?.callbackURL === 'string' && record.callbackURL.trim()
          ? record.callbackURL.trim()
          : null

      if (!callbackUrl) continue

      const candidateExternalIds = this.getActivityFileExternalIds(record)
      if (candidateExternalIds.length === 0) continue

      let workout = await prisma.workout.findFirst({
        where: {
          userId,
          source: 'garmin',
          externalId: { in: candidateExternalIds }
        },
        orderBy: { date: 'desc' }
      })

      if (!workout) {
        // Out-of-order activityFiles push: callbackUrl has a time-sensitive download token.
        // Download and parse FIT file immediately before token expires, creating the workout record.
        try {
          const buffer = await fetchGarminActivityFileByCallbackUrl(integration, callbackUrl)
          const primaryExternalId = candidateExternalIds[0] || 'unknown'
          const fitData = await parseFitFile(buffer)
          let session = fitData.sessions[0]
          if (!session && fitData.records && fitData.records.length > 0) {
            session = reconstructSessionFromRecords(fitData.records)
          }

          const filename = `garmin_${primaryExternalId}.fit`
          const workoutData = session
            ? normalizeFitSession(session, userId, filename, undefined)
            : {
                userId,
                externalId: primaryExternalId,
                source: 'garmin',
                date: new Date(),
                title: 'Garmin Activity',
                type: 'OTHER',
                durationSec: 0
              }
          workoutData.source = 'garmin'
          workoutData.externalId = primaryExternalId

          const { record: createdWorkout } = await workoutRepository.upsert(
            userId,
            'garmin',
            primaryExternalId,
            workoutData,
            workoutData
          )
          workout = createdWorkout

          // Reuse the already-parsed FIT data to avoid a second full parse in memory.
          await this.ingestFitArtifactsForWorkout(
            userId,
            workout.id,
            primaryExternalId,
            buffer,
            fitData
          )
          console.log(
            `[GarminService] Created workout and ingested FIT file from out-of-order activityFiles push for ${primaryExternalId}`
          )
        } catch (e) {
          if (isGarminDownloadTokenError(e)) {
            await this.handleExpiredActivityFileDownloadToken({
              workoutId: null,
              externalId: candidateExternalIds[0] || 'unknown',
              integration,
              startTimeInSeconds:
                typeof record?.startTimeInSeconds === 'number' ? record.startTimeInSeconds : null,
              error: e
            })
          } else {
            console.error(
              `[GarminService] Failed to ingest early activity file for candidate externalIds ${candidateExternalIds.join(', ')}`,
              e
            )
          }
        }
        continue
      }

      const existingFitFile = await prisma.fitFile.findUnique({
        where: { workoutId: workout.id },
        select: { id: true }
      })
      const existingStream = await workoutStreamRepository.existsByWorkoutId(workout.id)

      if (existingFitFile && existingStream) continue

      try {
        const buffer = await fetchGarminActivityFileByCallbackUrl(integration, callbackUrl)
        await this.ingestFitArtifactsForWorkout(userId, workout.id, workout.externalId, buffer)
      } catch (e) {
        if (isGarminDownloadTokenError(e)) {
          await this.handleExpiredActivityFileDownloadToken({
            workoutId: workout.id,
            externalId: workout.externalId,
            integration,
            startTimeInSeconds:
              typeof record?.startTimeInSeconds === 'number'
                ? record.startTimeInSeconds
                : workout.date
                  ? Math.floor(new Date(workout.date).getTime() / 1000)
                  : null,
            error: e
          })
        } else {
          console.error(
            `[GarminService] Failed to ingest activity file for workout ${workout.id} (${workout.externalId})`,
            e
          )
        }
      }
    }
  },

  getActivityFileExternalIds(record: any): string[] {
    const ids = new Set<string>()

    if (record?.activityId !== undefined && record?.activityId !== null) {
      ids.add(String(record.activityId))
    }

    if (typeof record?.summaryId === 'string' && record.summaryId.trim()) {
      const summaryId = record.summaryId.trim()
      ids.add(summaryId)
      if (summaryId.endsWith('-file')) ids.add(summaryId.slice(0, -5))
    }

    return [...ids]
  },

  resolveWellnessDate(
    record: Record<string, any>,
    options: {
      dateFields?: string[]
      timestampField?: string
      offsetField?: string
    } = {}
  ): Date | null {
    const dateFields = options.dateFields ?? ['calendarDate', 'date']

    for (const field of dateFields) {
      const value = record?.[field]
      if (typeof value === 'string' && value.trim()) {
        const parsed = parseCalendarDate(value.trim())
        if (parsed) return parsed
      }
    }

    const timestampValue = options.timestampField ? record?.[options.timestampField] : undefined
    if (typeof timestampValue === 'number' && Number.isFinite(timestampValue)) {
      const offsetValue = options.offsetField ? record?.[options.offsetField] : undefined
      return normalizeUtcDateFromTimestamp(
        timestampValue,
        typeof offsetValue === 'number' ? offsetValue : null
      )
    }

    return null
  },

  async ingestFitArtifactsForWorkout(
    userId: string,
    workoutId: string,
    externalId: string,
    buffer: Buffer,
    preParsed?: FitData
  ) {
    const hash = crypto.createHash('sha256').update(buffer).digest('hex')

    await prisma.fitFile.upsert({
      where: { workoutId },
      create: {
        userId,
        workoutId,
        filename: `garmin_${externalId}.fit`,
        fileData: buffer as any,
        hash
      },
      update: {
        filename: `garmin_${externalId}.fit`,
        fileData: buffer as any,
        hash
      }
    })

    const fitData = preParsed ?? (await parseFitFile(buffer))
    try {
      const streams = extractFitStreams(fitData.records)
      const extrasMeta = extractFitExtrasMeta(fitData)
      const fitDeviceName = inferDeviceNameFromFitData(fitData)

      if (fitDeviceName) {
        await prisma.workout.update({
          where: { id: workoutId },
          data: { deviceName: fitDeviceName }
        })
      }

      await workoutStreamRepository.upsert(workoutId, {
        ...streams,
        extrasMeta
      })
    } finally {
      releaseFitData(fitData)
    }

    await this.clearActivityFileIngestionStatus(workoutId)
  },

  /**
   * Persist expired/retryable FIT download state on the workout without failing the job batch.
   * Tokens in Garmin activityFiles callbacks are short-lived; request a narrow activities
   * backfill so Garmin can re-push a fresh callbackURL.
   */
  async handleExpiredActivityFileDownloadToken(params: {
    workoutId: string | null
    externalId: string
    integration: any
    startTimeInSeconds?: number | null
    error: unknown
  }) {
    const message =
      params.error instanceof Error ? params.error.message : String(params.error || 'unknown')

    console.warn(
      `[GarminService] Activity FIT download token expired for ${params.externalId}; marking retryable and requesting activities backfill`,
      { workoutId: params.workoutId, message }
    )

    if (params.workoutId) {
      try {
        await this.markActivityFileIngestionExpired(params.workoutId, {
          externalId: params.externalId,
          reason: message
        })
      } catch (markError) {
        console.warn(
          `[GarminService] Failed to mark file ingestion expired for workout ${params.workoutId}`,
          markError
        )
      }
    }

    try {
      await this.requestActivityFileBackfill(params.integration, params.startTimeInSeconds)
    } catch (backfillError) {
      console.warn(
        `[GarminService] Failed to request activities backfill after download token expiry for ${params.externalId}`,
        backfillError
      )
    }
  },

  async markActivityFileIngestionExpired(
    workoutId: string,
    details: { externalId: string; reason: string }
  ) {
    const workout = await prisma.workout.findUnique({
      where: { id: workoutId },
      select: { rawJson: true }
    })

    const existing =
      workout?.rawJson && typeof workout.rawJson === 'object' && !Array.isArray(workout.rawJson)
        ? ({ ...(workout.rawJson as Record<string, unknown>) } as Record<string, unknown>)
        : {}

    await prisma.workout.update({
      where: { id: workoutId },
      data: {
        rawJson: {
          ...existing,
          garminFileIngestion: {
            status: 'download_token_expired',
            retryable: true,
            externalId: details.externalId,
            reason: details.reason,
            updatedAt: new Date().toISOString()
          }
        }
      }
    })
  },

  async clearActivityFileIngestionStatus(workoutId: string) {
    try {
      const workout = await prisma.workout.findUnique({
        where: { id: workoutId },
        select: { rawJson: true }
      })

      if (
        !workout?.rawJson ||
        typeof workout.rawJson !== 'object' ||
        Array.isArray(workout.rawJson)
      ) {
        return
      }

      const existing = { ...(workout.rawJson as Record<string, unknown>) }
      if (!('garminFileIngestion' in existing)) return

      delete existing.garminFileIngestion
      await prisma.workout.update({
        where: { id: workoutId },
        data: { rawJson: toPrismaInputJsonValue(existing) }
      })
    } catch (error) {
      console.warn(
        `[GarminService] Failed to clear garminFileIngestion status for workout ${workoutId}`,
        error
      )
    }
  },

  async requestActivityFileBackfill(
    integration: any,
    startTimeInSeconds?: number | null
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000) - 60
    const anchor =
      typeof startTimeInSeconds === 'number' && Number.isFinite(startTimeInSeconds)
        ? Math.floor(startTimeInSeconds)
        : now - 24 * 60 * 60

    // Narrow window around the activity so Garmin re-pushes activities + activityFiles.
    const startTimestamp = Math.max(0, anchor - 60 * 60)
    const endTimestamp = Math.min(now, Math.max(startTimestamp + 60, anchor + 24 * 60 * 60))

    await requestGarminBackfill(integration, 'activities', startTimestamp, endTimestamp)
  },

  extractPullToken(
    payload: any,
    context?: { query?: Record<string, any> | null; headers?: Record<string, any> | null }
  ): string | null {
    const queryToken = context?.query?.token
    if (typeof queryToken === 'string' && queryToken.trim()) return queryToken.trim()
    if (Array.isArray(queryToken)) {
      const candidate = queryToken.find((value) => typeof value === 'string' && value.trim())
      if (candidate) return candidate.trim()
    }

    const payloadToken = payload?.token
    if (typeof payloadToken === 'string' && payloadToken.trim()) return payloadToken.trim()

    const headerToken =
      context?.headers?.['x-garmin-pull-token'] || context?.headers?.['X-Garmin-Pull-Token']
    if (typeof headerToken === 'string' && headerToken.trim()) return headerToken.trim()
    if (Array.isArray(headerToken)) {
      const candidate = headerToken.find((value) => typeof value === 'string' && value.trim())
      if (candidate) return candidate.trim()
    }

    return null
  },

  async runIngestGarmin(payload: {
    userId: string
    startDate?: string
    endDate?: string
    startTimestamp?: number
    endTimestamp?: number
    manualSync?: boolean
  }) {
    const { userId } = payload

    let integration = await prisma.integration.findUnique({
      where: { userId_provider: { userId, provider: 'garmin' } }
    })

    if (!integration) {
      throw new Error(`Garmin integration not found for user ${userId}`)
    }

    integration = await refreshGarminIntegrationPermissions(integration)

    const now = Math.floor(Date.now() / 1000)
    let startTimestamp = payload.startTimestamp
    let endTimestamp = payload.endTimestamp

    if (!startTimestamp && payload.startDate) {
      startTimestamp = Math.floor(new Date(payload.startDate).getTime() / 1000)
    }
    if (!endTimestamp && payload.endDate) {
      endTimestamp = Math.floor(new Date(payload.endDate).getTime() / 1000)
    }

    if (!startTimestamp) {
      endTimestamp = endTimestamp || now - 60
      startTimestamp = endTimestamp - 86400
    }
    if (!endTimestamp) {
      endTimestamp = now - 60
    }

    if (endTimestamp > now - 60) {
      endTimestamp = now - 60
    }

    const timeSlices = buildGarminTimeSlices(startTimestamp!, endTimestamp)

    await prisma.integration.update({
      where: { id: integration.id },
      data: { syncStatus: 'SYNCING' }
    })

    try {
      const settings = (integration.settings as Record<string, any> | null) || {}
      const wellnessEnabled = shouldIngestWellness(settings)
      const workoutsEnabled = shouldIngestActivities('garmin', integration.ingestWorkouts, settings)

      const dailies: Awaited<ReturnType<typeof fetchGarminDailies>> = []
      const sleeps: Awaited<ReturnType<typeof fetchGarminSleeps>> = []
      const hrv: Awaited<ReturnType<typeof fetchGarminHRV>> = []
      const bodyComps: Awaited<ReturnType<typeof fetchGarminBodyComps>> = []
      const userMetrics: Awaited<ReturnType<typeof fetchGarminUserMetrics>> = []
      const activities: Awaited<ReturnType<typeof fetchGarminActivities>> = []
      const results: PromiseSettledResult<unknown>[] = []

      for (const slice of timeSlices) {
        const sliceResults = await Promise.allSettled([
          wellnessEnabled
            ? fetchGarminDailies(integration, slice.startTimestamp, slice.endTimestamp)
            : [],
          wellnessEnabled
            ? fetchGarminSleeps(integration, slice.startTimestamp, slice.endTimestamp)
            : [],
          wellnessEnabled
            ? fetchGarminHRV(integration, slice.startTimestamp, slice.endTimestamp)
            : [],
          wellnessEnabled
            ? fetchGarminBodyComps(integration, slice.startTimestamp, slice.endTimestamp)
            : [],
          wellnessEnabled
            ? fetchGarminUserMetrics(integration, slice.startTimestamp, slice.endTimestamp)
            : [],
          workoutsEnabled
            ? fetchGarminActivities(integration, slice.startTimestamp, slice.endTimestamp)
            : []
        ])

        results.push(...sliceResults)

        if (sliceResults[0].status === 'fulfilled')
          dailies.push(...(sliceResults[0].value as any[]))
        if (sliceResults[1].status === 'fulfilled') sleeps.push(...(sliceResults[1].value as any[]))
        if (sliceResults[2].status === 'fulfilled') hrv.push(...(sliceResults[2].value as any[]))
        if (sliceResults[3].status === 'fulfilled')
          bodyComps.push(...(sliceResults[3].value as any[]))
        if (sliceResults[4].status === 'fulfilled')
          userMetrics.push(...(sliceResults[4].value as any[]))
        if (sliceResults[5].status === 'fulfilled')
          activities.push(...(sliceResults[5].value as any[]))
      }

      if (dailies.length > 0) await GarminService.processWellness(userId, dailies)
      if (sleeps.length > 0) await GarminService.processSleep(userId, sleeps)
      if (hrv.length > 0) await GarminService.processHRV(userId, hrv)
      if (bodyComps.length > 0) await GarminService.processBodyComp(userId, bodyComps)
      if (userMetrics.length > 0) await GarminService.processUserMetrics(userId, userMetrics)
      if (activities.length > 0)
        await GarminService.processActivities(userId, activities, integration)

      if (results.every((r) => r.status === 'rejected')) {
        const firstFailure = results.find(
          (r): r is PromiseRejectedResult => r.status === 'rejected'
        )
        const failureMessage =
          firstFailure?.reason instanceof Error
            ? firstFailure.reason.message
            : String(firstFailure?.reason || 'All Garmin API requests failed')

        const isPullTokenError = results.some(
          (r) =>
            r.status === 'rejected' &&
            String(r.reason instanceof Error ? r.reason.message : r.reason || '').includes(
              'InvalidPullTokenException'
            )
        )

        if (isPullTokenError) {
          console.log(
            `[GarminService] Direct REST pull restricted by Garmin for user ${userId}. Initiating asynchronous backfill...`
          )
          await this.startBackfill(userId)

          await prisma.integration.update({
            where: { id: integration.id },
            data: {
              syncStatus: 'SUCCESS',
              lastSyncAt: new Date(),
              errorMessage:
                'Direct pull restricted by Garmin Health API. Asynchronous backfill requested via webhooks.'
            }
          })

          return {
            success: true,
            backfillTriggered: true,
            counts: {
              dailies: 0,
              sleeps: 0,
              hrv: 0,
              bodyComps: 0,
              userMetrics: 0,
              activities: 0
            }
          }
        }

        throw new Error(failureMessage)
      }

      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          syncStatus: 'SUCCESS',
          lastSyncAt: new Date(),
          errorMessage: results.some((r) => r.status === 'rejected')
            ? 'Some data types failed to sync. Check logs for details.'
            : null
        }
      })

      return {
        success: true,
        counts: {
          dailies: dailies.length,
          sleeps: sleeps.length,
          hrv: hrv.length,
          bodyComps: bodyComps.length,
          userMetrics: userMetrics.length,
          activities: activities.length
        }
      }
    } catch (error) {
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          syncStatus: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        }
      })
      throw error
    }
  }
}

registerTaskHandler('ingest-garmin', (payload) => GarminService.runIngestGarmin(payload))
