import { getServerSession } from '#auth'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  
  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  try {
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
    await prisma.integration.delete({
      where: {
        userId_provider: {
          userId: user.id,
          provider: 'withings'
        }
      }
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to disconnect Withings:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to disconnect Withings'
    })
  }
})
