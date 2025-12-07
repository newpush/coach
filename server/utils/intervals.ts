import type { Integration } from '@prisma/client'

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

export async function createIntervalsPlannedWorkout(
  integration: Integration,
  data: {
    date: Date
    title: string
    description?: string
    type: string
    durationSec?: number
    tss?: number
  }
): Promise<IntervalsPlannedWorkout> {
  const athleteId = integration.externalUserId || 'i0'
  
  // Map workout types to Intervals.icu format
  let category = 'WORKOUT'
  let sport = data.type
  
  // Handle Gym workouts - use "WeightTraining" (no space) for Intervals.icu
  if (data.type === 'Gym') {
    sport = 'WeightTraining'
  }
  
  // Format date as ISO datetime string (YYYY-MM-DDTHH:mm:ss) - preserving time
  const year = data.date.getFullYear()
  const month = String(data.date.getMonth() + 1).padStart(2, '0')
  const day = String(data.date.getDate()).padStart(2, '0')
  const hour = String(data.date.getHours()).padStart(2, '0')
  const minute = String(data.date.getMinutes()).padStart(2, '0')
  const second = String(data.date.getSeconds()).padStart(2, '0')
  const dateStr = `${year}-${month}-${day}T${hour}:${minute}:${second}`
  
  const eventData = {
    start_date_local: dateStr,
    name: data.title,
    description: data.description || '',
    category,
    type: sport,
    duration: data.durationSec,
    tss: data.tss
  }
  
  console.log('[createIntervalsPlannedWorkout] 📤 Sending to Intervals.icu:', {
    athleteId,
    url: `https://intervals.icu/api/v1/athlete/${athleteId}/events`,
    eventData
  })
  
  const url = `https://intervals.icu/api/v1/athlete/${athleteId}/events`
  const auth = Buffer.from(`API_KEY:${integration.accessToken}`).toString('base64')
    
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(eventData)
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
  const athleteId = integration.externalUserId || 'i0'
  
  const url = `https://intervals.icu/api/v1/athlete/${athleteId}/events/${eventId}`
  const auth = Buffer.from(`API_KEY:${integration.accessToken}`).toString('base64')
    
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Basic ${auth}`
    }
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
  }
): Promise<IntervalsPlannedWorkout> {
  const athleteId = integration.externalUserId || 'i0'
  
  // Map workout types to Intervals.icu format
  let sport = data.type
  if (data.type === 'Gym') {
    sport = 'WeightTraining'
  }
  
  // Format date if provided
  let dateStr: string | undefined
  if (data.date) {
    const year = data.date.getFullYear()
    const month = String(data.date.getMonth() + 1).padStart(2, '0')
    const day = String(data.date.getDate()).padStart(2, '0')
    dateStr = `${year}-${month}-${day}T00:00:00`
  }
  
  const eventData: any = {}
  if (dateStr) eventData.start_date_local = dateStr
  if (data.title) eventData.name = data.title
  if (data.description !== undefined) eventData.description = data.description
  if (sport) eventData.type = sport
  if (data.durationSec) eventData.duration = data.durationSec
  if (data.tss) eventData.tss = data.tss
  
  const url = `https://intervals.icu/api/v1/athlete/${athleteId}/events/${eventId}`
  const auth = Buffer.from(`API_KEY:${integration.accessToken}`).toString('base64')
    
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(eventData)
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Intervals API error: ${response.status} ${errorText}`)
  }
  
  return await response.json()
}

export async function fetchIntervalsPlannedWorkouts(
  integration: Integration,
  startDate: Date,
  endDate: Date
): Promise<IntervalsPlannedWorkout[]> {
  const athleteId = integration.externalUserId || 'i0'
  
  const url = new URL(`https://intervals.icu/api/v1/athlete/${athleteId}/events`)
  url.searchParams.set('oldest', startDate.toISOString().split('T')[0])
  url.searchParams.set('newest', endDate.toISOString().split('T')[0])
  
  const auth = Buffer.from(`API_KEY:${integration.accessToken}`).toString('base64')
    
  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Basic ${auth}`
    }
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
  const athleteId = integration.externalUserId || 'i0' // i0 means "current authenticated user"
  
  const url = new URL(`https://intervals.icu/api/v1/athlete/${athleteId}/activities`)
  url.searchParams.set('oldest', startDate.toISOString().split('T')[0])
  url.searchParams.set('newest', endDate.toISOString().split('T')[0])
  
  // Intervals.icu API expects Basic Auth with "API_KEY" as username and the API key as password
  const auth = Buffer.from(`API_KEY:${integration.accessToken}`).toString('base64')
    
  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Basic ${auth}`
    }
  })
  
  if (!response.ok) {
    throw new Error(`Intervals API error: ${response.status} ${response.statusText}`)
  }
  
  return await response.json()
}

export async function fetchIntervalsAthlete(accessToken: string, athleteId?: string): Promise<IntervalsAthlete> {
  // Intervals.icu API expects Basic Auth with "API_KEY" as username and the API key as password
  // The athlete ID must be provided in the URL path
  
  if (!athleteId) {
    throw new Error('Athlete ID is required')
  }
  
  const auth = Buffer.from(`API_KEY:${accessToken}`).toString('base64')
  
  const response = await fetch(`https://intervals.icu/api/v1/athlete/${athleteId}`, {
    headers: {
      'Authorization': `Basic ${auth}`
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
  const athleteId = integration.externalUserId || 'i0'
  const auth = Buffer.from(`API_KEY:${integration.accessToken}`).toString('base64')
  
  // Fetch athlete data
  const athleteResponse = await fetch(`https://intervals.icu/api/v1/athlete/${athleteId}`, {
    headers: {
      'Authorization': `Basic ${auth}`
    }
  })
  
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
      const wellnessResponse = await fetch(
        `https://intervals.icu/api/v1/athlete/${athleteId}/wellness/${dateStr}`,
        {
          headers: {
            'Authorization': `Basic ${auth}`
          }
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
  let ftp = null
  let lthr = null
  let maxHR = null
  
  if (athlete.icu_type_settings && athlete.icu_type_settings.length > 0) {
    // Look for cycling/ride FTP first
    const cyclingSettings = athlete.icu_type_settings.find((s: any) =>
      s.types && (s.types.includes('Ride') || s.types.includes('VirtualRide'))
    )
    if (cyclingSettings) {
      ftp = cyclingSettings.ftp
      lthr = cyclingSettings.lthr
      maxHR = cyclingSettings.max_hr
    } else {
      // Use first type setting with FTP
      const firstWithFtp = athlete.icu_type_settings.find((s: any) => s.ftp)
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
  const recentHrvValues = wellnessData
    .map(d => d.hrv)
    .filter(v => v != null)
  const avgRecentHRV = recentHrvValues.length > 0
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
    
    // Recent wellness
    recentHRV: wellnessData.length > 0 ? wellnessData[0].hrv : null,
    avgRecentHRV: avgRecentHRV ? Math.round(avgRecentHRV * 10) / 10 : null,
    recentWeight: wellnessData.find(d => d.weight)?.weight || null,
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
  const athleteId = integration.externalUserId || 'i0'
  
  const wellness: IntervalsWellness[] = []
  
  // Fetch wellness data for each day in the range
  const currentDate = new Date(startDate)
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0]
    const url = `https://intervals.icu/api/v1/athlete/${athleteId}/wellness/${dateStr}`
    
    const auth = Buffer.from(`API_KEY:${integration.accessToken}`).toString('base64')
    
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Basic ${auth}`
        }
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
    // Use start_date (UTC) if available, otherwise fall back to local (which might be imprecise depending on server timezone)
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
    intensity: activity.icu_intensity || activity.intensity || null,
    kilojoules: activity.icu_joules || null,
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
    rpe: activity.perceived_exertion || null,
    sessionRpe: activity.session_rpe || null,
    feel: activity.feel || null,
    
    // Environmental
    avgTemp: activity.average_temp || null,
    trainer: activity.trainer || null,
    
    // Balance
    lrBalance: activity.avg_lr_balance || null,
    
    // Store raw data
    rawJson: activity
  }
}

export function normalizeIntervalsPlannedWorkout(event: IntervalsPlannedWorkout, userId: string) {
  return {
    userId,
    externalId: String(event.id), // Convert to string
    date: new Date(event.start_date_local),
    title: event.name || 'Unnamed Event',
    description: event.description || null,
    type: event.type || null,
    category: event.category || 'WORKOUT',
    durationSec: event.duration || null,
    distanceMeters: event.distance || null,
    tss: event.tss || null,
    workIntensity: event.work || null,
    completed: false,
    workoutId: null,
    rawJson: event
  }
}

export function normalizeIntervalsWellness(wellness: IntervalsWellness, userId: string, date: Date) {
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
    soreness: wellness.soreness || null,
    fatigue: wellness.fatigue || null,
    stress: wellness.stress || null,
    mood: wellness.mood || null,
    motivation: wellness.motivation || null,
    
    // Physical
    weight: wellness.weight || null,
    spO2: wellness.spO2 || null,
    
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
  const athleteId = integration.externalUserId || 'i0'
  const auth = Buffer.from(`API_KEY:${integration.accessToken}`).toString('base64')
  
  const url = `https://intervals.icu/api/v1/activity/${activityId}/streams`
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Basic ${auth}`
    }
  })
  
  if (!response.ok) {
    if (response.status === 404) {
      // Activity doesn't have stream data
      return {}
    }
    throw new Error(`Intervals API error: ${response.status} ${response.statusText}`)
  }
  
  const rawStreams = await response.json()
  
  // Transform Intervals.icu stream format to match our expected format
  // Intervals returns: { watts: [values], heartrate: [values], time: [values], etc }
  const streams: Record<string, IntervalsStream> = {}
  
  if (rawStreams.time) {
    streams.time = { type: 'time', data: rawStreams.time }
  }
  if (rawStreams.distance) {
    streams.distance = { type: 'distance', data: rawStreams.distance }
  }
  if (rawStreams.velocity) {
    streams.velocity = { type: 'velocity', data: rawStreams.velocity }
  }
  if (rawStreams.heartrate || rawStreams.hr) {
    streams.heartrate = { type: 'heartrate', data: rawStreams.heartrate || rawStreams.hr }
  }
  if (rawStreams.cadence || rawStreams.cad) {
    streams.cadence = { type: 'cadence', data: rawStreams.cadence || rawStreams.cad }
  }
  if (rawStreams.watts) {
    streams.watts = { type: 'watts', data: rawStreams.watts }
  }
  if (rawStreams.altitude || rawStreams.alt) {
    streams.altitude = { type: 'altitude', data: rawStreams.altitude || rawStreams.alt }
  }
  if (rawStreams.lat && rawStreams.lon) {
    // Combine lat/lon into latlng pairs
    const latlng: [number, number][] = []
    for (let i = 0; i < rawStreams.lat.length; i++) {
      latlng.push([rawStreams.lat[i], rawStreams.lon[i]])
    }
    streams.latlng = { type: 'latlng', data: latlng }
  }
  if (rawStreams.grade) {
    streams.grade = { type: 'grade', data: rawStreams.grade }
  }
  if (rawStreams.moving) {
    streams.moving = { type: 'moving', data: rawStreams.moving }
  }
  
  return streams
}