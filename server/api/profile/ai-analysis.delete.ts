import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'
import { Prisma } from '@prisma/client'

defineRouteMeta({
  openAPI: {
    tags: ['Profile'],
    summary: 'Wipe AI Analysis & Recommendations',
    description: 'Removes all AI-generated workout analysis, recommendations, and reports.',
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                counts: {
                  type: 'object',
                  properties: {
                    workouts: { type: 'integer' },
                    recommendations: { type: 'integer' },
                    planAdherence: { type: 'integer' },
                    reports: { type: 'integer' }
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

  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const userId = (session.user as any).id

  // 1. Clear Workout AI Analysis
  const workoutsUpdate = await prisma.workout.updateMany({
    where: { userId },
    data: {
      aiAnalysis: null,
      aiAnalysisJson: Prisma.DbNull,
      aiAnalysisStatus: 'NOT_STARTED',
      aiAnalyzedAt: null,
      overallScore: null,
      technicalScore: null,
      effortScore: null,
      pacingScore: null,
      executionScore: null,
      overallQualityExplanation: null,
      technicalExecutionExplanation: null,
      effortManagementExplanation: null,
      pacingStrategyExplanation: null,
      executionConsistencyExplanation: null
    }
  })

  // 2. Delete Activity Recommendations
  const recommendationsDelete = await prisma.activityRecommendation.deleteMany({
    where: { userId }
  })

  // 3. Delete Plan Adherence Analysis
  const planAdherenceDelete = await prisma.planAdherence.deleteMany({
    where: {
      workout: {
        userId: userId
      }
    }
  })

  // 4. Delete Reports (excluding ATHLETE_PROFILE)
  const reportsDelete = await prisma.report.deleteMany({
    where: {
      userId,
      type: {
        in: ['WEEKLY_ANALYSIS', 'RACE_PREP', 'DAILY_SUGGESTION']
      }
    }
  })

  return {
    success: true,
    counts: {
      workouts: workoutsUpdate.count,
      recommendations: recommendationsDelete.count,
      planAdherence: planAdherenceDelete.count,
      reports: reportsDelete.count
    }
  }
})
