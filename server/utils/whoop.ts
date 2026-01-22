import type { Integration } from '@prisma/client'
import { prisma } from './db'
import { normalizeWhoopSport } from './activity-mapping'

interface WhoopTokenResponse {
  access_token: string
  expires_in: number
  refresh_token: string
  scope: string
  token_type: string
}

/**
 * Refreshes an expired Whoop access token using the refresh token
 */
export async function refreshWhoopToken(integration: Integration): Promise<Integration> {
  if (!integration.refreshToken) {
    throw new Error('No refresh token available for Whoop integration')
  }

  const clientId = process.env.WHOOP_CLIENT_ID
  const clientSecret = process.env.WHOOP_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('WHOOP credentials not configured')
  }

  console.log('Refreshing Whoop token for integration:', integration.id)

  const response = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: integration.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'offline'
    }).toString()
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Whoop token refresh failed:', errorText)
    throw new Error(`Failed to refresh Whoop token: ${response.status} ${response.statusText}`)
  }

  const tokenData: WhoopTokenResponse = await response.json()
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000)

  // Update the integration in the database
  const updatedIntegration = await prisma.integration.update({
    where: { id: integration.id },
    data: {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt
    }
  })

  return updatedIntegration
}

/**
 * Checks if a token is expired or about to expire (within 5 minutes)
 */
function isTokenExpired(integration: Integration): boolean {
  if (!integration.expiresAt) {
    return false // If no expiry is set, assume it's valid
  }

  const now = new Date()
  const expiryWithBuffer = new Date(integration.expiresAt.getTime() - 5 * 60 * 1000) // 5 minutes buffer
  return now >= expiryWithBuffer
}

/**
 * Ensures the integration has a valid access token, refreshing if necessary
 */
async function ensureValidToken(integration: Integration): Promise<Integration> {
  if (isTokenExpired(integration)) {
    console.log('Whoop token expired or expiring soon, refreshing...')
    return await refreshWhoopToken(integration)
  }
  return integration
}

interface WhoopSleep {
  id: string
  created_at: string
  updated_at: string
  start: string
  end: string
  score_state: string
  score?: {
    stage_summary: {
      total_in_bed_time_milli: number
      total_awake_time_milli: number
      total_light_sleep_time_milli: number
      total_slow_wave_sleep_time_milli: number
      total_rem_sleep_time_milli: number
    }
    sleep_performance_percentage?: number
    sleep_efficiency_percentage?: number
    respiratory_rate?: number
  }
  [key: string]: any
}

interface WhoopRecovery {
  cycle_id: number
  sleep_id: string // v2 uses UUID string
  user_id: number
  created_at: string
  updated_at: string
  score_state: string
  score?: {
    user_calibrating: boolean
    recovery_score: number
    resting_heart_rate: number
    hrv_rmssd_milli: number
    spo2_percentage?: number
    skin_temp_celsius?: number
  }
  [key: string]: any
}

interface WhoopRecoveryResponse {
  records: WhoopRecovery[]
  next_token?: string
}

interface WhoopUser {
  user_id: number
  email: string
  first_name: string
  last_name: string
}

export interface WhoopWorkout {
  id: string
  user_id: number
  created_at: string
  updated_at: string
  start: string
  end: string
  timezone_offset: string
  sport_id: number
  score_state: string
  score?: {
    strain: number
    average_heart_rate: number
    max_heart_rate: number
    kilojoule: number
    percent_recorded: number
    distance_meter: number
    altitude_gain_meter: number
    altitude_change_meter: number
    zone_durations: {
      zone_zero_milli: number
      zone_one_milli: number
      zone_two_milli: number
      zone_three_milli: number
      zone_four_milli: number
      zone_five_milli: number
    }
  }
  [key: string]: any
}

interface WhoopWorkoutResponse {
  records: WhoopWorkout[]
  next_token?: string
}

