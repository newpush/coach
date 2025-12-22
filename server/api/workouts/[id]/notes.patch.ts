import { getServerSession } from '#auth'

defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Update workout notes',
    description: 'Updates the notes for a specific workout.',
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
                workout: { $ref: '#/components/schemas/Workout' }
              }
            }
          }
        }
      },
      400: { description: 'Invalid input' },
      401: { description: 'Unauthorized' },
      404: { description: 'Workout not found' }
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

  const workoutId = getRouterParam(event, 'id')
  if (!workoutId) {
    throw createError({
      statusCode: 400,
      message: 'Workout ID is required'
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

  // Verify the workout belongs to the user
  const workout = await workoutRepository.getById(workoutId, (session.user as any).id)

  if (!workout) {
    throw createError({
      statusCode: 404,
      message: 'Workout not found'
    })
  }

  // Update the workout notes
  // Note: Repository update doesn't support 'select' yet, so we use full return or add support
  // Let's assume full object return is fine or we should modify the repo.
  // The client likely expects just the updated fields or the full object.
  // Given the API contract returns { workout: updatedWorkout }, full object is safe.
  const updatedWorkout = await workoutRepository.update(workoutId, {
    notes: notes,
    notesUpdatedAt: new Date()
  })

  return {
    success: true,
    workout: updatedWorkout
  }
})