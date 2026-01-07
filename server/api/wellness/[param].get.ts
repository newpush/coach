import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['Wellness'],
    summary: 'Get wellness by ID or Date',
    description: 'Returns a wellness record by ID or Date.',
    parameters: [
      {
        name: 'param',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'UUID or Date (YYYY-MM-DD)'
      }
    ],
    responses: {
      200: { description: 'Success' },
      400: { description: 'Invalid format' },
      401: { description: 'Unauthorized' },
      403: { description: 'Access denied' },
      404: { description: 'Not found' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const param = getRouterParam(event, 'param')
  if (!param) {
    throw createError({
      statusCode: 400,
      message: 'Parameter is required'
    })
  }

  const userId = (session.user as any).id
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(param)

  let wellnessData: any = null
  let targetDate: Date

  if (isUuid) {
    // --- ID Lookup Logic ---
    const wellness = await prisma.wellness.findUnique({
      where: { id: param }
    })

    if (!wellness) {
      throw createError({
        statusCode: 404,
        message: 'Wellness data not found'
      })
    }

    if (wellness.userId !== userId) {
      throw createError({
        statusCode: 403,
        message: 'Access denied'
      })
    }

    wellnessData = wellness
    targetDate = wellness.date
  } else {
    // --- Date Lookup Logic ---
    const date = new Date(param)
    if (isNaN(date.getTime())) {
      throw createError({
        statusCode: 400,
        message: 'Invalid date format'
      })
    }
    targetDate = date

    const wellness = await wellnessRepository.findFirst(userId, { date })

    if (wellness) {
      wellnessData = wellness
    } else {
      // Fall back to daily metrics
      const dailyMetric = await prisma.dailyMetric.findFirst({
        where: {
          userId,
          date
        }
      })

      if (dailyMetric) {
        wellnessData = {
          ...dailyMetric,
          sleepQuality: null, // Map missing fields
          soreness: null,
          fatigue: null,
          stress: null,
          mood: null,
          motivation: null,
          readiness: null,
          weight: null,
          rawJson: null
        }
      }
    }
  }

  if (!wellnessData) {
    return null
  }

  // --- Trend Calculation Logic ---
  const endDate = targetDate
  const startDate = new Date(targetDate)
  startDate.setDate(startDate.getDate() - 30) // 30 days back

  const [historyWellness, historyMetrics] = await Promise.all([
    wellnessRepository.getForUser(userId, {
      startDate,
      endDate,
      select: {
        date: true,
        hrv: true,
        restingHr: true,
        sleepHours: true,
        sleepScore: true,
        recoveryScore: true,
        readiness: true
      }
    }),
    prisma.dailyMetric.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      select: {
        date: true,
        hrv: true,
        restingHr: true,
        hoursSlept: true,
        sleepScore: true,
        recoveryScore: true
      }
    })
  ])

  // Merge history (Wellness priority)
  const historyMap = new Map<string, any>()

  // 1. Populate with Daily Metrics
  historyMetrics.forEach((m) => {
    const d = m.date.toISOString().split('T')[0]!
    historyMap.set(d, {
      hrv: m.hrv,
      restingHr: m.restingHr,
      sleepHours: m.hoursSlept,
      sleepScore: m.sleepScore,
      recoveryScore: m.recoveryScore,
      readiness: null
    })
  })

  // 2. Override with Wellness
  historyWellness.forEach((w) => {
    const d = w.date.toISOString().split('T')[0]!
    const existing = historyMap.get(d) || {}
    historyMap.set(d, {
      ...existing,
      hrv: w.hrv ?? existing.hrv,
      restingHr: w.restingHr ?? existing.restingHr,
      sleepHours: w.sleepHours ?? existing.sleepHours,
      sleepScore: w.sleepScore ?? existing.sleepScore,
      recoveryScore: w.recoveryScore ?? existing.recoveryScore,
      readiness: w.readiness ?? existing.readiness
    })
  })

  // Calculate Averages
  const metrics = ['hrv', 'restingHr', 'sleepHours', 'sleepScore', 'recoveryScore', 'readiness']
  const trends: any = {}

  // Sort dates descending (today first)
  const sortedDates = Array.from(historyMap.keys()).sort().reverse()

  // Calculate Trends and History
  const targetDateStr = targetDate.toISOString().split('T')[0]!
  const values30Entries = Array.from(historyMap.entries())
    .filter(
      ([d]) =>
        d <= targetDateStr &&
        d > new Date(targetDate.getTime() - 30 * 86400000).toISOString().split('T')[0]!
    )
    .sort(([a], [b]) => a.localeCompare(b))

  metrics.forEach((key) => {
    const values7 = values30Entries
      .filter(
        ([d]) => d > new Date(targetDate.getTime() - 7 * 86400000).toISOString().split('T')[0]!
      )
      .map(([, v]) => v[key])
      .filter((v) => v != null)

    const values30 = values30Entries.map(([, v]) => v[key]).filter((v) => v != null)

    // Find previous day data (not just the last entry, but specifically the day before target)
    const previousDateStr = new Date(targetDate.getTime() - 86400000).toISOString().split('T')[0]!
    const previousEntry = historyMap.get(previousDateStr)

    trends[key] = {
      value: wellnessData[key], // Current value
      previous: previousEntry ? previousEntry[key] : null,
      avg7: values7.length ? values7.reduce((a, b) => a + b, 0) / values7.length : null,
      avg30: values30.length ? values30.reduce((a, b) => a + b, 0) / values30.length : null,
      history: values30Entries.map(([date, data]) => ({
        date,
        value: data[key]
      }))
    }
  })

  return {
    ...wellnessData,
    trends
  }
})
