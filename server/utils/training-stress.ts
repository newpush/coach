/**
 * Training Stress Metrics Calculation Service
 *
 * Implements the Performance Management Chart (PMC) methodology for tracking:
 * - CTL (Chronic Training Load) - 42-day weighted average representing "Fitness"
 * - ATL (Acute Training Load) - 7-day weighted average representing "Fatigue"
 * - TSB (Training Stress Balance) - CTL - ATL representing "Form"
 */

export interface PMCMetrics {
  date: Date
  ctl: number
  atl: number
  tsb: number
  tss: number
}

export interface FormStatus {
  status: string
  color: string
  description: string
}

/**
 * Calculate CTL (Chronic Training Load) - "Fitness"
 * Uses 42-day exponentially weighted moving average
 */
export function calculateCTL(previousCTL: number, todayTSS: number): number {
  const timeConstant = 42
  return previousCTL + (todayTSS - previousCTL) / timeConstant
}

/**
 * Calculate ATL (Acute Training Load) - "Fatigue"
 * Uses 7-day exponentially weighted moving average
 */
export function calculateATL(previousATL: number, todayTSS: number): number {
  const timeConstant = 7
  return previousATL + (todayTSS - previousATL) / timeConstant
}

/**
 * Calculate TSB (Training Stress Balance) - "Form"
 * TSB = CTL - ATL
 * Returns null if either value is null
 */
export function calculateTSB(ctl: number | null, atl: number | null): number | null {
  if (ctl === null || atl === null) return null
  return ctl - atl
}

/**
 * Get training stress score from workout
 * Prioritizes: power-based TSS > HRSS > TRIMP
 */
export function getStressScore(workout: any): number {
  return workout.tss ?? workout.hrss ?? workout.trimp ?? 0
}

/**
 * Get form status based on TSB value
 */
export function getFormStatus(tsb: number): FormStatus {
  if (tsb > 25) {
    return {
      status: 'No Fitness',
      color: 'gray',
      description: 'Resting too long; fitness declining'
    }
  }
  if (tsb > 5) {
    return {
      status: 'Performance',
      color: 'green',
      description: 'Fresh and ready to race; peak form'
    }
  }
  if (tsb > -10) {
    return {
      status: 'Maintenance',
      color: 'yellow',
      description: 'Neutral zone; maintaining fitness'
    }
  }
  if (tsb > -25) {
    return {
      status: 'Productive',
      color: 'blue',
      description: 'Optimal training zone; building fitness'
    }
  }
  if (tsb > -40) {
    return {
      status: 'Cautionary',
      color: 'orange',
      description: 'High fatigue; injury risk increasing'
    }
  }
  return {
    status: 'Overreaching',
    color: 'red',
    description: 'Severe fatigue; rest needed immediately'
  }
}

/**
 * Get TSB color class for UI
 */
export function getTSBColorClass(tsb: number | null): string {
  if (tsb === null) return 'text-gray-400'
  if (tsb >= 5) return 'text-green-600 dark:text-green-400'
  if (tsb >= -10) return 'text-yellow-600 dark:text-yellow-400'
  if (tsb >= -25) return 'text-blue-600 dark:text-blue-400'
  return 'text-red-600 dark:text-red-400'
}

/**
 * Calculate PMC metrics for a date range
 * Returns array of daily metrics with CTL/ATL/TSB
 */
