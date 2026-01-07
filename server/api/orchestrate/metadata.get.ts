import { defineEventHandler, createError } from 'h3'
import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['Orchestration'],
    summary: 'Get orchestration metadata',
    description: 'Returns status and timestamps for various background tasks and data syncs.',
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                metadata: {
                  type: 'object',
                  additionalProperties: {
                    type: 'object',
                    properties: {
                      lastSync: { type: 'string', format: 'date-time', nullable: true },
                      isUpToDate: { type: 'boolean', nullable: true },
                      pendingCount: { type: 'integer', nullable: true },
                      totalCount: { type: 'integer', nullable: true },
                      duplicateCount: { type: 'integer', nullable: true }
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

  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const userEmail = session.user.email

  // Get the actual userId from the database
  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    select: { id: true }
  })

  if (!user) {
    throw createError({
      statusCode: 404,
      message: 'User not found'
    })
  }

  const userId = user.id

  try {
    // Fetch metadata for all tasks
    const [lastAnalyzedWorkout, lastAnalyzedNutrition, integrationStats] = await Promise.all([
      // Last analyzed workout (excluding duplicates)
      prisma.workout.findFirst({
        where: {
          userId,
          isDuplicate: false,
          aiAnalysisStatus: 'COMPLETED'
        },
        select: {
          aiAnalyzedAt: true
        },
        orderBy: { aiAnalyzedAt: 'desc' }
      }),

      // Last analyzed nutrition
      prisma.nutrition.findFirst({
        where: {
          userId,
          aiAnalysisStatus: 'COMPLETED'
        },
        select: {
          aiAnalyzedAt: true
        },
        orderBy: { aiAnalyzedAt: 'desc' }
      }),

      // Integration sync times
      prisma.integration.findMany({
        where: { userId },
        select: {
          provider: true,
          lastSyncAt: true
        }
      })
    ])

    // Count pending analyses and duplicates
    const [
      workoutPendingCount,
      nutritionPendingCount,
      totalWorkouts,
      totalNutrition,
      duplicateCount
    ] = await Promise.all([
      prisma.workout.count({
        where: {
          userId,
          isDuplicate: false,
          OR: [
            { aiAnalysisStatus: 'NOT_STARTED' },
            { aiAnalysisStatus: 'PENDING' },
            { aiAnalysisStatus: null }
          ]
        }
      }),
      prisma.nutrition.count({
        where: {
          userId,
          OR: [
            { aiAnalysisStatus: 'NOT_STARTED' },
            { aiAnalysisStatus: 'PENDING' },
            { aiAnalysisStatus: null }
          ]
        }
      }),
      prisma.workout.count({ where: { userId, isDuplicate: false } }),
      prisma.nutrition.count({ where: { userId } }),
      prisma.workout.count({ where: { userId, isDuplicate: true } })
    ])

    // Build metadata object
    const metadata: Record<string, any> = {}

    // Integration metadata
    integrationStats.forEach((int) => {
      const taskId = `ingest-${int.provider}`
      metadata[taskId] = {
        lastSync: int.lastSyncAt
      }
    })

    // Deduplication metadata
    metadata['deduplicate-workouts'] = {
      duplicateCount: duplicateCount,
      totalCount: totalWorkouts + duplicateCount,
      isUpToDate: duplicateCount === 0
    }

    // Workout analysis metadata
    metadata['analyze-workouts'] = {
      pendingCount: workoutPendingCount,
      totalCount: totalWorkouts,
      lastSync: lastAnalyzedWorkout?.aiAnalyzedAt || null,
      isUpToDate: workoutPendingCount === 0 && totalWorkouts > 0
    }

    // Nutrition analysis metadata
    metadata['analyze-nutrition'] = {
      pendingCount: nutritionPendingCount,
      totalCount: totalNutrition,
      lastSync: lastAnalyzedNutrition?.aiAnalyzedAt || null,
      isUpToDate: nutritionPendingCount === 0 && totalNutrition > 0
    }

    // Get latest workout/nutrition dates for comparison
    const [latestWorkout, latestNutrition] = await Promise.all([
      prisma.workout.findFirst({
        where: { userId, isDuplicate: false },
        orderBy: { date: 'desc' },
        select: { date: true }
      }),
      prisma.nutrition.findFirst({
        where: { userId },
        orderBy: { date: 'desc' },
        select: { date: true }
      })
    ])

    // Profile generation metadata - check if profile is current
    const lastProfile = await prisma.report.findFirst({
      where: {
        userId,
        type: 'ATHLETE_PROFILE',
        status: 'COMPLETED'
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true }
    })

    // Profile is up to date if generated after latest analyzed workout/nutrition
    const profileUpToDate =
      lastProfile &&
      (!lastAnalyzedWorkout ||
        !lastAnalyzedWorkout.aiAnalyzedAt ||
        lastProfile.createdAt >= lastAnalyzedWorkout.aiAnalyzedAt) &&
      (!lastAnalyzedNutrition ||
        !lastAnalyzedNutrition.aiAnalyzedAt ||
        lastProfile.createdAt >= lastAnalyzedNutrition.aiAnalyzedAt)

    metadata['generate-athlete-profile'] = {
      lastSync: lastProfile?.createdAt || null,
      isUpToDate: !!profileUpToDate
    }

    // Workout report metadata - should cover last 7 days
    const lastWorkoutReport = await prisma.report.findFirst({
      where: {
        userId,
        type: 'WEEKLY',
        status: 'COMPLETED'
      },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        dateRangeEnd: true
      }
    })

    // Report is up to date if it covers data through at least 24 hours ago
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const workoutReportUpToDate =
      lastWorkoutReport &&
      lastWorkoutReport.dateRangeEnd &&
      new Date(lastWorkoutReport.dateRangeEnd) >= oneDayAgo

    metadata['generate-weekly-workout-report'] = {
      lastSync: lastWorkoutReport?.createdAt || null,
      isUpToDate: !!workoutReportUpToDate
    }

    // Nutrition report metadata (for now, same as workout report)
    metadata['generate-weekly-nutrition-report'] = {
      lastSync: lastWorkoutReport?.createdAt || null,
      isUpToDate: !!workoutReportUpToDate
    }

    // Plan metadata - should cover current/upcoming week
    const lastPlan = await prisma.report.findFirst({
      where: {
        userId,
        type: 'WEEKLY_PLAN',
        status: 'COMPLETED'
      },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        dateRangeStart: true,
        dateRangeEnd: true
      }
    })

    // Plan is up to date if it covers today through at least 3 days from now
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)

    const planUpToDate =
      lastPlan &&
      lastPlan.dateRangeStart &&
      lastPlan.dateRangeEnd &&
      new Date(lastPlan.dateRangeStart) <= today &&
      new Date(lastPlan.dateRangeEnd) >= threeDaysFromNow

    metadata['generate-weekly-plan'] = {
      lastSync: lastPlan?.createdAt || null,
      isUpToDate: !!planUpToDate
    }

    // Today's training metadata - should be for today
    const today2 = new Date()
    today2.setHours(0, 0, 0, 0)

    const lastRecommendation = await prisma.activityRecommendation.findFirst({
      where: {
        userId,
        status: 'COMPLETED',
        date: {
          gte: today2
        }
      },
      orderBy: { date: 'desc' },
      select: { date: true }
    })

    metadata['generate-daily-recommendations'] = {
      lastSync: lastRecommendation?.date || null,
      isUpToDate: !!lastRecommendation
    }

    return {
      success: true,
      metadata
    }
  } catch (error: any) {
    console.error('Error fetching task metadata:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to fetch metadata'
    })
  }
})
