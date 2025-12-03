import { getServerSession } from '#auth'
import { prisma } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  
  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }
  
  const user = await prisma.user.findUnique({
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
      trainingConsistencyExplanation: true
    }
  }) as any
  
  if (!user) {
    throw createError({
      statusCode: 404,
      message: 'User not found'
    })
  }

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
      recoveryCapacity: user.recoveryCapacityScore,
      recoveryCapacityExplanation: user.recoveryCapacityExplanation,
      nutritionCompliance: user.nutritionComplianceScore,
      nutritionComplianceExplanation: user.nutritionComplianceExplanation,
      trainingConsistency: user.trainingConsistencyScore,
      trainingConsistencyExplanation: user.trainingConsistencyExplanation,
      lastUpdated: user.profileLastUpdated
    }
  }
})