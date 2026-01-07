import { logger, task } from '@trigger.dev/sdk/v3'
import { generateStructuredAnalysis } from '../server/utils/gemini'
import { prisma } from '../server/utils/db'
import { userReportsQueue } from './queues'

const adherenceSchema = {
  type: 'object',
  properties: {
    overallScore: { type: 'integer', description: '0-100 score of overall adherence' },
    intensityScore: { type: 'integer', description: '0-100 score for intensity adherence' },
    durationScore: { type: 'integer', description: '0-100 score for duration adherence' },
    executionScore: { type: 'integer', description: '0-100 score for structured execution' },
    summary: { type: 'string', description: 'Executive summary of adherence' },
    deviations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          metric: { type: 'string' },
          planned: { type: 'string' },
          actual: { type: 'string' },
          deviation: { type: 'string', description: "e.g. '+15%'" },
          impact: { type: 'string', description: 'Impact on training goal' }
        }
      }
    },
    recommendations: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: ['overallScore', 'summary', 'deviations']
}

export const analyzePlanAdherenceTask = task({
  id: 'analyze-plan-adherence',
  queue: userReportsQueue,
  run: async (payload: { workoutId: string; plannedWorkoutId: string }) => {
    const { workoutId, plannedWorkoutId } = payload

    // Fetch data
    const [workout, plan] = await Promise.all([
      prisma.workout.findUnique({
        where: { id: workoutId },
        include: {
          user: { select: { ftp: true, aiPersona: true } }
        }
      }),
      prisma.plannedWorkout.findUnique({
        where: { id: plannedWorkoutId }
      })
    ])

    if (!workout || !plan) throw new Error('Workout or Plan not found')

    // Create/Update initial adherence record
    await prisma.planAdherence.upsert({
      where: { workoutId },
      create: {
        workoutId,
        plannedWorkoutId,
        analysisStatus: 'PROCESSING'
      },
      update: {
        analysisStatus: 'PROCESSING'
      }
    })

    try {
      const prompt = `Analyze the adherence of this completed workout to the planned workout.
      
      PLANNED:
      - Title: ${plan.title}
      - Type: ${plan.type}
      - Duration: ${plan.durationSec ? Math.round(plan.durationSec / 60) + 'm' : 'N/A'}
      - TSS: ${plan.tss || 'N/A'}
      - Intensity: ${plan.workIntensity ? plan.workIntensity * 100 + '%' : 'N/A'}
      - Description: ${plan.description || 'N/A'}
      - Structure: ${JSON.stringify(plan.structuredWorkout).substring(0, 1000)}
      
      COMPLETED:
      - Duration: ${Math.round(workout.durationSec / 60)}m
      - TSS: ${workout.tss || 'N/A'}
      - Avg Power: ${workout.averageWatts || 'N/A'}W
      - Norm Power: ${workout.normalizedPower || 'N/A'}W
      - Avg HR: ${workout.averageHr || 'N/A'}bpm
      - Description: ${workout.description || 'N/A'}
      
      USER CONTEXT:
      - FTP: ${workout.user.ftp || 'N/A'}W
      
      INSTRUCTIONS:
      1. Calculate an overall adherence score (0-100) based on how well the execution matched the plan.
      2. Analyze deviations in Duration, Intensity (Power/HR), and Structure.
      3. Provide specific feedback on what was missed or exceeded.
      4. If the plan had intervals, estimate if they were executed correctly based on the aggregate data available.
      5. "impact" should describe how the deviation affects the training stimulus (e.g. "Reduced aerobic benefit", "Excessive fatigue risk").
      
      OUTPUT JSON matching the schema.`

      const analysis = await generateStructuredAnalysis(prompt, adherenceSchema, 'flash', {
        userId: workout.userId,
        operation: 'analyze_plan_adherence',
        entityType: 'PlanAdherence',
        entityId: workoutId
      })

      // Save results
      await prisma.planAdherence.update({
        where: { workoutId },
        data: {
          overallScore: analysis.overallScore,
          intensityScore: analysis.intensityScore,
          durationScore: analysis.durationScore,
          executionScore: analysis.executionScore,
          summary: analysis.summary,
          deviations: analysis.deviations,
          recommendations: analysis.recommendations,
          analysisStatus: 'COMPLETED',
          analyzedAt: new Date(),
          modelVersion: 'gemini-2.0-flash'
        }
      })

      return { success: true, workoutId }
    } catch (error: any) {
      logger.error('Plan adherence analysis failed', { error })

      await prisma.planAdherence.update({
        where: { workoutId },
        data: {
          analysisStatus: 'FAILED',
          summary: 'Analysis failed: ' + error.message
        }
      })

      throw error
    }
  }
})
