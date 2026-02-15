import type { Integration } from '@prisma/client'
import { formatUserDate } from './date'
import { roundToTwoDecimals } from './number'

import { WorkoutConverter } from './workout-converter'

function getIntervalsHeaders(integration: Integration): Record<string, string> {
  // If we have a scope or refresh token, it's an OAuth integration
  if (integration.scope || integration.refreshToken) {
    return { Authorization: `Bearer ${integration.accessToken}` }
  }

  // Otherwise, assume it's a legacy API Key integration
  const auth = Buffer.from(`API_KEY:${integration.accessToken}`).toString('base64')
  return { Authorization: `Basic ${auth}` }
}

function getIntervalsAthleteId(integration: Integration): string {
  // Use '0' for OAuth integrations as recommended by Intervals.icu docs for Bearer tokens
  if (integration.scope || integration.refreshToken) {
    return '0'
  }
  return integration.externalUserId || 'i0'
}

export function isIntervalsEventId(eventId: string | null | undefined): eventId is string {
  return typeof eventId === 'string' && /^\d+$/.test(eventId.trim())
}

interface IntervalsActivity {
  id: string
  start_date: string // UTC timestamp
  start_date_local: string
  name: string
  description?: string
  type: string
  moving_time: number
  elapsed_time?: number
  duration?: number
  distance?: number
  total_elevation_gain?: number

  // Power metrics
  average_watts?: number
  max_watts?: number
  normalized_power?: number
  icu_average_watts?: number
  icu_weighted_avg_watts?: number
  icu_ftp?: number
  icu_joules?: number
  icu_variability_index?: number
  icu_power_hr?: number
  icu_efficiency_factor?: number

  // Heart rate
  average_heartrate?: number
  max_heartrate?: number

  // Cadence
  average_cadence?: number
  max_cadence?: number

  // Speed
  average_speed?: number

  // Training load
  icu_training_load?: number
  icu_intensity?: number
  icu_hrss?: number
  trimp?: number
  tss?: number
  intensity?: number

  // Training status
  icu_ctl?: number
  icu_atl?: number

  // Subjective
  perceived_exertion?: number
  session_rpe?: number
  feel?: number

  // Performance
  decoupling?: number
  polarization_index?: number

  // Environmental
  average_temp?: number
  trainer?: boolean

  // Balance
  avg_lr_balance?: number

  // Streams available
  stream_types?: string[]

  // Linked Event
  paired_event_id?: string | number

  [key: string]: any
}

interface IntervalsWellness {
  id: string
  restingHR?: number
  hrv?: number
  hrvSDNN?: number
  sleepSecs?: number
  sleepScore?: number
  sleepQuality?: number
  avgSleepingHR?: number
  readiness?: number
  soreness?: number
  fatigue?: number
  stress?: number
  mood?: number
  motivation?: number
  weight?: number
  spO2?: number
  ctl?: number
  atl?: number
  comments?: string
  vo2max?: number
  bodyFat?: number
  abdomen?: number
  injury?: string
  lactate?: number
  systolic?: number
  diastolic?: number
  hydration?: string
  hydrationVolume?: number
  respiration?: number
  bloodGlucose?: number
  menstrualPhase?: string
  [key: string]: any
}

interface IntervalsAthlete {
  id: string
  email: string
  name: string
}

interface IntervalsPlannedWorkout {
  id: string
  start_date_local: string
  end_date_local?: string
  name: string
  description?: string
  type?: string
  category?: string
  duration?: number
  distance?: number
  tss?: number
  work?: number
  workout_doc?: any
  for_week?: boolean
  [key: string]: any
}

// ... existing code ...

export function normalizeIntervalsCalendarNote(event: IntervalsPlannedWorkout, userId: string) {
  // Parse the local date string (YYYY-MM-DDTHH:mm:ss) and force to UTC midnight
  // for day-granular notes to avoid timezone shifting in the UI.
  const startDateStr = event.start_date_local.split('T')[0]
  const startDate = new Date(`${startDateStr}T00:00:00Z`)

  let endDate: Date | null = null
  if (event.end_date_local) {
    const endDateStr = event.end_date_local.split('T')[0]
    endDate = new Date(`${endDateStr}T00:00:00Z`)
  }

  return {
    userId,
    externalId: String(event.id),
    source: 'intervals',
    startDate,
    endDate,
    isWeeklyNote: event.for_week || false,
    title: event.name || 'Unnamed Note',
    description: event.description || null,
    category: event.category || 'NOTE',
    type: event.type || null,
    rawJson: event
  }
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  backoff = 1000
): Promise<Response> {
  try {
    const response = await fetch(url, options)

    if (response.status === 429 && retries > 0) {
      const retryAfter = response.headers.get('Retry-After')
      const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : backoff

      console.warn(
        `[Intervals API] 429 Too Many Requests. Retrying in ${waitTime}ms... (${retries} retries left)`
      )
      await new Promise((resolve) => setTimeout(resolve, waitTime))

      return fetchWithRetry(url, options, retries - 1, backoff * 2)
    }

    return response
  } catch (error) {
    if (retries > 0) {
      console.warn(
        `[Intervals API] Network error: ${error}. Retrying in ${backoff}ms... (${retries} retries left)`
      )
      await new Promise((resolve) => setTimeout(resolve, backoff))
      return fetchWithRetry(url, options, retries - 1, backoff * 2)
    }
    throw error
  }
}

