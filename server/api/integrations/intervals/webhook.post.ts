import { logWebhookRequest, updateWebhookStatus } from '../../../utils/webhook-logger'
import { IntervalsService } from '../../../utils/services/intervalsService'

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
      // Cap endDate at end of today (service will handle historical cap logic too)
      endDate.setHours(23, 59, 59, 999)

      switch (type) {
        case 'ACTIVITY_UPLOADED':
        case 'ACTIVITY_ANALYZED':
          // Sync last 2 days
          startDate = new Date()
          startDate.setDate(startDate.getDate() - 2)
          await IntervalsService.syncActivities(userId, startDate, endDate)
          break

        case 'ACTIVITY_UPDATED': {
          const activityDateStr = intervalEvent.activity?.start_date_local || intervalEvent.activity?.start_date
          if (activityDateStr) {
            const actDate = new Date(activityDateStr)
            startDate = new Date(actDate)
            startDate.setDate(startDate.getDate() - 1)
            endDate = new Date(actDate)
            endDate.setDate(endDate.getDate() + 1)
          } else {
            startDate = new Date()
            startDate.setDate(startDate.getDate() - 2)
          }
          await IntervalsService.syncActivities(userId, startDate, endDate)
          break
        }

        case 'WELLNESS_UPDATED':
          startDate = new Date()
          startDate.setDate(startDate.getDate() - 2)
          await IntervalsService.syncWellness(userId, startDate, endDate)
          break

        case 'FITNESS_UPDATED': {
          const records = intervalEvent.records || []
          if (records.length > 0) {
            const dates = records.map((r: any) => new Date(r.id).getTime())
            startDate = new Date(Math.min(...dates))
            endDate = new Date(Math.max(...dates))
          } else {
            startDate = new Date()
            startDate.setDate(startDate.getDate() - 2)
          }
          await IntervalsService.syncWellness(userId, startDate, endDate)
          break
        }

        case 'ACTIVITY_DELETED': {
          const deletedActivityId = intervalEvent.activity?.id || intervalEvent.id
          if (deletedActivityId) {
            await IntervalsService.deleteActivity(userId, deletedActivityId.toString())
          }
          // Sync a brief range to ensure metrics (CTL/ATL) are updated
          startDate = new Date()
          startDate.setDate(startDate.getDate() - 1)
          await IntervalsService.syncActivities(userId, startDate, endDate)
          break
        }
        
        case 'CALENDAR_UPDATED': {
          const deletedEvents = intervalEvent.deleted_events || []
          if (deletedEvents.length > 0) {
            const deletedIds = deletedEvents.map((id: any) => id.toString())
            await IntervalsService.deletePlannedWorkouts(userId, deletedIds)
          }

          // Sync wider range for calendar
          startDate = new Date()
          startDate.setDate(startDate.getDate() - 3)
          endDate = new Date()
          endDate.setDate(endDate.getDate() + 28)
          await IntervalsService.syncPlannedWorkouts(userId, startDate, endDate)
          break
        }

        default:
          console.log(`[Intervals Webhook] Unhandled event type: ${type}`)
          continue
      }
      
      console.log(`[Intervals Webhook] Processed ${type} for user ${userId} synchronously`)
    }
    
    if (log) await updateWebhookStatus(log.id, 'PROCESSED')
  } catch (error: any) {
    console.error(`[Intervals Webhook] Failed to process webhook:`, error)
    if (log) await updateWebhookStatus(log.id, 'FAILED', error.message || 'Unknown error')
  }

  return 'OK'
})
