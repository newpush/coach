import { getServerSession } from '../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Chat'],
    summary: 'List chat rooms',
    description: 'Returns the list of chat rooms for the authenticated user.',
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  roomId: { type: 'string' },
                  roomName: { type: 'string' },
                  avatar: { type: 'string' },
                  unreadCount: { type: 'integer' },
                  lastMessage: { type: 'object', nullable: true }
                }
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' }
    }
  }
})

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
        avatar: '/media/logo.webp', // Assuming a logo exists
        users: {
          create: [{ userId: userId }]
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
  const formattedRooms = rooms.map((room) => {
    const lastMessage = room.messages[0]

    return {
      roomId: room.id,
      roomName: room.name,
      avatar: room.avatar,
      unreadCount: 0, // TODO: Implement unread count logic
      index: lastMessage
        ? new Date(lastMessage.createdAt).getTime()
        : new Date(room.createdAt).getTime(),
      lastMessage: lastMessage
        ? {
            content: lastMessage.content,
            senderId: lastMessage.senderId,
            username: lastMessage.senderId === 'ai_agent' ? 'Coach Watts' : 'Me', // Simplified
            timestamp: new Date(lastMessage.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit'
            }),
            saved: true,
            distributed: true,
            seen: true,
            new: false
          }
        : null,
      users: [
        {
          _id: userId,
          username: 'Me',
          avatar: session.user?.image || null,
          status: {
            state: 'online',
            lastChanged: 'today'
          }
        },
        {
          _id: 'ai_agent',
          username: 'Coach Watts',
          avatar: '/media/logo.webp',
          status: {
            state: 'online',
            lastChanged: 'always'
          }
        }
      ],
      typingUsers: []
    }
  })

  // Sort rooms by index (last message timestamp) in descending order (newest first)
  return formattedRooms.sort((a, b) => b.index - a.index)
})