export async function createIntervalsPlannedWorkout(
  integration: Integration,
  data: {
    date: Date
    title: string
    description?: string
    type: string
    durationSec?: number
    tss?: number
    workout_doc?: string
    managedBy?: string
    startTime?: string | null
  }
): Promise<IntervalsPlannedWorkout> {
  const athleteId = getIntervalsAthleteId(integration)

  // Map workout types to Intervals.icu format
  const category = 'WORKOUT'
  let sport = data.type

  // Handle Gym workouts - use "WeightTraining" (no space) for Intervals.icu
  if (data.type === 'Gym') {
    sport = 'WeightTraining'
  }

  // Format date as ISO datetime string (YYYY-MM-DDTHH:mm:ss) - preserving time
  // BUT: Intervals.icu treats 'start_date_local' as the athlete's local time.
  // If we send a full ISO string, it might be interpreted strictly.
  // For Planned Workouts (which are date-based in our DB), we want to target a specific day.
  // Ideally we send YYYY-MM-DDT00:00:00.
  const year = data.date.getUTCFullYear()
  const month = String(data.date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(data.date.getUTCDate()).padStart(2, '0')
  // Use UTC components because our input date is forced to UTC midnight for the correct calendar day.
  // We want to send this exact date as the local start date to Intervals.

  // Use provided startTime (HH:mm) or default to 06:00:00
  const timeStr = data.startTime ? `${data.startTime}:00` : '06:00:00'
  const dateStr = `${year}-${month}-${day}T${timeStr}`

  const workoutText = data.workout_doc || ''
  let combinedDescription = ''

  if (workoutText) {
    // If we have a structured workout doc, it contains everything Intervals.icu needs
    // We use it as the main description so Intervals.icu can parse the blocks correctly
    combinedDescription = workoutText
  } else {
    // Fallback for non-structured workouts
    combinedDescription = data.description || ''
  }

  // Append CoachWatts signature if managed by us
  if (data.managedBy === 'COACH_WATTS' && !combinedDescription.includes('[CoachWatts]')) {
    combinedDescription = `${combinedDescription}\n\n[CoachWatts]`.trim()
  }

  const eventData: any = {
    start_date_local: dateStr,
    name: data.title,
    description: combinedDescription,
    category,
    type: sport
  }

  // If we don't have workout text, we can send duration/tss explicitly
  if (!data.workout_doc) {
    eventData.duration = data.durationSec
    eventData.tss = data.tss
  } else {
    // If we have workout structure, Intervals.icu might calculate TSS itself from the structure.
    // However, if we have a target TSS estimated, we should probably send it to ensure it appears in calendars correctly.
    // Intervals.icu usually recalculates based on the structure provided in the description/doc.
    // But sending tss might act as a target/planned value.
    if (data.tss) {
      eventData.tss = data.tss
    }
  }

  console.log(
    '[createIntervalsPlannedWorkout] 📤 Sending to Intervals.icu (using description for workout text):',
    {
      athleteId,
      url: `https://intervals.icu/api/v1/athlete/${athleteId}/events`
    }
  )

  const url = `https://intervals.icu/api/v1/athlete/${athleteId}/events`
  const headers = getIntervalsHeaders(integration)
  const bodyStr = JSON.stringify(eventData)

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: bodyStr
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[createIntervalsPlannedWorkout] ❌ Intervals.icu API error:', {
      status: response.status,
      statusText: response.statusText,
      errorText,
      eventData
    })
    throw new Error(`Intervals API error: ${response.status} ${errorText}`)
  }

  const result = await response.json()
  console.log('[createIntervalsPlannedWorkout] ✅ Intervals.icu response:', {
    id: result.id,
    name: result.name
  })

  return result
}

export async function deleteIntervalsPlannedWorkout(
  integration: Integration,
  eventId: string
): Promise<void> {
  if (!isIntervalsEventId(eventId)) {
    throw new Error(`Invalid Intervals event ID: ${eventId}`)
  }

  const athleteId = getIntervalsAthleteId(integration)

  const url = `https://intervals.icu/api/v1/athlete/${athleteId}/events/${eventId}`
  const headers = getIntervalsHeaders(integration)

  const response = await fetchWithRetry(url, {
    method: 'DELETE',
    headers
  })

  if (!response.ok && response.status !== 404) {
    const errorText = await response.text()
    throw new Error(`Intervals API error: ${response.status} ${errorText}`)
  }
}

export async function updateIntervalsPlannedWorkout(
  integration: Integration,
  eventId: string,
  data: {
    date?: Date
    title?: string
    description?: string
    type?: string
    durationSec?: number
    tss?: number
    workout_doc?: string
    managedBy?: string
    startTime?: string | null
  }
): Promise<IntervalsPlannedWorkout> {
  if (!isIntervalsEventId(eventId)) {
    throw new Error(`Invalid Intervals event ID: ${eventId}`)
  }

  const athleteId = getIntervalsAthleteId(integration)

  // Map workout types to Intervals.icu format
  let sport = data.type
  if (data.type === 'Gym') {
    sport = 'WeightTraining'
  }

  // Format date if provided
  let dateStr: string | undefined
  if (data.date) {
    const year = data.date.getUTCFullYear()
    const month = String(data.date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(data.date.getUTCDate()).padStart(2, '0')

    // Use provided startTime (HH:mm) or default to 00:00:00 (since it's an update, maybe better to preserve?)
    // Actually, if date is provided but not startTime, we use T00:00:00.
    // If startTime is provided, we use it.
    const timeStr = data.startTime ? `${data.startTime}:00` : '00:00:00'
    dateStr = `${year}-${month}-${day}T${timeStr}`
  } else if (data.startTime) {
    // If only startTime is provided, we need the existing date.
    // However, the interface currently expects data.date to be present if we want to change dateStr.
    // For now, let's assume if startTime is provided without date, we might not be able to easily update start_date_local
    // without knowing the current date. But the caller should probably provide both or we should fetch it.
    // In this API, we usually provide the date.
  }

  const eventData: any = {}
  if (dateStr) eventData.start_date_local = dateStr
  if (data.title) eventData.name = data.title

  // Handle workout doc / description merge
  if (data.workout_doc || data.description !== undefined) {
    const workoutText = data.workout_doc || ''
    let combinedDescription = ''

    if (workoutText) {
      combinedDescription = workoutText
    } else {
      combinedDescription = data.description || ''
    }

    // Append CoachWatts signature if managed by us
    if (data.managedBy === 'COACH_WATTS' && !combinedDescription.includes('[CoachWatts]')) {
      combinedDescription = `${combinedDescription}\n\n[CoachWatts]`.trim()
    }

    eventData.description = combinedDescription

    // Send duration and tss if provided, even with structure
    if (data.durationSec) eventData.duration = data.durationSec
    if (data.tss) eventData.tss = data.tss
  } else {
    // Legacy path if just updating metadata
    if (data.durationSec) eventData.duration = data.durationSec
    if (data.tss) eventData.tss = data.tss
  }

  if (sport) eventData.type = sport

  const url = `https://intervals.icu/api/v1/athlete/${athleteId}/events/${eventId}`
  const headers = getIntervalsHeaders(integration)

  const response = await fetchWithRetry(url, {
    method: 'PUT',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(eventData)
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[updateIntervalsPlannedWorkout] ❌ Intervals.icu update failed:', {
      status: response.status,
      athleteId,
      eventId,
      errorText,
      eventData
    })
    throw new Error(`Intervals API error: ${response.status} ${errorText}`)
  }

  return await response.json()
}

export async function fetchIntervalsPlannedWorkouts(
  integration: Integration,
  startDate: Date,
  endDate: Date
): Promise<IntervalsPlannedWorkout[]> {
  const athleteId = getIntervalsAthleteId(integration)

  const url = new URL(`https://intervals.icu/api/v1/athlete/${athleteId}/events`)
  const oldestStr = startDate.toISOString().split('T')[0]
  const newestStr = endDate.toISOString().split('T')[0]

  if (oldestStr) url.searchParams.set('oldest', oldestStr)
  if (newestStr) url.searchParams.set('newest', newestStr)

  const headers = getIntervalsHeaders(integration)

  const response = await fetchWithRetry(url.toString(), {
    headers
  })

  if (!response.ok) {
    throw new Error(`Intervals API error: ${response.status} ${response.statusText}`)
  }

  return await response.json()
}

