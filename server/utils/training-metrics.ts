import { prisma } from './db'

/**
 * Training Metrics Utility
 *
 * Provides comprehensive training statistics for LLM prompt contexts:
 * - Zone distribution (HR/Power zones)
 * - Load management (TSB/CTL/ATL trends)
 * - Activity type breakdowns
 * - Training volume and intensity patterns
 */

/**
 * Calculate TSB (Training Stress Balance) - "Form"
 * TSB = CTL - ATL
 * Returns null if either value is null
 */
function calculateTSB(ctl: number | null, atl: number | null): number | null {
  if (ctl === null || atl === null) return null
  return ctl - atl
}

// Default zone definitions matching frontend
const DEFAULT_HR_ZONES = [
  { name: 'Z1', min: 60, max: 120 },
  { name: 'Z2', min: 121, max: 145 },
  { name: 'Z3', min: 146, max: 160 },
  { name: 'Z4', min: 161, max: 175 },
  { name: 'Z5', min: 176, max: 220 }
]

const DEFAULT_POWER_ZONES = [
  { name: 'Z1', min: 0, max: 137 },
  { name: 'Z2', min: 138, max: 187 },
  { name: 'Z3', min: 188, max: 225 },
  { name: 'Z4', min: 226, max: 262 },
  { name: 'Z5', min: 263, max: 999 }
]

interface Zone {
  name: string
  min: number
  max: number
}

interface ZoneDistribution {
  type: 'hr' | 'power'
  zones: {
    name: string
    timeSeconds: number
    percentage: number
  }[]
  totalTime: number
}

interface LoadTrend {
  date: Date
  ctl: number | null
  atl: number | null
  tsb: number | null
}

interface ActivityBreakdown {
  type: string
  count: number
  totalDuration: number
  totalDistance: number
  totalTSS: number
  avgTSS: number
}

interface TrainingContext {
  period: string
  summary: {
    totalWorkouts: number
    totalDuration: number
    totalDistance: number
    totalTSS: number
    avgTSS: number
  }
  loadTrend: {
    currentCTL: number | null
    currentATL: number | null
    currentTSB: number | null
    trend: 'increasing' | 'stable' | 'decreasing' | 'unknown'
    weeklyTSSAvg: number
  }
  activityBreakdown: ActivityBreakdown[]
  zoneDistribution?: ZoneDistribution
  intensityDistribution: {
    recovery: number  // < 0.70 IF
    endurance: number // 0.70-0.85 IF
    tempo: number     // 0.85-0.95 IF
    threshold: number // 0.95-1.05 IF
    vo2max: number    // > 1.05 IF
  }
}

/**
 * Calculate Training Stress Score using the same fallback logic as the frontend
 */
export function calculateTSS(workout: any): number {
  return workout.tss ?? workout.trimp ?? workout.plannedTss ?? 0
}

/**
 * Get zone index for a value given zone definitions
 */
function getZoneIndex(value: number, zones: Zone[]): number {
  for (let i = 0; i < zones.length; i++) {
    if (value >= zones[i].min && value <= zones[i].max) {
      return i
    }
  }
  
  // If value is above all zones, put it in the highest zone
  if (value > zones[zones.length - 1].max) {
    return zones.length - 1
  }
  
  return -1
}

/**
 * Calculate zone distribution from workout streams
 */
