import { logger, task } from '@trigger.dev/sdk/v3'
import { prisma } from '../server/utils/db'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateText } from 'ai'
import { calculateLlmCost } from '../server/utils/ai-config'

export const summarizeChatTask = task({
  id: 'summarize-chat',
  run: async (payload: { roomId: string; userId: string }) => {
    const { roomId, userId } = payload

    logger.info(`Starting summarization for room ${roomId}`)

    // 0. Fetch Room Data
    const roomData = await prisma.chatRoom.findUnique({
      where: { id: roomId },
      select: { name: true, metadata: true }
    })

    if (!roomData) {
      logger.error(`Room ${roomId} not found`)
      return { success: false, reason: 'room_not_found' }
    }

    const metadata = (roomData.metadata as any) || {}
    const lastId = metadata.lastSummarizedMessageId

    // 1. Fetch NEW messages for the room (after the last summarized one)
    const messages = await prisma.chatMessage.findMany({
      where: {
        roomId,
        ...(lastId
          ? {
              createdAt: {
                gt: (
                  await prisma.chatMessage.findUnique({
                    where: { id: lastId },
                    select: { createdAt: true }
                  })
                )?.createdAt
              }
            }
          : {})
      },
      orderBy: { createdAt: 'asc' },
      take: 50 // Process next chunk
    })

    if (messages.length < 5 && !lastId) {
      logger.info(`Not enough messages to start summarization in room ${roomId}`)
      return { success: false, reason: 'too_few_messages' }
    }

    if (messages.length === 0) {
      logger.info(`No new messages to summarize in room ${roomId}`)
      return { success: true, reason: 'up_to_date' }
    }

    // 2. Format messages for the AI
    const conversationText = messages
      .map((m) => {
        const role = m.senderId === 'ai_agent' ? 'Assistant' : 'User'
        return `${role}: ${m.content}`
      })
      .join('\n\n')

    // 3. Call AI to summarize and potentially rename
    const google = createGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY
    })

    const shouldRename = !roomData.name || roomData.name === 'New Chat'
    const existingSummary = metadata.historySummary || ''

    // Generate summary using Flash Lite (ultra-low cost)
    const { text: summary, usage: summaryUsage } = await generateText({
      model: google('gemini-flash-lite-latest'),
      system: `You are an expert at condensing training conversations. 
      Summarize the chat between an athlete and their AI coach.
      ${existingSummary ? `IMPORTANT: Here is the PREVIOUS summary of earlier parts of this conversation: "${existingSummary}". Incorporate its key points into the new summary so no vital context is lost.` : ''}
      Focus on: Key achievements, current injuries/pains, recent workout feedback, and any specific goals discussed. Keep it under 250 words.`,
      prompt: `NEW MESSAGES IN CONVERSATION:\n${conversationText}`
    })

    // Log Summary Usage
    await prisma.llmUsage.create({
      data: {
        userId,
        provider: 'google',
        model: 'gemini-flash-lite-latest',
        operation: 'summarize-chat',
        entityType: 'ChatRoom',
        entityId: roomId,
        promptTokens: summaryUsage.promptTokens,
        completionTokens: summaryUsage.completionTokens,
        totalTokens: summaryUsage.totalTokens,
        estimatedCost: calculateLlmCost(
          'gemini-flash-lite-latest',
          summaryUsage.promptTokens,
          summaryUsage.completionTokens
        ),
        success: true
      }
    })

    let newTitle = null
    if (shouldRename) {
      const { text: title, usage: titleUsage } = await generateText({
        model: google('gemini-flash-lite-latest'),
        system:
          'Generate a 2-4 word catchy title for this conversation. No quotes, just the title.',
        prompt: conversationText
      })
      newTitle = title.trim().replace(/^"|"$/g, '')

      // Log Title Usage
      await prisma.llmUsage.create({
        data: {
          userId,
          provider: 'google',
          model: 'gemini-flash-lite-latest',
          operation: 'rename-chat',
          entityType: 'ChatRoom',
          entityId: roomId,
          promptTokens: titleUsage.promptTokens,
          completionTokens: titleUsage.completionTokens,
          totalTokens: titleUsage.totalTokens,
          estimatedCost: calculateLlmCost(
            'gemini-flash-lite-latest',
            titleUsage.promptTokens,
            titleUsage.completionTokens
          ),
          success: true
        }
      })
    }

    // 4. Update ChatRoom metadata and name
    metadata.historySummary = summary
    metadata.lastSummarizedMessageId = messages[messages.length - 1].id
    metadata.summarizedCount = (metadata.summarizedCount || 0) + messages.length

    await prisma.chatRoom.update({
      where: { id: roomId },
      data: {
        metadata,
        name: newTitle || undefined
      }
    })

    logger.info(`Successfully summarized room ${roomId}`)
    return { success: true, summary }
  }
})
