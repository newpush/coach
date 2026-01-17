import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'
import { tasks } from '@trigger.dev/sdk/v3'

defineRouteMeta({
  openAPI: {
    tags: ['Scores'],
    summary: 'Get score explanation',
    description: 'Returns an AI-generated explanation for a specific score trend.',
    parameters: [
      {
        name: 'type',
        in: 'query',
        required: true,
        schema: { type: 'string', enum: ['nutrition', 'workout'] }
      },
      {
        name: 'period',
        in: 'query',
        required: true,
        schema: { type: 'integer' }
      },
      {
        name: 'metric',
        in: 'query',
        required: true,
        schema: { type: 'string' }
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
                analysis: { type: 'object', nullable: true },
                score: { type: 'number', nullable: true },
                period: { type: 'integer', nullable: true },
                cached: { type: 'boolean' },
                generatedAt: { type: 'string', format: 'date-time', nullable: true },
                expiresAt: { type: 'string', format: 'date-time', nullable: true },
                message: { type: 'string', nullable: true },
                generating: { type: 'boolean', nullable: true }
              }
            }
          }
        }
      },
      400: { description: 'Missing required parameters' },
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
  const { type, period, metric } = query as {
    type: string
    period: string
    metric: string
  }

  if (!type || !period || !metric) {
    throw createError({
      statusCode: 400,
      message: 'Missing required parameters: type, period, metric'
    })
  }

  const periodNum = parseInt(period)
  if (isNaN(periodNum)) {
    throw createError({
      statusCode: 400,
      message: 'Period must be a number'
    })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  })

  if (!user) {
    throw createError({
      statusCode: 404,
      message: 'User not found'
    })
  }

  try {
    // Try to find existing valid explanation
    const explanation = await prisma.scoreTrendExplanation.findUnique({
      where: {
        userId_type_period_metric: {
          userId: user.id,
          type,
          period: periodNum,
          metric
        }
      }
    })

    // If explanation exists and hasn't expired, return it
    if (explanation && explanation.expiresAt > new Date()) {
      return {
        analysis: explanation.analysisData,
        score: explanation.score,
        period: explanation.period,
        cached: true,
        generatedAt: explanation.generatedAt,
        expiresAt: explanation.expiresAt
      }
    }

    // If no valid explanation exists, return empty state
    // We no longer auto-trigger here. The user must explicitly request generation.
    return {
      analysis: null,
      cached: false,
      message: 'No insights generated yet. Click "Generate Insights" to analyze.',
      generating: false
    }
  } catch (error) {
    console.error('Error fetching explanation:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to fetch explanation'
    })
  }
})