export async function fetchIntervalsWorkouts(
  integration: Integration,
  startDate: Date,
  endDate: Date
): Promise<IntervalsActivity[]> {
  const athleteId = getIntervalsAthleteId(integration)

  const url = new URL(`https://intervals.icu/api/v1/athlete/${athleteId}/activities`)
  const oldestStr = startDate.toISOString().split('T')[0]
  const newestStr = endDate.toISOString().split('T')[0]

  if (oldestStr) url.searchParams.set('oldest', oldestStr)
  if (newestStr) url.searchParams.set('newest', newestStr)

  const headers = getIntervalsHeaders(integration)

  console.log(`[Intervals Sync] Fetching workouts from: ${url.toString()}`)

  const response = await fetchWithRetry(url.toString(), {
    headers
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[Intervals Sync] ❌ Error ${response.status}: ${errorText}`)
    throw new Error(`Intervals API error: ${response.status} ${response.statusText}`)
  }

  return await response.json()
}

export async function fetchIntervalsActivity(
  integration: Integration,
  activityId: string
): Promise<IntervalsActivity> {
  const headers = getIntervalsHeaders(integration)
  const url = `https://intervals.icu/api/v1/activity/${activityId}`

  console.log(`[Intervals Sync] Fetching detailed activity from: ${url}`)

  const response = await fetchWithRetry(url, { headers })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[Intervals Sync] ❌ Error fetching activity ${activityId}: ${errorText}`)
    throw new Error(`Intervals API error: ${response.status} ${response.statusText}`)
  }

  const activity = await response.json()

  // Also fetch the intervals analysis which is often separate or missing from main payload
  try {
    const intervalsUrl = `https://intervals.icu/api/v1/activity/${activityId}/intervals`
    console.log(`[Intervals Sync] Fetching intervals analysis from: ${intervalsUrl}`)
    const intervalsResponse = await fetchWithRetry(intervalsUrl, { headers })

    if (intervalsResponse.ok) {
      const intervalsData = await intervalsResponse.json()
      if (intervalsData && Array.isArray(intervalsData.icu_intervals)) {
        console.log(
          `[Intervals Sync] Merging ${intervalsData.icu_intervals.length} intervals into activity`
        )
        activity.icu_intervals = intervalsData.icu_intervals
        activity.icu_groups = intervalsData.icu_groups
      }
    }
  } catch (error) {
    console.warn(`[Intervals Sync] Failed to fetch intervals analysis for ${activityId}:`, error)
    // Continue without intervals, don't fail the whole sync
  }

  return activity
}

export async function fetchIntervalsAthlete(
  accessToken: string,
  athleteId?: string
): Promise<IntervalsAthlete> {
  // Intervals.icu API expects Basic Auth with "API_KEY" as username and the API key as password
  // The athlete ID must be provided in the URL path

  if (!athleteId) {
    throw new Error('Athlete ID is required')
  }

  const auth = Buffer.from(`API_KEY:${accessToken}`).toString('base64')

  const response = await fetchWithRetry(`https://intervals.icu/api/v1/athlete/${athleteId}`, {
    headers: {
      Authorization: `Basic ${auth}`
    }
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Intervals.icu API error:', response.status, errorText)
    throw new Error(`Intervals API error: ${response.status} ${response.statusText}`)
  }

  return await response.json()
}

export async function fetchIntervalsAthleteProfile(integration: Integration) {
  const athleteId = getIntervalsAthleteId(integration)
  const headers = getIntervalsHeaders(integration)

  console.log(
    `[Intervals Sync] Fetching athlete profile from: https://intervals.icu/api/v1/athlete/${athleteId}`
  )

  // Fetch athlete data
  const athleteResponse = await fetchWithRetry(
    `https://intervals.icu/api/v1/athlete/${athleteId}`,
    {
      headers
    }
  )

  if (!athleteResponse.ok) {
    throw new Error(`Failed to fetch athlete profile: ${athleteResponse.statusText}`)
  }

  const athlete = await athleteResponse.json()
  const timezone = athlete.timezone || 'UTC'

  // Fetch recent wellness data (last 7 days)
  const today = new Date()

  const wellnessData: any[] = []
  for (let i = 0; i < 7; i++) {
    // Use the user's timezone to calculate "7 days ago" correctly relative to their day
    const date = new Date(today)
    date.setUTCDate(date.getDate() - i)
    // Format in user's timezone to ensure we ask for the correct calendar day
    const dateStr = formatUserDate(date, timezone, 'yyyy-MM-dd')

    try {
      const wellnessResponse = await fetchWithRetry(
        `https://intervals.icu/api/v1/athlete/${athleteId}/wellness/${dateStr}`,
        {
          headers
        }
      )

      if (wellnessResponse.ok) {
        const wellness = await wellnessResponse.json()
        if (wellness && Object.keys(wellness).length > 0) {
          wellnessData.push({ date: dateStr, ...wellness })
        }
      }
    } catch (error) {
      // Continue on error for individual days
      console.error(`Error fetching wellness for ${dateStr}:`, error)
    }
  }

  // Extract FTP and other metrics from type settings
  let ftp: number | null = null
  let lthr: number | null = null
  let maxHR: number | null = null
  let hrZones = null
  let powerZones = null

  // Check for both new (sportSettings) and legacy (icu_type_settings) formats
  const settings =
    athlete.sportSettings && athlete.sportSettings.length > 0
      ? athlete.sportSettings
      : athlete.icu_type_settings || []

  const sportSettings = settings.map((s: any) => {
    // Determine zones
    const currentFtp = s.ftp || null
    const currentLthr = s.lthr || null
    const currentMaxHr = s.max_hr || null
    const currentThresholdPace = s.threshold_pace || null

    const currentHrZones = convertIntervalsZones(s.hr_zones, s.hr_zone_names, 'hr')
    const currentPowerZones = convertIntervalsZones(
      s.power_zones,
      s.power_zone_names,
      'power',
      currentFtp
    )
    // Pace zones might be complex (units vary), but if provided we try to map them
    // Assuming pace zones are also "max" values if in array
    const currentPaceZones = convertIntervalsZones(s.pace_zones, s.pace_zone_names, 'pace')

    // Extended Settings
    const warmupTime = s.warmup_time ? Math.round(s.warmup_time / 60) : null // convert seconds to minutes if needed, usually stored as seconds in Intervals? Docs say integer. Let's assume seconds if consistent with other duration fields, but user prompt said "Warmup / Cooldown time in minutes". Let's check typical usage. Intervals usually uses seconds for durations. If user sees "10" it might be minutes in UI but seconds in API? Let's check API docs or assume seconds and convert to minutes for our DB if our DB expects minutes.
    // User prompt: "Warmup / Cooldown time in minutes".
    // Intervals API: "warmup_time: integer". Usually seconds.
    // Let's store as Minutes in our DB to match user request "Include fields for Warmup/Cooldown duration (minutes)".
    // So if API returns seconds (e.g. 600 for 10 min), we divide by 60.

    return {
      source: 'intervals',
      externalId: s.id?.toString(),
      types: s.types || [],
      ftp: currentFtp,
      indoorFtp: s.indoor_ftp || null,
      wPrime: s.w_prime || null,
      lthr: currentLthr,
      maxHr: currentMaxHr,
      hrZones: currentHrZones,
      powerZones: currentPowerZones,
      thresholdPace: currentThresholdPace,

      // Extended Power
      eFtp: s.e_ftp || null, // Check if this field exists, user mentioned "eFTP 225". It might be computed.
      eWPrime: s.e_w_prime || null,
      pMax: s.p_max || null,
      ePMax: s.e_p_max || null,
      powerSpikeThreshold: s.power_spike_threshold || null,
      eftpMinDuration: s.ftp_est_min_secs || null,

      // Extended HR
      // restingHr: s.resting_hr || null, // If available per sport
      hrLoadType: s.hr_load_type || null,

      // General
      warmupTime: s.warmup_time ? Math.round(s.warmup_time / 60) : null,
      cooldownTime: s.cooldown_time ? Math.round(s.cooldown_time / 60) : null,
      loadPreference: s.load_order || null
    }
  })

  // Extract primary settings (Cycling/Ride preference)
  if (sportSettings.length > 0) {
    const cyclingSettings = sportSettings.find(
      (s: any) => s.types && (s.types.includes('Ride') || s.types.includes('VirtualRide'))
    )

    if (cyclingSettings) {
      ftp = cyclingSettings.ftp
      lthr = cyclingSettings.lthr
      maxHR = cyclingSettings.maxHr
      hrZones = cyclingSettings.hrZones
      powerZones = cyclingSettings.powerZones
    } else {
      // Fallback to first setting with FTP
      const firstWithFtp = sportSettings.find((s: any) => s.ftp)
      if (firstWithFtp) {
        ftp = firstWithFtp.ftp
        lthr = firstWithFtp.lthr
        maxHR = firstWithFtp.maxHr
        hrZones = firstWithFtp.hrZones
        powerZones = firstWithFtp.powerZones
      }
    }
  }

  // Calculate age from date of birth
  const calculateAge = (dob: string): number | null => {
    if (!dob) return null
    const birthDate = new Date(dob)
    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--
    }
    return age
  }

  // Calculate recent HRV average
  const recentHrvValues = wellnessData.map((d) => d.hrv).filter((v) => v != null)
  const avgRecentHRV =
    recentHrvValues.length > 0
      ? recentHrvValues.reduce((a, b) => a + b, 0) / recentHrvValues.length
      : null

  return {
    // Basic info
    name: athlete.name || null,
    email: athlete.email || null,
    sex:
      athlete.sex === 'M' || athlete.sex === 'Male'
        ? 'Male'
        : athlete.sex === 'F' || athlete.sex === 'Female'
          ? 'Female'
          : 'Other',
    dateOfBirth: athlete.icu_date_of_birth || null,
    age: athlete.icu_date_of_birth ? calculateAge(athlete.icu_date_of_birth) : null,
    location: {
      city: athlete.city || null,
      state: athlete.state || null,
      country: athlete.country || null
    },

    // Physical metrics
    weight: athlete.icu_weight || athlete.weight || null,
    restingHR: athlete.icu_resting_hr || null,

    // Performance metrics (from type settings)
    ftp,
    lthr,
    maxHR,
    hrZones,
    powerZones,

    // Recent wellness
    recentHRV: wellnessData.length > 0 ? wellnessData[0].hrv : null,
    avgRecentHRV: avgRecentHRV ? Math.round(avgRecentHRV * 10) / 10 : null,
    recentWeight: wellnessData.find((d) => d.weight)?.weight || null,
    recentReadiness: wellnessData.length > 0 ? wellnessData[0].readiness : null,

    // Preferences
    timezone: athlete.timezone || null,
    locale: athlete.locale || null,
    measurementPreference: athlete.measurement_preference || null,

    // Sport specific settings
    sportSettings
  }
}

export async function fetchIntervalsWellness(
  integration: Integration,
  startDate: Date,
  endDate: Date
): Promise<IntervalsWellness[]> {
  const athleteId = getIntervalsAthleteId(integration)

  const wellness: IntervalsWellness[] = []

  // Fetch wellness data for each day in the range
  const currentDate = new Date(startDate)
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0]
    const url = `https://intervals.icu/api/v1/athlete/${athleteId}/wellness/${dateStr}`

    const headers = getIntervalsHeaders(integration)

    try {
      const response = await fetchWithRetry(url, {
        headers
      })

      if (response.ok) {
        const data = await response.json()
        wellness.push({ id: dateStr, ...data })
      }
    } catch (error) {
      // Continue on error for individual days
      console.error(`Error fetching wellness for ${dateStr}:`, error)
    }

    currentDate.setUTCDate(currentDate.getDate() + 1)
  }

  return wellness
}

