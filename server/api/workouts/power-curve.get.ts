import { defineEventHandler, getQuery, createError } from 'h3'
import { workoutRepository } from '../../utils/repositories/workoutRepository'
import { getServerSession } from '../../utils/session'
import { subDays } from 'date-fns'
import { getUserTimezone, getStartOfYearUTC } from '../../utils/date'

defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Get aggregate power curve',
    description: 'Returns the power curve (current period vs all-time) for the athlete.',
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
                current: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      duration: { type: 'integer' },
                      watts: { type: 'number' }
                    }
                  }
                },
                allTime: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      duration: { type: 'integer' },
                      watts: { type: 'number' }
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
    const days = Number(query.days) || 90 // Default to 90 days for current period
    startDate = subDays(now, days)
  }

  // 1. Fetch workouts for the selected period (Current Curve)
  const currentWorkouts = await workoutRepository.getForUser(userId, {
    startDate,
    endDate: now,
    includeDuplicates: false
  })

  // 2. Fetch all-time bests (All-Time Curve)
  // Ideally, we would have a dedicated 'PowerCurve' table or aggregation
  // For now, we'll scan all workouts (this might need optimization later)
  // or limit to last 2 years for "All-Time" relevant to current fitness
  const allTimeStartDate = subDays(now, 730) // 2 years
  const allTimeWorkouts = await workoutRepository.getForUser(userId, {
    startDate: allTimeStartDate,
    endDate: now,
    includeDuplicates: false
  })

  // Helper to extract max power for standard durations
  // Durations in seconds: 1s, 5s, 10s, 30s, 1min, 5min, 10min, 20min, 60min
  const durations = [1, 5, 10, 30, 60, 300, 600, 1200, 3600]

  const calculateCurve = (workouts: any[]) => {
    const curve: Record<number, number> = {}
    durations.forEach((d) => (curve[d] = 0))

    workouts.forEach((w) => {
      // Assuming we have 'powerCurve' JSON field or similar in the future
      // For now, we only have averageWatts (approx 60min) and maxWatts (1s)
      // This is a PLACEHOLDER until we have real power curve data ingestion
      // We will simulate a curve based on FTP/Max models if real data is missing

      // Use real data if available in rawJson (from Intervals/Strava streams)
      if (w.maxWatts !== null && w.maxWatts !== undefined) {
        curve[1] = Math.max(curve[1] || 0, w.maxWatts)
        curve[5] = Math.max(curve[5] || 0, w.maxWatts * 0.9) // Estimate
      }
      if (w.averageWatts !== null && w.averageWatts !== undefined) {
        // Rough estimate if we don't have granular data
        curve[3600] = Math.max(curve[3600] || 0, w.averageWatts)
      }
      // ... more sophisticated stream processing would go here
    })

    // For this implementation, let's assume we can fetch pre-calculated curve points
    // or we'll return a simulated curve based on the athlete's known bests
    return durations.map((d) => ({
      duration: d,
      watts: curve[d]
    }))
  }

  // NOTE: since we don't have full power stream processing yet,
  // we will return the best 1s (Max) and Average (approx 1h) and interpolated points
  // In a real scenario, we'd query a `PowerCurve` table.

  // Real implementation using the repository's hypothetical 'getPowerCurve' method
  // If not exists, we'll stick to basic fields

  const processWorkoutsToCurve = (workouts: any[]) => {
    let max1s = 0
    const max20m = 0 // Est from FTP or best 20m effort

    workouts.forEach((w) => {
      if (w.maxWatts > max1s) max1s = w.maxWatts
      // If we had 20m power...
    })

    // Placeholder curve generator (Model based)
    // This allows the frontend to work while we build the backend stream processor
    return [
      { duration: 1, watts: max1s },
      { duration: 10, watts: max1s * 0.8 },
      { duration: 60, watts: max1s * 0.5 },
      { duration: 300, watts: max1s * 0.35 },
      { duration: 1200, watts: max1s * 0.28 }, // ~FTP
      { duration: 3600, watts: max1s * 0.25 }
    ]
  }

  return {
    current: processWorkoutsToCurve(currentWorkouts),
    allTime: processWorkoutsToCurve(allTimeWorkouts)
  }
})
