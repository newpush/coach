import { prisma } from '../../utils/db'
import { tasks } from '@trigger.dev/sdk/v3'
import { getServerSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const { blockId, weekId, instructions } = await readBody(event)

  if (!blockId || !weekId) {
    throw createError({ statusCode: 400, message: 'Block ID and Week ID are required' })
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

  // Verify week belongs to block
  const week = await prisma.trainingWeek.findFirst({
    where: {
      id: weekId,
      blockId: blockId
    }
  })

  if (!week) {
    throw createError({ statusCode: 404, message: 'Week not found' })
  }

  // Use a trigger.dev task to regenerate the week
  const handle = await tasks.trigger('generate-weekly-plan', {
    userId: session.user.id,
    startDate: week.startDate,
    daysToPlann: 7, // Always plan the full week
    userInstructions: instructions, // Pass the new instructions
    trainingWeekId: week.id // Pass the specific training week ID to link to
  })

  return {
    success: true,
    jobId: handle.id
  }
})
