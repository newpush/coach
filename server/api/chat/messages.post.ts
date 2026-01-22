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

    // Workaround for 'Unsupported role: tool' in convertToModelMessages

    // We filter out tool messages, convert the rest, then append tool messages manually

    console.log(
      '[Chat API] History messages roles:',
      historyMessages.map((m: any) => m.role)
    )

    const uiMessages = historyMessages.filter((m: any) => m.role !== 'tool')

    console.log(
      '[Chat API] UI messages roles (filtered):',
      uiMessages.map((m: any) => m.role)
    )

    const toolMessages = historyMessages.filter((m: any) => m.role === 'tool')

    const coreMessages = [
      ...(await convertToModelMessages(uiMessages)),

      ...toolMessages.map((m: any) => ({
        role: 'tool',

        content: m.content
      }))
    ] as any

    // Manual Tool Execution for Approvals

    // If the last message is a tool result saying "User confirmed", we must execute the tool!

    const lastCoreMsg = coreMessages[coreMessages.length - 1]

    if (lastCoreMsg?.role === 'tool' && Array.isArray(lastCoreMsg.content)) {
      const approvalPart = lastCoreMsg.content.find(
        (p: any) => p.result === 'User confirmed action.' || p.approved === true
      )

      if (approvalPart) {
        const toolCallId = approvalPart.toolCallId || approvalPart.approvalId

        console.log('[Chat API] Intercepted approval for:', toolCallId)

        // Find the tool call in the previous assistant message

        const assistantMsg = coreMessages[coreMessages.length - 2]

        if (assistantMsg?.role === 'assistant' && Array.isArray(assistantMsg.content)) {
          const toolCallPart = assistantMsg.content.find(
            (p: any) => p.type === 'tool-call' && p.toolCallId === toolCallId
          )

          if (toolCallPart) {
            const toolName = toolCallPart.toolName

            const args = toolCallPart.args

            console.log(`[Chat API] Executing approved tool: ${toolName}`)

            if (tools[toolName]) {
              try {
                const executionResult = await tools[toolName].execute(args, {
                  toolCallId,

                  messages: coreMessages
                })

                console.log(
                  '[Chat API] Execution result:',
                  JSON.stringify(executionResult).substring(0, 100)
                )

                // REPLACE the approval content with the actual result

                lastCoreMsg.content = [
                  {
                    type: 'tool-result',

                    toolCallId,

                    toolName,

                    result: executionResult
                  }
                ]

                // Track execution for metadata

                allToolResults.push({
                  toolCallId,

                  toolName,

                  args,

                  result: executionResult
                })
              } catch (execErr: any) {
                console.error('[Chat API] Tool execution failed:', execErr)

                lastCoreMsg.content = [
                  {
                    type: 'tool-result',

                    toolCallId,

                    toolName,

                    result: `Error executing tool: ${execErr.message}`,

                    isError: true
                  }
                ]
              }
            }
          }
        }
      }
    }

    const result = await streamText({
      model: google(modelName),

      system: systemInstruction,

      messages: coreMessages,

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
        const { text, toolResults: finalStepResults, usage, finishReason, toolCalls } = event

        console.log(
          `[Chat API] Stream finished for room ${roomId}. Reason: ${finishReason}. Content length: ${text?.length || 0}`
        )
        // console.log('[Chat API] onFinish event keys:', Object.keys(event))

        // 1. Save AI Response to DB immediately to ensure persistence
        let aiMessage: any
        try {
          aiMessage = await prisma.chatMessage.create({
            data: {
              content: text || ' ', // Force non-empty content
              roomId,
              senderId: 'ai_agent',
              seen: {}
            }
          })
        } catch (dbErr: any) {
          console.error('[Chat API] Failed to save AI message:', dbErr)
          return
        }

        // 2. Capture metadata
        try {
          const toolApprovals: any[] = []

          try {
            // Access response promise
            const response = await result.response
            const responseMessages = response.messages

            const lastResponseMessage = responseMessages[responseMessages.length - 1]

            if (lastResponseMessage && Array.isArray(lastResponseMessage.content)) {
              lastResponseMessage.content.forEach((part: any) => {
                if (part.type === 'tool-approval-request') {
                  const id = part.toolCallId || part.approvalId
                  console.log('[Chat API] Found approval request:', id)

                  // Lookup details in toolCalls if missing in part
                  const toolName = part.toolCall?.toolName || part.toolName
                  const args = part.toolCall?.args || part.args

                  let resolvedName = toolName
                  let resolvedArgs = args

                  if (!resolvedName && toolCalls) {
                    const matchingCall = toolCalls.find((tc: any) => tc.toolCallId === id)
                    if (matchingCall) {
                      resolvedName = matchingCall.toolName
                      resolvedArgs = matchingCall.args
                    }
                  }

                  if (resolvedName) {
                    toolApprovals.push({
                      toolCallId: id,
                      name: resolvedName,
                      args: resolvedArgs,
                      timestamp: new Date().toISOString()
                    })
                  } else {
                    console.warn('[Chat API] Approval request missing toolName:', part)
                  }
                }
              })
            }
          } catch (resErr: any) {
            console.warn(`[Chat API] Failed to read result.response: ${resErr.message}`)
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

          // Track LLM Usage
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
                promptPreview:
                  typeof content === 'string'
                    ? content.substring(0, 500)
                    : JSON.stringify(content).substring(0, 500),
                responsePreview: (text || '').substring(0, 500)
              }
            })
          } catch (error) {
            console.error('[Chat] Failed to log LLM usage:', error)
          }

          // Auto-rename logic
          const messageCount = await prisma.chatMessage.count({ where: { roomId } })
          if (messageCount === 2) {
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
        } catch (err: any) {
          console.error(`[Chat API] Error in onFinish metadata processing: ${err.message}`)
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
