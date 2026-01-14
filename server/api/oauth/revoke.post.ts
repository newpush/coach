import { oauthRepository } from '../../utils/repositories/oauthRepository'
import { logAction } from '../../utils/audit'

defineRouteMeta({
  openAPI: {
    tags: ['OAuth'],
    summary: 'Revoke Token',
    description: 'Invalidates an access token or refresh token.',
    requestBody: {
      content: {
        'application/x-www-form-urlencoded': {
          schema: {
            type: 'object',
            required: ['token'],
            properties: {
              token: { type: 'string' },
              token_type_hint: { type: 'string', enum: ['access_token', 'refresh_token'] },
              client_id: { type: 'string' },
              client_secret: { type: 'string' }
            }
          }
        }
      }
    },
    responses: {
      200: { description: 'Success' },
      400: { description: 'Bad Request' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { token, client_id, client_secret } = body

  if (!token) {
    throw createError({ statusCode: 400, message: 'Missing token parameter' })
  }

  // Optional client verification (recommended for confidential clients)
  if (client_id && client_secret) {
    const isValid = await oauthRepository.verifyClient(client_id, client_secret)
    if (!isValid) {
      // RFC 7009 says: "The authorization server SHOULD NOT disclose the
      // reason for a failed revocation to the client"
      // But we return 200 even if token is not found.
    }
  }

  const revoked = await oauthRepository.revokeToken(token)

  if (revoked) {
    await logAction({
      userId: revoked.userId,
      action: 'TOKEN_REVOKED',
      resourceType: 'OAuthToken',
      resourceId: revoked.id,
      metadata: { appId: revoked.appId, tokenTypeHint: body.token_type_hint },
      event
    })
  }

  // RFC 7009: "The server responds with HTTP status code 200 if the token has
  // been revoked successfully or if the client submitted an invalid token."
  return { success: true }
})
