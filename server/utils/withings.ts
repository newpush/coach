import type { Integration } from '@prisma/client'
import { prisma } from './db'

interface WithingsTokenResponse {
  access_token: string
  expires_in: number
  refresh_token: string
  scope: string
  token_type: string
  userid: string
}

interface WithingsMeasure {
  value: number
  type: number
  unit: number
  algo?: number
  fm?: number
}

interface WithingsMeasureGroup {
  grpid: number
  attrib: number // 0: User device, 1: User ambiguous, 2: Manual, 4: Manual ambiguous
  date: number // Unix timestamp
  created: number
  modified: number
  category: number // 1: Real measure, 2: Target
  measures: WithingsMeasure[]
  comment?: string
}

interface WithingsMeasureResponse {
  status: number
  body: {
    updatetime: number
    timezone: string
    measuregrps: WithingsMeasureGroup[]
    more: boolean
    offset: number
  }
}

// Workout (Activity) interfaces
export interface WithingsActivity {
  id: number
  category: number
  timezone: string
  model: number
  attrib: number
  startdate: number // Unix timestamp
  enddate: number // Unix timestamp
  date: string // YYYY-MM-DD
  deviceid?: string
  hash_deviceid?: string
  data: {
    steps?: number
    distance?: number // meters
    elevation?: number // meters
    soft?: number
    moderate?: number
    intense?: number
    active?: number
    calories?: number
    totalcalories?: number
    hr_average?: number
    hr_min?: number
    hr_max?: number
    hr_zone_0?: number
    hr_zone_1?: number
    hr_zone_2?: number
    hr_zone_3?: number
  }
}

interface WithingsActivityResponse {
  status: number
  body: {
    activities: WithingsActivity[]
    more: boolean
    offset: number
  }
}

// Measurement types from Withings API
export const WITHINGS_MEASURE_TYPES = {
  WEIGHT: 1,
  HEIGHT: 4,
  FAT_FREE_MASS: 5,
  FAT_RATIO: 6,
  FAT_MASS_WEIGHT: 8,
  DIASTOLIC_BP: 9,
  SYSTOLIC_BP: 10,
  HEART_RATE: 11,
  SPO2: 54,
  BODY_TEMPERATURE: 71,
  MUSCLE_MASS: 76,
  HYDRATION: 77,
  BONE_MASS: 88,
  PULSE_WAVE_VELOCITY: 91
}

/**
 * Refreshes an expired Withings access token using the refresh token
 */
export async function refreshWithingsToken(integration: Integration): Promise<Integration> {
  if (!integration.refreshToken) {
    throw new Error('No refresh token available for Withings integration')
  }

  const clientId = process.env.WITHINGS_CLIENT_ID
  const clientSecret = process.env.WITHINGS_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Withings credentials not configured')
  }

  console.log('Refreshing Withings token for integration:', integration.id)

  const response = await fetch('https://wbsapi.withings.net/v2/oauth2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      action: 'requesttoken',
      grant_type: 'refresh_token',
      refresh_token: integration.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  })

  const data = await response.json()

  if (data.status !== 0) {
    console.error('Withings token refresh failed:', data)
    throw new Error(`Failed to refresh Withings token: Status ${data.status}`)
  }

  const tokenData: WithingsTokenResponse = data.body
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000)

  // Update the integration in the database
  const updatedIntegration = await prisma.integration.update({
    where: { id: integration.id },
    data: {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt,
    }
  })

  return updatedIntegration
}

/**
 * Checks if a token is expired or about to expire (within 5 minutes)
 */
function isTokenExpired(integration: Integration): boolean {
  if (!integration.expiresAt) {
    return false // If no expiry is set, assume it's valid (though typically it should be set)
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
    console.log('Withings token expired or expiring soon, refreshing...')
    return await refreshWithingsToken(integration)
  }
  return integration
}

/**
 * Fetches measurements from Withings API
 */
