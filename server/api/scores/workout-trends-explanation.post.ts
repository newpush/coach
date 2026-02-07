import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'
import { generateStructuredAnalysis } from '../../utils/gemini'
import { getUserAiSettings } from '../../utils/ai-user-settings'

defineRouteMeta({
  openAPI: {
    tags: ['Scores'],
    summary: 'Generate workout trend explanation',
    description: 'Generates an AI explanation for workout trends.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['summary'],
            properties: {
              days: { type: 'integer', default: 30 },
              summary: {
                type: 'object',
                required: ['total'],
                properties: {
                  total: { type: 'integer' },
                  avgOverall: { type: 'number' },
                  avgTechnical: { type: 'number' },
                  avgEffort: { type: 'number' },
                  avgPacing: { type: 'number' },
                  avgExecution: { type: 'number' }
                }
              }
            }
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                analysis: { type: 'object' },
                score: { type: 'number' },
                period: { type: 'integer' }
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' }
    }
  }
})

interface TrendAnalysis {
  executive_summary: string
  sections: Array<{
    title: string
    status: string
    analysis_points: string[]
  }>
  recommendations: Array<{
    title: string
    description: string
    priority: string
  }>
}

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const body = await readBody(event)
  const { days = 30, summary } = body

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  })

  if (!user) {
    throw createError({
      statusCode: 404,
      message: 'User not found'
    })
  }

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  const aiSettings = await getUserAiSettings(user.id)

  // Get recent workouts
  const workouts = await prisma.workout.findMany({
    where: {
      userId: user.id,
      date: {
        gte: startDate
      }
    },
    select: {
      date: true,
      title: true,
      type: true,
      distanceMeters: true,
      durationSec: true,
      tss: true
    },
    orderBy: {
      date: 'desc'
    },
    take: 10 // Last 10 workouts for context
  })

  const prompt = `You are a **${aiSettings.aiPersona}** expert coach analyzing workout performance trends.
Adapt your analysis tone and insights to match your **${aiSettings.aiPersona}** persona.

SUMMARY (Last ${days} days):
- Total: ${summary.total} workouts
- Overall Score: ${summary.avgOverall?.toFixed(1)}/10
- Technical: ${summary.avgTechnical?.toFixed(1)}/10
- Effort: ${summary.avgEffort?.toFixed(1)}/10
- Pacing: ${summary.avgPacing?.toFixed(1)}/10
- Execution: ${summary.avgExecution?.toFixed(1)}/10

RECENT WORKOUTS:
${workouts
  .map((w) => {
    const distance = w.distanceMeters ? `${(w.distanceMeters / 1000).toFixed(1)}km` : ''
    const duration = w.durationSec ? `${Math.round(w.durationSec / 60)}min` : ''
    return `- ${w.date.toISOString().split('T')[0]}: ${w.title || w.type} ${distance} ${duration}`.trim()
  })
  .join('\n')}

Provide a structured analysis focusing on patterns and actionable insights.
Maintain your **${aiSettings.aiPersona}** persona throughout.`

  const schema = {
    type: 'object',
    properties: {
      executive_summary: {
        type: 'string',
        description: '2-3 sentence summary of current performance level and key patterns'
      },
      sections: {
        type: 'array',
        description: 'Analysis sections for different aspects',
        items: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: "Section title (e.g., 'Technical Execution', 'Effort Management')"
            },
            status: {
              type: 'string',
              enum: ['excellent', 'good', 'moderate', 'needs_improvement'],
              description: 'Current status'
            },
            analysis_points: {
              type: 'array',
              items: { type: 'string' },
              description: '2-3 specific observations about this aspect'
            }
          },
          required: ['title', 'status', 'analysis_points']
        }
      },
      recommendations: {
        type: 'array',
        description: '3-4 actionable improvement recommendations',
        items: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Brief recommendation title'
            },
            description: {
              type: 'string',
              description: 'Detailed actionable step'
            },
            priority: {
              type: 'string',
              enum: ['high', 'medium', 'low'],
              description: 'Priority level'
            }
          },
          required: ['title', 'description', 'priority']
        }
      }
    },
    required: ['executive_summary', 'sections', 'recommendations']
  }

  try {
    const analysis = await generateStructuredAnalysis<TrendAnalysis>(
      prompt,
      schema,
      aiSettings.aiModelPreference,
      {
        userId: user.id,
        operation: 'workout_trends_explanation',
        entityType: 'Workout',
        entityId: undefined // This is a trend analysis, not a specific entity
      }
    )

    return {
      analysis,
      score: summary.avgOverall,
      period: days
    }
  } catch (error) {
    console.error('Error generating workout explanation:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to generate explanation'
    })
  }
})
