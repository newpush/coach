import { defineEventHandler, getQuery, createError } from 'h3'
import { workoutRepository } from '../../utils/repositories/workoutRepository'
import { getServerSession } from '../../utils/session'
import { subDays, format, isSameDay } from 'date-fns'
import { prisma } from '../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['Scores'],
    summary: 'Get readiness correlation',
    description: 'Returns data points correlating recovery scores with workout performance (TSS).',
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
                points: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      x: { type: 'number', description: 'Recovery Score' },
                      y: { type: 'number', description: 'Performance (TSS)' },
                      date: { type: 'string', format: 'date-time' },
                      type: { type: 'string' },
                      title: { type: 'string' }
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
  const days = Number(query.days) || 30

  const now = new Date()
  const startDate = subDays(now, days)

  // 1. Fetch workouts (Performance)
  const workouts = await workoutRepository.getForUser(userId, {
    startDate,
    endDate: now,
    includeDuplicates: false
  })

  // 2. Fetch Daily Metrics (Recovery/Readiness)
  const dailyMetrics = await prisma.dailyMetric.findMany({
    where: {
      userId,
      date: {
        gte: startDate,
        lte: now
      }
    },
    orderBy: {
      date: 'asc'
    }
  })

  // 3. Correlate Data
  // We want to see if High Recovery leads to High Performance (e.g. TSS or Intensity)
  // or simply plot them together scatter style

  const points = []

  for (const workout of workouts) {
    // Find metric for the same day
    const metric = dailyMetrics.find((m) => isSameDay(new Date(m.date), new Date(workout.date)))

    // We prioritize recoveryScore (Whoop style 0-100)
    // If not available, maybe HRV or Sleep Score
    const recovery = metric?.recoveryScore ?? metric?.sleepScore ?? null

    if (recovery !== null && workout.tss) {
      points.push({
        x: recovery, // Recovery Score (0-100)
        y: workout.tss, // Performance (TSS) - could also be IF or Power
        date: workout.date,
        type: workout.type,
        title: workout.title
      })
    }
  }

  return {
    points
  }
})
