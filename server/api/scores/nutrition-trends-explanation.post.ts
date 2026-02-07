import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'
import { generateStructuredAnalysis } from '../../utils/gemini'
import { getUserAiSettings } from '../../utils/ai-user-settings'

defineRouteMeta({
  openAPI: {
    tags: ['Scores'],
    summary: 'Generate nutrition trend explanation',
    description: 'Generates an AI explanation for nutrition trends.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['summary'],
            properties: {
              days: { type: 'integer', default: 14 },
              summary: {
                type: 'object',
                required: ['total'],
                properties: {
                  total: { type: 'integer' },
                  avgOverall: { type: 'number' },
                  avgMacroBalance: { type: 'number' },
                  avgQuality: { type: 'number' },
                  avgAdherence: { type: 'number' },
                  avgHydration: { type: 'number' }
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
  const { days = 14, summary } = body

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

  // Get recent nutrition entries
  const nutrition = await prisma.nutrition.findMany({
    where: {
      userId: user.id,
      date: {
        gte: startDate
      }
    },
    select: {
      date: true,
      calories: true,
      protein: true,
      carbs: true,
      fat: true
    },
    orderBy: {
      date: 'desc'
    },
    take: 10 // Last 10 days for context
  })

  const prompt = `You are a **${aiSettings.aiPersona}** expert nutrition coach analyzing trends for an endurance athlete.
Adapt your analysis tone and insights to match your **${aiSettings.aiPersona}** persona.

SUMMARY (Last ${days} days):
- Total Days: ${summary.total}
- Overall Score: ${summary.avgOverall?.toFixed(1)}/10
- Macro Balance: ${summary.avgMacroBalance?.toFixed(1)}/10
- Quality: ${summary.avgQuality?.toFixed(1)}/10
- Adherence: ${summary.avgAdherence?.toFixed(1)}/10
- Hydration: ${summary.avgHydration?.toFixed(1)}/10

RECENT DATA:
${nutrition
  .map((n) => {
    const totalMacros = (n.protein || 0) + (n.carbs || 0) + (n.fat || 0)
    const proteinPct = totalMacros > 0 ? (((n.protein || 0) / totalMacros) * 100).toFixed(0) : 0
    const carbsPct = totalMacros > 0 ? (((n.carbs || 0) / totalMacros) * 100).toFixed(0) : 0
    const fatPct = totalMacros > 0 ? (((n.fat || 0) / totalMacros) * 100).toFixed(0) : 0
    return `- ${n.date.toISOString().split('T')[0]}: ${n.calories || 0}kcal (P:${proteinPct}% C:${carbsPct}% F:${fatPct}%)`
  })
  .join('\n')}

Provide structured analysis focusing on patterns and actionable nutrition improvements.
Maintain your **${aiSettings.aiPersona}** persona throughout.`

  const schema = {
    type: 'object',
    properties: {
      executive_summary: {
        type: 'string',
        description: '2-3 sentence summary of current nutrition performance and key patterns'
      },
      sections: {
        type: 'array',
        description: 'Analysis sections for different aspects',
        items: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: "Section title (e.g., 'Macro Balance', 'Food Quality')"
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
        description: '3-4 actionable nutrition improvement recommendations',
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
        operation: 'nutrition_trends_explanation',
        entityType: 'Nutrition',
        entityId: undefined // This is a trend analysis, not a specific entity
      }
    )

    return {
      analysis,
      score: summary.avgOverall,
      period: days
    }
  } catch (error) {
    console.error('Error generating nutrition explanation:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to generate explanation'
    })
  }
})
