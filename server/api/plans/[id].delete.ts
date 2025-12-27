import { prisma } from '../../utils/db'
import { getServerSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const id = getRouterParam(event, 'id')
  const userId = (session.user as any).id

  const plan = await (prisma as any).trainingPlan.findUnique({
    where: { id }
  })

  if (!plan) {
    throw createError({ statusCode: 404, message: 'Plan not found' })
  }

  if (plan.userId !== userId) {
    throw createError({ statusCode: 403, message: 'Forbidden' })
  }

  // Allow deleting DRAFT plans and Templates
  if (plan.status !== 'DRAFT' && !plan.isTemplate) {
    throw createError({ statusCode: 400, message: 'Only drafts or templates can be permanently deleted. Active plans should be abandoned or archived.' })
  }

  await (prisma as any).trainingPlan.delete({
    where: { id }
  })

  return { success: true }
})