export async function fetchWithingsMeasures(
  integration: Integration,
  startDate: Date,
  endDate: Date,
  measureTypes: number[] = [WITHINGS_MEASURE_TYPES.WEIGHT, WITHINGS_MEASURE_TYPES.FAT_RATIO]
): Promise<WithingsMeasureGroup[]> {
  // Ensure we have a valid token before making the request
  const validIntegration = await ensureValidToken(integration)
  
  const url = new URL('https://wbsapi.withings.net/measure')
  url.searchParams.set('action', 'getmeas')
  url.searchParams.set('access_token', validIntegration.accessToken)
  url.searchParams.set('startdate', Math.floor(startDate.getTime() / 1000).toString())
  url.searchParams.set('enddate', Math.floor(endDate.getTime() / 1000).toString())
  url.searchParams.set('category', '1') // 1: Real measures, 2: User objectives
  
  if (measureTypes.length > 0) {
    url.searchParams.set('meastypes', measureTypes.join(','))
  }
  
  console.log('[Withings] Fetching measures:', {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString()
  })
  
  const response = await fetch(url.toString())
  const data: WithingsMeasureResponse = await response.json()
  
  if (data.status !== 0) {
    // 401: Invalid access token
    if (data.status === 401) {
      console.log('[Withings] Token invalid (401), attempting refresh...')
      const refreshedIntegration = await refreshWithingsToken(validIntegration)
      // Retry with new token
      url.searchParams.set('access_token', refreshedIntegration.accessToken)
      const retryResponse = await fetch(url.toString())
      const retryData: WithingsMeasureResponse = await retryResponse.json()
      
      if (retryData.status !== 0) {
        throw new Error(`Withings API error after refresh: Status ${retryData.status}`)
      }
      
      return retryData.body.measuregrps || []
    }
    
    throw new Error(`Withings API error: Status ${data.status}`)
  }
  
  return data.body.measuregrps || []
}

/**
 * Fetches workouts (activities) from Withings API
 */
export async function fetchWithingsActivities(
  integration: Integration,
  startDate: Date,
  endDate: Date
): Promise<WithingsActivity[]> {
  // Ensure we have a valid token before making the request
  const validIntegration = await ensureValidToken(integration)
  
  const url = new URL('https://wbsapi.withings.net/v2/measure')
  url.searchParams.set('action', 'getactivity')
  url.searchParams.set('access_token', validIntegration.accessToken)
  // Withings accepts startdateymd/enddateymd (YYYY-MM-DD) or startdate/enddate (unix)
  // Let's use unix timestamps for consistency
  url.searchParams.set('startdate', Math.floor(startDate.getTime() / 1000).toString())
  url.searchParams.set('enddate', Math.floor(endDate.getTime() / 1000).toString())
  // Comma separated list of data fields to retrieve
  // Retrieve everything available
  url.searchParams.set('data_fields', 'steps,distance,elevation,soft,moderate,intense,active,calories,totalcalories,hr_average,hr_min,hr_max,hr_zone_0,hr_zone_1,hr_zone_2,hr_zone_3')
  
  console.log('[Withings] Fetching activities:', {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString()
  })
  
  const response = await fetch(url.toString())
  const data: WithingsActivityResponse = await response.json()
  
  if (data.status !== 0) {
    // 401: Invalid access token
    if (data.status === 401) {
      console.log('[Withings] Token invalid (401), attempting refresh...')
      const refreshedIntegration = await refreshWithingsToken(validIntegration)
      // Retry with new token
      url.searchParams.set('access_token', refreshedIntegration.accessToken)
      const retryResponse = await fetch(url.toString())
      const retryData: WithingsActivityResponse = await retryResponse.json()
      
      if (retryData.status !== 0) {
        throw new Error(`Withings API error after refresh: Status ${retryData.status}`)
      }
      
      return retryData.body.activities || []
    }
    
    throw new Error(`Withings API error: Status ${data.status}`)
  }
  
  return data.body.activities || []
}

/**
 * Helper to calculate actual value from value * 10^unit
 */
export function getWithingsValue(value: number, unit: number): number {
  return value * Math.pow(10, unit)
}

/**
 * Normalizes Withings data into our Wellness format
 * Note: Withings provides data points (weight, fat, etc) which might be separate or grouped.
 * This function processes a single measure group.
 */
