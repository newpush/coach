import { getServerSession } from '../../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Nutrition'],
    summary: 'Update nutrition notes',
    description: 'Updates the notes for a specific nutrition entry.',
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' }
      }
    ],
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              notes: { type: 'string', nullable: true }
            }
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                nutrition: { type: 'object' }
              }
            }
          }
        }
      },
      400: { description: 'Invalid input' },
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

  const nutritionId = getRouterParam(event, 'id')
  if (!nutritionId) {
    throw createError({
      statusCode: 400,
      message: 'Nutrition ID is required'
    })
  }

  const body = await readBody(event)
  const { notes } = body

  if (typeof notes !== 'string' && notes !== null) {
    throw createError({
      statusCode: 400,
      message: 'Notes must be a string or null'
    })
  }

  // Verify the nutrition entry belongs to the user
  const nutrition = await nutritionRepository.getById(nutritionId, (session.user as any).id)

  if (!nutrition) {
    throw createError({
      statusCode: 404,
      message: 'Nutrition entry not found'
    })
  }

  // Update the nutrition notes
  const updatedNutrition = await nutritionRepository.update(nutritionId, {
    notes: notes,
    notesUpdatedAt: new Date()
  })

  return {
    success: true,
    nutrition: updatedNutrition
  }
})
