import { prisma } from '../../utils/db'
import { tasks } from "@trigger.dev/sdk/v3"

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const { planId, adaptationType } = await readBody(event)

  if (!planId || !adaptationType) {
    throw createError({ statusCode: 400, message: 'Plan ID and Adaptation Type are required' })
  }

  // Verify ownership
  const plan = await prisma.trainingPlan.findFirst({
    where: { 
      id: planId,
      userId: session.user.id
    }
  })

  if (!plan) {
    throw createError({ statusCode: 404, message: 'Plan not found' })
  }

  const handle = await tasks.trigger('adapt-training-plan', {
    userId: session.user.id,
    planId: planId,
    adaptationType
  })

  return { 
    success: true, 
    jobId: handle.id 
  }
})
