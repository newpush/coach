import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['Goals'],
    summary: 'Update goal',
    description: 'Updates a specific goal by ID.',
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
              title: { type: 'string' },
              description: { type: 'string' },
              currentValue: { type: 'number' },
              status: { type: 'string', enum: ['ACTIVE', 'COMPLETED', 'ARCHIVED'] },
              targetDate: { type: 'string', format: 'date-time' },
              targetValue: { type: 'number' },
              aiContext: { type: 'string' },
              distance: { type: 'number' },
              elevation: { type: 'number' },
              duration: { type: 'number' },
              terrain: { type: 'string' },
              phase: { type: 'string' }
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
                goal: { type: 'object' }
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' },
      403: { description: 'Forbidden' },
      404: { description: 'Goal not found' }
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
  
  const userId = (session.user as any).id
  const id = event.context.params?.id
  
  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Goal ID is required'
    })
  }
  
  // Verify the goal belongs to this user
  const existingGoal = await prisma.goal.findUnique({
    where: { id },
    select: { userId: true, eventId: true }
  })
  
  if (!existingGoal) {
    throw createError({
      statusCode: 404,
      message: 'Goal not found'
    })
  }
  
  if (existingGoal.userId !== userId) {
    throw createError({
      statusCode: 403,
      message: 'Not authorized to edit this goal'
    })
  }
  
  const body = await readBody(event)
  
  // Handle Event updates
  const { eventData, ...goalData } = body
  const data: any = { ...goalData }
  
  if (eventData) {
    const { externalId, source, title, date, ...details } = eventData
    if (externalId && source) {
      const eventRecord = await prisma.event.upsert({
        where: {
          userId_source_externalId: {
            userId,
            source,
            externalId
          }
        },
        update: {
          title,
          date: new Date(date),
          type: details.type,
          subType: details.subType,
          distance: details.distance,
          elevation: details.elevation,
          expectedDuration: details.expectedDuration,
          terrain: details.terrain
        },
        create: {
          userId,
          externalId,
          source,
          title,
          date: new Date(date),
          type: details.type,
          subType: details.subType,
          distance: details.distance,
          elevation: details.elevation,
          expectedDuration: details.expectedDuration,
          terrain: details.terrain
        }
      })
      data.eventId = eventRecord.id
    } else if (title && date) {
      // Determine which event to update
      const eventIdToUpdate = data.eventId || existingGoal.eventId
      if (eventIdToUpdate) {
        await prisma.event.update({
          where: { id: eventIdToUpdate },
          data: {
            title,
            date: new Date(date),
            type: details.type,
            subType: details.subType,
            distance: details.distance,
            elevation: details.elevation,
            expectedDuration: details.expectedDuration,
            terrain: details.terrain
          }
        })
      } else {
        const eventRecord = await prisma.event.create({
          data: {
            userId,
            title,
            date: new Date(date),
            type: details.type,
            subType: details.subType,
            distance: details.distance,
            elevation: details.elevation,
            expectedDuration: details.expectedDuration,
            terrain: details.terrain
          }
        })
        data.eventId = eventRecord.id
      }
    }
  }

  // Convert date strings to Date objects for Prisma
  if (data.targetDate && typeof data.targetDate === 'string') {
    data.targetDate = new Date(data.targetDate)
  }
  if (data.eventDate && typeof data.eventDate === 'string') {
    data.eventDate = new Date(data.eventDate)
  }
  data.updatedAt = new Date()
  
  try {
    const goal = await prisma.goal.update({
      where: { id },
      data
    })
    
    return {
      success: true,
      goal
    }
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: `Failed to update goal: ${error instanceof Error ? error.message : 'Unknown error'}`
    })
  }
})