export function normalizeIntervalsWorkout(activity: IntervalsActivity, userId: string) {
  const moving_time = activity.moving_time || 0
  const elapsed_time = activity.elapsed_time || 0
  const duration = activity.duration || 0
  const durationSec = moving_time || elapsed_time || duration

  return {
    userId,
    externalId: activity.id,
    source: 'intervals',
    // Prefer start_date (UTC ISO string) which is absolute.
    // Do NOT force to midnight for completed activities - we want the exact time.
    date: new Date(activity.start_date || activity.start_date_local),
    title: activity.name || 'Unnamed Activity',
    description: activity.description || null,
    type: activity.type,
    durationSec,
    distanceMeters: activity.distance || null,
    elevationGain: activity.total_elevation_gain ? Math.round(activity.total_elevation_gain) : null,

    // Power metrics
    averageWatts: activity.icu_average_watts || activity.average_watts || null,
    maxWatts:
      activity.max_watts ||
      activity.icu_pm_p_max ||
      activity.icu_rolling_p_max ||
      activity.p_max ||
      null,
    normalizedPower: activity.normalized_power || null,
    weightedAvgWatts: activity.icu_weighted_avg_watts || null,

    // Heart rate
    averageHr: activity.average_heartrate ? Math.round(activity.average_heartrate) : null,
    maxHr: activity.max_heartrate ? Math.round(activity.max_heartrate) : null,

    // Cadence
    averageCadence: activity.average_cadence ? Math.round(activity.average_cadence) : null,
    maxCadence: activity.max_cadence ? Math.round(activity.max_cadence) : null,

    // Speed
    averageSpeed: activity.average_speed || null,

    // Training load
    tss: activity.tss || null,
    trainingLoad: activity.icu_training_load || null,
    hrLoad: activity.icu_hrss || null,

    // FIX: Normalize intensity to 0-1 scale
    intensity: (() => {
      let val = activity.icu_intensity || activity.intensity || null
      if (val !== null && val > 5) {
        val = val / 100
      }
      return val ? Math.round(val * 10000) / 10000 : null
    })(),

    kilojoules: activity.icu_joules ? Math.round(activity.icu_joules / 1000) : null,
    trimp: activity.trimp || null,

    // Performance metrics
    ftp: activity.icu_ftp || null,
    variabilityIndex: activity.icu_variability_index || null,
    powerHrRatio: activity.icu_power_hr || null,
    efficiencyFactor: activity.icu_efficiency_factor || null,
    decoupling: activity.decoupling || null,
    polarizationIndex: activity.polarization_index || null,

    // Training status
    ctl: activity.icu_ctl || null,
    atl: activity.icu_atl || null,

    // Subjective metrics
    rpe: activity.perceived_exertion || activity.icu_rpe || null,
    sessionRpe: activity.session_rpe || null,
    // Intervals uses 1 (Strong) to 5 (Weak). We standardize to 1 (Weak) to 5 (Strong).
    feel: activity.feel ? 6 - activity.feel : null,

    // Environmental
    avgTemp: activity.average_temp || null,
    trainer: activity.trainer || null,

    // Balance
    lrBalance: activity.avg_lr_balance || null,

    // Energy & Time
    calories: activity.calories || null,
    elapsedTimeSec: activity.elapsed_time || null,

    // Device & Metadata
    deviceName: null, // Intervals.icu doesn't provide device info
    commute: false, // Intervals.icu doesn't track commute flag
    isPrivate: false, // Intervals.icu doesn't provide privacy flag
    gearId: null, // Intervals.icu doesn't provide gear info

    // Store raw data
    rawJson: activity
  }
}

