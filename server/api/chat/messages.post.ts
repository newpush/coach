import { getServerSession } from '../../utils/session'
import { streamText, convertToModelMessages, stepCountIs } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { getToolsWithContext } from '../../utils/ai-tools'
import { generateCoachAnalysis, MODEL_NAMES } from '../../utils/gemini'
import { buildAthleteContext } from '../../utils/services/chatContextService'
import { prisma } from '../../utils/db'
import { getUserTimezone } from '../../utils/date'
import { getUserAiSettings } from '../../utils/ai-settings'

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

  // Block messages in legacy rooms (pre-migration)
  const MIGRATION_CUTOFF = new Date('2026-01-22T00:00:00Z')
  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: { createdAt: true }
  })

  if (room && new Date(room.createdAt) < MIGRATION_CUTOFF) {
    throw createError({
      statusCode: 403,
      message: 'This chat is read-only. Please start a new chat.'
    })
  }

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

  // Verify user is in the room and room is not deleted
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
          deletedAt: true
        }
      }
    }
  })

  if (!participant || participant.room.deletedAt) {
    throw createError({ statusCode: 404, message: 'Room not found or access denied' })
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
          content: typeof content === 'string' ? content : '', // Ensure string, never pass array
          roomId,
          senderId: lastMessage.role === 'tool' ? 'system_tool' : userId, // Distinguish tool responses
          files: files || undefined,
          replyToId: replyMessage?._id || undefined,
          seen: { [userId]: new Date() },
          metadata
        }
      })
    } catch (err: any) {
      // If ID collision occurs, it's a duplicate, we can ignore
      if (err.code === 'P2002') {
        console.warn('[Chat] Message save skipped (duplicate ID):', userMessageId)
      } else {
        console.error('[Chat] Message save failed:', err)
        console.error('Message Data:', {
          id: userMessageId,
          role: lastMessage.role,
          contentLength: content?.length
        })
      }
    }
  }

  // 2. Build Athlete Context (Extracted to Service)
  const { userProfile, systemInstruction } = await buildAthleteContext(userId)
  const timezone = await getUserTimezone(userId)
  const aiSettings = await getUserAiSettings(userId)

  // 3. Initialize Model and Tools
  const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY
  })
  const modelName = MODEL_NAMES[aiSettings.aiModelPreference]
  const tools = getToolsWithContext(userId, timezone, aiSettings)

  // 4. Stream Text
  try {
    const allToolResults: any[] = []

    // Workaround for 'Unsupported role: tool' in convertToModelMessages

    // We filter out tool messages, convert the rest, then append tool messages manually

    console.log(
      '[Chat API] History messages roles:',
      historyMessages.map((m: any) => m.role)
    )

    // 4. Robust conversion to CoreMessages that handles interleaving and merges tool results correctly
    const coreMessages: any[] = []

    // Map approval IDs to tool call IDs to ensure consistency
    const approvalIdMap = new Map<string, string>()
    for (const m of historyMessages) {
      // 1. Check message parts (if preserved by client)
      if (m.role === 'assistant' && Array.isArray(m.parts)) {
        m.parts.forEach((p: any) => {
          if (p.type === 'tool-approval-request' && p.approvalId && p.toolCallId) {
            approvalIdMap.set(p.approvalId, p.toolCallId)
          }
        })
      }

      // 2. Check metadata (fallback for stripped parts)
      if (m.role === 'assistant' && m.metadata?.toolApprovals) {
        const approvals = m.metadata.toolApprovals
        if (Array.isArray(approvals)) {
          approvals.forEach((approval: any) => {
            if (approval.approvalId && approval.toolCallId) {
              approvalIdMap.set(approval.approvalId, approval.toolCallId)
            }
          })
        }
      }
    }
    console.log(`[Chat API] Mapped ${approvalIdMap.size} tool approvals`)

    for (const msg of historyMessages) {
      if (msg.role === 'tool') {
        // Correctly interleave tool messages
        // Extract results from tool response part or content
        const parts = Array.isArray(msg.content) ? msg.content : msg.parts || []
        const results = parts
          .filter(
            (p: any) =>
              p.type === 'tool-result' ||
              p.type === 'tool-invocation' ||
              p.type === 'tool-approval-response'
          )
          .map((p: any) => {
            const resolvedId = p.toolCallId || approvalIdMap.get(p.approvalId) || p.approvalId
            return {
              type: 'tool-result',
              toolCallId: resolvedId,
              toolName: p.toolName || p.name || 'unknown',
              result: p.result || (p.approved ? 'User confirmed action.' : 'User denied action.')
            }
          })

        if (results.length > 0) {
          coreMessages.push({
            role: 'tool',
            content: results
          })
        }
        continue
      }

      // Use SDK helper for user/assistant messages but post-process assistant results
      const converted = await convertToModelMessages([msg])

      for (const coreMsg of converted) {
        // Fix role mapping for Google Generative AI (assistant -> model)
        if (coreMsg.role === 'assistant') {
          coreMsg.role = 'model'
        }

        // Patch: Inject tool-call parts from tool-approval-request parts
        // convertToModelMessages ignores our custom 'tool-approval-request' parts,
        // leading to missing tool calls in the history which invalidates the prompt schema.
        if (coreMsg.role === 'model') {
          const approvalParts = (msg.parts || []).filter(
            (p: any) => p.type === 'tool-approval-request'
          )

          if (approvalParts.length > 0) {
            // Filter approvals: Only inject tool-call if a subsequent tool message specifically references it.
            // If the user replied with text (e.g. "No"), we must NOT inject the tool-call,
            // otherwise Gemini will error expecting a tool result.
            const currentMsgIndex = historyMessages.indexOf(msg)
            const subsequentMessages = historyMessages.slice(currentMsgIndex + 1)

            const validApprovalParts = approvalParts.filter((ap: any) => {
              const id = ap.toolCallId || ap.approvalId
              if (!id) return false

              return subsequentMessages.some(
                (m: any) =>
                  m.role === 'tool' &&
                  (Array.isArray(m.content) ? m.content : m.parts || []).some(
                    (p: any) => p.toolCallId === id || p.approvalId === id
                  )
              )
            })

            if (validApprovalParts.length > 0) {
              // Ensure content is an array
              if (typeof coreMsg.content === 'string') {
                coreMsg.content = [{ type: 'text', text: coreMsg.content }]
              } else if (!Array.isArray(coreMsg.content)) {
                coreMsg.content = []
              }

              const existingCalls = (coreMsg.content as any[]).filter((p) => p.type === 'tool-call')

              validApprovalParts.forEach((ap: any) => {
                // Extract details from nested toolCall object or direct properties
                const toolCallId = ap.toolCallId || ap.approvalId
                const toolName = ap.toolCall?.toolName || ap.toolName || ap.name
                const args = ap.toolCall?.args || ap.args

                // Only add if not already present
                if (
                  toolCallId &&
                  toolName &&
                  !existingCalls.find((ec) => ec.toolCallId === toolCallId)
                ) {
                  ;(coreMsg.content as any[]).push({
                    type: 'tool-call',
                    toolCallId,
                    toolName,
                    args: args || {}
                  })
                }
              })
            }
          }
        }

        // Ensure no empty model messages (Google GenAI strictness)
        if (
          coreMsg.role === 'model' &&
          (!coreMsg.content || (Array.isArray(coreMsg.content) && coreMsg.content.length === 0))
        ) {
          coreMsg.content = [{ type: 'text', text: ' ' }]
        }

        if (coreMsg.role === 'model' && Array.isArray(coreMsg.content)) {
          // If the Assistant message contains tool-invocation parts with state: 'result',
          // we need to move them to a separate Tool message to satisfy Gemini requirements.
          const uiParts = (msg.parts || []) as any[]
          const toolResultParts = uiParts.filter(
            (p) => p.type === 'tool-invocation' && p.state === 'result'
          )

          if (toolResultParts.length > 0) {
            // Fix tool names in assistant content if they were converted to "invocation"
            coreMsg.content = coreMsg.content.map((p: any) => {
              if (p.type === 'tool-call' && (p.toolName === 'invocation' || !p.toolName)) {
                const originalPart = uiParts.find((op) => op.toolCallId === p.toolCallId)
                if (originalPart) {
                  return { ...p, toolName: originalPart.toolName }
                }
              }
              return p
            })

            coreMessages.push(coreMsg)

            // Add a Tool message with the results
            coreMessages.push({
              role: 'tool',
              content: toolResultParts.map((p) => ({
                type: 'tool-result',
                toolCallId: p.toolCallId,
                toolName: p.toolName,
                result: p.result
              }))
            })
          } else {
            coreMessages.push(coreMsg)
          }
        } else {
          coreMessages.push(coreMsg)
        }
      }
    }

    // Manual Tool Execution for Approvals
    const executedToolCallIds = new Set<string>()

    for (const msg of coreMessages) {
      if (msg.role === 'tool' && Array.isArray(msg.content)) {
        const approvalPartIndex = msg.content.findIndex(
          (p: any) =>
            p.result === 'User confirmed action.' ||
            p.approved === true ||
            p.type === 'tool-approval-response' ||
            (p.type === 'tool-result' && p.result === 'User confirmed action.')
        )

        if (approvalPartIndex !== -1) {
          const approvalPart = msg.content[approvalPartIndex]

          const toolCallId = approvalPart.toolCallId

          if (toolCallId && !executedToolCallIds.has(toolCallId)) {
            console.log('[Chat API] Intercepted approval for:', toolCallId)

            // Find the tool call in PREVIOUS messages (Assistant)

            // We search backwards from this message

            const msgIndex = coreMessages.indexOf(msg)

            const assistantMsg = coreMessages
              .slice(0, msgIndex)
              .reverse()
              .find(
                (m: any) =>
                  m.role === 'assistant' &&
                  Array.isArray(m.content) &&
                  m.content.some((p: any) => p.type === 'tool-call' && p.toolCallId === toolCallId)
              )

            if (assistantMsg) {
              const toolCallPart = (assistantMsg.content as any[]).find(
                (p: any) => p.type === 'tool-call' && p.toolCallId === toolCallId
              )

              if (toolCallPart) {
                const toolName = toolCallPart.toolName

                const args = toolCallPart.args || (toolCallPart as any).input || {}

                console.log(
                  `[Chat API] Executing approved tool: ${toolName}. Args:`,
                  JSON.stringify(args)
                )

                if ((tools as any)[toolName]) {
                  try {
                    // Execute

                    const executionResult = await (tools as any)[toolName].execute(args, {
                      toolCallId,

                      messages: coreMessages
                    })

                    console.log(
                      '[Chat API] Execution result:',
                      JSON.stringify(executionResult).substring(0, 100)
                    )

                    // Replace content with result
                    msg.content[approvalPartIndex] = {
                      type: 'tool-result',
                      toolCallId,
                      toolName,
                      result: executionResult
                    }

                    executedToolCallIds.add(toolCallId)

                    // Track execution
                    allToolResults.push({
                      toolCallId,
                      toolName,
                      args,
                      result: executionResult
                    })
                  } catch (execErr: any) {
                    console.error('[Chat API] Tool execution failed:', execErr)

                    msg.content[approvalPartIndex] = {
                      type: 'tool-result',
                      toolCallId,
                      toolName,
                      result: `Error executing tool: ${execErr.message}`,
                      isError: true
                    }

                    executedToolCallIds.add(toolCallId) // Mark executed even if failed to prevent retry loops
                  }
                }
              }
            }
          } else if (toolCallId && executedToolCallIds.has(toolCallId)) {
            // Duplicate approval for already executed tool
            msg.content[approvalPartIndex] = {
              type: 'tool-result',
              toolCallId,
              toolName: 'unknown',
              result: 'Tool already executed in previous message.'
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
                      resolvedArgs = (matchingCall as any).args || (matchingCall as any).input
                    }
                  }

                  if (resolvedName) {
                    toolApprovals.push({
                      toolCallId: id,
                      approvalId: part.approvalId, // Save original approval ID for frontend matching
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
        console.error('[Chat API] Error Stack:', error.stack)
        const errorMsg = error.message || 'Unknown error'
        // Handle specific history sync errors gracefully
        if (
          errorMsg.includes('tool result without matching tool call') ||
          errorMsg.includes('history')
        ) {
          return 'Chat history sync error. Please refresh the page or start a new chat.'
        }
        return `An error occurred while generating the response: ${errorMsg}`
      }
    })
  } catch (error: any) {
    console.error('[Chat] Error in streamText:', error)
    console.error('[Chat] Error Stack:', error.stack)
    console.error('[Chat] Request Context:', { roomId, userId, messageCount: messages?.length })

    // Check for history/sequence errors which often indicate corrupted legacy chats
    const errorStr = (error.message || '').toLowerCase()
    const isHistoryError =
      errorStr.includes('history') ||
      errorStr.includes('tool_call') ||
      errorStr.includes('sequence') ||
      errorStr.includes('interleaved') ||
      errorStr.includes('previous_message')

    const userMessage = isHistoryError
      ? 'This chat history is not compatible with the new AI engine. Please start a new chat to continue.'
      : 'Failed to generate response: ' + error.message

    throw createError({ statusCode: 500, message: userMessage })
  }
})
