import { requireAuth } from '../../utils/auth-guard'
import { nutritionDatabaseService } from '../../utils/services/nutritionDatabaseService'

defineRouteMeta({
  openAPI: {
    tags: ['Nutrition'],
    summary: 'Search nutrition database',
    description: 'Search branded and generic food items from the nutrition feeder service.',
    security: [{ bearerAuth: [] }],
    inputSchema: [
      {
        name: 'q',
        in: 'query',
        required: true,
        schema: { type: 'string' }
      },
      {
        name: 'limit',
        in: 'query',
        schema: { type: 'integer', default: 10 }
      }
    ]
  }
})

export default defineEventHandler(async (event) => {
  await requireAuth(event, ['nutrition:read'])

  const query = getQuery(event)
  const q = Array.isArray(query.q) ? query.q[0] : query.q
  const limitRaw = Array.isArray(query.limit) ? query.limit[0] : query.limit

  if (!q || typeof q !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Query parameter "q" is required'
    })
  }

  const limit = limitRaw ? parseInt(limitRaw as string, 10) : 10
  const items = await nutritionDatabaseService.searchFoodDatabase(q, limit)

  // Drop items the database has no energy or macro data for. Their zeros are
  // placeholders, and offering them as selectable results silently under-reports
  // intake, which then feeds fuelling recommendations. Items that genuinely
  // state 0 kcal (water, black coffee, diet drinks) report has_nutrition_data
  // true and are kept.
  const usable = items.filter((item) => item.has_nutrition_data !== false)

  return {
    success: true,
    count: usable.length,
    items: usable
  }
})
