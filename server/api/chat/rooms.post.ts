import { getServerSession } from '../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Chat'],
    summary: 'Create chat room',
    description: 'Creates a new chat room for the authenticated user.',
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                roomId: { type: 'string' },
                roomName: { type: 'string' },
                avatar: { type: 'string' },
                users: { type: 'array' }
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

  const userId = (session.user as any).id

  // Create a new chat room
  const newRoom = await prisma.chatRoom.create({
    data: {
      name: 'New Chat', // Could be dynamic or user-provided
      avatar: '/media/logo.webp',
      lastMessageAt: new Date(),
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
      timestamp: new Date(newRoom.createdAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      }),
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
