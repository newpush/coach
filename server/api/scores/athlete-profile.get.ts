import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['Scores'],
    summary: 'Get athlete profile scores',
    description: 'Returns the current athlete profile scores and explanations.',
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                user: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string', nullable: true },
                    ftp: { type: 'integer', nullable: true },
                    weight: { type: 'number', nullable: true },
                    maxHr: { type: 'integer', nullable: true },
                    wkg: { type: 'string', nullable: true }
                  }
                },
                scores: {
                  type: 'object',
                  properties: {
                    currentFitness: { type: 'integer', nullable: true },
                    recoveryCapacity: { type: 'integer', nullable: true },
                    nutritionCompliance: { type: 'integer', nullable: true },
                    trainingConsistency: { type: 'integer', nullable: true },
                    lastUpdated: { type: 'string', format: 'date-time', nullable: true }
                  }
                }
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' },
      404: { description: 'User not found' }
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

  const user = (await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      name: true,
      ftp: true,
      weight: true,
      maxHr: true,
      currentFitnessScore: true,
      recoveryCapacityScore: true,
      nutritionComplianceScore: true,
      trainingConsistencyScore: true,
      profileLastUpdated: true,
      currentFitnessExplanation: true,
      recoveryCapacityExplanation: true,
      nutritionComplianceExplanation: true,
      trainingConsistencyExplanation: true,
      currentFitnessExplanationJson: true,
      recoveryCapacityExplanationJson: true,
      nutritionComplianceExplanationJson: true,
      trainingConsistencyExplanationJson: true
    }
  })) as any

  if (!user) {
    throw createError({
      statusCode: 404,
      message: 'User not found'
    })
  }

  // Fetch historical scores from reports
  const reports = await prisma.report.findMany({
    where: {
      userId: user.id,
      type: 'ATHLETE_PROFILE',
      status: 'COMPLETED'
    },
    orderBy: { createdAt: 'desc' },
    take: 6, // Current one + 5 previous
    select: {
      analysisJson: true,
      createdAt: true
    }
  })

  const history = reports
    .map((r) => {
      const json = r.analysisJson as any
      return {
        date: r.createdAt,
        currentFitness: json?.athlete_scores?.current_fitness,
        recoveryCapacity: json?.athlete_scores?.recovery_capacity,
        nutritionCompliance: json?.athlete_scores?.nutrition_compliance,
        trainingConsistency: json?.athlete_scores?.training_consistency
      }
    })
    .reverse()

  return {
    user: {
      id: user.id,
      name: user.name,
      ftp: user.ftp,
      weight: user.weight,
      maxHr: user.maxHr,
      wkg: user.ftp && user.weight ? (user.ftp / user.weight).toFixed(2) : null
    },
    scores: {
      currentFitness: user.currentFitnessScore,
      currentFitnessExplanation: user.currentFitnessExplanation,
      currentFitnessExplanationJson: user.currentFitnessExplanationJson,
      recoveryCapacity: user.recoveryCapacityScore,
      recoveryCapacityExplanation: user.recoveryCapacityExplanation,
      recoveryCapacityExplanationJson: user.recoveryCapacityExplanationJson,
      nutritionCompliance: user.nutritionComplianceScore,
      nutritionComplianceExplanation: user.nutritionComplianceExplanation,
      nutritionComplianceExplanationJson: user.nutritionComplianceExplanationJson,
      trainingConsistency: user.trainingConsistencyScore,
      trainingConsistencyExplanation: user.trainingConsistencyExplanation,
      trainingConsistencyExplanationJson: user.trainingConsistencyExplanationJson,
      lastUpdated: user.profileLastUpdated
    },
    history
  }
})
