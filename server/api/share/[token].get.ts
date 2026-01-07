defineRouteMeta({
  openAPI: {
    tags: ['Public'],
    summary: 'Get shared resource',
    description: 'Returns details of a shared resource via token.',
    parameters: [
      {
        name: 'token',
        in: 'path',
        required: true,
        schema: { type: 'string' }
      }
    ],
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                resourceType: { type: 'string' },
                data: { type: 'object' },
                user: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', nullable: true },
                    image: { type: 'string', nullable: true }
                  }
                }
              }
            }
          }
        }
      },
      404: { description: 'Share link not found or expired' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')

  if (!token) {
    throw createError({
      statusCode: 400,
      message: 'Share token is required'
    })
  }

  // @ts-ignore
  const shareToken = await prisma.shareToken.findUnique({
    where: { token },
    include: {
      user: {
        select: {
          name: true,
          image: true
        }
      }
    }
  })

  if (!shareToken) {
    throw createError({
      statusCode: 404,
      message: 'Share link not found'
    })
  }

  // Check expiration
  if (shareToken.expiresAt && new Date() > shareToken.expiresAt) {
    throw createError({
      statusCode: 410,
      message: 'Share link has expired'
    })
  }

  let data: any = null

  if (shareToken.resourceType === 'REPORT') {
    data = await prisma.report.findUnique({
      where: { id: shareToken.resourceId }
    })
  } else if (shareToken.resourceType === 'WORKOUT') {
    data = await prisma.workout.findUnique({
      where: { id: shareToken.resourceId },
      include: {
        streams: true
      }
    })
  } else if (shareToken.resourceType === 'NUTRITION') {
    data = await prisma.nutrition.findUnique({
      where: { id: shareToken.resourceId }
    })
  } else if (shareToken.resourceType === 'ATHLETE_PROFILE') {
    data = await prisma.report.findUnique({
      where: { id: shareToken.resourceId }
    })
  } else if (shareToken.resourceType === 'PLANNED_WORKOUT') {
    data = await prisma.plannedWorkout.findUnique({
      where: { id: shareToken.resourceId },
      include: {
        trainingWeek: {
          include: {
            block: {
              include: {
                plan: {
                  include: {
                    goal: true
                  }
                }
              }
            }
          }
        }
      }
    })
  } else if (shareToken.resourceType === 'TRAINING_PLAN') {
    data = await prisma.trainingPlan.findUnique({
      where: { id: shareToken.resourceId },
      include: {
        goal: true,
        blocks: {
          orderBy: { order: 'asc' },
          include: {
            weeks: {
              orderBy: { weekNumber: 'asc' },
              include: {
                workouts: {
                  orderBy: { date: 'asc' }
                }
              }
            }
          }
        }
      }
    })

    // If workouts don't have share tokens, generate them on the fly for the response
    if (data && data.blocks) {
      const workoutsNeedingTokens: string[] = []
      const workoutIds: string[] = []
      
      // @ts-ignore
      data.blocks.forEach((block: any) => {
        block.weeks.forEach((week: any) => {
          week.workouts.forEach((workout: any) => {
             workoutIds.push(workout.id)
          })
        })
      })

      // Fetch existing tokens for these workouts
      const existingTokens = await prisma.shareToken.findMany({
        where: {
          resourceType: 'PLANNED_WORKOUT',
          resourceId: { in: workoutIds }
        }
      })

      const tokenMap = new Map(existingTokens.map(t => [t.resourceId, t.token]))

      // Identify workouts needing tokens
      // @ts-ignore
      data.blocks.forEach((block: any) => {
        block.weeks.forEach((week: any) => {
          week.workouts.forEach((workout: any) => {
            if (!tokenMap.has(workout.id)) {
               workoutsNeedingTokens.push(workout.id)
            }
          })
        })
      })
      
      if (workoutsNeedingTokens.length > 0) {
        // Generate tokens for any workouts that don't have them yet
        await Promise.all(workoutsNeedingTokens.map(async (workoutId) => {
           const newToken = await prisma.shareToken.create({
            data: {
              userId: (data as any).userId,
              resourceType: 'PLANNED_WORKOUT',
              resourceId: workoutId,
            }
          })
          tokenMap.set(workoutId, newToken.token)
        }))
      }

      // Attach tokens to workouts in the response
      // @ts-ignore
      data.blocks.forEach((block: any) => {
        block.weeks.forEach((week: any) => {
          week.workouts.forEach((workout: any) => {
             workout.shareToken = { token: tokenMap.get(workout.id) }
          })
        })
      })
    }
  } else if (shareToken.resourceType === 'WELLNESS') {
    data = await prisma.wellness.findUnique({
      where: { id: shareToken.resourceId }
    })
  }

  if (!data) {
    throw createError({
      statusCode: 404,
      message: 'Shared resource no longer exists'
    })
  }

  return {
    resourceType: shareToken.resourceType,
    data,
    user: shareToken.user
  }
})