export async function calculateZoneDistribution(
  workoutIds: string[],
  userId: string,
  options: { preferPower?: boolean } = {}
): Promise<ZoneDistribution | null> {
  if (workoutIds.length === 0) return null
  
  // Fetch user's zone definitions
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { hrZones: true, powerZones: true }
  })
  
  const hrZones = (user?.hrZones as unknown as Zone[]) || DEFAULT_HR_ZONES
  const powerZones = (user?.powerZones as unknown as Zone[]) || DEFAULT_POWER_ZONES
  
  // Fetch streams for all workouts
  const streams = await prisma.workoutStream.findMany({
    where: { workoutId: { in: workoutIds } },
    select: {
      heartrate: true,
      watts: true,
      hrZoneTimes: true,
      powerZoneTimes: true
    }
  })
  
  if (streams.length === 0) return null
  
  // Aggregate zone times
  const hrZoneTimes = new Array(5).fill(0)
  const powerZoneTimes = new Array(5).fill(0)
  let hasHrData = false
  let hasPowerData = false
  
  for (const stream of streams) {
    const s = stream as any
    // Check for cached zone times first
    if (s.hrZoneTimes && Array.isArray(s.hrZoneTimes) && (s.hrZoneTimes as number[]).length >= 5) {
      hasHrData = true
      const cached = s.hrZoneTimes as number[]
      for (let i = 0; i < 5; i++) {
        hrZoneTimes[i] += cached[i]
      }
    } else if (stream.heartrate && Array.isArray(stream.heartrate)) {
      // Process HR zones from raw stream
      hasHrData = true
      for (const hr of stream.heartrate as number[]) {
        if (hr === null || hr === undefined) continue
        const zoneIndex = getZoneIndex(hr, hrZones)
        if (zoneIndex >= 0) hrZoneTimes[zoneIndex]++
      }
    }
    
    // Process Power zones
    if (s.powerZoneTimes && Array.isArray(s.powerZoneTimes) && (s.powerZoneTimes as number[]).length >= 5) {
        hasPowerData = true
        const cached = s.powerZoneTimes as number[]
        for (let i = 0; i < 5; i++) {
            powerZoneTimes[i] += cached[i]
        }
    } else if (stream.watts && Array.isArray(stream.watts)) {
      hasPowerData = true
      for (const watts of stream.watts as number[]) {
        if (watts === null || watts === undefined) continue
        const zoneIndex = getZoneIndex(watts, powerZones)
        if (zoneIndex >= 0) powerZoneTimes[zoneIndex]++
      }
    }
  }
  
  // Prefer power if available (or if explicitly requested), otherwise use HR
  const usePower = options.preferPower ? hasPowerData : (hasPowerData || !hasHrData)
  const zoneTimes = usePower ? powerZoneTimes : hrZoneTimes
  const zones = usePower ? powerZones : hrZones
  const type = usePower ? 'power' as const : 'hr' as const
  
  if (!usePower && !hasHrData) return null
  
  const totalTime = zoneTimes.reduce((sum, time) => sum + time, 0)
  if (totalTime === 0) return null
  
  return {
    type,
    zones: zones.map((zone, index) => ({
      name: zone.name,
      timeSeconds: zoneTimes[index],
      percentage: (zoneTimes[index] / totalTime) * 100
    })),
    totalTime
  }
}

/**
 * Calculate load trends from workouts and wellness data
 */
