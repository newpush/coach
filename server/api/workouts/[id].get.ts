import { getServerSession } from '../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Get workout details',
    description: 'Returns the full details for a specific workout.',
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
            schema: { $ref: '#/components/schemas/Workout' }
          }
        }
      },
      404: { description: 'Workout not found' },
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

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Workout ID is required'
    })
  }

  const workout = await workoutRepository.getById(id, (session.user as any).id, {
    include: {
      streams: true,
      duplicates: true,
      canonicalWorkout: true,
      plannedWorkout: true,
      planAdherence: true,
      exercises: {
        include: {
          exercise: true,
          sets: {
            orderBy: {
              order: 'asc'
            }
          }
        },
        orderBy: {
          order: 'asc'
        }
      }
    }
  })

  if (!workout) {
    throw createError({
      statusCode: 404,
      message: 'Workout not found'
    })
  }

  // Find associated LLM usage
  const llmUsage = await prisma.llmUsage.findFirst({
    where: {
      entityId: workout.id,
      entityType: 'Workout'
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      feedback: true,
      feedbackText: true
    }
  })

  return {
    ...workout,
    llmUsageId: llmUsage?.id,
    feedback: llmUsage?.feedback,
    feedbackText: llmUsage?.feedbackText
  }
})
