import { defineEventHandler, getQuery, createError } from 'h3'
import { workoutRepository } from '../../utils/repositories/workoutRepository'
import { getServerSession } from '../../utils/session'
import { subDays, format } from 'date-fns'
import { getUserTimezone, getStartOfYearUTC } from '../../utils/date'

defineRouteMeta({
  openAPI: {
    tags: ['Scores'],
    summary: 'Get efficiency trends',
    description: 'Returns efficiency factor (Power/HR) and decoupling trends.',
    parameters: [
      {
        name: 'days',
        in: 'query',
        schema: { type: ['integer', 'string'], default: 90 }
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
                trends: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      date: { type: 'string' },
                      efficiencyFactor: { type: 'number' },
                      decoupling: { type: 'number', nullable: true },
                      normalizedPower: { type: 'number', nullable: true },
                      averageHr: { type: 'number', nullable: true }
                    }
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
  const user = session?.user as any

  if (!user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }

  const userId = user.id
  const query = getQuery(event)

  const now = new Date()
  let startDate = new Date()

  if (query.days === 'YTD') {
    const timezone = await getUserTimezone(userId)
    startDate = getStartOfYearUTC(timezone)
  } else {
    const days = Number(query.days) || 90
    startDate = subDays(now, days)
  }

  // Fetch workouts with power and HR data
  const workouts = await workoutRepository.getForUser(userId, {
    startDate,
    endDate: now,
    includeDuplicates: false
  })

  // Filter for workouts that have both Power and HR (needed for Efficiency Factor)
  // And filter for workouts that have Normalized Power (needed for Decoupling usually, or use Avg Power if NP missing)
  const relevantWorkouts = workouts
    .filter((w) => (w.averageWatts || w.normalizedPower) && w.averageHr && w.averageHr > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // Calculate EF for each workout
  // EF = Normalized Power / Average Heart Rate
  // Decoupling (Pa:Hr) would ideally come from the source (Intervals.icu/Strava Analysis)
  // If we don't have decoupling pre-calculated, we can't accurately calc it from summary stats alone
  // So we'll check if 'efficiencyFactor' or 'decoupling' is in rawJson, or estimate EF.

  const data = relevantWorkouts.map((w) => {
    // Try to get advanced metrics from rawJson or dedicated columns if we had them
    // For now, calculate simple EF
    const power = w.normalizedPower || w.averageWatts || 0
    const hr = w.averageHr || 1

    // Simple EF calculation
    const ef = power / hr

    // Decoupling (Pw:Hr) - Placeholder or extract from rawJson if available
    // We'll return null if not available, frontend handles it
    let decoupling = null
    if (w.rawJson && typeof w.rawJson === 'object') {
      // @ts-expect-error - dynamic property access
      if (w.rawJson.decoupling) decoupling = w.rawJson.decoupling
      // @ts-expect-error - dynamic property access
      if (w.rawJson.aerobic_decoupling) decoupling = w.rawJson.aerobic_decoupling
    }

    return {
      date: format(new Date(w.date), 'yyyy-MM-dd'),
      efficiencyFactor: parseFloat(ef.toFixed(2)),
      decoupling: decoupling,
      normalizedPower: w.normalizedPower,
      averageHr: w.averageHr
    }
  })

  return {
    trends: data
  }
})
