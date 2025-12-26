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
  // eventDate: z.string().optional(), // Deprecated for EVENT goals
  // eventType: z.string().optional(), // Deprecated for EVENT goals
  metric: z.string().optional(),
  targetValue: z.number().optional(),
  startValue: z.number().optional(),
  currentValue: z.number().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  aiContext: z.string().optional(),
  distance: z.number().optional(), // Keep for Performance goals
  elevation: z.number().optional(), // Keep for Performance goals
  duration: z.number().optional(), // Keep for Performance goals
  terrain: z.string().optional(),
  phase: z.string().optional(),
  eventIds: z.array(z.string()).optional(), // Multiple events
  eventId: z.string().optional(), // Single event (backward compat)
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
  
  // Consistency Check: Event driven goals must have at least one event
  const hasEventIds = (data.eventIds && data.eventIds.length > 0) || !!data.eventId
  const hasEventData = !!data.eventData
  
  if (data.type === 'EVENT' && !hasEventIds && !hasEventData) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Event driven goals must have at least one event attached.'
    })
  }
  
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
    const eventsToConnect: { id: string }[] = []
    
    // Add existing IDs
    if (data.eventIds) {
      data.eventIds.forEach(id => eventsToConnect.push({ id }))
    }
    if (data.eventId) {
      if (!eventsToConnect.some(e => e.id === data.eventId)) {
        eventsToConnect.push({ id: data.eventId })
      }
    }
    
    // Create new event if provided
    if (data.eventData) {
      const { externalId, source, title, date, ...details } = data.eventData
      let newEventId: string
      
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
        newEventId = eventRecord.id
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
        newEventId = eventRecord.id
      }
      
      if (!eventsToConnect.some(e => e.id === newEventId)) {
        eventsToConnect.push({ id: newEventId })
      }
    }
    
    // Determine targetDate if not set (use latest event date)
    let finalTargetDate = data.targetDate ? new Date(data.targetDate) : null
    
    if (!finalTargetDate && eventsToConnect.length > 0) {
      // We need to fetch the dates of the events to determine the latest one
      // Optimization: If we just created one, we know the date.
      // If we only have IDs, we need to query.
      const eventIds = eventsToConnect.map(e => e.id)
      const linkedEvents = await prisma.event.findMany({
        where: { id: { in: eventIds } },
        select: { date: true }
      })
      
      if (linkedEvents.length > 0) {
        // Find max date
        const maxDate = linkedEvents.reduce((max, e) => e.date > max ? e.date : max, linkedEvents[0].date)
        finalTargetDate = maxDate
      }
    }

    // Prepare Goal Data
    // We strictly avoid duplicating event data for EVENT goals
    const isEventGoal = data.type === 'EVENT'
    
    const goal = await prisma.goal.create({
      data: {
        userId: user.id,
        type: data.type,
        title: data.title,
        description: data.description,
        targetDate: finalTargetDate,
        
        // For EVENT goals, we do NOT set these redundant fields
        // For other goals, we allow them
        eventDate: isEventGoal ? null : (data.eventDate ? new Date(data.eventDate) : null),
        eventType: isEventGoal ? null : data.eventType, // Or should this be null too?
        distance: isEventGoal ? null : data.distance,
        elevation: isEventGoal ? null : data.elevation,
        duration: isEventGoal ? null : data.duration,
        terrain: isEventGoal ? null : data.terrain,
        
        metric: data.metric,
        targetValue: data.targetValue,
        startValue: data.startValue,
        currentValue: data.currentValue || data.startValue,
        priority: data.priority,
        aiContext: data.aiContext || `Goal: ${data.title}. Type: ${data.type}.`,
        phase: data.phase,
        
        events: eventsToConnect.length > 0 ? { connect: eventsToConnect } : undefined
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