export async function fetchWhoopRecovery(
  integration: Integration,
  startDate: Date,
  endDate: Date
): Promise<WhoopRecovery[]> {
  // Ensure we have a valid token before making the request
  const validIntegration = await ensureValidToken(integration)

  const url = new URL('https://api.prod.whoop.com/developer/v2/recovery')
  url.searchParams.set('start', startDate.toISOString())
  url.searchParams.set('end', endDate.toISOString())
  url.searchParams.set('limit', '25')

  const allRecords: WhoopRecovery[] = []
  let nextToken: string | undefined

  do {
    if (nextToken) {
      url.searchParams.set('nextToken', nextToken)
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${validIntegration.accessToken}`
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Whoop] API Error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      })
      throw new Error(`Whoop API error: ${response.status} ${response.statusText}`)
    }

    const data: WhoopRecoveryResponse = await response.json()

    allRecords.push(...(data.records || []))
    nextToken = data.next_token
  } while (nextToken)

  return allRecords
}

export async function fetchWhoopWorkouts(
  integration: Integration,
  startDate: Date,
  endDate: Date
): Promise<WhoopWorkout[]> {
  // Ensure we have a valid token before making the request
  const validIntegration = await ensureValidToken(integration)

  // Use V2 API for workouts
  const url = new URL('https://api.prod.whoop.com/developer/v2/activity/workout')
  url.searchParams.set('start', startDate.toISOString())
  url.searchParams.set('end', endDate.toISOString())
  url.searchParams.set('limit', '25')

  console.log('[Whoop] Fetching workout data:', {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString()
  })

  const allWorkouts: WhoopWorkout[] = []
  let nextToken: string | undefined

  do {
    if (nextToken) {
      url.searchParams.set('nextToken', nextToken)
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${validIntegration.accessToken}`
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Whoop] Workout API Error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      })
      // Don't throw here, just return what we have so far or empty array to avoid blocking recovery sync
      return allWorkouts
    }

    const data: WhoopWorkoutResponse = await response.json()
    console.log(`[Whoop] Fetched ${data.records?.length || 0} workout records`)

    allWorkouts.push(...(data.records || []))
    nextToken = data.next_token
  } while (nextToken)

  return allWorkouts
}

export async function fetchWhoopWorkout(
  integration: Integration,
  workoutId: string
): Promise<WhoopWorkout | null> {
  try {
    const validIntegration = await ensureValidToken(integration)

    const response = await fetch(
      `https://api.prod.whoop.com/developer/v2/activity/workout/${workoutId}`,
      {
        headers: {
          Authorization: `Bearer ${validIntegration.accessToken}`
        }
      }
    )

    if (!response.ok) {
      console.error(`Failed to fetch workout ${workoutId}:`, response.status)
      return null
    }

    return await response.json()
  } catch (error) {
    console.error(`Error fetching workout ${workoutId}:`, error)
    return null
  }
}

export async function fetchWhoopRecoveryBySleepId(
  integration: Integration,
  sleepId: string
): Promise<WhoopRecovery | null> {
  // 1. Fetch the sleep to get the timestamp
  const sleep = await fetchWhoopSleep(integration, sleepId)
  if (!sleep) {
    console.error(`Could not find sleep ${sleepId} to fetch associated recovery`)
    return null
  }

  // 2. Define a search window around the sleep.
  // Sleep start time is a good anchor. Recovery is usually generated after sleep.
  // We'll search from sleep start to sleep end + some buffer, or just a generic 2-day window around it.
  const sleepDate = new Date(sleep.start)
  const startDate = new Date(sleepDate)
  startDate.setDate(startDate.getDate() - 1)
  const endDate = new Date(sleepDate)
  endDate.setDate(endDate.getDate() + 2)

  // 3. Fetch recoveries in range
  const recoveries = await fetchWhoopRecovery(integration, startDate, endDate)

  // 4. Find the one matching the sleepId
  const match = recoveries.find((r) => r.sleep_id === sleepId)
  return match || null
}

export async function fetchWhoopSleep(
  integration: Integration,
  sleepId: string
): Promise<WhoopSleep | null> {
  try {
    // Ensure we have a valid token before making the request
    const validIntegration = await ensureValidToken(integration)

    const response = await fetch(
      `https://api.prod.whoop.com/developer/v2/activity/sleep/${sleepId}`,
      {
        headers: {
          Authorization: `Bearer ${validIntegration.accessToken}`
        }
      }
    )

    if (!response.ok) {
      console.error(`Failed to fetch sleep ${sleepId}:`, response.status)
      return null
    }

    return await response.json()
  } catch (error) {
    console.error(`Error fetching sleep ${sleepId}:`, error)
    return null
  }
}

export async function fetchWhoopUser(tokenOrIntegration: string | Integration): Promise<WhoopUser> {
  let accessToken: string

  if (typeof tokenOrIntegration === 'string') {
    // Called with just an access token (e.g., during initial OAuth flow)
    accessToken = tokenOrIntegration
  } else {
    // Called with an integration object - ensure valid token
    const validIntegration = await ensureValidToken(tokenOrIntegration)
    accessToken = validIntegration.accessToken
  }

  const response = await fetch('https://api.prod.whoop.com/developer/v2/user/profile/basic', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    throw new Error(`Whoop API error: ${response.status} ${response.statusText}`)
  }

  return await response.json()
}

