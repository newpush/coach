import { defineEventHandler, createError, readBody, setCookie } from 'h3'
import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const user = session?.user as any

  // Strict admin check
  if (!user?.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden'
    })
  }

  const { userId } = await readBody(event)

  if (!userId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'User ID is required'
    })
  }

  const userToImpersonate = await prisma.user.findUnique({
    where: { id: userId }
  })

  if (!userToImpersonate) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found'
    })
  }

  console.log('[Impersonate] Admin', user.email, 'impersonating', userToImpersonate.email)

  // Set impersonation cookie - this is what the session utility checks for
  setCookie(event, 'auth.impersonated_user_id', userId, {
    httpOnly: true,
    path: '/',
    maxAge: 3600 // 1 hour
  })

  // Set metadata cookie for frontend (NOT httpOnly so frontend can read it)
  setCookie(
    event,
    'auth.impersonation_meta',
    JSON.stringify({
      adminId: user.id,
      adminEmail: user.email,
      impersonatedUserId: userId,
      impersonatedUserEmail: userToImpersonate.email
    }),
    {
      httpOnly: false,
      path: '/',
      maxAge: 3600
    }
  )

  console.log('[Impersonate] Set impersonation cookie for user:', userId)

  return { success: true }
})
