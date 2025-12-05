import { getServerSession } from '#auth'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const userId = session.user.id

  // Find existing rooms for the user
  let rooms = await prisma.chatRoom.findMany({
    where: {
      users: {
        some: {
          userId: userId
        }
      }
    },
    include: {
      users: {
        include: {
          user: true
        }
      },
      messages: {
        orderBy: {
          createdAt: 'desc'
        },
        take: 1
      }
    }
  })

  // If no room exists, create a default "AI Coach" room
  if (rooms.length === 0) {
    const aiRoom = await prisma.chatRoom.create({
      data: {
        name: 'Coach Watts',
        avatar: '/images/logo.svg', // Assuming a logo exists
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
    rooms = [aiRoom]
  }

  // Format for vue-advanced-chat
  return rooms.map(room => {
    const lastMessage = room.messages[0]
    
    return {
      roomId: room.id,
      roomName: room.name,
      avatar: room.avatar,
      unreadCount: 0, // TODO: Implement unread count logic
      index: lastMessage ? new Date(lastMessage.createdAt).getTime() : new Date(room.createdAt).getTime(),
      lastMessage: lastMessage ? {
        content: lastMessage.content,
        senderId: lastMessage.senderId,
        username: lastMessage.senderId === 'ai_agent' ? 'Coach Watts' : 'Me', // Simplified
        timestamp: new Date(lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        saved: true,
        distributed: true,
        seen: true,
        new: false
      } : null,
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
})