export function cleanIntervalsDescription(description: string): string {
  if (!description) return ''

  // 1. Remove CoachWatts signature
  let cleanDesc = description
    .replace(/\n\n\[CoachWatts\]/g, '')
    .replace(/\[CoachWatts\]/g, '')
    .trim()

  // 2. Attempt to separate user description from workout definition
  // We look for the start of the workout definition.
  const lines = cleanDesc.split('\n')
  let splitIndex = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim()
    if (!line) continue

    // Heuristics for Intervals.icu workout text start
    if (
      /^(Warmup|Cooldown|Main Set)$/i.test(line) || // Section headers
      /^(\d+x|(- )?\d+(m|s|h)\s+\d+)/.test(line) || // Steps (Nx, 10m 50%, - Step 10m...)
      /^-\s+\*\*(.+)\*\*$/.test(line) // Gym Exercises (- **Name**)
    ) {
      splitIndex = i
      break
    }
  }

  if (splitIndex !== -1) {
    cleanDesc = lines.slice(0, splitIndex).join('\n').trim()
  }

  return cleanDesc
}

function normalizeWorkoutSteps(steps: any[]): any[] {
  if (!Array.isArray(steps)) return []

  return steps.map((step: any) => {
    const normalizeTarget = (target: any) => {
      if (target === null || target === undefined) return null

      if (Array.isArray(target)) {
        if (target.length >= 2) {
          return { range: { start: Number(target[0]) || 0, end: Number(target[1]) || 0 } }
        }
        if (target.length === 1) {
          return { value: Number(target[0]) || 0 }
        }
        return null
      }

      if (typeof target === 'number') {
        return { value: target }
      }

      if (typeof target === 'object') {
        if (target.range && typeof target.range === 'object') {
          return {
            range: {
              start: Number(target.range.start) || 0,
              end: Number(target.range.end) || 0
            },
            units: target.units
          }
        }
        if (target.start !== undefined && target.end !== undefined) {
          return {
            range: {
              start: Number(target.start) || 0,
              end: Number(target.end) || 0
            },
            units: target.units
          }
        }
        if (target.value !== undefined) {
          return { value: Number(target.value) || 0, units: target.units }
        }
      }

      return null
    }

    // 1. Recurse for nested steps (repeats)
    if (step.steps && Array.isArray(step.steps)) {
      step.steps = normalizeWorkoutSteps(step.steps)
    }

    // Map legacy/short field names
    if (step.hr && !step.heartRate) {
      step.heartRate = step.hr
      delete step.hr
    }

    // Duration
    if (step.duration !== undefined && step.durationSeconds === undefined) {
      step.durationSeconds = step.duration
    }
    if (step.durationSeconds !== undefined && step.duration === undefined) {
      step.duration = step.durationSeconds
    }

    // Normalize common Intervals target formats (arrays, numbers, start/end objects)
    step.power = normalizeTarget(step.power) || step.power
    step.heartRate = normalizeTarget(step.heartRate) || step.heartRate
    step.pace = normalizeTarget(step.pace) || step.pace

    // Power
    if (step.power) {
      // Structure: start/end -> range
      if (step.power.start !== undefined && step.power.end !== undefined && !step.power.range) {
        step.power.range = {
          start: step.power.start,
          end: step.power.end
        }
        delete step.power.start
        delete step.power.end
      }

      // Scale: % -> Ratio (e.g. 90 -> 0.90)
      // Heuristic: if units contain % OR value is > 5 (assuming nobody targets > 500% FTP often without units)
      // Note: Absolute watts (e.g. 200) usually don't have units='%', so we skip if units='watts'
      const units = step.power.units || ''
      const isPercent =
        units.includes('%') || (!units && (step.power.value > 5 || step.power.range?.start > 5))

      if (isPercent) {
        if (step.power.value !== undefined && step.power.value > 2) step.power.value /= 100
        if (step.power.range) {
          if (step.power.range.start !== undefined && step.power.range.start > 2)
            step.power.range.start /= 100
          if (step.power.range.end !== undefined && step.power.range.end > 2)
            step.power.range.end /= 100
        }
      }
    }

    // Heart Rate
    if (step.heartRate) {
      // Structure: start/end -> range
      if (
        step.heartRate.start !== undefined &&
        step.heartRate.end !== undefined &&
        !step.heartRate.range
      ) {
        step.heartRate.range = {
          start: step.heartRate.start,
          end: step.heartRate.end
        }
        delete step.heartRate.start
        delete step.heartRate.end
      }

      // Scale: % -> Ratio
      const units = step.heartRate.units || ''
      const isPercent =
        units.includes('%') ||
        (!units && (step.heartRate.value > 5 || step.heartRate.range?.start > 5))

      if (isPercent) {
        if (step.heartRate.value !== undefined && step.heartRate.value > 2)
          step.heartRate.value /= 100

        if (step.heartRate.range) {
          if (step.heartRate.range.start !== undefined && step.heartRate.range.start > 2)
            step.heartRate.range.start /= 100

          if (step.heartRate.range.end !== undefined && step.heartRate.range.end > 2)
            step.heartRate.range.end /= 100
        }
      }
    }

    // Cadence
    // Intervals often returns { value: 90, units: 'rpm' } or { start: 80, end: 90, units: 'rpm' }
    if (step.cadence && typeof step.cadence === 'object') {
      if (step.cadence.value !== undefined) {
        step.cadence = step.cadence.value
      } else if (step.cadence.start !== undefined && step.cadence.end !== undefined) {
        // Average the range for a single value representation
        step.cadence = Math.round((step.cadence.start + step.cadence.end) / 2)
      } else {
        // Fallback: If we can't parse it, better to delete it than crash UI with object
        delete step.cadence
      }
    }

    // Name (Intervals uses 'text' for the step description/name)
    if (!step.name && step.text) {
      step.name = step.text
    }

    // Type (Intervals uses boolean flags or implicit types)
    if (!step.type) {
      if (step.warmup) {
        step.type = 'Warmup'
      } else if (step.cooldown) {
        step.type = 'Cooldown'
      } else {
        // Heuristic: Low intensity (< 60%) is likely Rest/Recovery
        // Check power first, then HR
        let intensity = 0

        if (step.power?.value) intensity = step.power.value
        else if (step.power?.range) intensity = (step.power.range.start + step.power.range.end) / 2
        else if (step.heartRate?.value) intensity = step.heartRate.value
        else if (step.heartRate?.range)
          intensity = (step.heartRate.range.start + step.heartRate.range.end) / 2

        // If we have nested steps, assume it's Active (container) unless explicitly Rest
        if (step.steps && step.steps.length > 0) {
          step.type = 'Active'
        } else {
          step.type = intensity < 0.6 ? 'Rest' : 'Active'
        }
      }
    }

    return step
  })
}

