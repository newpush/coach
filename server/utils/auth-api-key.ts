import type { H3Event } from 'h3'

/**
 * Validates an API key from the request headers.
 * Looks for 'X-API-Key' header.
 * 
 * @returns The user associated with the key if valid, null otherwise.
 */
export async function validateApiKey(event: H3Event) {
  const apiKey = getHeader(event, 'X-API-Key')
  
  if (!apiKey) {
    return null
  }

  // Hash the incoming key to compare with stored hash
  const hashedKey = hashApiKey(apiKey)

  const keyRecord = await prisma.apiKey.findUnique({
    where: {
      key: hashedKey
    },
    include: {
      user: true
    }
  })

  if (!keyRecord) {
    return null
  }

  // Check expiration if set
  if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
    return null
  }

  // Update last used timestamp (async, don't block)
  prisma.apiKey.update({
    where: { id: keyRecord.id },
    data: { lastUsedAt: new Date() }
  }).catch(err => console.error('Failed to update API key lastUsedAt:', err))

  return keyRecord.user
}

/**
 * Ensures the request is authenticated either via session OR valid API key.
 * Sets event.context.user if valid.
 */
export async function requireAuth(event: H3Event) {
  // 1. Try session (NuxtAuth)
  const session = await getServerSession(event)
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    })
    if (user) {
      event.context.user = user
      return user
    }
  }

  // 2. Try API key
  const user = await validateApiKey(event)
  if (user) {
    event.context.user = user
    return user
  }

  throw createError({
    statusCode: 401,
    message: 'Unauthorized'
  })
}
