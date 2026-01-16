import { webhookQueue } from '../../../utils/queue'
import { logWebhookRequest, updateWebhookStatus } from '../../../utils/webhook-logger'

defineRouteMeta({
  openAPI: {
    tags: ['Integrations'],
    summary: 'Intervals.icu async webhook',
    description:
      'Handles incoming webhook notifications from Intervals.icu asynchronously via Redis queue.',
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

  if (!body || body.secret !== secret) {
    console.warn('[Intervals Webhook Async] Unauthorized or missing secret')
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized: Invalid secret'
    })
  }

  try {
    // Enqueue the entire bulk request for the worker to handle logging and splitting
    await webhookQueue.add('intervals-webhook-bulk', {
      provider: 'intervals-bulk',
      payload: body,
      headers
    })
  } catch (error: any) {
    console.error('[Intervals Webhook Async] Failed to queue bulk request:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error'
    })
  }

  return 'OK'
})
