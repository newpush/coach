import { defineWebSocketHandler } from 'h3'
import { runs } from '@trigger.dev/sdk/v3'
import { verifyWsToken } from '../utils/ws-auth'
import { buildAthleteContext } from '../utils/services/chatContextService'
import { prisma } from '../utils/db'
import { MODEL_NAMES, calculateLlmCost } from '../utils/ai-config'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { streamText, convertToModelMessages, stepCountIs } from 'ai'
import { getToolsWithContext } from '../utils/ai-tools'
import { getUserTimezone } from '../utils/date'
import { getUserAiSettings } from '../utils/ai-user-settings'
import { getLlmOperationSettings } from '../utils/ai-operation-settings'
import { checkQuota } from '../utils/quotas/engine'

// Map to store active subscriptions cancel functions per peer
const subscriptions = new Map<any, Set<() => void>>()
// Map to store peer authentication status
const peerContext = new Map<any, { userId?: string }>()

export default defineWebSocketHandler({
  open(peer) {
    peer.send(JSON.stringify({ type: 'welcome', message: 'Connected to Coach Watts WebSocket' }))
    subscriptions.set(peer, new Set())
    peerContext.set(peer, {})
  },

  async message(peer, message) {
    const text = message.text()

    if (text === 'ping') {
      peer.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }))
      return
    }

    try {
      const data = JSON.parse(text)

      // Handle Authentication
      if (data.type === 'authenticate') {
        const userId = verifyWsToken(data.token)
        if (userId) {
          const ctx = peerContext.get(peer) || {}
          ctx.userId = userId
          peerContext.set(peer, ctx)
          peer.send(JSON.stringify({ type: 'authenticated', userId }))
        } else {
          peer.send(
            JSON.stringify({
              type: 'error',
              code: 'INVALID_TOKEN',
              message: 'Invalid authentication token'
            })
          )
        }
        return
      }

      if (data.type === 'subscribe_run') {
        const runId = data.runId
        if (!runId) return

        startSubscription(peer, () => runs.subscribeToRun(runId), runId)
      }

      if (data.type === 'subscribe_user') {
        // Enforce Authentication
        const ctx = peerContext.get(peer)
        if (!ctx?.userId) {
          peer.send(
            JSON.stringify({
              type: 'error',
              code: 'UNAUTHORIZED',
              message: 'Authentication required'
            })
          )
          return
        }

        // Use the authenticated user ID, ignore payload to prevent snooping
        const userId = ctx.userId
        const tag = `user:${userId}`
        startSubscription(peer, () => runs.subscribeToRunsWithTag(tag), `tag:${tag}`)
      }

      // Handle Chat Message
      if (data.type === 'chat_message') {
        const ctx = peerContext.get(peer)
        if (!ctx?.userId) {
          peer.send(
            JSON.stringify({
              type: 'error',
              code: 'UNAUTHORIZED',
              message: 'Authentication required for chat'
            })
          )
          return
        }

        const { roomId, content, replyMessage } = data
        if (!roomId || !content) return

        await handleChatMessage(peer, ctx.userId, roomId, content, replyMessage)
      }
    } catch (e) {
      // Ignore JSON parse errors
      console.error('WebSocket message error:', e)
    }
  },

  close(peer, event) {
    const peerSubs = subscriptions.get(peer)
    if (peerSubs) {
      peerSubs.forEach((cancel) => cancel())
      subscriptions.delete(peer)
    }
    peerContext.delete(peer)
  },

  error(peer, error) {
    // WebSocket error
  }
})

// Helper to handle subscription loops
function startSubscription(peer: any, iteratorFn: () => AsyncIterable<any>, subId: string) {
  let isSubscribed = true
  const cancel = () => {
    isSubscribed = false
  }

  const peerSubs = subscriptions.get(peer)
  if (peerSubs) peerSubs.add(cancel)
  ;(async () => {
    try {
      for await (const run of iteratorFn()) {
        if (!isSubscribed) break

        peer.send(
          JSON.stringify({
            type: 'run_update',
            runId: run.id,
            taskIdentifier: run.taskIdentifier,
            status: run.status,
            output: run.output,
            error: run.error,
            tags: run.tags,
            startedAt: run.startedAt,
            finishedAt: run.finishedAt
          })
        )
      }
    } catch (err) {
      // Subscription error
    } finally {
      if (peerSubs) peerSubs.delete(cancel)
    }
  })()
}

