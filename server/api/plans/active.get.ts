import { prisma } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const plan = await prisma.trainingPlan.findFirst({
    where: {
      userId: session.user.id,
      status: 'ACTIVE'
    },
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

  return { plan }
})
