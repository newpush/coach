import { getServerSession } from '#auth'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  
  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  try {
    const userId = (session.user as any).id

    const wellness = await wellnessRepository.getForUser(userId, {
      limit: 90,
      orderBy: { date: 'desc' }
    })

    return wellness
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: 'Failed to fetch wellness data'
    })
  }
})