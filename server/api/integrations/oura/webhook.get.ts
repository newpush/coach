defineRouteMeta({
  openAPI: {
    tags: ['Integrations'],
    summary: 'Oura Webhook Verification',
    description: 'Verifies the Oura webhook subscription.',
    parameters: [
      { name: 'verification_token', in: 'query', schema: { type: 'string' } },
      { name: 'challenge', in: 'query', schema: { type: 'string' } }
    ],
    responses: {
      200: { description: 'Challenge accepted' },
      401: { description: 'Invalid token' }
    }
  }
})

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const verificationToken = query.verification_token as string
  const challenge = query.challenge as string

  // Use a specific verification token or fallback to client secret if not set
  // (User should configure this in Oura portal and .env)
  const expectedToken =
    process.env.OURA_WEBHOOK_VERIFICATION_TOKEN || process.env.OURA_CLIENT_SECRET

  if (verificationToken === expectedToken) {
    return { challenge }
  } else {
    throw createError({
      statusCode: 401,
      message: 'Invalid verification token'
    })
  }
})
