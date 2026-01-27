import { logWebhookRequest, updateWebhookStatus } from '../../../utils/webhook-logger'
import { webhookQueue } from '../../../utils/queue'
import crypto from 'node:crypto'

defineRouteMeta({
  openAPI: {
    tags: ['Integrations'],
    summary: 'Oura webhook',
    description: 'Handles incoming webhook notifications from Oura.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            additionalProperties: true
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
  const rawBody = await readRawBody(event)
  const headers = getRequestHeaders(event)
  const signature = headers['x-oura-signature']
  const timestamp = headers['x-oura-timestamp'] // Not strictly required for verification if not used in signature construction, but usually is.
  // The example code says: hmac.update(timestamp + JSON.stringify(req.body));
  // So timestamp IS required.
  const clientSecret = process.env.OURA_CLIENT_SECRET

  // 1. Validate Signature
  if (!clientSecret) {
    console.error('[Oura Webhook] Missing OURA_CLIENT_SECRET')
    throw createError({ statusCode: 500, statusMessage: 'Server Configuration Error' })
  }

  if (!signature || !rawBody) {
    // Timestamp might be needed?
    console.warn('[Oura Webhook] Missing signature headers or body')
    await logWebhookRequest({
      provider: 'oura',
      eventType: 'UNKNOWN',
      headers,
      status: 'FAILED',
      error: 'Missing signature headers'
    })
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // Oura docs: hmac.update(timestamp + body) (from the snippet in json file)
  // Let's verify if timestamp is in headers.
  if (!timestamp) {
    console.warn('[Oura Webhook] Missing timestamp header')
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const payloadToSign = `${timestamp}${rawBody}`
  const calculatedSignature = crypto
    .createHmac('sha256', clientSecret)
    .update(payloadToSign)
    .digest('hex') // Oura example says 'hex', Whoop used 'base64'. Oura example: digest('hex').toUpperCase()??
  // Example: const calculatedSignature = hmac.digest('hex').toUpperCase();
  // I need to be careful with case.

  if (
    calculatedSignature !== signature &&
    calculatedSignature.toUpperCase() !== signature &&
    calculatedSignature.toLowerCase() !== signature
  ) {
    // Try strict match first.
    // If Oura sends uppercase hex, and I generated lowercase.
    // Let's assume standard hex match.
    // I'll check strict equality first, then case insensitive.

    console.warn('[Oura Webhook] Invalid signature', {
      received: signature,
      calculated: calculatedSignature
    })

    await logWebhookRequest({
      provider: 'oura',
      eventType: 'UNKNOWN',
      headers,
      status: 'FAILED',
      error: 'Invalid signature'
    })
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // 2. Parse Body
  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch (e) {
    console.error('[Oura Webhook] Failed to parse JSON body')
    throw createError({ statusCode: 400, statusMessage: 'Invalid JSON' })
  }

  const { event_type, data_type, user_id } = body

  // 3. Log Receipt
  const log = await logWebhookRequest({
    provider: 'oura',
    eventType: event_type || 'UNKNOWN',
    payload: body,
    headers,
    status: 'PENDING'
  })

  // 4. Find User (if needed for queuing, usually we rely on externalUserId in the worker, but better to check existence here)
  if (!user_id) {
    console.warn('[Oura Webhook] Missing user_id in payload')
    if (log) await updateWebhookStatus(log.id, 'FAILED', 'Missing user_id')
    return 'OK'
  }

  const integration = await prisma.integration.findFirst({
    where: {
      provider: 'oura',
      externalUserId: user_id.toString()
    }
  })

  if (!integration) {
    console.warn(`[Oura Webhook] No integration found for user_id: ${user_id}`)
    if (log) await updateWebhookStatus(log.id, 'IGNORED', 'User not found')
    return 'OK'
  }

  // 5. Enqueue Job
  try {
    await webhookQueue.add('oura-webhook', {
      provider: 'oura',
      type: event_type,
      dataType: data_type, // Oura distinguishes data types (sleep, workout, etc.)
      userId: integration.userId,
      payload: body,
      logId: log?.id
    })
    if (log) await updateWebhookStatus(log.id, 'QUEUED')
    console.log(`[Oura Webhook] Queued event ${event_type} for user ${integration.userId}`)
  } catch (err: any) {
    console.error('[Oura Webhook] Failed to enqueue job:', err)
    if (log) await updateWebhookStatus(log.id, 'FAILED', 'Queue error')
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }

  return 'OK'
})
