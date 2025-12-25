import { z } from 'zod'
import { getServerSession } from '../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Goals'],
    summary: 'Create goal',
    description: 'Creates a new goal for the authenticated user.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['type', 'title'],
            properties: {
              type: { type: 'string', enum: ['BODY_COMPOSITION', 'EVENT', 'PERFORMANCE', 'CONSISTENCY'] },
              title: { type: 'string' },
              description: { type: 'string' },
              targetDate: { type: 'string', format: 'date-time' },
              eventDate: { type: 'string', format: 'date-time' },
              eventType: { type: 'string' },
              metric: { type: 'string' },
              targetValue: { type: 'number' },
              startValue: { type: 'number' },
              currentValue: { type: 'number' },
              priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },
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
                goal: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    title: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      },
      400: { description: 'Invalid input' },
      401: { description: 'Unauthorized' }
    }
  }
})

const goalSchema = z.object({
  type: z.enum(['BODY_COMPOSITION', 'EVENT', 'PERFORMANCE', 'CONSISTENCY']),
  title: z.string(),
  description: z.string().optional(),
  targetDate: z.string().optional(), // ISO string
  eventDate: z.string().optional(), // ISO string
  eventType: z.string().optional(),
  metric: z.string().optional(),
  targetValue: z.number().optional(),
  startValue: z.number().optional(),
  currentValue: z.number().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  aiContext: z.string().optional(),
  distance: z.number().optional(),
  elevation: z.number().optional(),
  duration: z.number().optional(),
  terrain: z.string().optional(),
  phase: z.string().optional(),
  eventId: z.string().optional(),
  eventData: z.object({
    externalId: z.string().optional(),
    source: z.string().optional(),
    title: z.string(),
    date: z.string(),
    type: z.string().optional(),
    subType: z.string().optional(),
    distance: z.number().optional(),
    elevation: z.number().optional(),
    expectedDuration: z.number().optional(),
    terrain: z.string().optional()
  }).optional()
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  
  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }
  
  const body = await readBody(event)
  const result = goalSchema.safeParse(body)
  
  if (!result.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid input',
      data: result.error.issues
    })
  }
  
  const data = result.data
  
  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })
    
    if (!user) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found'
      })
    }
    
    // Handle Event creation/linkage
    let finalEventId = data.eventId
    
    if (data.eventData) {
      const { externalId, source, title, date, ...details } = data.eventData
      
      if (externalId && source) {
        const eventRecord = await prisma.event.upsert({
          where: {
            userId_source_externalId: {
              userId: user.id,
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
            userId: user.id,
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
        finalEventId = eventRecord.id
      } else {
        const eventRecord = await prisma.event.create({
          data: {
            userId: user.id,
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
        finalEventId = eventRecord.id
      }
    }
    
    const goal = await prisma.goal.create({
      data: {
        userId: user.id,
        type: data.type,
        title: data.title,
        description: data.description,
        targetDate: data.targetDate ? new Date(data.targetDate) : null,
        eventDate: data.eventDate ? new Date(data.eventDate) : null,
        eventType: data.eventType,
        metric: data.metric,
        targetValue: data.targetValue,
        startValue: data.startValue,
        currentValue: data.currentValue || data.startValue,
        priority: data.priority,
        aiContext: data.aiContext || `Goal: ${data.title}. Type: ${data.type}.`,
        distance: data.distance,
        elevation: data.elevation,
        duration: data.duration,
        terrain: data.terrain,
        phase: data.phase,
        eventId: finalEventId
      }
    })
    
    return {
      success: true,
      goal: {
        id: goal.id,
        title: goal.title
      }
    }
  } catch (error: any) {
    console.error('Error creating goal:', error)
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || 'Internal Server Error'
    })
  }
})
