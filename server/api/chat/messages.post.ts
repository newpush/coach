import { getServerSession } from '../../utils/session'
import { streamText, convertToModelMessages, stepCountIs } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { getToolsWithContext } from '../../utils/ai-tools'
import { generateCoachAnalysis, MODEL_NAMES } from '../../utils/gemini'
import { buildAthleteContext } from '../../utils/services/chatContextService'
import { prisma } from '../../utils/db'
import { getUserTimezone } from '../../utils/date'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const userId = (session.user as any).id
  if (!userId) {
    throw createError({ statusCode: 401, message: 'User ID not found' })
  }

  const body = await readBody(event)
  const { roomId, messages, files, replyMessage } = body

  // Vercel AI SDK sends the full conversation history in 'messages'
  // The last message is the new user input
  const lastMessage = messages?.[messages.length - 1]

  let content = lastMessage?.content
  // Handle cases where content might be in parts only (common in newer SDK versions)
  if (!content && Array.isArray(lastMessage?.parts)) {
    content = lastMessage.parts
      .filter((p: any) => p.type === 'text')
      .map((p: any) => p.text)
      .join('')
  }

  const historyMessages = messages

  // Allow empty content for tool messages (approvals/results)
  if (!roomId || (!content && lastMessage?.role !== 'tool')) {
    throw createError({ statusCode: 400, message: 'Room ID and content required' })
  }

  // 1. Save User/Tool Message to DB if it's not already persisted
  // The AI SDK sends a unique ID for each message. We can use this to prevent duplicates.
  const userMessageId = lastMessage.id

  const existingMessage = userMessageId
    ? await prisma.chatMessage.findUnique({
        where: { id: userMessageId }
      })
    : null

  if (!existingMessage) {
    try {
      const metadata: any = {}

      // If it's a tool message, save the parts/result to metadata
      if (lastMessage.role === 'tool' && Array.isArray(lastMessage.content)) {
        // It comes as content array in the body for tool messages in Vercel AI SDK
        metadata.toolResponse = lastMessage.content
      }

      await prisma.chatMessage.create({
        data: {
          id: userMessageId || undefined,
          content: content || '', // Allow empty string for tool messages
          roomId,
          senderId: lastMessage.role === 'tool' ? 'system_tool' : userId, // Distinguish tool responses
          files: files || undefined,
          replyToId: replyMessage?._id || undefined,
          seen: { [userId]: new Date() },
          metadata
        }
      })
    } catch (err) {
      // If ID collision occurs, it's a duplicate, we can ignore
      console.warn('[Chat] Message save skipped (likely duplicate ID):', userMessageId)
    }
  }

  // 2. Build Athlete Context (Extracted to Service)
  const { userProfile, systemInstruction } = await buildAthleteContext(userId)
  const timezone = await getUserTimezone(userId)

  // 3. Initialize Model and Tools
  const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY
  })
  const modelType = userProfile?.aiModelPreference === 'flash' ? 'flash' : 'pro'
  const modelName = MODEL_NAMES[modelType]
  const tools = getToolsWithContext(userId, timezone)

  // 4. Stream Text
  try {
    const allToolResults: any[] = []

    const result = await streamText({
      model: google(modelName),
      system: systemInstruction,
      messages: await convertToModelMessages(historyMessages),
      tools,
      stopWhen: stepCountIs(5), // Allow multi-step interactions (Agency)
      onStepFinish: async ({ text, toolCalls, toolResults, finishReason, usage }) => {
        console.log(`[Chat API] Step finished. Reason: ${finishReason}`)

        if (toolResults && toolResults.length > 0) {
          // Merge with toolCalls to ensure we have args and toolName
          const detailedResults = toolResults.map((tr) => {
            const call = toolCalls?.find((tc) => tc.toolCallId === tr.toolCallId)
            return {
              ...tr,
              args:
                (tr as any).args ||
                (tr as any).input ||
                (call as any)?.args ||
                (call as any)?.input,
              toolName: tr.toolName || call?.toolName,
              result: (tr as any).result || (tr as any).output // Handle 'output' property from Google provider
            }
          })

          console.log(`[Chat API] Tool results in step: ${detailedResults.length}`)
          detailedResults.forEach((r) => {
            console.log(`[Chat API] Tool result (${r.toolName}):`, JSON.stringify(r, null, 2))
          })
          allToolResults.push(...detailedResults)
        }
      },
      onFinish: async (event) => {
        const { text, toolResults: finalStepResults, usage, finishReason } = event

        console.log(
          `[Chat API] Stream finished for room ${roomId}. Reason: ${finishReason}. Content length: ${text?.length || 0}`
        )
        console.log('[Chat API] onFinish event keys:', Object.keys(event))

        // 1. Save AI Response to DB immediately to ensure persistence
        let aiMessage: any
        try {
          aiMessage = await prisma.chatMessage.create({
            data: {
              content: text || '',
              roomId,
              senderId: 'ai_agent',
              seen: {}
            }
          })
        } catch (dbErr) {
          console.error('[Chat API] Failed to save AI message:', dbErr)
          return
        }

        // 2. Capture metadata (Approvals, Tools, Charts)
        try {
          // Capture tool approval requests from the final message content
          // We use the 'result' object from the outer scope
          const toolApprovals: any[] = []

          try {
            const response = await result.response
            const responseMessages = response.messages
            const lastResponseMessage = responseMessages[responseMessages.length - 1]

            if (lastResponseMessage && Array.isArray(lastResponseMessage.content)) {
              lastResponseMessage.content.forEach((part: any) => {
                if (part.type === 'tool-approval-request') {
                  console.log('[Chat API] Found approval request:', part.toolCallId)
                  toolApprovals.push({
                    toolCallId: part.toolCallId || part.approvalId,
                    name: part.toolCall.toolName,
                    args: part.toolCall.args,
                    timestamp: new Date().toISOString()
                  })
                }
              })
            }
          } catch (resErr) {
            console.warn('[Chat API] Failed to read result.response:', resErr)
            // Fallback: If we can't read response, we might miss approvals.
          }

          // Ensure we capture results if they only appear in onFinish
          const resultsToSave = allToolResults.length > 0 ? allToolResults : finalStepResults || []

          // 4. Handle tool calls and charts in metadata
          const toolCallsUsed = resultsToSave.map((tr: any) => ({
            toolCallId: tr.toolCallId,
            name: tr.toolName,
            args: tr.args || tr.input,
            response: tr.result || tr.output,
            timestamp: new Date().toISOString()
          }))

          const charts = resultsToSave
            .filter(
              (tr: any) =>
                tr.toolName === 'create_chart' && (tr.result?.success || tr.output?.success)
            )
            .map((tr: any, index: number) => ({
              id: `chart-${aiMessage.id}-${index}`,
              ...tr.args
            }))

          if (charts.length > 0 || toolCallsUsed.length > 0 || toolApprovals.length > 0) {
            await prisma.chatMessage.update({
              where: { id: aiMessage.id },
              data: {
                metadata: {
                  charts,
                  toolCalls: toolCallsUsed,
                  toolApprovals: toolApprovals.length > 0 ? toolApprovals : undefined,
                  toolsUsed: toolCallsUsed.map((t) => t.name),
                  toolCallCount: toolCallsUsed.length
                } as any
              }
            })
          }

          // Track LLM Usage (moved after save)
          // ... (LLM tracking logic remains same, just ensure it uses aiMessage.id)
          try {
            const promptTokens = usage.inputTokens || 0
            const completionTokens = usage.outputTokens || 0
            const totalTokens = promptTokens + completionTokens

            const PRICING = {
              input: 0.075,
              output: 0.3
            }
            const estimatedCost =
              (promptTokens / 1_000_000) * PRICING.input +
              (completionTokens / 1_000_000) * PRICING.output

            await prisma.llmUsage.create({
              data: {
                userId,
                provider: 'google',
                model: modelName,
                modelType: userProfile?.aiModelPreference === 'flash' ? 'flash' : 'pro',
                operation: 'chat',
                entityType: 'ChatMessage',
                entityId: aiMessage.id,
                promptTokens,
                completionTokens,
                totalTokens,
                estimatedCost,
                durationMs: 0,
                retryCount: 0,
                success: true,
                promptPreview: content.substring(0, 500),
                responsePreview: (text || '').substring(0, 500)
              }
            })
          } catch (error) {
            console.error('[Chat] Failed to log LLM usage:', error)
          }

          // Auto-rename logic ...
          const messageCount = await prisma.chatMessage.count({ where: { roomId } })
          if (messageCount === 2) {
            // ... (existing auto-rename logic)
            try {
              const titlePrompt = `Based on this conversation, generate a very concise, descriptive title (max 6 words). Just return the title, nothing else.\n\nUser: ${content}\nAI: ${(text || '').substring(0, 500)}\n\nTitle:`
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
            } catch (error) {
              console.error(`[Chat] Failed to auto-rename room ${roomId}:`, error)
            }
          }
        } catch (err) {
          console.error('[Chat API] Error in onFinish metadata processing:', err)
        }
      }
    })
    return result.toUIMessageStreamResponse({
      onError: (error) => {
        console.error('[Chat API] Stream error:', error)
        return 'An error occurred while generating the response.'
      }
    })
  } catch (error: any) {
    console.error('[Chat] Error in streamText:', error)
    throw createError({ statusCode: 500, message: 'Failed to generate response: ' + error.message })
  }
})