export function normalizeIntervalsPlannedWorkout(event: IntervalsPlannedWorkout, userId: string) {
  // Intervals.icu sometimes uses different field names for planned metrics depending on the source/type
  const durationSec = event.duration ?? event.moving_time ?? event.workout_doc?.duration ?? null
  const tss = event.tss ?? event.icu_training_load ?? null

  // FIX: Prioritize icu_intensity and normalize to 0-1 scale
  // event.work is Joules, which shouldn't be mapped to intensity
  let workIntensity = event.icu_intensity ?? null

  // If intensity is > 5, assume it's a percentage (e.g. 75 for 0.75)
  if (workIntensity !== null && workIntensity > 5) {
    workIntensity = workIntensity / 100
  }

  const distance = event.distance ?? event.icu_distance ?? null

  // Structured workout data
  const structuredWorkout = event.workout_doc ?? (event.steps ? { steps: event.steps } : null)

  // Normalize steps recursively
  if (structuredWorkout && Array.isArray(structuredWorkout.steps)) {
    structuredWorkout.steps = normalizeWorkoutSteps(structuredWorkout.steps)
  }
  // Detect CoachWatts management
  const isCoachWatts = event.description?.includes('[CoachWatts]')

  // Clean description to avoid appending loop
  let description = event.description || null
  if (description) {
    // Only clean if it looks like a structured workout or has our signature
    if (structuredWorkout || isCoachWatts) {
      description = cleanIntervalsDescription(description)
    }

    if (description === '') {
      description = null
    }
  }

  // RECOVERY LOGIC: Parse Exercises from Description
  // If this is a Gym workout and we have no valid structure (or just junk Rest steps from Intervals),
  // try to recover the exercises from the description text.
  const isGym = event.type === 'WeightTraining' || event.type === 'Gym'
  const steps = structuredWorkout?.steps || []
  // Intervals auto-parsing often creates steps named 'Rest:' with type 'Rest'.
  const hasJunkSteps =
    steps.length > 0 &&
    steps.every(
      (s: any) =>
        s.type === 'Rest' ||
        s.text?.startsWith('Rest:') ||
        s.name?.startsWith('Rest:') ||
        s.name === 'Rest'
    )

  if (isGym && (hasJunkSteps || !steps.length) && event.description) {
    const parsedExercises = WorkoutConverter.parseIntervalsGymDescription(event.description || '')
    if (parsedExercises.length > 0) {
      if (!structuredWorkout) {
        // We can't assign to const, so we'll attach it to the result object directly later
        // or we can mutate the structuredWorkout object if it exists (it might be null)
      } else {
        structuredWorkout.exercises = parsedExercises
        // Clear junk steps if we found valid exercises
        if (hasJunkSteps) {
          structuredWorkout.steps = []
        }
      }
    }
  }

  const result = {
    userId,
    externalId: String(event.id), // Convert to string
    // Parse the local date string (YYYY-MM-DDTHH:mm:ss) and force to UTC midnight
    // This ensures that "2026-01-15T06:00:00" becomes 2026-01-15T00:00:00Z in our DB
    date: new Date(new Date(event.start_date_local).toISOString().split('T')[0] + 'T00:00:00Z'),
    title: event.name || 'Unnamed Event',
    description: description,
    type: event.type || null,
    category: event.category || 'WORKOUT',
    startTime: (() => {
      if (event.start_date_local && event.start_date_local.includes('T')) {
        const timePart = event.start_date_local.split('T')[1]
        if (timePart && timePart.length >= 5) {
          return timePart.substring(0, 5)
        }
      }
      return null
    })(),
    durationSec: durationSec ? Math.round(durationSec) : null,
    distanceMeters: distance ? Math.round(distance) : null,
    tss: tss ? Math.round(tss * 10) / 10 : null,
    workIntensity: workIntensity ? Math.round(workIntensity * 100) / 100 : null,
    structuredWorkout,
    completed: false,
    managedBy: isCoachWatts ? 'COACH_WATTS' : 'USER',
    rawJson: event
  }

  // If structuredWorkout was null but we parsed exercises, we need to attach it now
  if (!structuredWorkout && isGym && event.description) {
    const parsedExercises = WorkoutConverter.parseIntervalsGymDescription(event.description || '')
    if (parsedExercises.length > 0) {
      result.structuredWorkout = { exercises: parsedExercises, steps: [] }
    }
  }

  return result
}

function mapIntervalsMood(val: number | undefined | null): number | null {
  if (!val) return null
  // Intervals: 1=Great, 2=Good, 3=OK, 4=Grumpy
  // Coach Watts (1-10): 10=Great, 1=Grumpy
  const map: Record<number, number> = { 1: 10, 2: 7, 3: 4, 4: 1 }
  return map[val] || null
}

