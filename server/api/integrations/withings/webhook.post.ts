import { tasks } from '@trigger.dev/sdk/v3'
import { logWebhookRequest, updateWebhookStatus } from '../../../utils/webhook-logger'
// prisma is auto-imported in server routes

defineRouteMeta({
  openAPI: {
    tags: ['Integrations'],
    summary: 'Withings webhook',
    description: 'Handles incoming webhook notifications from Withings.',
    requestBody: {
      content: {
        'application/x-www-form-urlencoded': {
          schema: {
            type: 'object',
            properties: {
              userid: { type: 'string' },
              appli: { type: 'string' },
              startdate: { type: 'string' },
              enddate: { type: 'string' }
            }
          }
        },
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              userid: { type: 'string' },
              appli: { type: 'string' },
              startdate: { type: 'string' },
              enddate: { type: 'string' }
            }
          }
        }
      }
    },
    responses: {
      200: { description: 'OK' },
      400: { description: 'Missing userid' }
    }
  }
})

export default defineEventHandler(async (event) => {
  // 1. Verify Request
  // Withings usually sends a HEAD request to verify the endpoint
  if (event.method === 'HEAD') {
    return 'OK'
  }
  
  // 2. Parse Payload
  // The notification payload is sent as form-data or urlencoded
  const body = await readBody(event)
  const query = getQuery(event)
  const headers = getRequestHeaders(event)
  
  // Combine body and query (Withings can send params in either depending on setup)
  // Usually notifications are POST with body params
  const params = { ...query, ...(typeof body === 'object' ? body : {}) }
  
  const { userid, appli, startdate, enddate } = params
  
  const log = await logWebhookRequest({
    provider: 'withings',
    eventType: 'NOTIFICATION', // Withings sends generic notifications
    payload: params,
    headers,
    status: 'PENDING'
  })
  
  console.log('[Withings Webhook] Received notification:', params)
  
  if (!userid) {
    if (log) await updateWebhookStatus(log.id, 'FAILED', 'Missing userid')
    throw createError({
      statusCode: 400,
      message: 'Missing userid'
    })
  }

  // 3. Find Integration
  // We need to find the user associated with this Withings user ID
  const integration = await prisma.integration.findFirst({
    where: {
      provider: 'withings',
      externalUserId: userid.toString()
    }
  })

  if (!integration) {
    console.warn(`[Withings Webhook] Integration not found for external user ${userid}`)
    if (log) await updateWebhookStatus(log.id, 'IGNORED', `Integration not found for external user ${userid}`)
    // Return 200 to acknowledge receipt even if we can't process it (to prevent retries)
    return 'OK'
  }

  // 4. Trigger Ingestion
  // We'll trigger the ingestion task for the specific range
  // Default to today if no dates provided (though notifications usually include them)
  const now = new Date()
  const start = startdate ? new Date(parseInt(startdate) * 1000) : new Date(now.setHours(0,0,0,0))
  const end = enddate ? new Date(parseInt(enddate) * 1000) : new Date(now.setHours(23,59,59,999))
  
  // Add a buffer to start/end to ensure we catch everything around the event
  // e.g. -1 day for start, +1 day for end
  const bufferStart = new Date(start.getTime() - 24 * 60 * 60 * 1000)
  const bufferEnd = new Date(end.getTime() + 24 * 60 * 60 * 1000)

  try {
    await tasks.trigger("ingest-withings", {
      userId: integration.userId,
      startDate: bufferStart.toISOString(),
      endDate: bufferEnd.toISOString()
    }, {
      concurrencyKey: integration.userId
    })
    
    console.log(`[Withings Webhook] Triggered ingestion for user ${integration.userId}`)
    if (log) await updateWebhookStatus(log.id, 'PROCESSED')
  } catch (error: any) {
    console.error('[Withings Webhook] Failed to trigger ingestion:', error)
    if (log) await updateWebhookStatus(log.id, 'FAILED', error.message || 'Failed to trigger ingestion')
    // Still return 200 so Withings doesn't retry indefinitely
  }

  return 'OK'
})
