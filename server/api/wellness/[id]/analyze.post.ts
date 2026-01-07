import { getServerSession } from '../../../utils/session'
import { prisma } from '../../../utils/db'
import { generateStructuredAnalysis, type GeminiModel } from '../../../utils/gemini'
import { wellnessRepository } from '../../../utils/repositories/wellnessRepository'

// Define the schema for the AI analysis
const wellnessAnalysisSchema = {
  type: 'object',
  properties: {
    executive_summary: {
      type: 'string',
      description: 'A concise summary of the athlete\'s wellness status (2-3 sentences).'
    },
    status: {
      type: 'string',
      enum: ['optimal', 'good', 'caution', 'rest_required'],
      description: 'Overall wellness status classification.'
    },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          status: { type: 'string', enum: ['optimal', 'good', 'caution', 'attention'] },
          analysis_points: {
            type: 'array',
            items: { type: 'string' }
          }
        },
        required: ['title', 'status', 'analysis_points']
      }
    },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] }
        },
        required: ['title', 'description', 'priority']
      }
    }
  },
  required: ['executive_summary', 'status', 'sections', 'recommendations']
}

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const userId = (session.user as any).id
  const wellnessId = getRouterParam(event, 'id')

  if (!wellnessId) {
    throw createError({ statusCode: 400, message: 'Wellness ID is required' })
  }

  // Fetch the wellness record
  const wellness = await prisma.wellness.findUnique({
    where: { id: wellnessId }
  })

  if (!wellness) {
    throw createError({ statusCode: 404, message: 'Wellness record not found' })
  }

  if (wellness.userId !== userId) {
    throw createError({ statusCode: 403, message: 'Access denied' })
  }

  // Update status to PROCESSING
  await prisma.wellness.update({
    where: { id: wellnessId },
    data: { aiAnalysisStatus: 'PROCESSING' }
  })

  try {
    // Fetch 30-day history for context
    const endDate = wellness.date
    const startDate = new Date(wellness.date)
    startDate.setDate(startDate.getDate() - 30)

    const history = await wellnessRepository.getForUser(userId, {
      startDate,
      endDate,
      select: {
        date: true,
        hrv: true,
        restingHr: true,
        sleepHours: true,
        sleepScore: true,
        recoveryScore: true,
        readiness: true,
        stress: true,
        fatigue: true,
        soreness: true
      },
      orderBy: { date: 'asc' }
    })

    // Construct the prompt
    const readinessLabel = (wellness.readiness || 0) > 10 ? `${wellness.readiness}%` : `${wellness.readiness}/10`
    
    const prompt = `
      Analyze this athlete's daily wellness data.

      CURRENT DAY (${wellness.date.toISOString().split('T')[0]}):
      - Recovery Score: ${wellness.recoveryScore}%
      - Resting HR: ${wellness.restingHr} bpm
      - HRV: ${wellness.hrv} ms
      - Sleep: ${wellness.sleepHours} hours (Score: ${wellness.sleepScore})
      - Readiness: ${readinessLabel}
      - Subjective: Stress ${wellness.stress}/10, Fatigue ${wellness.fatigue}/10, Soreness ${wellness.soreness}/10
      - Vitals: SpO2 ${wellness.spO2}%, Weight ${wellness.weight}kg
      
      HISTORY (Last 30 Days):
      - Average HRV: ${Math.round(history.reduce((acc, curr) => acc + (curr.hrv || 0), 0) / history.filter(h => h.hrv).length || 0)} ms
      - Average RHR: ${Math.round(history.reduce((acc, curr) => acc + (curr.restingHr || 0), 0) / history.filter(h => h.restingHr).length || 0)} bpm
      - Average Sleep: ${(history.reduce((acc, curr) => acc + (curr.sleepHours || 0), 0) / history.filter(h => h.sleepHours).length || 0).toFixed(1)} hours

      TASK:
      Provide a comprehensive analysis of the athlete's recovery status and readiness to train.
      1. Evaluate key metrics (HRV, Sleep, Recovery) against the 30-day context.
      2. Identify any warning signs (e.g., high fatigue, low HRV trend).
      3. Provide actionable recommendations for today's training (e.g., push hard, active recovery, rest).
      4. Note any subjective factors (stress, soreness) that might impact performance.

      Output JSON format matching the schema.
    `

    // Generate analysis using Gemini
    const analysis = await generateStructuredAnalysis(
      prompt,
      wellnessAnalysisSchema,
      'flash',
      {
        userId,
        operation: 'wellness_analysis',
        entityType: 'Wellness',
        entityId: wellnessId
      }
    )

    // Save the result
    const updatedWellness = await prisma.wellness.update({
      where: { id: wellnessId },
      data: {
        aiAnalysisJson: analysis as any, // Cast to any for Prisma JSON compatibility
        aiAnalysisStatus: 'COMPLETED',
        aiAnalyzedAt: new Date()
      }
    })

    return {
      status: 'COMPLETED',
      analysis: updatedWellness.aiAnalysisJson,
      analyzedAt: updatedWellness.aiAnalyzedAt
    }

  } catch (error: any) {
    console.error('Wellness analysis failed:', error)
    
    await prisma.wellness.update({
      where: { id: wellnessId },
      data: { aiAnalysisStatus: 'FAILED' }
    })

    throw createError({
      statusCode: 500,
      message: `Analysis failed: ${error.message}`
    })
  }
})
