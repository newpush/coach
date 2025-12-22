import { v4 as uuidv4 } from 'uuid'
import { getServerSession } from '#auth'

defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Share workout',
    description: 'Generates or revokes a public share token for a workout.',
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
            required: ['action'],
            properties: {
              action: { type: 'string', enum: ['generate', 'revoke'] }
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
                token: { type: 'string', nullable: true },
                success: { type: 'boolean', nullable: true }
              }
            }
          }
        }
      },
      400: { description: 'Invalid action' },
      401: { description: 'Unauthorized' },
      404: { description: 'Workout not found' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const workoutId = getRouterParam(event, 'id')
  const { action } = await readBody(event)

  if (!workoutId) {
    throw createError({ statusCode: 400, message: 'Workout ID required' })
  }

  const userId = (session.user as any).id

  // Verify ownership
  const workout = await prisma.workout.findUnique({
    where: { id: workoutId, userId }
  })

  if (!workout) {
    throw createError({ statusCode: 404, message: 'Workout not found' })
  }

  if (action === 'generate') {
    // Generate or return existing token
    if (workout.shareToken) {
      return { token: workout.shareToken }
    }

    const token = uuidv4()
    const updated = await prisma.workout.update({
      where: { id: workoutId },
      data: { shareToken: token }
    })
    return { token: updated.shareToken }
  } 
  
  if (action === 'revoke') {
    await prisma.workout.update({
      where: { id: workoutId },
      data: { shareToken: null }
    })
    return { success: true }
  }

  throw createError({ statusCode: 400, message: 'Invalid action' })
})
