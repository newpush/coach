import { getServerSession } from '#auth'
import { prisma } from '../../utils/db'
import { generateStructuredAnalysis } from '../../utils/gemini'

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

  const prompt = `Analyze these workout performance trends:

SUMMARY (Last ${days} days):
- Total: ${summary.total} workouts
- Overall Score: ${summary.avgOverall?.toFixed(1)}/10
- Technical: ${summary.avgTechnical?.toFixed(1)}/10
- Effort: ${summary.avgEffort?.toFixed(1)}/10
- Pacing: ${summary.avgPacing?.toFixed(1)}/10
- Execution: ${summary.avgExecution?.toFixed(1)}/10

RECENT WORKOUTS:
${workouts.map(w => {
  const distance = w.distanceMeters ? `${(w.distanceMeters / 1000).toFixed(1)}km` : '';
  const duration = w.durationSec ? `${Math.round(w.durationSec / 60)}min` : '';
  return `- ${w.date.toISOString().split('T')[0]}: ${w.title || w.type} ${distance} ${duration}`.trim()
}).join('\n')}

Provide a structured analysis focusing on patterns and actionable insights.`

  const schema = {
    type: "object",
    properties: {
      executive_summary: {
        type: "string",
        description: "2-3 sentence summary of current performance level and key patterns"
      },
      sections: {
        type: "array",
        description: "Analysis sections for different aspects",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Section title (e.g., 'Technical Execution', 'Effort Management')"
            },
            status: {
              type: "string",
              enum: ["excellent", "good", "moderate", "needs_improvement"],
              description: "Current status"
            },
            analysis_points: {
              type: "array",
              items: { type: "string" },
              description: "2-3 specific observations about this aspect"
            }
          },
          required: ["title", "status", "analysis_points"]
        }
      },
      recommendations: {
        type: "array",
        description: "3-4 actionable improvement recommendations",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Brief recommendation title"
            },
            description: {
              type: "string",
              description: "Detailed actionable step"
            },
            priority: {
              type: "string",
              enum: ["high", "medium", "low"],
              description: "Priority level"
            }
          },
          required: ["title", "description", "priority"]
        }
      }
    },
    required: ["executive_summary", "sections", "recommendations"]
  }

  try {
    const analysis = await generateStructuredAnalysis<TrendAnalysis>(prompt, schema, 'flash')
    
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