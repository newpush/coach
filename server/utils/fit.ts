// @ts-ignore
import FitParser from 'fit-file-parser'

/**
 * Parsed FIT file data structure
 */
export interface FitData {
  protocolVersion: number
  profileVersion: number
  activity: any
  sessions: any[]
  laps: any[]
  records: any[]
  events: any[]
  device_infos: any[]
  [key: string]: any
}

/**
 * Parse a FIT file buffer into a structured object
 */
export function parseFitFile(buffer: Buffer): Promise<FitData> {
  return new Promise((resolve, reject) => {
    const fitParser = new FitParser({
      force: true,
      speedUnit: 'm/s', // Consistent with database units
      lengthUnit: 'm',
      temperatureUnit: 'celsius',
      elapsedRecordField: true,
      mode: 'list',
    })

    fitParser.parse(buffer, (error: any, data: any) => {
      if (error) {
        reject(error)
      } else {
        resolve(data)
      }
    })
  })
}

/**
 * Normalize FIT session data to Workout model
 */
export function normalizeFitSession(session: any, userId: string, filename: string) {
  // Map sport to type
  let type = 'Other'
  if (session.sport === 'cycling') type = 'Ride'
  else if (session.sport === 'running') type = 'Run'
  else if (session.sport === 'swimming') type = 'Swim'
  else if (session.sport === 'training') type = 'Gym'
  
  // Calculate power/HR metrics
  const avgWatts = session.avg_power ? Math.round(session.avg_power) : null
  const avgHr = session.avg_heart_rate ? Math.round(session.avg_heart_rate) : null
  
  // Calculate variability index if possible
  let variabilityIndex = null
  if (session.normalized_power && avgWatts) {
    variabilityIndex = Math.round((session.normalized_power / avgWatts) * 100) / 100
  }

  // Determine title from date and type if not provided
  const date = new Date(session.start_time)
  const title = `${type} - ${date.toLocaleDateString()}`

  return {
    userId,
    externalId: `fit_${date.getTime()}_${filename}`, // Unique ID based on timestamp and filename
    source: 'fit_file',
    date,
    title,
    description: `Imported from ${filename}`,
    type,
    
    // Duration & Distance
    durationSec: Math.round(session.total_timer_time || session.total_elapsed_time || 0),
    elapsedTimeSec: Math.round(session.total_elapsed_time || 0),
    distanceMeters: session.total_distance || null,
    elevationGain: session.total_ascent ? Math.round(session.total_ascent) : null,
    
    // Power
    averageWatts: avgWatts,
    maxWatts: session.max_power ? Math.round(session.max_power) : null,
    normalizedPower: session.normalized_power ? Math.round(session.normalized_power) : null,
    weightedAvgWatts: session.normalized_power ? Math.round(session.normalized_power) : null,
    variabilityIndex,
    
    // Heart Rate
    averageHr: avgHr,
    maxHr: session.max_heart_rate ? Math.round(session.max_heart_rate) : null,
    
    // Cadence & Speed
    averageCadence: session.avg_cadence ? Math.round(session.avg_cadence) : null,
    maxCadence: session.max_cadence ? Math.round(session.max_cadence) : null,
    averageSpeed: session.avg_speed || null,
    
    // Load metrics
    tss: session.training_stress_score || null,
    intensity: session.intensity_factor || null,
    kilojoules: session.total_work ? Math.round(session.total_work / 1000) : null,
    calories: session.total_calories || null,
    
    // Environment
    avgTemp: session.avg_temperature || null,
    
    // Metadata
    isDuplicate: false
  }
}

/**
 * Extract time-series streams from FIT records
 */
export function extractFitStreams(records: any[]) {
  const streams: Record<string, any[]> = {
    time: [],
    distance: [],
    velocity: [], // pace/speed
    heartrate: [],
    cadence: [],
    watts: [],
    altitude: [],
    latlng: [],
    grade: [],
    moving: []
  }

  records.forEach((record: any) => {
    // Only include records with timestamps
    if (!record.timestamp) return

    // Base time/distance
    if (record.elapsed_time !== undefined) streams.time.push(record.elapsed_time)
    if (record.distance !== undefined) streams.distance.push(record.distance)
    
    // Metrics
    if (record.speed !== undefined) streams.velocity.push(record.speed)
    if (record.heart_rate !== undefined) streams.heartrate.push(record.heart_rate)
    if (record.cadence !== undefined) streams.cadence.push(record.cadence)
    if (record.power !== undefined) streams.watts.push(record.power)
    if (record.altitude !== undefined) streams.altitude.push(record.altitude)
    if (record.grade !== undefined) streams.grade.push(record.grade)
    
    // GPS
    if (record.position_lat && record.position_long) {
      streams.latlng.push([record.position_lat, record.position_long])
    }
  })

  return streams
}
