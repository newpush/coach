import { getServerSession } from '#auth'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const { roomId } = getQuery(event) as { roomId: string }
  
  if (!roomId) {
    throw createError({ statusCode: 400, message: 'Room ID required' })
  }

  // Verify user is in the room
  const participant = await prisma.chatParticipant.findUnique({
    where: {
      userId_roomId: {
        userId: session.user.id,
        roomId
      }
    }
  })

  if (!participant) {
    throw createError({ statusCode: 403, message: 'Access denied' })
  }

  const messages = await prisma.chatMessage.findMany({
    where: { roomId },
    orderBy: { createdAt: 'asc' }
  })

  return messages.map(msg => ({
    _id: msg.id,
    content: msg.content,
    senderId: msg.senderId,
    username: msg.senderId === 'ai_agent' ? 'Coach Watts' : 'Me',
    avatar: msg.senderId === 'ai_agent' ? '/images/logo.svg' : session.user.image,
    date: new Date(msg.createdAt).toLocaleDateString(),
    timestamp: new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    system: false,
    saved: true,
    distributed: true,
    seen: true,
    disableActions: false,
    disableReactions: false
  }))
})