export async function calculatePMCForDateRange(
  startDate: Date,
  endDate: Date,
  userId: string,
  initialCTL: number = 0,
  initialATL: number = 0
): Promise<PMCMetrics[]> {
  const { prisma } = await import('./db')

  const endDateTime = new Date(endDate)
  endDateTime.setUTCHours(23, 59, 59, 999)

  // Fetch workouts for TSS calculation
  const workouts = await prisma.workout.findMany({
    where: {
      userId,
      date: { gte: startDate, lte: endDateTime },
      isDuplicate: false
    },
    orderBy: { date: 'asc' }
  })

  // Fetch wellness data for "Source of Truth" CTL/ATL
  const wellness = await prisma.wellness.findMany({
    where: {
      userId,
      date: { gte: startDate, lte: endDateTime }
    },
    select: {
      date: true,
      ctl: true,
      atl: true
    }
  })

  let ctl = initialCTL
  let atl = initialATL
  const results: PMCMetrics[] = []

  // Map date string (YYYY-MM-DD) to daily TSS sum
  const dailyTSS = new Map<string, number>()
  for (const workout of workouts) {
    const dateKey = workout.date.toISOString().split('T')[0] ?? ''
    const tss = getStressScore(workout)
    dailyTSS.set(dateKey, (dailyTSS.get(dateKey) || 0) + tss)
  }

  // Map date string to "Known" CTL/ATL from Wellness (Source of Truth)
  // or use Workouts as fallback if Wellness is missing but Workout has valid CTL/ATL
  const knownMetrics = new Map<string, { ctl: number; atl: number }>()

  // 1. Populate from Wellness (Highest Priority)
  for (const w of wellness) {
    if (w.ctl !== null && w.atl !== null) {
      const dateKey = w.date.toISOString().split('T')[0] ?? ''
      knownMetrics.set(dateKey, { ctl: w.ctl, atl: w.atl })
    }
  }

  // 2. Populate from Workouts (Fallback)
  for (const w of workouts) {
    // Only use if not already set by Wellness
    const dateKey = w.date.toISOString().split('T')[0] ?? ''
    if (!knownMetrics.has(dateKey) && w.ctl !== null && w.atl !== null) {
      knownMetrics.set(dateKey, { ctl: w.ctl!, atl: w.atl! })
    }
  }

  // Iterate through each day in the range
  const currentDate = new Date(startDate)
  // Reset time to midnight UTC to avoid timezone issues
  currentDate.setUTCHours(0, 0, 0, 0)

  while (currentDate <= endDateTime) {
    const dateKey = currentDate.toISOString().split('T')[0] ?? ''
    const tss = dailyTSS.get(dateKey) || 0

    // Check if we have a known "Truth" value for this day
    const known = knownMetrics.get(dateKey)

    if (known) {
      // Resync our running calculation to the stored truth
      ctl = known.ctl
      atl = known.atl
    } else {
      // Calculate based on previous day
      ctl = calculateCTL(ctl, tss)
      atl = calculateATL(atl, tss)
    }

    const tsb = calculateTSB(ctl, atl)!

    results.push({
      date: new Date(currentDate),
      ctl,
      atl,
      tsb,
      tss
    })

    // Move to next day
    currentDate.setUTCDate(currentDate.getDate() + 1)
  }

  return results
}

/**
 * Get initial CTL/ATL values from last known workout OR wellness before date range
 */
export async function getInitialPMCValues(
  userId: string,
  beforeDate: Date
): Promise<{ ctl: number; atl: number }> {
  const { prisma } = await import('./db')

  // Find last workout with metrics
  const lastWorkout = await prisma.workout.findFirst({
    where: {
      userId,
      date: { lt: beforeDate },
      isDuplicate: false,
      OR: [{ ctl: { not: null } }, { atl: { not: null } }]
    },
    orderBy: { date: 'desc' }
  })

  // Find last wellness with metrics
  const lastWellness = await prisma.wellness.findFirst({
    where: {
      userId,
      date: { lt: beforeDate },
      ctl: { not: null },
      atl: { not: null }
    },
    orderBy: { date: 'desc' }
  })

  // Compare dates to find the most recent one
  let startCTL = 0
  let startATL = 0

  const workoutDate = lastWorkout?.date ? new Date(lastWorkout.date).getTime() : 0
  const wellnessDate = lastWellness?.date ? new Date(lastWellness.date).getTime() : 0

  if (workoutDate > wellnessDate && lastWorkout) {
    startCTL = lastWorkout.ctl ?? 0
    startATL = lastWorkout.atl ?? 0
  } else if (lastWellness) {
    startCTL = lastWellness.ctl ?? 0
    startATL = lastWellness.atl ?? 0
  }

  return {
    ctl: startCTL,
    atl: startATL
  }
}

/**
 * Calculate and update CTL/ATL for all workouts for a user
 * Used for backfilling historical data
 */
export async function backfillPMCMetrics(userId: string): Promise<number> {
  const { prisma } = await import('./db')

  const workouts = await prisma.workout.findMany({
    where: {
      userId,
      isDuplicate: false
    },
    orderBy: { date: 'asc' }
  })

  let ctl = 0
  let atl = 0
  let updated = 0

  for (const workout of workouts) {
    const tss = getStressScore(workout)
    ctl = calculateCTL(ctl, tss)
    atl = calculateATL(atl, tss)

    await prisma.workout.update({
      where: { id: workout.id },
      data: { ctl, atl }
    })

    updated++
  }

  return updated
}

/**
 * Get current fitness summary
 */