export function normalizeWithingsMeasureGroup(group: WithingsMeasureGroup, userId: string) {
  const date = new Date(group.date * 1000)
  // Normalize to YYYY-MM-DD for storage
  const dateOnly = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  
  let weight: number | null = null
  let fatRatio: number | null = null
  let muscleMass: number | null = null
  let hydration: number | null = null
  let boneMass: number | null = null
  let heartRate: number | null = null
  let spo2: number | null = null
  
  for (const measure of group.measures) {
    const value = getWithingsValue(measure.value, measure.unit)
    
    switch (measure.type) {
      case WITHINGS_MEASURE_TYPES.WEIGHT:
        // Convert kg to our standard if needed (we store in kg)
        weight = value
        break
      case WITHINGS_MEASURE_TYPES.FAT_RATIO:
        fatRatio = value // Percentage
        break
      case WITHINGS_MEASURE_TYPES.MUSCLE_MASS:
        muscleMass = value
        break
      case WITHINGS_MEASURE_TYPES.HYDRATION:
        hydration = value
        break
      case WITHINGS_MEASURE_TYPES.BONE_MASS:
        boneMass = value
        break
      case WITHINGS_MEASURE_TYPES.HEART_RATE:
        heartRate = Math.round(value)
        break
      case WITHINGS_MEASURE_TYPES.SPO2:
        spo2 = value
        break
    }
  }
  
  // Only return if we have at least one meaningful metric
  if (!weight && !fatRatio && !heartRate && !spo2) {
    return null
  }
  
  return {
    userId,
    date: dateOnly,
    weight,
    // Store body composition in rawJson since we don't have dedicated columns for all of them yet
    // But we can extract them if we add columns later
    spO2: spo2,
    restingHr: heartRate, // If it's a resting measurement
    rawJson: {
      withings: {
        grpid: group.grpid,
        fatRatio,
        muscleMass,
        hydration,
        boneMass,
        measures: group.measures
      }
    }
  }
}

/**
 * Normalizes Withings activity data into our Workout format
 */
export function normalizeWithingsActivity(activity: WithingsActivity, userId: string) {
  // Only process if activity has meaningful data
  if (!activity.data || (!activity.data.steps && !activity.data.active && !activity.data.totalcalories)) {
    return null
  }

  // Parse dates
  const startDate = new Date(activity.startdate * 1000)
  const endDate = new Date(activity.enddate * 1000)
  
  // If enddate is missing or invalid, default to startdate + active time or just same day
  const effectiveEndDate = isNaN(endDate.getTime()) ? startDate : endDate
  
  // Duration: Use 'active' time if available (seconds), otherwise calculate from dates
  let durationSec = activity.data.active || 0
  if (durationSec === 0 && effectiveEndDate.getTime() > startDate.getTime()) {
      durationSec = Math.round((effectiveEndDate.getTime() - startDate.getTime()) / 1000)
  }

  // Activity type mapping (Withings 'category' is undocumented in public API docs as specific sport,
  // 'model' and 'attrib' give hints, but mostly it's just general activity unless we have more info)
  // Actually, 'getactivity' endpoint aggregates by day usually, so it's "Daily Activity"
  // But if it's broken down, it might be specific.
  // The docs say "getactivity" returns daily summaries.
  // Wait, "getactivity" returns "aggregated data". This is NOT individual workouts like a "Run".
  // It is daily steps, daily calories, etc.
  // This maps better to a "DailyMetric" or "Wellness" entry rather than a "Workout".
  // However, Withings DOES have a "getworkouts" endpoint for specific workouts.
  // The user asked for "Withings also support workouts" pointing to "measure-getmeas"? 
  // No, the link provided was "measure-getmeas", but that is for body measures.
  // The link title said "measure-getmeas" but maybe they meant "v2/measure?action=getworkouts"?
  // Let's assume for now we want actual workouts if available.
  // The user linked "https://developer.withings.com/api-reference/#tag/measure/operation/measure-getmeas"
  // But that IS body measures.
  // If the user said "Withings also support workouts", they probably mean they want Workouts synced.
  // The endpoint for workouts is 'v2/measure?action=getworkouts'.
  // Let's add support for that instead of 'getactivity' which is daily summary.
  
  return null // Placeholder as we shouldn't use getactivity for Workouts table
}

