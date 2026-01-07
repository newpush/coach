import type { H3Event } from 'h3'
import { getServerSession } from '#auth'
import { coachingRepository } from './repositories/coachingRepository'

/**
 * Gets the effective user ID for the current request.
 * If the user is a coach acting as an athlete, it returns the athlete's ID
 * after verifying the coaching relationship.
 */
export async function getEffectiveUserId(event: H3Event): Promise<string> {
  // 1. Try session (NuxtAuth)
  const session = await getServerSession(event)
  let userId: string | null = null

  if (session?.user) {
    userId = (session.user as any).id
  } else {
    // 2. Try API key
    const user = await validateApiKey(event)
    if (user) {
      userId = user.id
    }
  }

  if (!userId) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const actAsUserId = getHeader(event, 'x-act-as-user')

  if (!actAsUserId || actAsUserId === userId) {
    return userId
  }

  // Verify coaching relationship
  const hasRelationship = await coachingRepository.checkRelationship(userId, actAsUserId)
  if (!hasRelationship) {
    throw createError({
      statusCode: 403,
      message: "You do not have permission to access this athlete's data"
    })
  }

  return actAsUserId
}
