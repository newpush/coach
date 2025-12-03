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

  const query = getQuery(event)
  const days = parseInt(query.days as string) || 14
  
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
  
  const nutrition = await prisma.nutrition.findMany({
    where: {
      userId: user.id,
      date: {
        gte: startDate
      }
    },
    select: {
      id: true,
      date: true,
      calories: true,
      protein: true,
      carbs: true,
      fat: true
    },
    orderBy: {
      date: 'asc'
    }
  }) as any[]
  
  const nutritionWithScores = nutrition.filter((n: any) => n.overallScore != null)
  
  return {
    nutrition: nutritionWithScores,
    summary: {
      total: nutritionWithScores.length,
      avgOverall: nutritionWithScores.reduce((sum: number, n: any) => sum + (n.overallScore || 0), 0) / nutritionWithScores.length || 0,
      avgMacroBalance: nutritionWithScores.reduce((sum: number, n: any) => sum + (n.macroBalanceScore || 0), 0) / nutritionWithScores.length || 0,
      avgQuality: nutritionWithScores.reduce((sum: number, n: any) => sum + (n.qualityScore || 0), 0) / nutritionWithScores.length || 0,
      avgAdherence: nutritionWithScores.reduce((sum: number, n: any) => sum + (n.adherenceScore || 0), 0) / nutritionWithScores.length || 0,
      avgHydration: nutritionWithScores.reduce((sum: number, n: any) => sum + (n.hydrationScore || 0), 0) / nutritionWithScores.length || 0
    }
  }
})