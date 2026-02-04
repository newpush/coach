import { getServerSession } from '../../utils/session'
import { streamText, convertToModelMessages, stepCountIs } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { getToolsWithContext } from '../../utils/ai-tools'
import { generateCoachAnalysis } from '../../utils/gemini'
import { buildAthleteContext } from '../../utils/services/chatContextService'
import { prisma } from '../../utils/db'
import { getUserTimezone } from '../../utils/date'
import { getUserAiSettings } from '../../utils/ai-settings'
import { MODEL_NAMES, calculateLlmCost } from '../../utils/ai-config'

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
  const userMessageId = lastMessage.id

  const existingMessage = userMessageId
    ? await prisma.chatMessage.findUnique({
        where: { id: userMessageId }
      })
    : null

  if (!existingMessage) {
    try {
      const metadata: any = {}
      if (lastMessage.role === 'tool' && Array.isArray(lastMessage.content)) {
        metadata.toolResponse = lastMessage.content
      }

      await prisma.chatMessage.create({
        data: {
          id: userMessageId || undefined,
          content: typeof content === 'string' ? content : '',
          roomId,
          senderId: lastMessage.role === 'tool' ? 'system_tool' : userId,
          files: files || undefined,
          replyToId: replyMessage?._id || undefined,
          seen: { [userId]: new Date() },
          metadata
        }
      })
    } catch (err: any) {
      if (err.code !== 'P2002') {
        console.error('[Chat] Message save failed:', err)
      }
    }
  }

  // 2. Build Athlete Context
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

    // Map approval IDs to tool call IDs to ensure consistency
    const approvalIdMap = new Map<string, string>()
    for (const m of historyMessages) {
      if (m.role === 'assistant' && Array.isArray(m.parts)) {
        m.parts.forEach((p: any) => {
          if (
            (p.type === 'tool-approval-request' || p.type.startsWith('tool-')) &&
            p.approvalId &&
            p.toolCallId
          ) {
            approvalIdMap.set(p.approvalId, p.toolCallId)
          }
        })
      }
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

    // Step 1: Convert UIMessages to ModelMessages using the SDK's standard converter
    // Passing tools ensures that tool-NAME parts are correctly expanded into turns.
    const coreMessages = await convertToModelMessages(historyMessages, { tools: tools as any })

    /**
     * STAGE 2: Final Normalization and Schema Validation
     * 1. Merges consecutive messages of the same role.
     * 2. Concatenates multiple text parts in user messages (Gemini preference).
     * 3. STRIPS pending tool calls if Turn N stopped with them and Turn N+1 starts with a User message.
     */
    const normalizedMessages = (() => {
      const merged: any[] = []

      // Pass A: Merge consecutive roles
      for (const msg of coreMessages) {
        const last = merged[merged.length - 1]
        if (last && last.role === msg.role) {
          if (msg.role === 'tool') {
            last.content = [...(last.content as any[]), ...(msg.content as any[])]
          } else if (typeof last.content === 'string' && typeof msg.content === 'string') {
            last.content = `${last.content} \n\n${msg.content} `
          } else {
            const lastParts = Array.isArray(last.content)
              ? last.content
              : [{ type: 'text', text: last.content }]
            const msgParts = Array.isArray(msg.content)
              ? msg.content
              : [{ type: 'text', text: msg.content }]

            // Concatenate consecutive text parts within the same merged message
            const combinedParts: any[] = []
            for (const part of [...lastParts, ...msgParts]) {
              const lastCombined = combinedParts[combinedParts.length - 1]
              if (lastCombined?.type === 'text' && part.type === 'text') {
                lastCombined.text = `${lastCombined.text} \n\n${part.text} `
              } else {
                combinedParts.push(part)
              }
            }
            last.content = combinedParts
          }
          continue
        }
        merged.push(msg)
      }

      // Pass B: Clean and Enforce strict sequencing
      const final: any[] = []
      for (let i = 0; i < merged.length; i++) {
        const msg = merged[i]
        const nextMsg = merged[i + 1]

        // 1. Clean parts (strip empty text)
        if (Array.isArray(msg.content)) {
          msg.content = msg.content.filter((p: any) => {
            if (p.type === 'text' && !p.text?.trim()) return false
            return true
          })

          // 2. Concatenate multiple text parts (final sweep)
          if (msg.role === 'user' || msg.role === 'system') {
            const textParts = msg.content.filter((p: any) => p.type === 'text')
            if (textParts.length > 1) {
              const mergedText = textParts.map((p: any) => p.text).join('\n\n')
              const otherParts = msg.content.filter((p: any) => p.type !== 'text')
              msg.content = [{ type: 'text', text: mergedText }, ...otherParts]
            }
            if (msg.content.length === 1 && msg.content[0].type === 'text') {
              msg.content = msg.content[0].text
            }
          }

          // 3. Defensive sequence check: Strip tool calls if not followed by results
          if (msg.role === 'assistant' && (!nextMsg || nextMsg.role !== 'tool')) {
            const hasCalls = msg.content.some((p: any) => p.type === 'tool-call')
            if (hasCalls) {
              console.warn(
                `[Chat API]Normalizer: Stripping orphaned tool calls from turn index ${i} `
              )
              msg.content = msg.content.filter((p: any) => p.type !== 'tool-call')
            }
          }

          // 4. Fallback for empty assistant
          if (msg.content.length === 0) {
            if (msg.role === 'assistant') msg.content = [{ type: 'text', text: ' ' }]
            else continue
          }
        } else if (typeof msg.content === 'string' && !msg.content.trim()) {
          if (msg.role === 'assistant') msg.content = ' '
          else continue
        }

        final.push(msg)
      }
      return final
    })()

    const historyToolCalls = new Map<string, any>()
    normalizedMessages.forEach((m) => {
      if (m.role === 'assistant' && Array.isArray(m.content)) {
        m.content.forEach((p: any) => {
          if (p.type === 'tool-call' && p.toolCallId) {
            historyToolCalls.set(p.toolCallId, p)
          }
        })
      }
    })

    console.log(
      '[Chat API] Final Core Sequence:',
      normalizedMessages.map((m) => m.role).join(' -> ')
    )

    const result = await streamText({
      model: google(modelName),
      system: systemInstruction,
      messages: normalizedMessages,
      tools,
      stopWhen: stepCountIs(5),
      onStepFinish: async ({ toolCalls, toolResults }) => {
        if (toolCalls) toolCalls.forEach((tc) => historyToolCalls.set(tc.toolCallId, tc))
        if (toolResults) {
          const detailed = toolResults.map((tr) => {
            const call = historyToolCalls.get(tr.toolCallId)
            return {
              ...tr,
              args: (tr as any).args || (tr as any).input || call?.args || call?.input,
              toolName: tr.toolName || call?.toolName,
              result: (tr as any).result || (tr as any).output
            }
          })
          allToolResults.push(...detailed)
        }
      },
      onFinish: async (event) => {
        const { text, toolResults: finalStepResults, usage, toolCalls: finalCalls } = event
        let aiMessage: any
        try {
          aiMessage = await prisma.chatMessage.create({
            data: { content: text || ' ', roomId, senderId: 'ai_agent', seen: {} }
          })
        } catch (dbErr) {
          console.error('[Chat API] Failed to save AI message:', dbErr)
          return
        }

        try {
          const resultsToSave = finalStepResults?.length ? finalStepResults : allToolResults
          const enrichedResults = resultsToSave.map((tr: any) => {
            if (tr.toolName && (tr.args || tr.input)) return tr
            const call =
              finalCalls?.find((tc: any) => tc.toolCallId === tr.toolCallId) ||
              historyToolCalls.get(tr.toolCallId)
            return {
              ...tr,
              toolName: tr.toolName || call?.toolName,
              args: tr.args || call?.args || call?.input
            }
          })

          const toolCallsUsed = enrichedResults.map((tr: any) => ({
            toolCallId: tr.toolCallId,
            name: tr.toolName,
            args: tr.args,
            response: tr.result || tr.output,
            timestamp: new Date().toISOString()
          }))

          const charts = enrichedResults
            .filter(
              (tr: any) =>
                tr.toolName === 'create_chart' && (tr.result?.success || tr.output?.success)
            )
            .map((tr: any, index: number) => ({
              id: `chart - ${aiMessage.id} -${index} `,
              ...tr.args
            }))

          if (charts.length > 0 || toolCallsUsed.length > 0) {
            await prisma.chatMessage.update({
              where: { id: aiMessage.id },
              data: {
                metadata: {
                  charts,
                  toolCalls: toolCallsUsed,
                  toolsUsed: toolCallsUsed.map((t) => t.name),
                  toolCallCount: toolCallsUsed.length
                } as any
              }
            })
          }

          // Log usage
          try {
            const promptTokens = usage.inputTokens || 0
            const completionTokens = usage.outputTokens || 0
            const estimatedCost = calculateLlmCost(modelName, promptTokens, completionTokens)
            await prisma.llmUsage.create({
              data: {
                userId,
                provider: 'google',
                model: modelName,
                modelType: aiSettings.aiModelPreference === 'flash' ? 'flash' : 'pro',
                operation: 'chat',
                entityType: 'ChatMessage',
                entityId: aiMessage.id,
                promptTokens,
                completionTokens,
                totalTokens: promptTokens + completionTokens,
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
          } catch (e) {
            console.error('[Chat] LLM usage log failed:', e)
          }
        } catch (err) {
          console.error(`[Chat API] Metadata capture error: ${err} `)
        }
      }
    })

    return result.toUIMessageStreamResponse({
      onError: (error: any) => {
        console.error('[Chat API] Stream error:', error)
        return `An error occurred while generating the response: ${error?.message || 'Unknown error'} `
      }
    })
  } catch (error: any) {
    console.error('[Chat] Error in streamText:', error)
    throw createError({ statusCode: 500, message: 'Failed to generate response: ' + error.message })
  }
})
