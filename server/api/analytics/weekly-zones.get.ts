import { defineEventHandler, getQuery, createError } from 'h3'
import { prisma } from '../../utils/db'
import { userRepository } from '../../utils/repositories/userRepository'
import { calculatePowerZones, calculateHrZones } from '../../utils/zones'
import { getServerSession } from '../../utils/session'
import { getUserTimezone, getStartOfYearUTC } from '../../utils/date'

defineRouteMeta({
  openAPI: {
    tags: ['Analytics'],
    summary: 'Get weekly zone distribution',
    description: 'Returns time spent in power and heart rate zones aggregated weekly.',
    parameters: [
      {
        name: 'weeks',
        in: 'query',
        schema: { type: ['integer', 'string'], default: 12 }
      }
    ]
  }
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }
  const userId = (session.user as any).id

  const query = getQuery(event)
  const endDate = new Date()
  let startDate = new Date()
  let numWeeks = 0

  if (query.weeks === 'YTD') {
    const timezone = await getUserTimezone(userId)
    startDate = getStartOfYearUTC(timezone)
    // Calculate weeks since start of year
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime())
    numWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7))
  } else {
    numWeeks = parseInt(query.weeks as string) || 12
    startDate.setDate(startDate.getDate() - numWeeks * 7)
  }

  // 1. Get user for zone definitions
  const user = await userRepository.getById(userId)
  if (!user) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  // 2. Get workouts with streams
  const workouts = await prisma.workout.findMany({
    where: {
      userId,
      date: {
        gte: startDate,
        lte: endDate
      }
    },
    select: {
      date: true,
      ftp: true,
      streams: {
        select: {
          time: true,
          watts: true,
          heartrate: true
        }
      }
    }
  })

  // 3. Initialize buckets
  const weeklyData = new Map<
    string,
    {
      weekStart: string
      powerZones: number[]
      hrZones: number[]
      totalDuration: number
    }
  >()

  // Pre-fill weeks to ensure gaps are shown
  for (let i = 0; i <= numWeeks; i++) {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i * 7)

    const start = getWeekStart(d)
    const key = start.toISOString().split('T')[0]
    if (key) {
      weeklyData.set(key, {
        weekStart: key,
        powerZones: new Array(7).fill(0),
        hrZones: new Array(7).fill(0),
        totalDuration: 0
      })
    }
  }

  // 4. Aggregate
  for (const workout of workouts) {
    if (!workout.streams) continue

    const weekStart = getWeekStart(workout.date)
    const key = weekStart.toISOString().split('T')[0]
    if (!key) continue

    const bucket = weeklyData.get(key)
    if (!bucket) continue

    // Get zones for this workout
    const ftp = workout.ftp || (await userRepository.getFtpForDate(userId, workout.date))
    const lthr = await userRepository.getLthrForDate(userId, workout.date)

    // Check if user has custom zones, otherwise calculate
    const pZones = (user.powerZones as any) || calculatePowerZones(ftp)
    const hZones = (user.hrZones as any) || calculateHrZones(lthr, user.maxHr)

    const streams = workout.streams
    const time = (streams.time as number[]) || []
    const watts = (streams.watts as number[]) || []
    const hr = (streams.heartrate as number[]) || []

    for (let i = 0; i < time.length; i++) {
      const currentTime = time[i]
      if (currentTime === undefined || currentTime === null) continue

      const prevTime = i === 0 ? currentTime : time[i - 1]
      const delta = i === 0 ? 0 : currentTime - (prevTime || 0)
      if (delta <= 0 || delta > 10) continue // Skip pauses

      bucket.totalDuration += delta

      const w = watts[i]
      if (w !== undefined && w !== null) {
        const zIndex = pZones.findIndex((z: any) => w >= z.min && w <= z.max)
        if (zIndex !== -1 && bucket.powerZones[zIndex] !== undefined) {
          bucket.powerZones[zIndex] += delta
        }
      }

      const h = hr[i]
      if (h !== undefined && h !== null) {
        const zIndex = hZones.findIndex((z: any) => h >= z.min && h <= z.max)
        if (zIndex !== -1 && bucket.hrZones[zIndex] !== undefined) {
          bucket.hrZones[zIndex] += delta
        }
      }
    }
  }

  // 5. Finalize results
  const result = Array.from(weeklyData.values())
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map((w) => ({
      ...w,
      powerZones: w.powerZones.map((s) => Math.round((s / 3600) * 10) / 10),
      hrZones: w.hrZones.map((s) => Math.round((s / 3600) * 10) / 10),
      totalDuration: Math.round((w.totalDuration / 3600) * 10) / 10
    }))

  // Use the same HR zone calculation logic for labels as used in aggregation
  // Get LTHR for today to generate current zone labels
  const currentLthr = await userRepository.getLthrForDate(userId, new Date())

  return {
    weeks: result,
    zoneLabels: {
      power: calculatePowerZones(user.ftp || 200).map((z) => z.name),
      hr: calculateHrZones(currentLthr, user.maxHr || 190).map((z) => z.name)
    }
  }
})

function getWeekStart(d: Date) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1) // adjust when day is sunday
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}
