import { z } from 'zod'
import { prisma } from '../../../utils/db'
import { chatService } from '../../../utils/services/chatService'
import { sendTelegramMessage, sendTelegramAction } from '../../../utils/telegram'
import { generateText, isStepCount } from 'ai'
import { buildPersistedToolCalls, expandStoredChatMessages } from '../../../utils/chat/history'
import { transformHistoryToCoreMessages } from '../../../utils/ai-history'
import { normalizeCoreMessagesForGemini } from '../../../utils/chat/core-message-normalizer'
import { sanitizeCoreMessagesForToolApprovals } from '../../chat/sanitize-tool-approval'

export default defineEventHandler(async (event) => {
  const secretToken = getHeader(event, 'x-telegram-bot-api-secret-token')
  if (secretToken !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    throw createError({ statusCode: 403, message: 'Invalid secret token' })
  }

  const body = await readBody(event)
  const message = body.message
  let webhookStatus = 'PROCESSED'
  let webhookError: string | null = null

  if (!message || !message.text) return { status: 'ignored' }

  const chatId = message.chat.id.toString()
  const text = message.text

  // 1. Handle Commands
  if (text.startsWith('/start')) {
    const args = text.split(' ')
    if (args.length > 1) {
      const token = args[1]

      // Verify Token
      const shareToken = await prisma.shareToken.findUnique({
        where: { token },
        select: { userId: true, resourceType: true, expiresAt: true }
      })

      if (
        shareToken &&
        shareToken.resourceType === 'TELEGRAM_LINK' &&
        shareToken.expiresAt &&
        new Date() < shareToken.expiresAt
      ) {
        // Create/Update Integration
        await prisma.integration.upsert({
          where: {
            userId_provider: {
              userId: shareToken.userId,
              provider: 'telegram'
            }
          },
          create: {
            userId: shareToken.userId,
            provider: 'telegram',
            externalUserId: chatId,
            accessToken: 'valid', // Placeholder
            ingestWorkouts: false
          },
          update: {
            externalUserId: chatId
          }
        })

        // Cleanup token
        await prisma.shareToken.delete({ where: { token } })

        await sendTelegramMessage(
          chatId,
          "🚴 **Connected!** I'm Coach Watts.\n\nI'm ready to analyze your data and help you crush your goals. Ask me anything about your training, nutrition, or recovery.",
          'Markdown'
        )
        return { status: 'linked' }
      } else {
        await sendTelegramMessage(
          chatId,
          '⚠️ This link has expired or is invalid. Please generate a new one from your Dashboard.'
        )
        return { status: 'invalid_token' }
      }
    } else {
      // Just /start without token
      // Check if already linked
      const existing = await prisma.integration.findFirst({
        where: { provider: 'telegram', externalUserId: chatId }
      })

      if (existing) {
        await sendTelegramMessage(chatId, "Welcome back! I'm ready. ⚡")
      } else {
        await sendTelegramMessage(
          chatId,
          'Welcome to Coach Watts! 🚴\n\nPlease link your account via the Dashboard to start chatting.'
        )
      }
      return { status: 'welcome' }
    }
  }

  // 2. Resolve User
  const integration = await prisma.integration.findFirst({
    where: {
      provider: 'telegram',
      externalUserId: chatId
    }
  })

  if (!integration) {
    await sendTelegramMessage(chatId, 'Please link your account via the Dashboard first.')
    return { status: 'unauthorized' }
  }

  const userId = integration.userId

  // 3. Process Chat
  await sendTelegramAction(chatId, 'typing')

  // Find or Create Chat Room for Telegram
  // We use session-based rooms to avoid large context windows and partition conversations.
  const SESSION_TIMEOUT_MS = 6 * 60 * 60 * 1000 // 6 hours
  const existingRoom = await prisma.chatRoom.findFirst({
    where: {
      users: { some: { userId } },
      name: { startsWith: 'Telegram Chat' }
    },
    orderBy: { createdAt: 'desc' },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1
      }
    }
  })

  const latestMessage = existingRoom?.messages[0]
  const lastActivity = latestMessage?.createdAt || existingRoom?.createdAt
  const now = new Date()
  const shouldCreateNewRoom =
    !existingRoom || (lastActivity && now.getTime() - lastActivity.getTime() > SESSION_TIMEOUT_MS)

  let roomId: string

  if (shouldCreateNewRoom) {
    const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
    const newRoom = await prisma.chatRoom.create({
      data: {
        name: `Telegram Chat (${dateStr} ${timeStr})`,
        users: {
          create: { userId }
        }
      }
    })
    roomId = newRoom.id
  } else {
    roomId = existingRoom.id
  }

  // 4. Handle Authenticated Commands
  if (text === '/help') {
    const helpText = [
      '⚡ **Coach Watts Telegram Help**',
      '',
      '/help - Show this help message',
      '/roominfo - Get the current chat room ID',
      '/start - Restart or link your account',
      '',
      'Just send me a message to start chatting! I can help with training plans, nutrition, and analyzing your workouts.'
    ].join('\n')
    await sendTelegramMessage(chatId, helpText, 'Markdown')
    return { status: 'help' }
  }

  if (text === '/roominfo') {
    await sendTelegramMessage(chatId, `Current Room ID: \`${roomId}\``, 'Markdown')
    return { status: 'roominfo' }
  }

  // 5. Process Chat Message
  // Save User Message
  await chatService.saveUserMessage({
    userId,
    roomId,
    content: text,
    role: 'user'
  })

  // Prepare AI
  try {
    const startTime = Date.now()
    const { google, modelName, tools, systemInstruction } = await chatService.prepareAI(userId)

    // Build History (Last 20 messages)
    const history = await prisma.chatMessage.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true,
        content: true,
        senderId: true,
        createdAt: true,
        files: true,
        metadata: true
      }
    })

    const expandedHistory = expandStoredChatMessages(history.reverse())
    // Parity with the main chat turn executor, which applies this same guard in this same
    // position. Malformed `tool-approval-response` parts crash `standardizePrompt` with
    // AI_TypeValidationError (CW-209 / CW-293); no history shape this handler can build
    // today produces one, so this is defensive — it matters if the Telegram path ever
    // accepts client-submitted messages or `expandStoredChatMessage` learns to emit
    // `approval-responded` parts. It is a no-op for valid history. (CW-294)
    //
    // The main path's *other* guard, `sanitizeChatMessagesForToolApprovals` (via
    // `normalizeMessagesForSdk`), covers client-submitted UI messages. Telegram has no
    // such input — messages come only from the DB — so its absence here is deliberate.
    const coreMessages = sanitizeCoreMessagesForToolApprovals(
      await transformHistoryToCoreMessages(expandedHistory)
    )
    const normalizedMessages = normalizeCoreMessagesForGemini(coreMessages)

    // Generate Response
    let result
    try {
      result = await generateText({
        model: google(modelName),
        instructions: systemInstruction,
        messages: normalizedMessages as any,
        tools: tools as any,
        stopWhen: isStepCount(5)
      })
    } catch (llmError: any) {
      console.error('[Telegram] LLM Generation Failed:', llmError)

      // Log failed usage
      await chatService.logLlmUsage({
        userId,
        modelName,
        modelType: 'flash',
        content: text,
        response: '',
        usage: { inputTokens: 0, outputTokens: 0 },
        messageId: 'failed-generation', // No message ID yet
        error: llmError.message || String(llmError)
      } as any) // Cast to any because we're extending the type implicitly here/need to update chatService

      throw llmError // Re-throw to be caught by outer block
    }

    const toolCallsUsed = buildPersistedToolCalls(result.toolCalls, result.toolResults)
    let responseText = typeof result.text === 'string' ? result.text.trim() : ''

    // Gemini can occasionally finish immediately after a tool step without producing
    // user-facing text. Continue from the provider-generated tool exchange once, with
    // tools disabled, so Telegram receives the actual answer instead of an internal
    // fallback message.
    if (!responseText && toolCallsUsed.length > 0) {
      const continuation = await generateText({
        model: google(modelName),
        instructions: `${systemInstruction}\n\nAnswer the user's latest message using the completed tool results above. Return a concise, user-facing answer in the user's language. Do not call tools.`,
        messages: [...(normalizedMessages as any[]), ...(result.response.messages as any[])]
      })
      responseText = continuation.text.trim()
    }

    if (!responseText) {
      throw new Error('LLM response completed without user-facing text')
    }

    // Save AI Message
    const aiMsg = await chatService.saveAiMessage({
      roomId,
      content: responseText,
      metadata: {
        source: 'telegram',
        toolCalls: toolCallsUsed,
        toolsUsed: toolCallsUsed.map((toolCall: any) => toolCall.name),
        toolCallCount: toolCallsUsed.length
      }
    })

    // Log Usage
    await chatService.logLlmUsage({
      userId,
      modelName,
      modelType: 'flash', // Assuming flash for now or from prepareAI if exposed
      content: text,
      response: responseText,
      usage: result.usage,
      messageId: aiMsg.id,
      durationMs: Date.now() - startTime
    } as any)

    // Send Response
    await sendTelegramMessage(chatId, responseText)
  } catch (error: any) {
    console.error('[Telegram] Chat Error:', error)
    webhookStatus = 'FAILED'
    webhookError = error?.message || String(error)

    try {
      await sendTelegramMessage(chatId, 'I blew a gasket. 💥 Try again in a bit.')
    } catch (deliveryError: any) {
      webhookError = `${webhookError} | delivery failed: ${deliveryError?.message || String(deliveryError)}`
    }
  }

  // Log Webhook
  try {
    await prisma.webhookLog.create({
      data: {
        provider: 'telegram',
        eventType: text.startsWith('/') ? 'command' : 'message',
        payload: body as any,
        status: webhookStatus,
        error: webhookError,
        processedAt: new Date()
      }
    })
  } catch (e) {
    console.error('Failed to log webhook', e)
  }

  return { status: 'processed' }
})
