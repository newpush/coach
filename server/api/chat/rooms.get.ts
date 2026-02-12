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

  const userId = (session.user as any).id

  // Find existing rooms for the user
  // Optimization: Sort in DB using lastMessageAt and use select for minimal data
  let rooms = await prisma.chatRoom.findMany({
    where: {
      deletedAt: null,
      users: {
        some: {
          userId: userId
        }
      }
    },
    orderBy: {
      lastMessageAt: 'desc'
    },
    select: {
      id: true,
      name: true,
      avatar: true,
      createdAt: true,
      lastMessageAt: true,
      messages: {
        orderBy: {
          createdAt: 'desc'
        },
        take: 1,
        select: {
          content: true,
          senderId: true,
          createdAt: true
        }
      }
    }
  })

  // If no room exists, create a default "AI Coach" room
  if (rooms.length === 0) {
    const aiRoom = await prisma.chatRoom.create({
      data: {
        name: 'Coach Watts',
        avatar: '/media/logo.webp',
        lastMessageAt: new Date(),
        users: {
          create: [{ userId: userId }]
        }
      },
      select: {
        id: true,
        name: true,
        avatar: true,
        createdAt: true,
        lastMessageAt: true,
        messages: {
          select: {
            content: true,
            senderId: true,
            createdAt: true
          }
        }
      }
    })
    rooms = [aiRoom]
  }

  // Migration cutoff date: January 22, 2026
  const MIGRATION_CUTOFF = new Date('2026-01-22T00:00:00Z')
  const userImage = session.user?.image || null

  // Common users list to avoid repeated object creation
  const commonUsers = [
    {
      _id: userId,
      username: 'Me',
      avatar: userImage,
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
  ]

  // Format for vue-advanced-chat
  return rooms.map((room) => {
    const lastMessage = room.messages[0]
    const createdAtDate = new Date(room.createdAt)
    const isReadOnly = createdAtDate < MIGRATION_CUTOFF
    const activityDate = room.lastMessageAt ? new Date(room.lastMessageAt) : createdAtDate

    return {
      roomId: room.id,
      roomName: room.name,
      avatar: room.avatar,
      unreadCount: 0,
      isReadOnly,
      index: activityDate.getTime(),
      lastMessage: lastMessage
        ? {
            content: lastMessage.content,
            senderId: lastMessage.senderId,
            username: lastMessage.senderId === 'ai_agent' ? 'Coach Watts' : 'Me',
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
      users: commonUsers,
      typingUsers: []
    }
  })
})