export async function getCurrentFitnessSummary(userId: string) {
  const { prisma } = await import('./db')

  const latestWorkout = await prisma.workout.findFirst({
    where: {
      userId,
      isDuplicate: false,
      ctl: { not: null },
      atl: { not: null }
    },
    orderBy: { date: 'desc' }
  })

  const latestWellness = await prisma.wellness.findFirst({
    where: {
      userId,
      ctl: { not: null },
      atl: { not: null }
    },
    orderBy: { date: 'desc' }
  })

  // Determine which is more recent (or use defaults)
  let ctl = 0
  let atl = 0
  let lastUpdated: Date | null = null

  const workoutDate = latestWorkout?.date ? new Date(latestWorkout.date).getTime() : 0
  const wellnessDate = latestWellness?.date ? new Date(latestWellness.date).getTime() : 0

  // Prioritize Wellness if it's the same day or newer (Wellness is usually end-of-day summary)
  if (
    wellnessDate >= workoutDate &&
    latestWellness &&
    latestWellness.ctl !== null &&
    latestWellness.atl !== null
  ) {
    ctl = latestWellness.ctl
    atl = latestWellness.atl
    lastUpdated = latestWellness.date
  } else if (latestWorkout && latestWorkout.ctl !== null && latestWorkout.atl !== null) {
    ctl = latestWorkout.ctl
    atl = latestWorkout.atl
    lastUpdated = latestWorkout.date
  } else {
    // No data found
    return {
      ctl: 0,
      atl: 0,
      tsb: 0,
      formStatus: getFormStatus(0),
      lastUpdated: null
    }
  }

  const tsb = calculateTSB(ctl, atl)!

  return {
    ctl,
    atl,
    tsb,
    formStatus: getFormStatus(tsb),
    lastUpdated
  }
}

/**
 * Calculate Projected PMC metrics for a future date range based on Planned Workouts
 * Returns array of daily metrics with projected CTL/ATL/TSB
 */
export function calculateProjectedPMC(
  startDate: Date,
  endDate: Date,
  initialCTL: number,
  initialATL: number,
  plannedWorkouts: { date: Date; tss: number | null }[]
): PMCMetrics[] {
  let ctl = initialCTL
  let atl = initialATL
  const results: PMCMetrics[] = []

  // Map date string (YYYY-MM-DD) to daily TSS sum
  const dailyTSS = new Map<string, number>()
  for (const workout of plannedWorkouts) {
    if (workout.tss) {
      const dateKey = workout.date.toISOString().split('T')[0] ?? ''
      dailyTSS.set(dateKey, (dailyTSS.get(dateKey) || 0) + workout.tss)
    }
  }

  // Iterate through each day in the range
  const currentDate = new Date(startDate)
  // Reset time to midnight UTC to avoid timezone issues
  currentDate.setUTCHours(0, 0, 0, 0)

  const endDateTime = new Date(endDate)
  endDateTime.setUTCHours(23, 59, 59, 999)

  while (currentDate <= endDateTime) {
    const dateKey = currentDate.toISOString().split('T')[0] ?? ''
    const tss = dailyTSS.get(dateKey) || 0

    // Calculate based on previous day
    ctl = calculateCTL(ctl, tss)
    atl = calculateATL(atl, tss)

    // TSB = CTL (Yesterday) - ATL (Yesterday) usually, or Today?
    // In strict PMC, TSB for "Today" is usually calculated using "Yesterday's" CTL/ATL.
    // However, calculateTSB(ctl, atl) uses current values.
    // If we want "Form" for the *start* of the day, we should use values *before* the workout.
    // If we want "Form" resulting *after* the workout, we use current values.
    // Standard TSB is often Yesterday's Fitness - Yesterday's Fatigue.
    // Let's stick to the simple formula: TSB = CTL - ATL.
    // If ctl/atl are updated *with* today's stress, then TSB is the state *after* training.

    // BUT: The existing calculatePMCForDateRange does:
    // ctl = calculateCTL(ctl, tss)
    // atl = calculateATL(atl, tss)
    // tsb = calculateTSB(ctl, atl)
    // This implies TSB is post-activity.
    // Let's match that consistency.

    const tsb = calculateTSB(ctl, atl)!

    results.push({
      date: new Date(currentDate),
      ctl,
      atl,
      tsb,
      tss
    })

    // Move to next day
    currentDate.setUTCDate(currentDate.getDate() + 1)
  }

  return results
}
