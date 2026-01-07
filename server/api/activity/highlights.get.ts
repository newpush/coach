import { defineEventHandler, getQuery, createError } from 'h3'
import { workoutRepository } from '../../utils/repositories/workoutRepository'
import { subDays } from 'date-fns'
import { getServerSession } from '../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Activity'],
    summary: 'Get activity highlights',
    description: 'Returns aggregated activity statistics and workload ratios (ACWR).',
    parameters: [
      {
        name: 'days',
        in: 'query',
        schema: { type: 'integer', default: 30 }
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
                period: {
                  type: 'object',
                  properties: {
                    days: { type: 'integer' },
                    totalDuration: { type: 'integer' },
                    totalDistance: { type: 'number' },
                    totalTSS: { type: 'number' },
                    workoutCount: { type: 'integer' },
                    avgTSS: { type: 'number' }
                  }
                },
                load: {
                  type: 'object',
                  properties: {
                    acuteLoad: { type: 'number' },
                    chronicLoad: { type: 'number' },
                    workloadRatio: { type: 'number' }
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
  const days = Number(query.days) || 30

  const now = new Date()
  const startDate = subDays(now, days)

  // Fetch workouts for the selected period
  // We'll need to use raw query or repository method that supports aggregation
  // For now, let's fetch all workouts and aggregate in memory for simplicity,
  // but in production, this should be optimized with DB aggregation.
  const workouts = await workoutRepository.getForUser(userId, {
    startDate,
    endDate: now,
    includeDuplicates: false
  })

  // Calculate aggregated stats
  let totalDuration = 0
  let totalDistance = 0
  let totalTSS = 0
  const workoutCount = workouts.length

  workouts.forEach((w) => {
    totalDuration += w.durationSec || 0
    totalDistance += w.distanceMeters || 0
    totalTSS += w.tss || 0
  })

  // Calculate Load Ratios (ACWR)
  // Acute Load = Average daily load over last 7 days
  // Chronic Load = Average daily load over last 42 days

  const acuteStartDate = subDays(now, 7)
  const chronicStartDate = subDays(now, 42)

  const acuteWorkouts = await workoutRepository.getForUser(userId, {
    startDate: acuteStartDate,
    endDate: now,
    includeDuplicates: false
  })

  const chronicWorkouts = await workoutRepository.getForUser(userId, {
    startDate: chronicStartDate,
    endDate: now,
    includeDuplicates: false
  })

  const acuteLoad = acuteWorkouts.reduce((sum, w) => sum + (w.tss || 0), 0) / 7
  const chronicLoad = chronicWorkouts.reduce((sum, w) => sum + (w.tss || 0), 0) / 42

  const workloadRatio = chronicLoad > 0 ? acuteLoad / chronicLoad : 0

  return {
    period: {
      days,
      totalDuration,
      totalDistance,
      totalTSS,
      workoutCount,
      avgTSS: workoutCount > 0 ? totalTSS / workoutCount : 0
    },
    load: {
      acuteLoad,
      chronicLoad,
      workloadRatio
    }
  }
})
