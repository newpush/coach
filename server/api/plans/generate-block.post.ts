import { prisma } from '../../utils/db'
import { tasks } from "@trigger.dev/sdk/v3"

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const { blockId } = await readBody(event)

  if (!blockId) {
    throw createError({ statusCode: 400, message: 'Block ID is required' })
  }

  // Verify ownership
  const block = await prisma.trainingBlock.findFirst({
    where: { 
      id: blockId,
      plan: { userId: session.user.id }
    }
  })

  if (!block) {
    throw createError({ statusCode: 404, message: 'Block not found' })
  }

  const handle = await tasks.trigger('generate-training-block', {
    userId: session.user.id,
    blockId: blockId
  })

  return { 
    success: true, 
    jobId: handle.id 
  }
})
