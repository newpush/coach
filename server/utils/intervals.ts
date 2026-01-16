import type { Integration } from '@prisma/client'

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
  name: string
  description?: string
  type?: string
  category?: string
  duration?: number
  distance?: number
  tss?: number
  work?: number
  workout_doc?: any
  [key: string]: any
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
  const dateStr = `${year}-${month}-${day}T06:00:00` // Set to 6am local to be safe? Or 00:00?
  // Let's use T00:00:00 for now, but be aware Intervals might shift it if athlete settings differ.
  // Actually, keeping original logic for time-preservation if passed, but defaulting to safe calendar day.

  // const hour = String(data.date.getHours()).padStart(2, '0')
  // const minute = String(data.date.getMinutes()).padStart(2, '0')
  // const second = String(data.date.getSeconds()).padStart(2, '0')
  // const dateStr = `${year}-${month}-${day}T${hour}:${minute}:${second}`

  const workoutText = data.workout_doc || ''
  let combinedDescription = data.description
    ? `${data.description}\n\n${workoutText}`.trim()
    : workoutText

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
  }
): Promise<IntervalsPlannedWorkout> {
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
    dateStr = `${year}-${month}-${day}T00:00:00`
  }

  const eventData: any = {}
  if (dateStr) eventData.start_date_local = dateStr
  if (data.title) eventData.name = data.title

  // Handle workout doc / description merge
  if (data.workout_doc || data.description !== undefined) {
    const workoutText = data.workout_doc || ''
    const description = data.description || ''
    let combinedDescription = `${description}\n\n${workoutText}`.trim()

    // Append CoachWatts signature if managed by us
    if (data.managedBy === 'COACH_WATTS' && !combinedDescription.includes('[CoachWatts]')) {
      combinedDescription = `${combinedDescription}\n\n[CoachWatts]`.trim()
    }

    eventData.description = combinedDescription

    // Don't send duration/tss if we have workout structure, let Intervals calculate it
    // Unless specifically requested? Usually safer to let Intervals calc it.
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

  // Fetch recent wellness data (last 7 days)
  const today = new Date()
  const sevenDaysAgo = new Date(today)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const wellnessData: any[] = []
  for (let i = 0; i < 7; i++) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]

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

  if (settings.length > 0) {
    // Look for cycling/ride FTP first
    const cyclingSettings = settings.find(
      (s: any) => s.types && (s.types.includes('Ride') || s.types.includes('VirtualRide'))
    )

    if (cyclingSettings) {
      ftp = cyclingSettings.ftp
      lthr = cyclingSettings.lthr
      maxHR = cyclingSettings.max_hr

      // Extract Zones (Handle both formats)

      // 1. New Format (sportSettings has direct arrays)
      if (cyclingSettings.hr_zones && cyclingSettings.hr_zone_names) {
        // hr_zones are typically upper bounds? Or boundaries?
        // Example: [135, 150, 156, 167, 172, 177, 185] (last one matches max_hr)
        // We'll assume these are upper bounds for each zone 1..N
        hrZones = cyclingSettings.hr_zones.map((max: number, index: number) => {
          const prevMax = index === 0 ? 0 : cyclingSettings.hr_zones[index - 1]
          // Prefix with Z{i} if needed
          let name = cyclingSettings.hr_zone_names[index] || `Z${index + 1}`
          if (!name.startsWith('Z')) {
            name = `Z${index + 1} ${name}`
          }

          return {
            name,
            min: index === 0 ? 0 : prevMax + 1,
            max: max
          }
        })
      }

      if (cyclingSettings.power_zones && cyclingSettings.power_zone_names) {
        // power_zones are usually % of FTP in the new format
        // Example: [55, 75, 90, 105, 120, 150, 999]
        const threshold = ftp || 1
        powerZones = cyclingSettings.power_zones.map((val: number, index: number) => {
          const prevVal = index === 0 ? 0 : cyclingSettings.power_zones[index - 1]
          const prevMaxAbs = Math.round((prevVal / 100) * threshold)

          // Prefix with Z{i} if needed
          let name = cyclingSettings.power_zone_names[index] || `Z${index + 1}`
          if (!name.startsWith('Z') && !name.startsWith('SS')) {
            name = `Z${index + 1} ${name}`
          }

          return {
            name,
            min: index === 0 ? 0 : prevMaxAbs + 1,
            max: val >= 900 ? 2000 : Math.round((val / 100) * threshold) // Handle 999 as infinity/high
          }
        })
      }

      // 2. Legacy Format (icu_type_settings had training_zones array)
      if (!hrZones && cyclingSettings.training_zones) {
        // HR Zones
        const hrZ = cyclingSettings.training_zones.find((z: any) => z.type === 'HEART_RATE')
        if (hrZ && hrZ.zones) {
          // Intervals zones are usually % of LTHR
          // We need absolute values for our UI
          const threshold = lthr || 1
          hrZones = hrZ.zones.map((z: any) => ({
            name: z.id || z.name, // e.g. "Z1"
            min: Math.round((z.min / 100) * threshold),
            max: z.max ? Math.round((z.max / 100) * threshold) : maxHR || 200
          }))
        }

        // Power Zones
        const powerZ = cyclingSettings.training_zones.find((z: any) => z.type === 'POWER')
        if (powerZ && powerZ.zones) {
          const threshold = ftp || 1
          powerZones = powerZ.zones.map((z: any) => ({
            name: z.id || z.name, // e.g. "Z1"
            min: Math.round((z.min / 100) * threshold),
            max: z.max ? Math.round((z.max / 100) * threshold) : 999
          }))
        }
      }
    } else {
      // Use first type setting with FTP
      const firstWithFtp = settings.find((s: any) => s.ftp)
      if (firstWithFtp) {
        ftp = firstWithFtp.ftp
        lthr = firstWithFtp.lthr
        maxHR = firstWithFtp.max_hr
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
    sex: athlete.sex || null,
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
    measurementPreference: athlete.measurement_preference || null
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

    currentDate.setDate(currentDate.getDate() + 1)
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
    maxWatts: activity.max_watts || null,
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
    const line = lines[i].trim()
    // Heuristics for Intervals.icu workout text start
    if (
      /^(Warmup|Cooldown|Main Set)$/i.test(line) || // Section headers
      /^(\d+x|(- )?\d+(m|s|h)\s+\d+)/.test(line) // Steps (Nx, 10m 50%, - Step 10m...)
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

  return {
    userId,
    externalId: String(event.id), // Convert to string
    // Parse the local date string (YYYY-MM-DDTHH:mm:ss) and force to UTC midnight
    // This ensures that "2026-01-15T06:00:00" becomes 2026-01-15T00:00:00Z in our DB
    date: new Date(new Date(event.start_date_local).toISOString().split('T')[0] + 'T00:00:00Z'),
    title: event.name || 'Unnamed Event',
    description: description,
    type: event.type || null,
    category: event.category || 'WORKOUT',
    durationSec: durationSec ? Math.round(durationSec) : null,
    distanceMeters: distance ? Math.round(distance) : null,
    tss: tss ? Math.round(tss * 10) / 10 : null,
    workIntensity: workIntensity ? Math.round(workIntensity * 100) / 100 : null,
    structuredWorkout,
    completed: false,
    managedBy: isCoachWatts ? 'COACH_WATTS' : 'USER',
    rawJson: event
  }
}

function mapIntervalsMood(val: number | undefined | null): number | null {
  if (!val) return null
  // Intervals: 1=Great, 2=Good, 3=Avg, 4=Bad
  // Coach Watts (1-10): 10=Great
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

export function normalizeIntervalsWellness(
  wellness: IntervalsWellness,
  userId: string,
  date: Date
) {
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
    sleepScore: wellness.sleepScore || null,
    sleepQuality: wellness.sleepQuality || null,

    // Recovery
    readiness: wellness.readiness || null,
    recoveryScore: null, // Not directly available from Intervals.icu

    // Subjective
    soreness: mapIntervalsSoreness(wellness.soreness),
    fatigue: wellness.fatigue || null,
    stress: wellness.stress || null,
    mood: mapIntervalsMood(wellness.mood),
    motivation: wellness.motivation || null,

    // Physical
    weight: wellness.weight || null,
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
        // Special handling for latlng which might be split into lat and lon in some versions,
        // but here we map the common ones.
        streams[item.type] = { type: item.type, data: item.data }
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

  return streams
}
