import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'
import { Prisma } from '@prisma/client'

defineRouteMeta({
  openAPI: {
    tags: ['Profile'],
    summary: 'Delete all athlete profiles',
    description: 'Removes all AI-generated athlete profiles and clears cached scores from the user record.',
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                count: { type: 'integer' }
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
  
  // 1. Delete all reports of type ATHLETE_PROFILE
  const result = await prisma.report.deleteMany({
    where: {
      userId,
      type: 'ATHLETE_PROFILE'
    }
  })
  
  // 2. Clear cached scores and explanations in the User record
  await prisma.user.update({
    where: { id: userId },
    data: {
      currentFitnessScore: null,
      recoveryCapacityScore: null,
      nutritionComplianceScore: null,
      trainingConsistencyScore: null,
      currentFitnessExplanation: null,
      recoveryCapacityExplanation: null,
      nutritionComplianceExplanation: null,
      trainingConsistencyExplanation: null,
      currentFitnessExplanationJson: Prisma.DbNull,
      recoveryCapacityExplanationJson: Prisma.DbNull,
      nutritionComplianceExplanationJson: Prisma.DbNull,
      trainingConsistencyExplanationJson: Prisma.DbNull,
      profileLastUpdated: null
    }
  })
  
  return {
    success: true,
    count: result.count
  }
})
