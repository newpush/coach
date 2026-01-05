import { tasks } from '@trigger.dev/sdk/v3'
import { logWebhookRequest, updateWebhookStatus } from '../../../utils/webhook-logger'

defineRouteMeta({
  openAPI: {
    tags: ['Integrations'],
    summary: 'Intervals.icu webhook',
    description: 'Handles incoming webhook notifications from Intervals.icu for activities, calendar, and wellness updates.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              secret: { type: 'string' },
              events: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    athlete_id: { type: 'string' },
                    type: { type: 'string' },
                    timestamp: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    responses: {
      200: { description: 'OK' },
      401: { description: 'Unauthorized' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const secret = process.env.INTERVALS_WEBHOOK_SECRET
  
  const body = await readBody(event)
  const headers = getRequestHeaders(event)
  
  // Log receipt
  const log = await logWebhookRequest({
    provider: 'intervals',
    eventType: body?.events?.[0]?.type || 'UNKNOWN',
    payload: body,
    headers,
    status: 'PENDING'
  })
  
  if (!body || body.secret !== secret) {
    console.warn('[Intervals Webhook] Unauthorized or missing secret')
    if (log) await updateWebhookStatus(log.id, 'FAILED', 'Unauthorized: Invalid secret')
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized: Invalid secret",
    })
  }

  const events = body.events || []
  console.log(`[Intervals Webhook] Received ${events.length} events`)

  try {
    for (const intervalEvent of events) {
      const { athlete_id, type } = intervalEvent
      
      if (!athlete_id) continue

      // Find integration for this athlete
      const integration = await prisma.integration.findFirst({
        where: {
          provider: 'intervals',
          externalUserId: athlete_id.toString()
        }
      })

      if (!integration) {
        console.warn(`[Intervals Webhook] No integration found for athlete_id: ${athlete_id}`)
        continue
      }

      const userId = integration.userId
      console.log(`[Intervals Webhook] Processing ${type} for user ${userId}`)

      // Determine sync range
      let startDate: Date
      let endDate: Date = new Date()
      // Cap endDate at end of today
      endDate.setHours(23, 59, 59, 999)

      switch (type) {
        case 'ACTIVITY_UPLOADED':
        case 'ACTIVITY_ANALYZED':
        case 'WELLNESS_UPDATED':
          // Sync last 2 days to be safe and catch the updated data
          startDate = new Date()
          startDate.setDate(startDate.getDate() - 2)
          break

        case 'ACTIVITY_DELETED':
          // Handle activity deletion explicitly since ingest-intervals only upserts
          const deletedActivityId = intervalEvent.activity?.id || intervalEvent.id
          if (deletedActivityId) {
            await prisma.workout.deleteMany({
              where: {
                userId,
                source: 'intervals',
                externalId: deletedActivityId.toString()
              }
            })
            console.log(`[Intervals Webhook] Deleted activity ${deletedActivityId} for user ${userId}`)
          }
          // Also trigger a brief sync to ensure CTL/ATL etc are updated if they were impacted
          startDate = new Date()
          startDate.setDate(startDate.getDate() - 1)
          break
        
        case 'CALENDAR_UPDATED':
          // Handle deleted calendar events explicitly
          const deletedEvents = intervalEvent.deleted_events || []
          if (deletedEvents.length > 0) {
            const deletedIds = deletedEvents.map((id: any) => id.toString())
            await prisma.plannedWorkout.deleteMany({
              where: {
                userId,
                externalId: { in: deletedIds }
              }
            })
            console.log(`[Intervals Webhook] Deleted ${deletedEvents.length} planned workouts for user ${userId}`)
            
            // Also check if any racing events need to be deleted
            await prisma.event.deleteMany({
              where: {
                userId,
                source: 'intervals',
                externalId: { in: deletedIds }
              }
            })
          }

          // Sync a wider range for calendar updates (last 3 days to 4 weeks ahead)
          // to catch new or modified events
          startDate = new Date()
          startDate.setDate(startDate.getDate() - 3)
          endDate = new Date()
          endDate.setDate(endDate.getDate() + 28)
          break

        default:
          console.log(`[Intervals Webhook] Unhandled event type: ${type}`)
          continue
      }

      await tasks.trigger('ingest-intervals', {
        userId,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      }, {
        concurrencyKey: userId
      })
      console.log(`[Intervals Webhook] Triggered ingest-intervals for user ${userId} (${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]})`)
    }
    
    if (log) await updateWebhookStatus(log.id, 'PROCESSED')
  } catch (error: any) {
    console.error(`[Intervals Webhook] Failed to process webhook:`, error)
    if (log) await updateWebhookStatus(log.id, 'FAILED', error.message || 'Unknown error')
  }

  return 'OK'
})