export async function calculateLoadTrends(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<LoadTrend[]> {
  // Fetch workouts with CTL/ATL data
  const workouts = await prisma.workout.findMany({
    where: {
      userId,
      date: { gte: startDate, lte: endDate }
    },
    select: {
      date: true,
      ctl: true,
      atl: true
    },
    orderBy: { date: 'asc' }
  })
  
  // Also fetch wellness data which may have CTL/ATL
  const wellness = await prisma.wellness.findMany({
    where: {
      userId,
      date: { gte: startDate, lte: endDate }
    },
    select: {
      date: true,
      ctl: true,
      atl: true
    },
    orderBy: { date: 'asc' }
  })
  
  // Merge and deduplicate by date, preferring workout data
  const trendMap = new Map<string, LoadTrend>()
  
  for (const w of wellness) {
    const dateKey = w.date.toISOString().split('T')[0]
    trendMap.set(dateKey, {
      date: w.date,
      ctl: w.ctl,
      atl: w.atl,
      tsb: calculateTSB(w.ctl, w.atl)
    })
  }
  
  for (const w of workouts) {
    const dateKey = w.date.toISOString().split('T')[0]
    trendMap.set(dateKey, {
      date: w.date,
      ctl: w.ctl,
      atl: w.atl,
      tsb: calculateTSB(w.ctl, w.atl)
    })
  }
  
  return Array.from(trendMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime())
}

/**
 * Calculate activity type breakdown
 */
export async function calculateActivityBreakdown(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<ActivityBreakdown[]> {
  const workouts = await prisma.workout.findMany({
    where: {
      userId,
      date: { gte: startDate, lte: endDate },
      durationSec: { gt: 0 }
    },
    select: {
      type: true,
      durationSec: true,
      distanceMeters: true,
      tss: true,
      trimp: true
    }
  })
  
  const breakdown = new Map<string, ActivityBreakdown>()
  
  for (const workout of workouts) {
    const type = workout.type || 'Unknown'
    const tss = calculateTSS(workout)
    
    if (!breakdown.has(type)) {
      breakdown.set(type, {
        type,
        count: 0,
        totalDuration: 0,
        totalDistance: 0,
        totalTSS: 0,
        avgTSS: 0
      })
    }
    
    const current = breakdown.get(type)!
    current.count++
    current.totalDuration += workout.durationSec
    current.totalDistance += workout.distanceMeters || 0
    current.totalTSS += tss
  }
  
  // Calculate averages
  for (const b of breakdown.values()) {
    b.avgTSS = b.count > 0 ? b.totalTSS / b.count : 0
  }
  
  return Array.from(breakdown.values()).sort((a, b) => b.totalTSS - a.totalTSS)
}

/**
 * Calculate intensity distribution based on Intensity Factor (IF)
 */
export async function calculateIntensityDistribution(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<TrainingContext['intensityDistribution']> {
  const workouts = await prisma.workout.findMany({
    where: {
      userId,
      date: { gte: startDate, lte: endDate },
      intensity: { not: null }
    },
    select: {
      id: true,
      type: true,
      intensity: true,
      durationSec: true,
      date: true
    }
  })
  
  console.log('[TrainingMetrics] Intensity Distribution Debug:')
  console.log(`  Found ${workouts.length} workouts with intensity data`)
  
  const distribution = {
    recovery: 0,
    endurance: 0,
    tempo: 0,
    threshold: 0,
    vo2max: 0
  }
  
  let totalTime = 0
  
  for (const workout of workouts) {
    let intensity = workout.intensity!
    const duration = workout.durationSec
    
    // Normalize intensity: Intensity Factor should be a decimal ratio (typically 0.5-1.5, rarely >2.0)
    // - If > 2.0: Invalid data (likely from old Strava calculation), skip this workout
    // - If 2.0-10: Stored as percentage, divide by 100
    // - Otherwise: Use as-is (intervals.icu provides correct decimal values)
    if (intensity > 2.0) {
      if (intensity <= 10) {
        // Stored as percentage (e.g., 8.8 for 88%)
        console.log(`  Workout ${workout.id} (${workout.type}): Raw IF=${intensity.toFixed(3)} (normalizing to ${(intensity / 100).toFixed(3)}), Duration=${duration}s`)
        intensity = intensity / 100
      } else if (intensity <= 200) {
        // Stored as percentage * 100 (e.g., 88.210 for 88.21%)
        console.log(`  Workout ${workout.id} (${workout.type}): Raw IF=${intensity.toFixed(3)} (normalizing to ${(intensity / 100).toFixed(3)}), Duration=${duration}s`)
        intensity = intensity / 100
      } else {
        // Invalid data (e.g., raw watts from bad Strava calculation)
        console.log(`  Workout ${workout.id} (${workout.type}): Invalid IF=${intensity.toFixed(3)}, skipping`)
        continue
      }
    } else {
      console.log(`  Workout ${workout.id} (${workout.type}): IF=${intensity.toFixed(3)}, Duration=${duration}s`)
    }
    
    totalTime += duration
    
    if (intensity < 0.70) {
      distribution.recovery += duration
      console.log(`    -> Recovery (<0.70)`)
    } else if (intensity < 0.85) {
      distribution.endurance += duration
      console.log(`    -> Endurance (0.70-0.85)`)
    } else if (intensity < 0.95) {
      distribution.tempo += duration
      console.log(`    -> Tempo (0.85-0.95)`)
    } else if (intensity <= 1.05) {
      distribution.threshold += duration
      console.log(`    -> Threshold (0.95-1.05)`)
    } else {
      distribution.vo2max += duration
      console.log(`    -> VO2 Max (>1.05)`)
    }
  }
  
  console.log(`  Total time: ${totalTime}s`)
  console.log(`  Distribution (seconds):`, distribution)
  
  // Convert to percentages
  if (totalTime > 0) {
    distribution.recovery = (distribution.recovery / totalTime) * 100
    distribution.endurance = (distribution.endurance / totalTime) * 100
    distribution.tempo = (distribution.tempo / totalTime) * 100
    distribution.threshold = (distribution.threshold / totalTime) * 100
    distribution.vo2max = (distribution.vo2max / totalTime) * 100
  }
  
  console.log(`  Distribution (percentages):`, distribution)
  
  return distribution
}

/**
 * Generate comprehensive training context for LLM prompts
 */
export async function generateTrainingContext(
  userId: string,
  startDate: Date,
  endDate: Date,
  options: {
    includeZones?: boolean
    period?: string
  } = {}
): Promise<TrainingContext> {
  const { includeZones = false, period = 'Recent Period' } = options
  
  // Fetch workouts
  const workouts = await prisma.workout.findMany({
    where: {
      userId,
      date: { gte: startDate, lte: endDate },
      durationSec: { gt: 0 }
    },
    select: {
      id: true,
      date: true,
      durationSec: true,
      distanceMeters: true,
      tss: true,
      trimp: true,
      ctl: true,
      atl: true,
      intensity: true,
      type: true
    },
    orderBy: { date: 'desc' }
  })
  
  // Calculate summary stats
  const summary = {
    totalWorkouts: workouts.length,
    totalDuration: workouts.reduce((sum, w) => sum + w.durationSec, 0),
    totalDistance: workouts.reduce((sum, w) => sum + (w.distanceMeters || 0), 0),
    totalTSS: workouts.reduce((sum, w) => sum + calculateTSS(w), 0),
    avgTSS: 0
  }
  summary.avgTSS = summary.totalWorkouts > 0 ? summary.totalTSS / summary.totalWorkouts : 0
  
  // Get latest load values
  const latestWorkout = workouts[0] // Already sorted by date desc
  const currentCTL = latestWorkout?.ctl || null
  const currentATL = latestWorkout?.atl || null
  const currentTSB = calculateTSB(currentCTL, currentATL)
  
  // Calculate weekly TSS average
  const daysDiff = Math.max(1, (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  const weeklyTSSAvg = (summary.totalTSS / daysDiff) * 7
  
  // Determine trend
  let trend: 'increasing' | 'stable' | 'decreasing' | 'unknown' = 'unknown'
  if (workouts.length >= 2) {
    const oldCTL = workouts[workouts.length - 1].ctl
    if (currentCTL !== null && oldCTL !== null) {
      const diff = currentCTL - oldCTL
      if (diff > 5) trend = 'increasing'
      else if (diff < -5) trend = 'decreasing'
      else trend = 'stable'
    }
  }
  
  // Get activity breakdown
  const activityBreakdown = await calculateActivityBreakdown(userId, startDate, endDate)
  
  // Get intensity distribution
  const intensityDistribution = await calculateIntensityDistribution(userId, startDate, endDate)
  
  // Optionally get zone distribution (expensive operation)
  let zoneDistribution: ZoneDistribution | undefined
  if (includeZones) {
    const workoutIds = workouts.map(w => w.id)
    zoneDistribution = await calculateZoneDistribution(workoutIds, userId) || undefined
  }
  
  return {
    period,
    summary,
    loadTrend: {
      currentCTL,
      currentATL,
      currentTSB,
      trend,
      weeklyTSSAvg
    },
    activityBreakdown,
    zoneDistribution,
    intensityDistribution
  }
}

/**
 * Format training context as a human-readable string for LLM prompts
 */
export function formatTrainingContextForPrompt(context: TrainingContext): string {
  const lines: string[] = []
  
  lines.push(`## Training Context: ${context.period}`)
  lines.push('')
  
  // Summary
  lines.push('### Overview')
  lines.push(`- Total Workouts: ${context.summary.totalWorkouts}`)
  lines.push(`- Total Duration: ${(context.summary.totalDuration / 3600).toFixed(1)} hours`)
  if (context.summary.totalDistance > 0) {
    lines.push(`- Total Distance: ${(context.summary.totalDistance / 1000).toFixed(0)} km`)
  }
  lines.push(`- Total TSS: ${Math.round(context.summary.totalTSS)}`)
  lines.push(`- Average TSS per workout: ${Math.round(context.summary.avgTSS)}`)
  lines.push('')
  
  // Load Management
  lines.push('### Training Load & Form')
  if (context.loadTrend.currentCTL !== null) {
    lines.push(`- Chronic Training Load (CTL/Fitness): ${context.loadTrend.currentCTL.toFixed(1)}`)
  }
  if (context.loadTrend.currentATL !== null) {
    lines.push(`- Acute Training Load (ATL/Fatigue): ${context.loadTrend.currentATL.toFixed(1)}`)
  }
  if (context.loadTrend.currentTSB !== null) {
    const tsb = context.loadTrend.currentTSB
    const formStatus = tsb > 25 ? 'Detraining' :
                      tsb > 5 ? 'Peak Form' :
                      tsb > -10 ? 'Maintenance' :
                      tsb > -25 ? 'Building Fitness' :
                      tsb > -40 ? 'High Fatigue' : 'Overreaching'
    lines.push(`- Training Stress Balance (TSB/Form): ${tsb > 0 ? '+' : ''}${tsb.toFixed(0)} (${formStatus})`)
  }
  lines.push(`- Weekly TSS Average: ${Math.round(context.loadTrend.weeklyTSSAvg)}`)
  lines.push(`- Fitness Trend: ${context.loadTrend.trend}`)
  lines.push('')
  
  // Activity Breakdown
  if (context.activityBreakdown.length > 0) {
    lines.push('### Activity Type Breakdown')
    for (const activity of context.activityBreakdown) {
      const hours = (activity.totalDuration / 3600).toFixed(1)
      const distance = activity.totalDistance > 0 ? `, ${(activity.totalDistance / 1000).toFixed(0)}km` : ''
      lines.push(`- **${activity.type}**: ${activity.count} workouts, ${hours}h${distance}, ${Math.round(activity.totalTSS)} TSS`)
    }
    lines.push('')
  }
  
  // Intensity Distribution
  lines.push('### Intensity Distribution (by time)')
  lines.push(`- Recovery (<70% IF): ${context.intensityDistribution.recovery.toFixed(1)}%`)
  lines.push(`- Endurance (70-85% IF): ${context.intensityDistribution.endurance.toFixed(1)}%`)
  lines.push(`- Tempo (85-95% IF): ${context.intensityDistribution.tempo.toFixed(1)}%`)
  lines.push(`- Threshold (95-105% IF): ${context.intensityDistribution.threshold.toFixed(1)}%`)
  lines.push(`- VO2 Max (>105% IF): ${context.intensityDistribution.vo2max.toFixed(1)}%`)
  lines.push('')
  
  // Zone Distribution (if available)
  if (context.zoneDistribution) {
    const type = context.zoneDistribution.type === 'hr' ? 'Heart Rate' : 'Power'
    lines.push(`### ${type} Zone Distribution`)
    for (const zone of context.zoneDistribution.zones) {
      if (zone.percentage > 0) {
        const hours = Math.floor(zone.timeSeconds / 3600)
        const minutes = Math.floor((zone.timeSeconds % 3600) / 60)
        const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
        lines.push(`- ${zone.name}: ${timeStr} (${zone.percentage.toFixed(1)}%)`)
      }
    }
    lines.push('')
  }
  
  return lines.join('\n')
}