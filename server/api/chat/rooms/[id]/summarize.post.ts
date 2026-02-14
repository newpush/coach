import { getServerSession } from '../../../../utils/session'
import { prisma } from '../../../../utils/db'
import { summarizeChatTask } from '../../../../../trigger/summarize-chat'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const userId = (session.user as any).id
  const roomId = getRouterParam(event, 'id')

  if (!roomId) {
    throw createError({ statusCode: 400, message: 'Room ID required' })
  }

  // Verify participation
  const participant = await prisma.chatParticipant.findUnique({
    where: {
      userId_roomId: {
        userId,
        roomId
      }
    }
  })

  if (!participant) {
    throw createError({ statusCode: 404, message: 'Room not found or access denied' })
  }

  // Trigger task
  const result = await summarizeChatTask.trigger({ roomId, userId })

  return {
    success: true,
    runId: result.id
  }
})