function mapIntervalsSoreness(val: number | undefined | null): number | null {
  if (!val) return null
  // Intervals: 1=Low, 2=Avg, 3=High, 4=Extreme
  // Coach Watts (1-10): 10=Extreme (High Soreness)
  const map: Record<number, number> = { 1: 1, 2: 4, 3: 7, 4: 10 }
  return map[val] || null
}

function mapIntervalsFatigue(val: number | undefined | null): number | null {
  if (!val) return null
  // Intervals: 1=Low, 2=Avg, 3=High, 4=Extreme
  // Coach Watts (1-10): 10=Extreme (High Fatigue)
  const map: Record<number, number> = { 1: 1, 2: 4, 3: 7, 4: 10 }
  return map[val] || null
}

function mapIntervalsStress(val: number | undefined | null): number | null {
  if (!val) return null
  // Intervals: 1=Low, 2=Avg, 3=High, 4=Extreme
  // Coach Watts (1-10): 10=Extreme (High Stress)
  const map: Record<number, number> = { 1: 1, 2: 4, 3: 7, 4: 10 }
  return map[val] || null
}

function mapIntervalsSleepQuality(val: number | undefined | null): number | null {
  if (!val) return null
  // Intervals: 1=Great, 2=Good, 3=Avg, 4=Poor
  // Coach Watts (1-10): 10=Great, 1=Poor
  const map: Record<number, number> = { 1: 10, 2: 7, 3: 4, 4: 1 }
  return map[val] || null
}

function mapIntervalsMotivation(val: number | undefined | null): number | null {
  if (!val) return null
  // Intervals: 1=Extreme (High), 2=High, 3=Avg, 4=Low
  // Coach Watts (1-10): 10=High, 1=Low
  const map: Record<number, number> = { 1: 10, 2: 7, 3: 4, 4: 1 }
  return map[val] || null
}

export function normalizeIntervalsWellness(
  wellness: IntervalsWellness,
  userId: string,
  date: Date,
  readinessScale: string = 'STANDARD',
  sleepScoreScale: string = 'STANDARD',
  options?: {
    historicalRawReadiness?: number[]
  }
) {
  let readiness = wellness.readiness || null

  // Normalize Readiness based on user preference
  if (readiness !== null) {
    if (readinessScale === 'POLAR') {
      // Map 1-6 scale to 1-10
      readiness = Math.round((readiness / 6) * 10)
      readiness = Math.max(1, Math.min(10, readiness))
    } else if (readinessScale === 'TEN_POINT') {
      // Already 1-10, ensure it's capped
      if (readiness > 10) readiness = Math.round(readiness / 10)
      readiness = Math.max(1, Math.min(10, readiness))
    } else if (readinessScale === 'HRV4TRAINING') {
      // HRV4Training uses absolute values (e.g., 6.8-8.0)
      // Normalize to 0-100 based on historical distribution if provided
      const history = options?.historicalRawReadiness || []
      const allValues = [...history, readiness].filter((v) => v !== null && v !== undefined)

      if (allValues.length >= 3) {
        const min = Math.min(...allValues)
        const max = Math.max(...allValues)
        const range = max - min

        if (range > 0) {
          // Normalize to 1-100 range
          readiness = Math.round(((readiness - min) / range) * 99) + 1
        } else {
          // If no range, default to middle (50)
          readiness = 50
        }
      } else {
        // Not enough data, can't normalize properly, but let's not treat it as 1-10
        // Maybe just keep it as is? Or default to 50?
        // User said it floats in narrow band. Without history we can't do much.
        // Let's at least ensure it's > 10 so UI treats it as % if possible,
        // but raw values like 7.6 are < 10.
        // If we don't have history, maybe we can't support HRV4Training properly yet.
        // For now, let's keep it raw if no history, but clamp it to 1-100 for DB safety if it was somehow larger.
      }
      // Clamping for HRV4Training is 1-100
      readiness = Math.max(1, Math.min(100, readiness))
    } else {
      // STANDARD (0-100) or Default
      if (readiness > 10) {
        readiness = Math.round(readiness / 10)
      }
      readiness = Math.max(1, Math.min(10, readiness))
    }
  }

  let sleepScore = wellness.sleepScore || null

  // Normalize Sleep Score based on user preference
  if (sleepScore !== null) {
    if (sleepScoreScale === 'TEN_POINT') {
      // Map 1-10 to 0-100
      sleepScore = Math.round(sleepScore * 10)
    } else if (sleepScoreScale === 'POLAR') {
      // Polar Sleep Charge? Or just 1-10 like readiness?
      // Assuming user wants 0-100 output from a 1-6 input if they select POLAR?
      // Let's implement generic small-scale handling if needed, but for now stick to request.
      // If the user selected POLAR for sleep, they likely have a 1-6 or similar small scale.
      // Map 1-6 to 0-100?
      // 1 => 16, 6 => 100
      sleepScore = Math.round((sleepScore / 6) * 100)
    } else {
      // STANDARD (0-100)
      // Ensure it is 0-100.
      // If we receive a small number like 8 (and it's actually 8/100?), we keep it.
      // But if user meant 8/10, they should use TEN_POINT.
    }

    // Safety clamp
    sleepScore = Math.max(0, Math.min(100, sleepScore))
  }

  return {
    userId,
    date,

    // HRV
    hrv: wellness.hrv || null,
    hrvSdnn: wellness.hrvSDNN || null,

    // Heart rate
    restingHr: wellness.restingHR || null,
    avgSleepingHr: wellness.avgSleepingHR || null,

    // Sleep
    sleepSecs: wellness.sleepSecs || null,
    sleepHours: wellness.sleepSecs ? Math.round((wellness.sleepSecs / 3600) * 10) / 10 : null,
    sleepScore: sleepScore,
    sleepQuality: mapIntervalsSleepQuality(wellness.sleepQuality),

    // Recovery
    readiness: readiness,
    recoveryScore: readiness && readiness > 10 ? readiness : readiness ? readiness * 10 : null, // Map 1-10 to 10-100 if needed, or use direct % if > 10

    // Subjective
    soreness: mapIntervalsSoreness(wellness.soreness),
    fatigue: mapIntervalsFatigue(wellness.fatigue),
    stress: mapIntervalsStress(wellness.stress),
    mood: mapIntervalsMood(wellness.mood),
    motivation: mapIntervalsMotivation(wellness.motivation),

    // Physical
    weight: wellness.weight ? roundToTwoDecimals(wellness.weight) : null,
    bodyFat: wellness.bodyFat || null,
    abdomen: wellness.abdomen || null,
    vo2max: wellness.vo2max || null,
    spO2: wellness.spO2 || null,

    // Vitals
    systolic: wellness.systolic || null,
    diastolic: wellness.diastolic || null,
    respiration: wellness.respiration || null,
    bloodGlucose: wellness.bloodGlucose || null,
    lactate: wellness.lactate || null,

    // Hydration & Health
    hydration: wellness.hydration ? String(wellness.hydration) : null,
    hydrationVolume: wellness.hydrationVolume || null,
    injury: wellness.injury ? String(wellness.injury) : null,

    // Cycle
    menstrualPhase: wellness.menstrualPhase ? String(wellness.menstrualPhase) : null,

    // Training load
    ctl: wellness.ctl || null,
    atl: wellness.atl || null,

    // Notes
    comments: wellness.comments || null,

    // Raw data
    rawJson: wellness
  }
}

