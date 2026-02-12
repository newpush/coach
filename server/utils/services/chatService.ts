import { createError } from 'h3'
import { prisma } from '../../utils/db'
import { getUserTimezone } from '../../utils/date'
import { getUserAiSettings } from '../../utils/ai-user-settings'
import { buildAthleteContext } from './chatContextService'
import { getToolsWithContext } from '../../utils/ai-tools'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateCoachAnalysis } from '../../utils/gemini'
import { calculateLlmCost, MODEL_NAMES } from '../../utils/ai-config'

export class ChatService {
  async validateRoomAccess(userId: string, roomId: string) {
    const participant = await prisma.chatParticipant.findUnique({
      where: {
        userId_roomId: {
          userId,
          roomId
        }
      },
      include: {
        room: {
          select: {
            deletedAt: true,
            createdAt: true
          }
        }
      }
    })

    if (!participant || participant.room.deletedAt) {
      throw createError({ statusCode: 404, message: 'Room not found or access denied' })
    }

    // Block legacy rooms
    const MIGRATION_CUTOFF = new Date('2026-01-22T00:00:00Z')
    if (new Date(participant.room.createdAt) < MIGRATION_CUTOFF) {
      throw createError({
        statusCode: 403,
        message: 'This chat is read-only. Please start a new chat.'
      })
    }

    return participant
  }

  async saveUserMessage(data: {
    userId: string
    roomId: string
    content: string
    role: 'user' | 'tool'
    metadata?: any
    id?: string
    replyToId?: string
    files?: any
  }) {
    // Check for duplicate ID if provided
    if (data.id) {
      const existing = await prisma.chatMessage.findUnique({ where: { id: data.id } })
      if (existing) return existing
    }

    try {
      const message = await prisma.chatMessage.create({
        data: {
          id: data.id,
          content: data.content,
          roomId: data.roomId,
          senderId: data.role === 'tool' ? 'system_tool' : data.userId,
          files: data.files,
          replyToId: data.replyToId,
          seen: { [data.userId]: new Date() },
          metadata: data.metadata
        }
      })

      // Update room activity for sorting
      await prisma.chatRoom.update({
        where: { id: data.roomId },
        data: { lastMessageAt: new Date() }
      })

      return message
    } catch (err: any) {
      if (err.code === 'P2002') return null // Duplicate ignored
      throw err
    }
  }

  async saveAiMessage(data: { roomId: string; content: string; metadata?: any }) {
    const message = await prisma.chatMessage.create({
      data: {
        content: data.content || ' ',
        roomId: data.roomId,
        senderId: 'ai_agent',
        seen: {},
        metadata: data.metadata
      }
    })

    // Update room activity for sorting
    await prisma.chatRoom.update({
      where: { id: data.roomId },
      data: { lastMessageAt: new Date() }
    })

    return message
  }

  async updateMessageMetadata(messageId: string, metadata: any) {
    return await prisma.chatMessage.update({
      where: { id: messageId },
      data: { metadata }
    })
  }

  async prepareAI(userId: string, chatRoomId?: string) {
    const { userProfile, systemInstruction } = await buildAthleteContext(userId)
    const timezone = await getUserTimezone(userId)
    const aiSettings = await getUserAiSettings(userId)

    const google = createGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY
    })
    const modelName = MODEL_NAMES[aiSettings.aiModelPreference]
    const tools = getToolsWithContext(userId, timezone, aiSettings, chatRoomId)

    return {
      google,
      modelName,
      tools,
      systemInstruction,
      userProfile,
      aiSettings
    }
  }

  async logLlmUsage(data: {
    userId: string
    modelName: string
    modelType: string
    content: string
    response: string
    usage: any
    messageId: string
  }) {
    try {
      const promptTokens = data.usage.inputTokens || 0
      const completionTokens = data.usage.outputTokens || 0
      const cachedTokens = data.usage.inputTokenDetails?.cacheReadTokens || 0
      const reasoningTokens = data.usage.outputTokenDetails?.reasoningTokens || 0
      const totalTokens = promptTokens + completionTokens

      const estimatedCost = calculateLlmCost(
        data.modelName,
        promptTokens,
        completionTokens + reasoningTokens,
        cachedTokens
      )

      const durationMs = (data as any).durationMs || 0
      const error = (data as any).error
      const success = !error

      await prisma.llmUsage.create({
        data: {
          userId: data.userId,
          provider: 'google',
          model: data.modelName,
          modelType: data.modelType === 'flash' ? 'flash' : 'pro',
          operation: 'chat',
          entityType: 'ChatMessage',
          entityId: data.messageId,
          promptTokens,
          completionTokens,
          cachedTokens,
          reasoningTokens,
          totalTokens,
          estimatedCost,
          durationMs,
          retryCount: 0,
          success,
          errorType: error ? 'api_error' : undefined,
          errorMessage: error ? String(error) : undefined,
          promptPreview: data.content.substring(0, 500),
          responsePreview: data.response.substring(0, 500)
        }
      })
    } catch (error) {
      console.error('[ChatService] Failed to log LLM usage:', error)
    }
  }

  async autoRenameRoom(
    roomId: string,
    userId: string,
    firstUserMessage: string,
    firstAiMessage: string
  ) {
    try {
      const messageCount = await prisma.chatMessage.count({ where: { roomId } })
      if (messageCount === 2) {
        const titlePrompt = `Based on this conversation, generate a very concise, descriptive title (max 6 words). Just return the title, nothing else.

User: ${firstUserMessage}
AI: ${firstAiMessage}

Title:`
        let roomTitle = await generateCoachAnalysis(titlePrompt, 'flash', {
          userId,
          operation: 'chat_title_generation',
          entityType: 'ChatRoom',
          entityId: roomId
        })
        roomTitle = roomTitle
          .trim()
          .replace(/^["']|["']$/g, '')
          .substring(0, 60)
        await prisma.chatRoom.update({
          where: { id: roomId },
          data: { name: roomTitle }
        })
      }
    } catch (error) {
      console.error(`[ChatService] Failed to auto-rename room ${roomId}:`, error)
    }
  }
}

export const chatService = new ChatService()
