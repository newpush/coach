import { getServerSession } from '../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Reports'],
    summary: 'Get report detail',
    description: 'Returns the full details of a specific analysis report.',
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
                type: { type: 'string' },
                status: { type: 'string' },
                markdown: { type: 'string', nullable: true },
                analysisJson: { type: 'object', nullable: true },
                workouts: { type: 'array', items: { type: 'object' } },
                nutrition: { type: 'array', items: { type: 'object' } }
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' },
      404: { description: 'Report not found' }
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
      message: 'Report ID is required'
    })
  }

  const report = await prisma.report.findFirst({
    where: {
      id,
      userId: (session.user as any).id
    },
    include: {
      workouts: {
        include: {
          workout: {
            select: {
              id: true,
              title: true,
              type: true,
              date: true,
              durationSec: true,
              averageWatts: true,
              tss: true,
              distanceMeters: true
            }
          }
        },
        orderBy: {
          workout: {
            date: 'desc'
          }
        }
      },
      nutrition: {
        include: {
          nutrition: {
            select: {
              id: true,
              date: true,
              calories: true,
              protein: true,
              carbs: true,
              fat: true,
              fiber: true,
              caloriesGoal: true,
              proteinGoal: true,
              carbsGoal: true,
              fatGoal: true
            }
          }
        },
        orderBy: {
          nutrition: {
            date: 'desc'
          }
        }
      }
    }
  })

  if (!report) {
    throw createError({
      statusCode: 404,
      message: 'Report not found'
    })
  }

  // Find associated LLM usage
  const llmUsage = await prisma.llmUsage.findFirst({
    where: {
      entityId: report.id,
      entityType: 'Report'
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      feedback: true,
      feedbackText: true
    }
  })

  return {
    ...report,
    llmUsageId: llmUsage?.id,
    feedback: llmUsage?.feedback,
    feedbackText: llmUsage?.feedbackText
  }
})