export function normalizeWhoopRecovery(
  recovery: WhoopRecovery,
  userId: string,
  sleep?: WhoopSleep | null
) {
  // Only process if recovery has a score (state is SCORED)
  if (!recovery.score || recovery.score_state !== 'SCORED') {
    console.log(
      `[Whoop] Skipping unscored recovery - state: ${recovery.score_state}, created_at: ${recovery.created_at}`
    )
    return null
  }

  // Parse the date - use created_at for the recovery date
  const recoveryDate = new Date(recovery.created_at)
  // Create date-only (removing time component) in UTC
  const dateOnly = new Date(
    Date.UTC(recoveryDate.getUTCFullYear(), recoveryDate.getUTCMonth(), recoveryDate.getUTCDate())
  )

  // Extract sleep data if available
  let sleepSecs = null
  let sleepHours = null
  let sleepScore = null

  if (sleep && sleep.score) {
    const totalSleepMilli =
      sleep.score.stage_summary.total_light_sleep_time_milli +
      sleep.score.stage_summary.total_slow_wave_sleep_time_milli +
      sleep.score.stage_summary.total_rem_sleep_time_milli

    sleepSecs = Math.round(totalSleepMilli / 1000)
    sleepHours = Math.round((sleepSecs / 3600) * 10) / 10
    sleepScore = sleep.score.sleep_performance_percentage
      ? Math.round(sleep.score.sleep_performance_percentage)
      : null
  }

  const result = {
    userId,
    date: dateOnly,
    hrv: recovery.score.hrv_rmssd_milli,
    hrvSdnn: null,
    restingHr: Math.round(recovery.score.resting_heart_rate),
    avgSleepingHr: null,
    sleepSecs,
    sleepHours,
    sleepScore,
    sleepQuality: null,
    readiness: null,
    recoveryScore: Math.round(recovery.score.recovery_score),
    soreness: null,
    fatigue: null,
    stress: null,
    mood: null,
    motivation: null,
    weight: null,
    spO2: recovery.score.spo2_percentage
      ? Math.round(recovery.score.spo2_percentage * 10) / 10
      : null,
    respiration: sleep?.score?.respiratory_rate || null,
    skinTemp: recovery.score.skin_temp_celsius || null,
    ctl: null,
    atl: null,
    comments: null,
    rawJson: { recovery, sleep }
  }

  return result
}

export function normalizeWhoopWorkout(workout: WhoopWorkout, userId: string) {
  if (!workout.score || workout.score_state !== 'SCORED') {
    return null
  }

  const type = normalizeWhoopSport(workout.sport_id)

  // Parse dates
  const startDate = new Date(workout.start)
  const endDate = new Date(workout.end)
  const durationSec = Math.round((endDate.getTime() - startDate.getTime()) / 1000)

  // Construct workout object
  return {
    userId,
    externalId: workout.id, // Whoop UUID
    source: 'whoop',
    date: startDate,
    title: type === 'Other' ? `Whoop Activity` : type,
    description: `Imported from Whoop. Sport ID: ${workout.sport_id}`,
    type,
    durationSec,
    distanceMeters: workout.score.distance_meter || null,
    elevationGain: workout.score.altitude_gain_meter
      ? Math.round(workout.score.altitude_gain_meter)
      : null,

    // HR Data
    averageHr: Math.round(workout.score.average_heart_rate),
    maxHr: Math.round(workout.score.max_heart_rate),

    // Power/Energy
    kilojoules: workout.score.kilojoule ? Math.round(workout.score.kilojoule) : null,

    // Whoop specific metrics mapped to generic fields where possible
    // Whoop Strain (0-21) -> Intensity Factor? Not direct map.
    // Maybe store in rawJson and use for custom score.

    // Raw Data
    rawJson: workout
  }
}

/**
 * Extracts HR zone durations from Whoop workout data and formats them for WorkoutStream
 * Whoop zones are 0-5 (6 zones), our system typically expects 5 or 6 zones.
 * We'll map them to a JSON object that can be stored in WorkoutStream.hrZoneTimes (if we add it)
 * or return them as a separate object.
 */
export function extractWhoopHrZones(workout: WhoopWorkout) {
  if (!workout.score?.zone_durations) return null

  const zones = workout.score.zone_durations
  // Whoop gives milliseconds, we want seconds
  return [
    Math.round(zones.zone_one_milli / 1000),
    Math.round(zones.zone_two_milli / 1000),
    Math.round(zones.zone_three_milli / 1000),
    Math.round(zones.zone_four_milli / 1000),
    Math.round(zones.zone_five_milli / 1000)
  ]
}
