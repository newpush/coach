import { getEffectiveUserId } from '../../utils/coaching'

defineRouteMeta({
  openAPI: {
    tags: ['Nutrition'],
    summary: 'List nutrition data',
    description: 'Returns the recent nutrition logs for the authenticated user.',
    parameters: [
      {
        name: 'limit',
        in: 'query',
        schema: { type: 'integer', default: 30 }
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
                success: { type: 'boolean' },
                count: { type: 'integer' },
                nutrition: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      date: { type: 'string', format: 'date' },
                      calories: { type: 'integer', nullable: true },
                      protein: { type: 'number', nullable: true },
                      carbs: { type: 'number', nullable: true },
                      fat: { type: 'number', nullable: true }
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
  const userId = await getEffectiveUserId(event)

  const query = getQuery(event)
  const limit = query.limit ? parseInt(query.limit as string) : 30

  try {
    const nutrition = await nutritionRepository.getForUser(userId, {
      limit,
      orderBy: { date: 'desc' }
    })

    // Format dates to avoid timezone issues
    const formattedNutrition = nutrition.map((n) => ({
      ...n,
      date: n.date.toISOString().split('T')[0] // YYYY-MM-DD format
    }))

    return {
      success: true,
      count: formattedNutrition.length,
      nutrition: formattedNutrition
    }
  } catch (error) {
    console.error('Error fetching nutrition data:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to fetch nutrition data'
    })
  }
})
