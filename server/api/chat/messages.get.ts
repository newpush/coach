import { getServerSession } from '../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Chat'],
    summary: 'List chat messages',
    description: 'Returns the message history for a specific chat room.',
    parameters: [
      {
        name: 'roomId',
        in: 'query',
        required: true,
        schema: { type: 'string' }
      }
    ],
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
                  id: { type: 'string' },
                  role: { type: 'string' },
                  parts: { type: 'array' },
                  metadata: { type: 'object' }
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
  if (!userId) {
    throw createError({ statusCode: 401, message: 'User ID not found' })
  }

  const { roomId } = getQuery(event) as { roomId: string }

  if (!roomId) {
    throw createError({ statusCode: 400, message: 'Room ID required' })
  }

  // Verify user is in the room
  const participant = await prisma.chatParticipant.findUnique({
    where: {
      userId_roomId: {
        userId,
        roomId
      }
    }
  })

  if (!participant) {
    throw createError({ statusCode: 403, message: 'Access denied' })
  }

  const messages = await prisma.chatMessage.findMany({
    where: { roomId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      content: true,
      senderId: true,
      createdAt: true,
      metadata: true
    }
  })

  // Return messages in AI SDK v5 format
  return messages.map((msg) => {
    const parts: any[] = []

    // Add text part if content exists
    if (msg.content) {
      parts.push({
        type: 'text',
        text: msg.content
      })
    }

    // Add tool invocation parts from metadata
    const metadata = (msg.metadata as any) || {}

    // Add tool approvals (pending)
    if (metadata.toolApprovals && Array.isArray(metadata.toolApprovals)) {
      metadata.toolApprovals.forEach((approval: any) => {
        parts.push({
          type: 'tool-approval-request',
          approvalId: approval.approvalId || approval.toolCallId, // Prefer stored approvalId
          toolCallId: approval.toolCallId,
          toolCall: {
            toolName: approval.name,
            args: approval.args,
            toolCallId: approval.toolCallId
          }
        })
      })
    }

    // Add tool response from metadata (for tool-approval-response or tool results)
    if (metadata.toolResponse && Array.isArray(metadata.toolResponse)) {
      metadata.toolResponse.forEach((part: any) => {
        parts.push(part)
      })
    }

    if (metadata.toolCalls && Array.isArray(metadata.toolCalls)) {
      metadata.toolCalls.forEach((tc: any) => {
        parts.push({
          type: 'tool-invocation',
          toolCallId: tc.toolCallId || `call-${Math.random().toString(36).substring(7)}`,
          toolName: tc.name,
          args: tc.args,
          state: 'result',
          result: tc.response
        })
      })
    }

    return {
      id: msg.id,
      role:
        msg.senderId === 'ai_agent'
          ? 'assistant'
          : msg.senderId === 'system_tool'
            ? 'tool'
            : 'user',
      parts,
      content: msg.content || '', // Ensure top-level content is also set for compatibility
      metadata: {
        ...metadata,
        createdAt: msg.createdAt,
        senderId: msg.senderId
      }
    }
  })
})
