import { z } from 'zod'
import { logWebhookRequest } from '../../../utils/webhook-logger'
import { prisma } from '../../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['OAuth'],
    summary: 'Generic OAuth Webhook',
    description:
      'A generic webhook endpoint for third-party OAuth applications to push data. Captures the raw payload and associates it with the application.',
    inputSchema: [
      {
        name: 'clientId',
        in: 'path',
        required: true,
        schema: { type: 'string' }
      }
    ],
    responses: {
      200: { description: 'OK' },
      404: { description: 'Application Not Found' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const clientId = getRouterParam(event, 'clientId')
  const body = await readBody(event)
  const headers = getRequestHeaders(event)
  const query = getQuery(event)

  // 1. Identify the application
  const app = await prisma.oAuthApp.findUnique({
    where: { clientId }
  })

  if (!app) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Application not found'
    })
  }

  // 2. Check secret (optional for now, but we capture the result)
  // Secret can be in header X-Webhook-Secret or in query param 'secret'
  const providedSecret = (headers['x-webhook-secret'] as string) || (query.secret as string)
  const secretMatched = app.webhookSecret && providedSecret === app.webhookSecret

  // 3. Log the request - set status to PENDING for the worker poller to pick up.
  //
  // Both worker-facing fields MUST be written in this single `create`. The
  // poller (`claimPendingWebhookLogs` in cli/worker/start.ts) atomically flips
  // PENDING -> QUEUED, and `buildWebhookJob` derives the job's `appName` from
  // `eventType` and `secretMatched` from `error`. A row created with placeholder
  // values and corrected by a follow-up `update` can be claimed in between, and
  // because the claim is atomic the wrong values are permanent - nothing
  // re-reads the row afterwards. See CW-503.
  //
  // NOTE: `error` doubles as the secret-verification result here rather than
  // carrying an actual error. That overloading is pre-existing and intentional
  // for now (the worker reads `log.error === 'SECRET_MATCHED'`); giving the
  // WebhookLog schema a dedicated column is tracked in CW-564.
  const secretStatus = secretMatched
    ? 'SECRET_MATCHED'
    : providedSecret
      ? 'SECRET_MISMATCH'
      : 'NO_SECRET_PROVIDED'

  await logWebhookRequest({
    provider: `oauth-generic`,
    // Metadata for the generic worker - must be final at creation time.
    eventType: `oauth:${app.name}`,
    payload: body,
    headers,
    query,
    status: 'PENDING',
    error: secretStatus
  })

  // Always return 200 OK as per requirement to be developer-friendly
  return {
    status: 'success',
    message: 'Data captured',
    receivedAt: new Date().toISOString(),
    secretMatched
  }
})
