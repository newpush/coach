import { getServerSession } from '../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Nutrition'],
    summary: 'Get nutrition entry',
    description: 'Returns a specific nutrition log by ID.',
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' }
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
      },
      401: { description: 'Unauthorized' },
      404: { description: 'Nutrition entry not found' }
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

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Nutrition ID is required'
    })
  }

  const nutrition = await nutritionRepository.getById(id, (session.user as any).id)

  if (!nutrition) {
    throw createError({
      statusCode: 404,
      message: 'Nutrition entry not found'
    })
  }

  // Find associated LLM usage
  const llmUsage = await prisma.llmUsage.findFirst({
    where: {
      entityId: nutrition.id,
      entityType: 'Nutrition'
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      feedback: true,
      feedbackText: true
    }
  })

  // Format date to avoid timezone issues
  return {
    ...nutrition,
    date: nutrition.date.toISOString().split('T')[0], // YYYY-MM-DD format
    llmUsageId: llmUsage?.id,
    feedback: llmUsage?.feedback,
    feedbackText: llmUsage?.feedbackText
  }
})
