import { getServerSession } from '../../../utils/session'
import { prisma } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user?.email) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  // Get user ID from email
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true }
  })

  if (!user) {
    throw createError({ statusCode: 401, message: 'User not found' })
  }

  const userId = user.id

  const planId = getRouterParam(event, 'id')

  if (!planId) {
    throw createError({ statusCode: 400, message: 'Plan ID is required' })
  }

  const plan = await prisma.trainingPlan.findFirst({
    where: {
      id: planId,
      userId: userId
    },
    include: {
      goal: {
        select: {
          id: true,
          title: true,
          description: true
        }
      },
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

  if (!plan) {
    throw createError({ statusCode: 404, message: 'Plan not found' })
  }

  return plan
})