// Chat Message Handler with Streaming (Vercel AI SDK)
async function handleChatMessage(
  peer: any,
  userId: string,
  roomId: string,
  content: string,
  replyMessage?: any
) {
  try {
    // 0. Check Quota
    await checkQuota(userId, 'chat_ws')

    // 1. Save User Message (async)
    const userMessage = await prisma.chatMessage.create({
      data: {
        content,
        roomId,
        senderId: userId,
        replyToId: replyMessage?._id || undefined,
        seen: { [userId]: new Date() }
      }
    })

    // Notify client that message was saved
    peer.send(
      JSON.stringify({
        type: 'chat_message_saved',
        roomId,
        messageId: userMessage.id,
        content: userMessage.content,
        createdAt: userMessage.createdAt
      })
    )

    // 2. Build Context & Tools
    const { userProfile, systemInstruction } = await buildAthleteContext(userId)
    const timezone = await getUserTimezone(userId)
    const aiSettings = await getUserAiSettings(userId)
    const tools = getToolsWithContext(userId, timezone, aiSettings)

    // 3. Fetch History
    const history = await prisma.chatMessage.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      take: 50
    })
    const chronologicalHistory = history.reverse()

    // 4. Prepare History for AI SDK
    // Convert DB messages to AI SDK CoreMessage format
    // Simple conversion for now: map user/model roles.
    // Note: This simplistic conversion might lose tool call history in legacy messages.
    // A robust converter would parse metadata for toolCalls.
    const historyForModel = chronologicalHistory.map((msg: any) => ({
      role: msg.senderId === 'ai_agent' ? 'assistant' : 'user',
      content: msg.content
    })) as any[]

    // Remove leading assistant messages (invalid for some models)
    while (
      historyForModel.length > 0 &&
      historyForModel[0] &&
      historyForModel[0].role === 'assistant'
    ) {
      historyForModel.shift()
    }

    // 5. Initialize Provider
    const google = createGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY
    })
    const opSettings = await getLlmOperationSettings(userId, 'chat_ws')
    const modelName = opSettings.modelId

    // 6. Stream Text with Tools
    const allToolResults: any[] = []
    let fullResponseText = ''
    const startTime = Date.now()

    // Configure thinking based on model version and tier settings
    const providerOptions: any = {}
    if (modelName.includes('gemini-3')) {
      providerOptions.google = {
        thinkingConfig: { thinkingLevel: opSettings.thinkingLevel }
      }
    } else {
      // Gemini 2.5
      providerOptions.google = {
        thinkingConfig: { thinkingBudget: opSettings.thinkingBudget }
      }
    }

    const result = await streamText({
      model: google(modelName),
      system: systemInstruction,
      messages: historyForModel,
      tools,
      stopWhen: stepCountIs(opSettings.maxSteps), // Enable multi-step tool calls automatically
      providerOptions,
      onStepFinish: async ({ text, toolCalls, toolResults, finishReason, usage }) => {
        // Notify client about tool execution
        if (toolCalls && toolCalls.length > 0) {
          peer.send(
            JSON.stringify({
              type: 'tool_start',
              roomId,
              tools: toolCalls.map((tc) => tc.toolName)
            })
          )
        }

        if (toolResults && toolResults.length > 0) {
          // Collect results for metadata
          const detailedResults = toolResults.map((tr: any) => {
            const call = toolCalls?.find((tc) => tc.toolCallId === tr.toolCallId)
            return {
              ...tr,
              args: tr.args || (call as any)?.args || (call as any)?.input,
              toolName: tr.toolName || call?.toolName,
              result: tr.result || (tr as any).output
            }
          })
          allToolResults.push(...detailedResults)

          // Notify client tool finished
          peer.send(JSON.stringify({ type: 'tool_end', roomId }))
        }
      },
      onFinish: async (event) => {
        const { text, usage } = event
        const durationMs = Date.now() - startTime

        // 8. Save AI Response
        const aiMessage = await prisma.chatMessage.create({
          data: {
            content: text || ' ',
            roomId,
            senderId: 'ai_agent',
            seen: {}
          }
        })

        // 9. Extract Charts & Metadata
        const toolCallsUsed = allToolResults.map((tr: any) => ({
          name: tr.toolName,
          args: tr.args,
          response: tr.result,
          timestamp: new Date().toISOString()
        }))

        const charts = toolCallsUsed
          .filter((t) => t.name === 'create_chart')
          .map((call, index) => ({
            id: `chart-${aiMessage.id}-${index}`,
            ...call.args
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

        // 10. Send Completion Event
        peer.send(
          JSON.stringify({
            type: 'chat_complete',
            roomId,
            messageId: aiMessage.id,
            content: text,
            metadata: {
              charts,
              toolCalls: toolCallsUsed
            }
          })
        )

        // Log usage
        try {
          const promptTokens = usage.inputTokens || 0
          const completionTokens = usage.outputTokens || 0
          const cachedTokens = usage.inputTokenDetails?.cacheReadTokens || 0
          const reasoningTokens = (usage as any).outputTokenDetails?.reasoningTokens || 0
          const estimatedCost = calculateLlmCost(
            modelName,
            promptTokens,
            completionTokens + reasoningTokens,
            cachedTokens
          )

          await prisma.llmUsage.create({
            data: {
              userId,
              provider: 'google',
              model: modelName,
              modelType: aiSettings.aiModelPreference === 'flash' ? 'flash' : 'pro',
              operation: 'chat_ws',
              entityType: 'ChatMessage',
              entityId: aiMessage.id,
              promptTokens,
              completionTokens,
              cachedTokens,
              reasoningTokens,
              totalTokens: promptTokens + completionTokens,
              estimatedCost,
              durationMs,
              retryCount: 0,
              success: true,
              promptPreview: content.substring(0, 500),
              responsePreview: (text || '').substring(0, 500)
            }
          })
        } catch (e) {
          console.error('[WS Chat] LLM usage log failed:', e)
        }

        // 11. Auto-rename room
        try {
          const messageCount = await prisma.chatMessage.count({ where: { roomId } })
          if (messageCount === 2) {
            const titlePrompt = `Based on this conversation, generate a very concise, descriptive title (max 6 words). Just return the title, nothing else.\n\nUser: ${content}\nAI: ${text.substring(0, 500)}\n\nTitle:`
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
            await prisma.chatRoom.update({ where: { id: roomId }, data: { name: roomTitle } })
            peer.send(JSON.stringify({ type: 'room_renamed', roomId, name: roomTitle }))
          }
        } catch (e) {
          // Ignore rename errors
        }
      }
    })

    // 7. Iterate Stream for Tokens
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        const textDelta = (part as any).text || (part as any).textDelta
        fullResponseText += textDelta
        peer.send(
          JSON.stringify({
            type: 'chat_token',
            roomId,
            text: textDelta
          })
        )
      }
    }
  } catch (error: any) {
    console.error('[WS Chat] Error:', error)
    peer.send(
      JSON.stringify({
        type: 'error',
        roomId,
        code: 'CHAT_ERROR',
        message: error.message || 'An error occurred during chat processing'
      })
    )
  }
}
