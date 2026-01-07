import { getServerSession } from '../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Share'],
    summary: 'Generate share token',
    description: 'Generates a share token for a specific resource.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['resourceType', 'resourceId'],
            properties: {
              resourceType: { type: 'string', enum: ['WORKOUT', 'REPORT', 'NUTRITION', 'PLANNED_WORKOUT', 'TRAINING_PLAN', 'WELLNESS'] },
              resourceId: { type: 'string' },
              expiresIn: { type: 'number', description: 'Expiration in seconds' }
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
                token: { type: 'string' },
                url: { type: 'string' }
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' },
      404: { description: 'Resource not found' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const userId = (session.user as any).id
  if (!userId) {
    throw createError({ statusCode: 401, message: 'User ID not found in session' })
  }
  const { resourceType, resourceId, expiresIn } = await readBody(event)

  if (!resourceType || !resourceId) {
    throw createError({ statusCode: 400, message: 'Missing resourceType or resourceId' })
  }

  // Verify resource existence and ownership
  let resourceExists = false
  if (resourceType === 'REPORT') {
    const report = await prisma.report.findFirst({
      where: { id: resourceId, userId }
    })
    resourceExists = !!report
  } else if (resourceType === 'WORKOUT') {
    const workout = await prisma.workout.findFirst({
      where: { id: resourceId, userId }
    })
    resourceExists = !!workout
  } else if (resourceType === 'NUTRITION') {
    const nutrition = await prisma.nutrition.findFirst({
      where: { id: resourceId, userId }
    })
    resourceExists = !!nutrition
  } else if (resourceType === 'PLANNED_WORKOUT') {
    const planned = await prisma.plannedWorkout.findFirst({
      where: { id: resourceId, userId }
    })
    resourceExists = !!planned
  } else if (resourceType === 'TRAINING_PLAN') {
    const plan = await prisma.trainingPlan.findFirst({
      where: { id: resourceId, userId }
    })
    resourceExists = !!plan
  } else if (resourceType === 'WELLNESS') {
    const wellness = await prisma.wellness.findFirst({
      where: { id: resourceId, userId }
    })
    resourceExists = !!wellness
  }

  if (!resourceExists) {
    throw createError({ statusCode: 404, message: 'Resource not found or access denied' })
  }

  // Check for existing token
  // @ts-ignore - prisma client might need regeneration for newly added models
  let shareToken = await prisma.shareToken.findFirst({
    where: { userId, resourceType, resourceId }
  })

  if (!shareToken) {
    // @ts-ignore
    shareToken = await prisma.shareToken.create({
      data: {
        userId,
        resourceType,
        resourceId,
        expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null // Default to null (no expiration)
      }
    })
  }

  const config = useRuntimeConfig()
  const siteUrl = config.public.siteUrl || 'http://localhost:3000'
  let sharePath = ''
  
  switch(resourceType) {
    case 'REPORT': sharePath = '/share/profile'; break;
    case 'WORKOUT': sharePath = '/share/workouts'; break;
    case 'NUTRITION': sharePath = '/share/nutrition'; break;
    case 'PLANNED_WORKOUT': sharePath = '/share/planned-workout'; break;
    case 'TRAINING_PLAN': sharePath = '/share/plan'; break;
    case 'WELLNESS': sharePath = '/share/wellness'; break;
    default: sharePath = `/share/${resourceType.toLowerCase()}`;
  }

  return {
    token: shareToken.token,
    url: `${siteUrl}${sharePath}/${shareToken.token}`
  }
})
