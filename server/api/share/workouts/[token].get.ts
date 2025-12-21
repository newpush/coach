export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')

  if (!token) {
    throw createError({
      statusCode: 400,
      message: 'Share token is required'
    })
  }

  const workout = await prisma.workout.findUnique({
    where: {
      shareToken: token
    },
    include: {
      streams: true,
      user: {
        select: {
          name: true,
          image: true,
          hrZones: true,
          powerZones: true
        }
      }
    }
  })

  if (!workout) {
    throw createError({
      statusCode: 404,
      message: 'Workout not found or link is invalid'
    })
  }

  // Sanitize data before returning
  const { userId, externalId, ...safeWorkout } = workout
  return safeWorkout
})
