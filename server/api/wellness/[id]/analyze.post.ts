import { getServerSession } from '../../../utils/session'
import { prisma } from '../../../utils/db'
import { tasks } from '@trigger.dev/sdk/v3'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const userId = (session.user as any).id
  const wellnessId = getRouterParam(event, 'id')

  if (!wellnessId) {
    throw createError({ statusCode: 400, message: 'Wellness ID is required' })
  }

  // Fetch the wellness record
  const wellness = await prisma.wellness.findUnique({
    where: { id: wellnessId }
  })

  if (!wellness) {
    throw createError({ statusCode: 404, message: 'Wellness record not found' })
  }

  if (wellness.userId !== userId) {
    throw createError({ statusCode: 403, message: 'Access denied' })
  }

  // Update status to PROCESSING
  await prisma.wellness.update({
    where: { id: wellnessId },
    data: { aiAnalysisStatus: 'PROCESSING' }
  })

  try {
    // Trigger the background task
    const handle = await tasks.trigger(
      'analyze-wellness',
      {
        wellnessId,
        userId
      },
      {
        concurrencyKey: userId,
        tags: [`user:${userId}`],
        idempotencyKey: wellnessId,
        idempotencyKeyTTL: '5m'
      }
    )

    return {
      status: 'PROCESSING',
      jobId: handle.id
    }
  } catch (error: any) {
    console.error('Failed to trigger wellness analysis:', error)

    await prisma.wellness.update({
      where: { id: wellnessId },
      data: { aiAnalysisStatus: 'FAILED' }
    })

    throw createError({
      statusCode: 500,
      message: `Failed to start analysis: ${error.message}`
    })
  }
})
