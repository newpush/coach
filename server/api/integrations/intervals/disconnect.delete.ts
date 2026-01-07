import { getServerSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  // Find the user
  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  })

  if (!user) {
    throw createError({
      statusCode: 404,
      message: 'User not found'
    })
  }

  // Delete the integration
  await prisma.integration.deleteMany({
    where: {
      userId: user.id,
      provider: 'intervals'
    }
  })

  // Delete the account (fix for reconnection issue)
  await prisma.account.deleteMany({
    where: {
      userId: user.id,
      provider: 'intervals'
    }
  })

  // Also remove the linked account if it exists (for OAuth login/linking)
  // But be careful not to delete the user's primary login if they have one?
  // The Account table stores the OAuth link.
  // If we disconnect the "App", we should remove the Integration record.
  // The Account record is for "Sign In". Removing it might prevent them from signing in again?
  // Usually "Disconnect" in settings implies removing the data sync connection (Integration).
  // If they signed in with it, they might still want to sign in?
  // But if they disconnect, they probably want to revoke access.

  // Let's just delete the Integration record for now, which stops the sync.
  // The Account record allows them to "Log in with Intervals" which is fine.

  return {
    success: true
  }
})