export interface WithingsWorkout {
  id: number
  category: number // Sport category
  timezone: string
  model: number
  attrib: number
  startdate: number
  enddate: number
  date: string
  deviceid?: string
  data: {
    steps?: number
    distance?: number
    elevation?: number
    calories?: number
    hr_average?: number
    hr_min?: number
    hr_max?: number
    hr_zone_0?: number
    hr_zone_1?: number
    hr_zone_2?: number
    hr_zone_3?: number
    manual_calories?: number
    algo_pause_duration?: number
  }
}

interface WithingsWorkoutResponse {
  status: number
  body: {
    series: WithingsWorkout[]
    more: boolean
    offset: number
  }
}

/**
 * Fetches specific workouts from Withings API
 */
export async function fetchWithingsWorkouts(
  integration: Integration,
  startDate: Date,
  endDate: Date
): Promise<WithingsWorkout[]> {
  const validIntegration = await ensureValidToken(integration)
  
  const url = new URL('https://wbsapi.withings.net/v2/measure')
  url.searchParams.set('action', 'getworkouts')
  url.searchParams.set('access_token', validIntegration.accessToken)
  url.searchParams.set('startdateymd', startDate.toISOString().split('T')[0])
  url.searchParams.set('enddateymd', endDate.toISOString().split('T')[0])
  url.searchParams.set('data_fields', 'steps,distance,elevation,calories,hr_average,hr_min,hr_max,hr_zone_0,hr_zone_1,hr_zone_2,hr_zone_3,manual_calories,algo_pause_duration')
  
  console.log('[Withings] Fetching workouts:', {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  })
  
  const response = await fetch(url.toString())
  const data: WithingsWorkoutResponse = await response.json()
  
  if (data.status !== 0) {
      if (data.status === 401) {
          const refreshedIntegration = await refreshWithingsToken(validIntegration)
          url.searchParams.set('access_token', refreshedIntegration.accessToken)
          const retryResponse = await fetch(url.toString())
          const retryData: WithingsWorkoutResponse = await retryResponse.json()
          if (retryData.status !== 0) throw new Error(`Withings API error after refresh: Status ${retryData.status}`)
          return retryData.body.series || []
      }
      throw new Error(`Withings API error: Status ${data.status}`)
  }
  
  return data.body.series || []
}

export function normalizeWithingsWorkout(workout: WithingsWorkout, userId: string) {
    // Map Withings categories to our types
    // https://developer.withings.com/developer-guide/v3/integration-guide/public-health-data-api/data-api/all-categories-and-classification/
    const categoryMap: Record<number, string> = {
        1: 'Walk',
        2: 'Run',
        3: 'Hike',
        6: 'Ride', // Cycling
        7: 'Swim',
        9: 'Ski', // Downhill
        10: 'Rowing',
        11: 'Elliptical',
        16: 'WeightTraining', // Fitness
        18: 'Golf',
        19: 'Hike', // Trekking
        20: 'Dance',
        21: 'IceSkate',
        22: 'Pickleball', // Racquet sports approximation
        23: 'Rowing', // Indoors
        24: 'Yoga', // Yoga
        25: 'Volleyball',
        26: 'Other', // Boxing
        28: 'Other', // Other
        31: 'Kayaking',
        32: 'Kitesurf',
        33: 'Surfing',
        35: 'RockClimbing', // Climbing
        187: 'Walk', // Fruit Ninja? 
        188: 'Run', // Hyrule? 
        // Add more as needed
    }
    
    const type = categoryMap[workout.category] || 'Other'
    
    const startDate = new Date(workout.startdate * 1000)
    const endDate = new Date(workout.enddate * 1000)
    let durationSec = Math.round((endDate.getTime() - startDate.getTime()) / 1000)
    
    // Adjust for pauses if available
    if (workout.data.algo_pause_duration) {
        durationSec -= workout.data.algo_pause_duration
    }
    
    return {
        userId,
        externalId: `withings-${workout.id}`,
        source: 'withings',
        date: startDate,
        title: `Withings ${type}`,
        description: `Imported from Withings. Category: ${workout.category}`,
        type,
        durationSec,
        distanceMeters: workout.data.distance,
        elevationGain: workout.data.elevation,
        calories: (workout.data.calories || 0) + (workout.data.manual_calories || 0),
        averageHr: workout.data.hr_average,
        maxHr: workout.data.hr_max,
        // Raw data
        rawJson: workout
    }
}

