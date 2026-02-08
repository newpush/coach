import type { Integration } from '@prisma/client'
import { prisma } from './db'

interface OuraTokenResponse {
  access_token: string
  expires_in: number
  refresh_token: string
  scope: string
  token_type: string
}

/**
 * Refreshes an expired Oura access token using the refresh token
 */
export async function refreshOuraToken(integration: Integration): Promise<Integration> {
  if (!integration.refreshToken) {
    throw new Error('No refresh token available for Oura integration')
  }

  const clientId = process.env.OURA_CLIENT_ID
  const clientSecret = process.env.OURA_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('OURA credentials not configured')
  }

  console.log('Refreshing Oura token for integration:', integration.id)

  const response = await fetch('https://api.ouraring.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: integration.refreshToken,
      client_id: clientId,
      client_secret: clientSecret
    }).toString()
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Oura token refresh failed:', errorText)
    throw new Error(`Failed to refresh Oura token: ${response.status} ${response.statusText}`)
  }

  const tokenData: OuraTokenResponse = await response.json()
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
    console.log('Oura token expired or expiring soon, refreshing...')
    return await refreshOuraToken(integration)
  }
  return integration
}

// --- Data Fetching ---

export async function fetchOuraData(
  integration: Integration,
  endpoint: string,
  startDate: Date,
  endDate: Date
) {
  const validIntegration = await ensureValidToken(integration)

  const url = new URL(`https://api.ouraring.com/v2/usercollection/${endpoint}`)
  // Oura expects YYYY-MM-DD for most daily endpoints, but ISO for others.
  // The spec says "start_date" and "end_date" can be date or date-time.
  // For daily collections, date string 'YYYY-MM-DD' is usually best.
  // We'll use YYYY-MM-DD part of ISO string.
  url.searchParams.set('start_date', startDate.toISOString().split('T')[0]!)
  url.searchParams.set('end_date', endDate.toISOString().split('T')[0]!)

  const allRecords: any[] = []
  let nextToken: string | undefined

  do {
    if (nextToken) {
      url.searchParams.set('next_token', nextToken)
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${validIntegration.accessToken}`
      }
    })

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        console.warn(`[Oura] Skipping ${endpoint}: Token not authorized (check scopes).`)
        return []
      }
      if (response.status === 404) {
        return [] // No data for this endpoint/period
      }

      const errorText = await response.text()
      console.error(`[Oura] API Error (${endpoint}):`, {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      })
      throw new Error(`Oura API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    allRecords.push(...(data.data || [])) // Oura V2 usually wraps list in 'data'
    nextToken = data.next_token
  } while (nextToken)

  return allRecords
}

export async function fetchOuraDailySleep(
  integration: Integration,
  startDate: Date,
  endDate: Date
) {
  return fetchOuraData(integration, 'daily_sleep', startDate, endDate)
}

export async function fetchOuraSleepPeriods(
  integration: Integration,
  startDate: Date,
  endDate: Date
) {
  return fetchOuraData(integration, 'sleep', startDate, endDate)
}

export async function fetchOuraDailyActivity(
  integration: Integration,
  startDate: Date,
  endDate: Date
) {
  return fetchOuraData(integration, 'daily_activity', startDate, endDate)
}

export async function fetchOuraDailyReadiness(
  integration: Integration,
  startDate: Date,
  endDate: Date
) {
  return fetchOuraData(integration, 'daily_readiness', startDate, endDate)
}

export async function fetchOuraWorkouts(integration: Integration, startDate: Date, endDate: Date) {
  return fetchOuraData(integration, 'workout', startDate, endDate)
}

export async function fetchOuraDailySpO2(integration: Integration, startDate: Date, endDate: Date) {
  return fetchOuraData(integration, 'daily_spo2', startDate, endDate)
}

export async function fetchOuraDailyStress(
  integration: Integration,
  startDate: Date,
  endDate: Date
) {
  return fetchOuraData(integration, 'daily_stress', startDate, endDate)
}

export async function fetchOuraVO2Max(integration: Integration, startDate: Date, endDate: Date) {
  return fetchOuraData(integration, 'vo2_max', startDate, endDate)
}

export async function fetchOuraPersonalInfo(tokenOrIntegration: string | Integration) {
  let accessToken: string
  if (typeof tokenOrIntegration === 'string') {
    accessToken = tokenOrIntegration
  } else {
    const validIntegration = await ensureValidToken(tokenOrIntegration)
    accessToken = validIntegration.accessToken
  }

  const response = await fetch('https://api.ouraring.com/v2/usercollection/personal_info', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    throw new Error(`Oura API error: ${response.status} ${response.statusText}`)
  }

  return await response.json()
}

// --- Normalization ---

export function normalizeOuraWellness(
  dailySleep: any,
  dailyActivity: any,
  dailyReadiness: any,
  sleepPeriods: any[],
  userId: string,
  date: Date,
  extraData: {
    spo2?: any
    stress?: any
    vo2max?: any
    personalInfo?: any
  } = {}
) {
  // Combine data into a single wellness record
  // date is expected to be the specific day (UTC midnight)

  // Check if we have any data
  if (
    !dailySleep &&
    !dailyActivity &&
    !dailyReadiness &&
    (!sleepPeriods || sleepPeriods.length === 0) &&
    !extraData.spo2 &&
    !extraData.stress
  )
    return null

  // Oura V2 'daily_sleep' has the daily score.
  // Biometrics (HRV/RHR) are in the 'sleep' periods.
  // We'll take the first major sleep period if multiple exist.
  const mainSleep = sleepPeriods?.find((p) => p.type === 'long_sleep') || sleepPeriods?.[0]

  const sleepSecs = dailySleep?.total_sleep_duration || mainSleep?.total_sleep_duration
  const sleepHours = sleepSecs ? Math.round((sleepSecs / 3600) * 10) / 10 : null
  const sleepScore = dailySleep?.score

  // Readiness Metrics
  const readinessScore = dailyReadiness?.score

  // Biometrics from Sleep period (more precise raw values)
  // lowest_heart_rate and average_hrv are the standard raw metrics in Oura V2 sleep.
  // Note: We avoid using readiness contributors (resting_heart_rate, hrv_balance)
  // because they are 0-100 scores according to the OpenAPI schema.
  const restingHr = mainSleep?.lowest_heart_rate
  const avgHrv = mainSleep?.average_hrv

  // SpO2
  const spO2 = extraData.spo2?.spo2_percentage?.average || null

  // Stress
  // We map Oura daily summary to our stress field (if we use a 1-10 or category)
  // For now, let's keep it simple or store the raw summary
  let stressLevel = null
  if (extraData.stress?.day_summary === 'stressful') stressLevel = 8
  else if (extraData.stress?.day_summary === 'normal') stressLevel = 4
  else if (extraData.stress?.day_summary === 'restored') stressLevel = 1

  // VO2 Max
  const vo2max = extraData.vo2max?.vo2_max || null

  // Recovery Score (mapping 0-100 readiness to our 1-10)
  const recoveryScore = readinessScore ? Math.round(readinessScore) : null

  return {
    userId,
    date,
    hrv: avgHrv || null,
    hrvSdnn: null,
    restingHr: restingHr ? Math.round(restingHr) : null,
    avgSleepingHr: mainSleep?.average_heart_rate || null,
    sleepSecs: sleepSecs || null,
    sleepHours,
    sleepScore: sleepScore || null,
    sleepQuality: null,
    readiness: readinessScore ? Math.round(readinessScore / 10) : null, // Normalize to 1-10
    recoveryScore: recoveryScore,
    soreness: null,
    fatigue: null,
    stress: stressLevel,
    mood: null,
    motivation: null,
    weight: extraData.personalInfo?.weight || null,
    spO2: spO2,
    respiration: mainSleep?.average_breath || null,
    skinTemp: dailyReadiness?.temperature_deviation || null,
    vo2max: vo2max,
    ctl: null,
    atl: null,
    comments: null,
    rawJson: {
      dailySleep,
      dailyActivity,
      dailyReadiness,
      sleepPeriods,
      ...extraData
    }
  }
}

export function normalizeOuraWorkout(workout: any, userId: string) {
  // workout object from /v2/usercollection/workout
  const startDate = new Date(workout.start_datetime)
  const endDate = new Date(workout.end_datetime)
  const durationSec = Math.round((endDate.getTime() - startDate.getTime()) / 1000)

  // Map activity type
  const type = workout.activity || 'other'

  return {
    userId,
    externalId: workout.id,
    source: 'oura',
    date: startDate,
    title: `Oura ${type.charAt(0).toUpperCase() + type.slice(1)}`,
    description: `Imported from Oura`,
    type: mapOuraActivityType(type),
    durationSec,
    distanceMeters: workout.distance || null,
    elevationGain: null,
    averageHr: null, // PublicWorkout V2 doesn't have average heart rate
    maxHr: null,
    kilojoules: workout.calories ? Math.round(workout.calories * 4.184) : null,
    rawJson: workout
  }
}

function mapOuraActivityType(ouraType: string): string {
  const map: Record<string, string> = {
    running: 'Run',
    cycling: 'Ride',
    walking: 'Walk',
    swimming: 'Swim',
    weight_training: 'WeightTraining',
    strength_training: 'WeightTraining',
    yoga: 'Yoga'
    // Add more as needed
  }
  return map[ouraType.toLowerCase()] || 'Other'
}
