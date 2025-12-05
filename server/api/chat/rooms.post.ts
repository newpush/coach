import { getServerSession } from '#auth'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const userId = session.user.id

  // Create a new chat room
  const newRoom = await prisma.chatRoom.create({
    data: {
      name: 'New Chat', // Could be dynamic or user-provided
      avatar: '/images/logo.svg',
      users: {
        create: [
          { userId: userId }
        ]
      }
    },
    include: {
      users: {
        include: {
          user: true
        }
      },
      messages: true
    }
  })

  // Format for vue-advanced-chat
  return {
    roomId: newRoom.id,
    roomName: newRoom.name,
    avatar: newRoom.avatar,
    unreadCount: 0,
    index: new Date(newRoom.createdAt).getTime(),
    lastMessage: {
      content: 'Room created',
      senderId: 'system',
      username: 'System',
      timestamp: new Date(newRoom.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      saved: true,
      distributed: true,
      seen: true,
      new: false
    },
    users: [
      {
        _id: userId,
        username: 'Me',
        avatar: session.user.image,
        status: {
          state: 'online',
          lastChanged: 'today'
        }
      },
      {
        _id: 'ai_agent',
        username: 'Coach Watts',
        avatar: '/images/logo.svg',
        status: {
          state: 'online',
          lastChanged: 'always'
        }
      }
    ],
    typingUsers: []
  }
})