export interface WithingsSleepSummary {
  id: number
  timezone: string
  model: number
  model_id: number
  startdate: number
  enddate: number
  date: string
  created: number
  modified: number
  data: {
    total_timeinbed: number
    total_sleep_time: number
    asleepduration: number
    lightsleepduration: number
    remsleepduration: number
    deepsleepduration: number
    sleep_efficiency: number
    sleep_latency: number
    wakeup_latency: number
    wakeupduration: number
    wakeupcount: number
    waso: number
    nb_rem_episodes: number
    out_of_bed_count: number
    hr_average: number
    hr_min: number
    hr_max: number
    rr_average: number
    rr_min: number
    rr_max: number
    breathing_quality_assessment: number
    breathing_disturbances_intensity: number
    snoring: number
    snoringepisodecount: number
    sleep_score: number
    apnea_hypopnea_index: number
  }
}

interface WithingsSleepResponse {
  status: number
  body: {
    series: WithingsSleepSummary[]
    more: boolean
    offset: number
  }
}

/**
 * Fetches sleep summaries from Withings API
 */
export async function fetchWithingsSleep(
  integration: Integration,
  startDate: Date,
  endDate: Date
): Promise<WithingsSleepSummary[]> {
  const validIntegration = await ensureValidToken(integration)
  
  const url = new URL('https://wbsapi.withings.net/v2/sleep')
  url.searchParams.set('action', 'getsummary')
  url.searchParams.set('access_token', validIntegration.accessToken)
  url.searchParams.set('startdateymd', startDate.toISOString().split('T')[0])
  url.searchParams.set('enddateymd', endDate.toISOString().split('T')[0])
  // Request all useful fields
  url.searchParams.set('data_fields', 'total_timeinbed,total_sleep_time,asleepduration,lightsleepduration,remsleepduration,deepsleepduration,sleep_efficiency,sleep_latency,wakeup_latency,wakeupduration,wakeupcount,waso,nb_rem_episodes,out_of_bed_count,hr_average,hr_min,hr_max,rr_average,rr_min,rr_max,breathing_quality_assessment,breathing_disturbances_intensity,snoring,snoringepisodecount,sleep_score,apnea_hypopnea_index')
  
  console.log('[Withings] Fetching sleep:', {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  })
  
  const response = await fetch(url.toString())
  const data: WithingsSleepResponse = await response.json()
  
  if (data.status !== 0) {
      if (data.status === 401) {
          const refreshedIntegration = await refreshWithingsToken(validIntegration)
          url.searchParams.set('access_token', refreshedIntegration.accessToken)
          const retryResponse = await fetch(url.toString())
          const retryData: WithingsSleepResponse = await retryResponse.json()
          if (retryData.status !== 0) throw new Error(`Withings API error after refresh: Status ${retryData.status}`)
          return retryData.body.series || []
      }
      throw new Error(`Withings API error: Status ${data.status}`)
  }
  
  return data.body.series || []
}

/**
 * Normalizes Withings sleep data into our Wellness format
 */
export function normalizeWithingsSleep(sleep: WithingsSleepSummary, userId: string) {
    if (!sleep.data.total_sleep_time && !sleep.data.asleepduration) {
        return null
    }

    const date = new Date(sleep.startdate * 1000)
    // Normalize to YYYY-MM-DD for storage
    // Use the date string from Withings as it represents the "night of" date usually
    const dateOnly = new Date(sleep.date)
    
    // Fallback if date parsing fails
    if (isNaN(dateOnly.getTime())) {
        return null
    }

    return {
        userId,
        date: dateOnly,
        sleepSeconds: sleep.data.total_sleep_time || sleep.data.asleepduration,
        sleepQuality: sleep.data.sleep_score, // 0-100
        restingHr: sleep.data.hr_average,
        // Calculate HRV from available data if possible, otherwise null
        // Withings sleep summary doesn't provide RMSSD/SDNN directly in summary unless specifically requested
        // and even then, it's often not in the standard summary fields or requires specific devices.
        // We'll leave HRV null for now unless we switch to `get` (high freq) which is heavy.
        
        rawJson: {
            withings_sleep: {
                id: sleep.id,
                model: sleep.model,
                data: sleep.data
            }
        }
    }
}
