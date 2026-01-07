import 'dotenv/config'
import { prisma } from '../server/utils/db'

async function checkScores() {
  try {
    const user = await prisma.user.findFirst({
      select: {
        email: true,
        currentFitnessScore: true,
        recoveryCapacityScore: true,
        nutritionComplianceScore: true,
        trainingConsistencyScore: true,
        profileLastUpdated: true
      }
    })

    console.log('User Profile Scores:')
    console.log(JSON.stringify(user, null, 2))
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkScores()
