import { tasks } from '@trigger.dev/sdk/v3'
// prisma is auto-imported in server routes

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
  
  // Combine body and query (Withings can send params in either depending on setup)
  // Usually notifications are POST with body params
  const params = { ...query, ...(typeof body === 'object' ? body : {}) }
  
  const { userid, appli, startdate, enddate } = params
  
  console.log('[Withings Webhook] Received notification:', params)
  
  if (!userid) {
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
    })
    
    console.log(`[Withings Webhook] Triggered ingestion for user ${integration.userId}`)
  } catch (error) {
    console.error('[Withings Webhook] Failed to trigger ingestion:', error)
    // Still return 200 so Withings doesn't retry indefinitely
  }

  return 'OK'
})
