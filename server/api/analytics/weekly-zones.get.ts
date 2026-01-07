import { defineEventHandler, getQuery, createError } from 'h3'
import { prisma } from '../../utils/db'
import { userRepository } from '../../utils/repositories/userRepository'
import { calculatePowerZones, calculateHrZones } from '../../utils/zones'
import { getServerSession } from '../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Analytics'],
    summary: 'Get weekly zone distribution',
    description: 'Returns time spent in power and heart rate zones aggregated weekly.',
    parameters: [
      {
        name: 'weeks',
        in: 'query',
        schema: { type: 'integer', default: 12 }
      }
    ],
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                weeks: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      weekStart: { type: 'string' },
                      powerZones: { type: 'array', items: { type: 'number' } },
                      hrZones: { type: 'array', items: { type: 'number' } },
                      totalDuration: { type: 'number' }
                    }
                  }
                },
                zoneLabels: {
                  type: 'object',
                  properties: {
                    power: { type: 'array', items: { type: 'string' } },
                    hr: { type: 'array', items: { type: 'string' } }
                  }
                }
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user?.id) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }
  const userId = session.user.id

  const query = getQuery(event)
  const weeks = parseInt(query.weeks as string) || 12

  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - weeks * 7)

  // 1. Get user for zone definitions
  const user = await userRepository.getById(userId)
  if (!user) throw createError({ statusCode: 404, message: 'User not found' })

  // 2. Fetch workouts with streams
  const workouts = await prisma.workout.findMany({
    where: {
      userId,
      isDuplicate: false,
      date: { gte: startDate, lte: endDate },
      streams: { isNot: null }
    },
    include: {
      streams: true
    },
    orderBy: { date: 'asc' }
  })

  // 3. Prepare buckets
  const weeklyData = new Map<
    string,
    {
      weekStart: string
      powerZones: number[]
      hrZones: number[]
      totalDuration: number
    }
  >()

  const getWeekStart = (date: Date) => {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Adjust to Monday
    d.setDate(diff)
    d.setHours(0, 0, 0, 0)
    return d
  }

  // Pre-fill weeks to ensure gaps are shown
  for (let i = 0; i <= weeks; i++) {
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
