import { prisma } from '../../../utils/db'
import { getServerSession } from '../../../utils/session'
import { tasks } from "@trigger.dev/sdk/v3"

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const planId = getRouterParam(event, 'id')
  const userId = session.user.id

  const plan = await prisma.trainingPlan.findUnique({
    where: { id: planId },
    include: { blocks: { orderBy: { order: 'asc' } } }
  })

  if (!plan) {
    throw createError({ statusCode: 404, message: 'Plan not found' })
  }

  if (plan.userId !== userId) {
    throw createError({ statusCode: 403, message: 'Forbidden' })
  }

  if (plan.status !== 'DRAFT') {
    return { success: true, message: 'Plan is already active or archived' }
  }

  // 1. Archive existing active plans
  await prisma.trainingPlan.updateMany({
    where: {
      userId,
      status: 'ACTIVE',
      id: { not: planId }
    },
    data: {
      status: 'ARCHIVED'
    }
  })

  // 2. Activate Plan
  await prisma.trainingPlan.update({
    where: { id: planId },
    data: { status: 'ACTIVE' }
  })

  // 3. Trigger Generation for First Block
  if (plan.blocks.length > 0) {
    const firstBlock = plan.blocks[0]
    await tasks.trigger('generate-training-block', {
      userId,
      blockId: firstBlock.id
    })
  }

  return { success: true }
})
