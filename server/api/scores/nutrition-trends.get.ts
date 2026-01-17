import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'
import { nutritionRepository } from '../../utils/repositories/nutritionRepository'
import { getUserTimezone, getStartOfYearUTC, getUserLocalDate } from '../../utils/date'

defineRouteMeta({
  openAPI: {
    tags: ['Scores'],
    summary: 'Get nutrition trends',
    description: 'Returns nutrition scores and averages for a specified period.',
    parameters: [
      {
        name: 'days',
        in: 'query',
        schema: { type: 'integer', default: 14 }
      }
    ],
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                nutrition: { type: 'array', items: { type: 'object' } },
                summary: {
                  type: 'object',
                  properties: {
                    total: { type: 'integer' },
                    avgOverall: { type: 'number' },
                    avgMacroBalance: { type: 'number' },
                    avgQuality: { type: 'number' },
                    avgAdherence: { type: 'number' },
                    avgHydration: { type: 'number' }
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

  const query = getQuery(event)

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  })

  if (!user) {
    throw createError({
      statusCode: 404,
      message: 'User not found'
    })
  }

  const timezone = await getUserTimezone(user.id)
  let startDate = getUserLocalDate(timezone)

  if (query.days === 'YTD') {
    startDate = getStartOfYearUTC(timezone)
  } else {
    const days = parseInt(query.days as string) || 14
    startDate.setUTCDate(startDate.getUTCDate() - days)
  }

  const nutrition = (await nutritionRepository.getForUser(user.id, {
    startDate,
    orderBy: { date: 'asc' }
    // Note: 'select' is not directly exposed in getForUser options currently, returning full objects.
    // If performance is an issue, we can add 'select' to nutritionRepository.
    // For now, fetching full objects is acceptable as per standard repo pattern.
  })) as any[]

  const nutritionWithScores = nutrition.filter((n: any) => n.overallScore != null)

  return {
    nutrition: nutritionWithScores,
    summary: {
      total: nutritionWithScores.length,
      avgOverall:
        nutritionWithScores.reduce((sum: number, n: any) => sum + (n.overallScore || 0), 0) /
          nutritionWithScores.length || 0,
      avgMacroBalance:
        nutritionWithScores.reduce((sum: number, n: any) => sum + (n.macroBalanceScore || 0), 0) /
          nutritionWithScores.length || 0,
      avgQuality:
        nutritionWithScores.reduce((sum: number, n: any) => sum + (n.qualityScore || 0), 0) /
          nutritionWithScores.length || 0,
      avgAdherence:
        nutritionWithScores.reduce((sum: number, n: any) => sum + (n.adherenceScore || 0), 0) /
          nutritionWithScores.length || 0,
      avgHydration:
        nutritionWithScores.reduce((sum: number, n: any) => sum + (n.hydrationScore || 0), 0) /
          nutritionWithScores.length || 0
    }
  }
})
