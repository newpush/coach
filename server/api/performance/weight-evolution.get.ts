import { defineEventHandler, getQuery, createError } from 'h3'
import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'
import { userRepository } from '../../utils/repositories/userRepository'

defineRouteMeta({
  openAPI: {
    tags: ['Performance'],
    summary: 'Get weight evolution',
    description: 'Returns the history of weight changes from wellness logs.',
    parameters: [
      {
        name: 'months',
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
                data: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      date: { type: 'string', format: 'date-time' },
                      weight: { type: 'number' }
                    }
                  }
                },
                summary: {
                  type: 'object',
                  properties: {
                    current: { type: 'number', nullable: true },
                    starting: { type: 'number', nullable: true },
                    min: { type: 'number', nullable: true },
                    max: { type: 'number', nullable: true },
                    change: { type: 'number' },
                    unit: { type: 'string' }
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
  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const query = getQuery(event)
  const months = parseInt(query.months as string) || 12

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  })

  if (!user) throw createError({ statusCode: 404, message: 'User not found' })

  const endDate = new Date()
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - months)

  // Fetch weight history from Wellness table
  const weightHistory = await prisma.wellness.findMany({
    where: {
      userId: user.id,
      date: {
        gte: startDate,
        lte: endDate
      },
      weight: {
        not: null
      }
    },
    select: {
      date: true,
      weight: true
    },
    orderBy: {
      date: 'asc'
    }
  })

  // Format data points
  const data = weightHistory.map((entry) => ({
    date: entry.date,
    weight: entry.weight
  }))

  // Add current weight if recent history is missing or different
  // Only if current profile weight is set
  if (user.weight) {
    const lastEntry = data[data.length - 1]
    const today = new Date()
    // If no history, or last entry is old/different, append current state
    if (
      !lastEntry ||
      (lastEntry.weight !== user.weight &&
        today.getTime() - new Date(lastEntry.date).getTime() > 86400000)
    ) {
      data.push({
        date: today,
        weight: user.weight
      })
    }
  }

  // Calculate stats
  const lastEntry = data.length > 0 ? data[data.length - 1] : null
  const currentWeight = user.weight || (lastEntry ? lastEntry.weight : null)

  const firstEntry = data.length > 0 ? data[0] : null
  const startingWeight = firstEntry ? firstEntry.weight : null

  const minWeight = data.length > 0 ? Math.min(...data.map((d) => d.weight!)) : null
  const maxWeight = data.length > 0 ? Math.max(...data.map((d) => d.weight!)) : null

  const change = startingWeight && currentWeight ? currentWeight - startingWeight : 0

  return {
    data,
    summary: {
      current: currentWeight,
      starting: startingWeight,
      min: minWeight,
      max: maxWeight,
      change: Math.round(change * 10) / 10,
      unit: user.weightUnits || 'kg'
    }
  }
})