interface IntervalsStream {
  type: string
  data: number[] | [number, number][] | boolean[]
}

/**
 * Fetch time-series stream data for an Intervals.icu activity
 * Returns data arrays for various metrics like HR, power, cadence, altitude, etc.
 */
export async function fetchIntervalsActivityStreams(
  integration: Integration,
  activityId: string
): Promise<Record<string, IntervalsStream>> {
  const athleteId = getIntervalsAthleteId(integration)
  const headers = getIntervalsHeaders(integration)

  const url = `https://intervals.icu/api/v1/activity/${activityId}/streams`

  const response = await fetchWithRetry(url, {
    headers
  })

  if (!response.ok) {
    if (response.status === 404) {
      // Activity doesn't have stream data
      return {}
    }
    throw new Error(`Intervals API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  const streams: Record<string, IntervalsStream> = {}

  // Intervals.icu returns an array of objects: [{type: 'time', data: []}, {type: 'watts', data: []}, ...]
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item.type && item.data) {
        // Special handling for latlng
        if (item.type === 'latlng') {
          // Validate structure: must be array of arrays [[lat, lng], ...]
          // Intervals sometimes returns a flat array of latitudes labeled as 'latlng' (bug?)
          if (Array.isArray(item.data) && item.data.length > 0) {
            const firstPoint = item.data[0]
            if (Array.isArray(firstPoint) && firstPoint.length >= 2) {
              streams.latlng = { type: 'latlng', data: item.data }
            } else {
              console.warn(
                `[Intervals Sync] Invalid latlng format detected (expected tuples, got scalars). Discarding map data.`
              )
            }
          }
        } else {
          streams[item.type] = { type: item.type, data: item.data }
        }
      }
    }

    // Check if we need to reconstruct latlng from lat and lon streams
    if (!streams.latlng && streams.lat && streams.lon) {
      const lat = streams.lat.data as number[]
      const lon = streams.lon.data as number[]
      const latlng: [number, number][] = []
      for (let i = 0; i < lat.length; i++) {
        const la = lat[i]
        const lo = lon[i]
        if (la !== undefined && lo !== undefined) {
          latlng.push([la, lo])
        }
      }
      streams.latlng = { type: 'latlng', data: latlng }
    }

    // Map velocity_smooth to velocity if velocity is missing
    if (!streams.velocity && streams.velocity_smooth) {
      streams.velocity = { type: 'velocity', data: streams.velocity_smooth.data as number[] }
    }

    // Map fixed_altitude to altitude if altitude is missing
    if (!streams.altitude && streams.fixed_altitude) {
      streams.altitude = { type: 'altitude', data: streams.fixed_altitude.data as number[] }
    }
  }
  // Fallback for object format if it ever exists
  else if (typeof data === 'object' && data !== null) {
    if (data.time) streams.time = { type: 'time', data: data.time }
    if (data.distance) streams.distance = { type: 'distance', data: data.distance }
    if (data.velocity || data.velocity_smooth)
      streams.velocity = { type: 'velocity', data: data.velocity || data.velocity_smooth }
    if (data.heartrate || data.hr)
      streams.heartrate = { type: 'heartrate', data: data.heartrate || data.hr }
    if (data.cadence || data.cad)
      streams.cadence = { type: 'cadence', data: data.cadence || data.cad }
    if (data.watts) streams.watts = { type: 'watts', data: data.watts }
    if (data.altitude || data.alt)
      streams.altitude = { type: 'altitude', data: data.altitude || data.alt }
    if (data.lat && data.lon) {
      const latlng: [number, number][] = []
      for (let i = 0; i < data.lat.length; i++) {
        latlng.push([data.lat[i], data.lon[i]])
      }
      streams.latlng = { type: 'latlng', data: latlng }
    }
    if (data.grade) streams.grade = { type: 'grade', data: data.grade }
    if (data.moving) streams.moving = { type: 'moving', data: data.moving }
  }

  // Fallback: If latlng is missing or invalid (scalars), try the /map endpoint
  // Intervals.icu sometimes separates high-res map data or provides it only via /map for certain activity types
  const hasValidMap =
    streams.latlng &&
    Array.isArray(streams.latlng.data) &&
    streams.latlng.data.length > 0 &&
    Array.isArray((streams.latlng.data as any[])[0])

  if (!hasValidMap) {
    try {
      const mapUrl = `https://intervals.icu/api/v1/activity/${activityId}/map`
      // console.log(`[Intervals Sync] Fetching map fallback: ${mapUrl}`)
      const mapResponse = await fetchWithRetry(mapUrl, { headers })

      if (mapResponse.ok) {
        const mapData = await mapResponse.json()
        if (mapData && Array.isArray(mapData.latlngs) && mapData.latlngs.length > 0) {
          // console.log(`[Intervals Sync] Retrieved ${mapData.latlngs.length} map points from /map endpoint`)
          streams.latlng = { type: 'latlng', data: mapData.latlngs }
        }
      }
    } catch (error) {
      console.warn(`[Intervals Sync] Failed to fetch map fallback for ${activityId}:`, error)
    }
  }

  return streams
}

function convertIntervalsZones(
  zones: number[] | null,
  names: string[] | null,
  type: 'hr' | 'power' | 'pace',
  ftp?: number | null
): Array<{ min: number; max: number; name: string }> | null {
  if (!zones || zones.length === 0) return null

  const result = []
  let prevMax = 0

  for (let i = 0; i < zones.length; i++) {
    const rawValue = zones[i]
    if (typeof rawValue !== 'number') continue

    let max: number = rawValue
    const min: number = prevMax

    // Handle Power Percentages
    if (type === 'power') {
      if (!ftp) return null // Cannot calculate power zones without FTP

      // Calculate absolute watts from percentage
      // Intervals uses integer percentages (e.g. 55 for 55%)
      max = Math.round((rawValue / 100) * ftp)

      // If it's the last zone (often 999 or similar high number for "Max")
      // The calculation above will result in a very high watt number (e.g. 2000W+), which is fine.
    }

    // Handle Pace (placeholder logic as units vary significantly - min/km vs m/s)
    // If we receive raw values, we map them as is for now.
    // Ideally we'd normalize to m/s if they are in seconds/100m or similar.

    const name: string = (names && names[i]) || `Zone ${i + 1}`

    result.push({
      min,
      max,
      name
    })

    prevMax = max
  }

  return result
}
