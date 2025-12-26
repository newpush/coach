import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const userId = session.user.id

  const plans = await prisma.trainingPlan.findMany({
    where: {
      userId: userId,
      // We fetch everything except the currently active one? 
      // Or just everything and let the UI filter?
      // Let's fetch everything that is NOT active (since active is on /plan)
      // OR fetch templates separately?
      // Let's fetch all non-active plans + templates
      OR: [
        { status: { not: 'ACTIVE' } },
        { isTemplate: true }
      ]
    },
    orderBy: { createdAt: 'desc' },
    include: {
      goal: {
        select: { title: true }
      }
    }
  })

  return plans
})
