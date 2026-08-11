import type { Prisma } from '@prisma/client'
import * as Sentry from '@sentry/nuxt'
import { prisma } from '../db'
import { expandStoredChatMessages, truncateMessages } from '../chat/history'
import { shouldExcludeAssistantMessageFromHistory } from '../chat/message-state'
import { getJsonObject } from '../prisma-json'
import {
  CHAT_TURN_EVENT_TYPE,
  CHAT_TURN_HEARTBEAT_TIMEOUT_MS,
  CHAT_TURN_TIMEOUT_REASON,
  CHAT_TURN_STATUS,
  type ChatTurnStatus,
  isActiveChatTurnStatus,
  isMutatingChatTool,
  shouldResumeTurn
} from '../chat/turns'

type PersistedRequestSnapshot = {
  messages: any[]
  files?: any[]
  replyMessage?: any
  lastMessageId?: string
  content?: string
  coachingContext?: {
    actorUserId?: string
    isCoaching?: boolean
  }
}

function getDeploymentIdentity() {
  return (
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.RAILWAY_DEPLOYMENT_ID ||
    process.env.RENDER_INSTANCE_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.HOSTNAME ||
    'unknown'
  )
}

function buildRecoveredMutationConfirmation(execution: any) {
  const result = execution?.result
  if (typeof result?.message === 'string' && result.message.trim()) {
    return result.message.trim()
  }
  return `Completed ${String(execution?.toolName || 'the requested action').replaceAll('_', ' ')}.`
}

class ChatTurnService {
  private readonly maxRecoveryAttempts = Math.max(
    0,
    Number(process.env.CHAT_TURN_MAX_RECOVERY_ATTEMPTS || 2)
  )

  getTurnMetadata(turn: { metadata?: Prisma.JsonValue | null }) {
    return getJsonObject(turn.metadata) || {}
  }

  mergeTurnMetadata(
    turn: { metadata?: Prisma.JsonValue | null } | null | undefined,
    patch: Record<string, any>
  ) {
    return {
      ...this.getTurnMetadata(turn || {}),
      ...patch
    } as Prisma.InputJsonValue
  }

  getRequestSnapshot(turn: { metadata?: Prisma.JsonValue | null }): PersistedRequestSnapshot {
    const metadata = this.getTurnMetadata(turn)
    return {
      messages: Array.isArray(metadata.request?.messages) ? metadata.request.messages : [],
      files: Array.isArray(metadata.request?.files) ? metadata.request.files : [],
      replyMessage: metadata.request?.replyMessage,
      lastMessageId:
        typeof metadata.request?.lastMessageId === 'string'
          ? metadata.request.lastMessageId
          : undefined,
      content: typeof metadata.request?.content === 'string' ? metadata.request.content : undefined,
      coachingContext:
        metadata.request?.coachingContext && typeof metadata.request.coachingContext === 'object'
          ? metadata.request.coachingContext
          : undefined
    }
  }

  async createTurn(params: {
    roomId: string
    userId: string
    userMessageId: string
    request: PersistedRequestSnapshot
    lineageId?: string
    retryOfTurnId?: string
  }) {
    return await prisma.$transaction(async (tx) => {
      const turn = await tx.chatTurn.create({
        data: {
          roomId: params.roomId,
          userId: params.userId,
          userMessageId: params.userMessageId,
          status: CHAT_TURN_STATUS.QUEUED,
          lineageId: params.lineageId || 'pending',
          retryOfTurnId: params.retryOfTurnId,
          startedAt: null,
          finishedAt: null,
          lastHeartbeatAt: new Date(),
          metadata: {
            request: params.request
          } as any
        }
      })

      const lineageId = params.lineageId || turn.id

      await tx.chatTurn.update({
        where: { id: turn.id },
        data: { lineageId }
      })

      return {
        ...turn,
        lineageId
      }
    })
  }

  async enqueueTurn(turnId: string, userId: string) {
    const runId = `app:${userId}:${turnId}:${Date.now()}`

    const turn = await prisma.chatTurn.update({
      where: { id: turnId },
      data: {
        runId,
        status: CHAT_TURN_STATUS.QUEUED,
        lastHeartbeatAt: new Date()
      }
    })

    return {
      id: runId,
      turnId: turn.id,
      status: turn.status,
      kind: 'in_process'
    }
  }

  async claimNextQueuedTurn(workerId: string) {
    // Statuses that indicate a room already has an in-progress turn
    const blockingStatuses = [
      CHAT_TURN_STATUS.RECEIVED,
      CHAT_TURN_STATUS.RUNNING,
      CHAT_TURN_STATUS.STREAMING,
      CHAT_TURN_STATUS.WAITING_FOR_TOOLS
    ] as const

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        // Step 1: find all rooms that currently have an active turn
        const activeTurnRooms = await prisma.chatTurn.findMany({
          where: { status: { in: [...blockingStatuses] } },
          select: { roomId: true },
          distinct: ['roomId']
        })
        const blockedRoomIds = activeTurnRooms.map((t) => t.roomId)

        // Step 2: find the oldest queued turn in an unblocked room
        const candidate = await prisma.chatTurn.findFirst({
          where: {
            status: CHAT_TURN_STATUS.QUEUED,
            ...(blockedRoomIds.length > 0 ? { roomId: { notIn: blockedRoomIds } } : {})
          },
          orderBy: [{ createdAt: 'asc' }]
        })

        if (!candidate) {
          if (blockedRoomIds.length > 0) {
            // There may still be queued turns, but all their rooms are blocked.
            // They will become claimable once the active turns complete or are
            // recovered by the heartbeat sweep.
            const pendingCount = await prisma.chatTurn.count({
              where: { status: CHAT_TURN_STATUS.QUEUED }
            })
            if (pendingCount > 0) {
              console.warn(
                `[ChatTurnService] ${pendingCount} queued turn(s) are blocked by ${blockedRoomIds.length} room(s) with active turns. They will be processed once those turns complete.`
              )
            }
          }
          return null
        }

        // Step 3: CAS-claim the candidate (guards against concurrent workers)
        const claimRunId = `app-worker:${workerId}:${candidate.id}:${Date.now()}`
        const claimed = await prisma.chatTurn.updateMany({
          where: {
            id: candidate.id,
            status: CHAT_TURN_STATUS.QUEUED
          },
          data: {
            status: CHAT_TURN_STATUS.RECEIVED,
            runId: claimRunId,
            lastHeartbeatAt: new Date()
          }
        })

        if (claimed.count > 0) {
          return await prisma.chatTurn.findUnique({
            where: { id: candidate.id }
          })
        }
        // Another worker claimed it first — retry with fresh state
      } catch (err: any) {
        console.error(`[ChatTurnService] Error in claimNextQueuedTurn attempt ${attempt}:`, {
          code: err?.code,
          message: err?.message,
          stack: err?.stack
        })
        // Wait a small bit before retry
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)))
      }
    }

    return null
  }

  async tryStartExecution(
    turnId: string,
    runId: string | null | undefined,
    data: Partial<{
      startedAt: Date | null
      finishedAt: Date | null
      failureReason: string | null
      assistantMessageId: string | null
      providerRequestId: string | null
      metadata: Prisma.InputJsonValue
    }> = {}
  ) {
    if (!runId) {
      return null
    }

    const started = await prisma.chatTurn.updateMany({
      where: {
        id: turnId,
        runId,
        status: CHAT_TURN_STATUS.RECEIVED
      },
      data: {
        status: CHAT_TURN_STATUS.RUNNING,
        lastHeartbeatAt: new Date(),
        ...(data.startedAt !== undefined ? { startedAt: data.startedAt } : {}),
        ...(data.finishedAt !== undefined ? { finishedAt: data.finishedAt } : {}),
        ...(data.failureReason !== undefined ? { failureReason: data.failureReason } : {}),
        ...(data.assistantMessageId !== undefined
          ? { assistantMessageId: data.assistantMessageId }
          : {}),
        ...(data.providerRequestId !== undefined
          ? { providerRequestId: data.providerRequestId }
          : {}),
        ...(data.metadata !== undefined ? { metadata: data.metadata } : {})
      }
    })

    if (started.count === 0) {
      return null
    }

    return await prisma.chatTurn.findUnique({
      where: { id: turnId }
    })
  }

  async updateStatus(
    turnId: string,
    status: ChatTurnStatus,
    data: Partial<{
      startedAt: Date | null
      finishedAt: Date | null
      failureReason: string | null
      assistantMessageId: string | null
      providerRequestId: string | null
      metadata: Prisma.InputJsonValue
    }> = {}
  ) {
    return await prisma.chatTurn.update({
      where: { id: turnId },
      data: {
        status,
        lastHeartbeatAt: new Date(),
        ...(data.startedAt !== undefined ? { startedAt: data.startedAt } : {}),
        ...(data.finishedAt !== undefined ? { finishedAt: data.finishedAt } : {}),
        ...(data.failureReason !== undefined ? { failureReason: data.failureReason } : {}),
        ...(data.assistantMessageId !== undefined
          ? { assistantMessageId: data.assistantMessageId }
          : {}),
        ...(data.providerRequestId !== undefined
          ? { providerRequestId: data.providerRequestId }
          : {}),
        ...(data.metadata !== undefined ? { metadata: data.metadata } : {})
      }
    })
  }

  async updateStatusIfOwned(
    turnId: string,
    runId: string,
    status: ChatTurnStatus,
    data: Partial<{
      startedAt: Date | null
      finishedAt: Date | null
      failureReason: string | null
      assistantMessageId: string | null
      providerRequestId: string | null
      metadata: Prisma.InputJsonValue
    }> = {}
  ) {
    return await prisma.chatTurn.updateMany({
      where: { id: turnId, runId },
      data: {
        status,
        lastHeartbeatAt: new Date(),
        ...(data.startedAt !== undefined ? { startedAt: data.startedAt } : {}),
        ...(data.finishedAt !== undefined ? { finishedAt: data.finishedAt } : {}),
        ...(data.failureReason !== undefined ? { failureReason: data.failureReason } : {}),
        ...(data.assistantMessageId !== undefined
          ? { assistantMessageId: data.assistantMessageId }
          : {}),
        ...(data.providerRequestId !== undefined
          ? { providerRequestId: data.providerRequestId }
          : {}),
        ...(data.metadata !== undefined ? { metadata: data.metadata } : {})
      }
    })
  }

  async heartbeat(turnId: string, status?: ChatTurnStatus, runId?: string | null) {
    return await prisma.chatTurn.updateMany({
      where: {
        id: turnId,
        ...(runId ? { runId } : {})
      },
      data: {
        lastHeartbeatAt: new Date(),
        ...(status ? { status } : {})
      }
    })
  }

  async heartbeatWithTelemetry(turnId: string, runId: string, telemetry: Record<string, unknown>) {
    const turn = await prisma.chatTurn.findUnique({
      where: { id: turnId },
      select: { runId: true, metadata: true }
    })

    if (!turn || turn.runId !== runId) return { count: 0 }

    return await prisma.chatTurn.updateMany({
      where: { id: turnId, runId },
      data: {
        lastHeartbeatAt: new Date(),
        metadata: this.mergeTurnMetadata(turn as any, telemetry)
      }
    })
  }

  async recordEvent(turnId: string, type: string, data?: Prisma.InputJsonValue) {
    return await prisma.chatTurnEvent.create({
      data: {
        turnId,
        type,
        ...(data !== undefined ? { data } : {})
      }
    })
  }

  async createAssistantDraft(params: {
    turnId: string
    roomId: string
    status: ChatTurnStatus
    existingMessageId?: string | null
  }) {
    if (params.existingMessageId) {
      const existingMessage = await prisma.chatMessage.findUnique({
        where: { id: params.existingMessageId },
        select: { metadata: true }
      })

      return await prisma.chatMessage.update({
        where: { id: params.existingMessageId },
        data: {
          content: ' ',
          metadata: {
            ...((existingMessage?.metadata as any) || {}),
            isDraft: true,
            turnId: params.turnId,
            turnStatus: params.status,
            hideUntilContent: true,
            hiddenBecauseEmptyFailure: false
          } as any,
          turnId: params.turnId
        }
      })
    }

    const message = await prisma.chatMessage.create({
      data: {
        content: ' ',
        roomId: params.roomId,
        senderId: 'ai_agent',
        seen: {},
        turnId: params.turnId,
        metadata: {
          isDraft: true,
          turnId: params.turnId,
          turnStatus: params.status,
          hideUntilContent: true,
          hiddenBecauseEmptyFailure: false
        } as any
      }
    })

    await prisma.chatRoom.update({
      where: { id: params.roomId },
      data: { lastMessageAt: new Date() }
    })

    await prisma.chatTurn.update({
      where: { id: params.turnId },
      data: { assistantMessageId: message.id }
    })

    return message
  }

  async updateAssistantDraft(params: {
    messageId: string
    content: string
    metadata?: Prisma.InputJsonValue
  }) {
    return await prisma.chatMessage.update({
      where: { id: params.messageId },
      data: {
        content: params.content || ' ',
        ...(params.metadata !== undefined ? { metadata: params.metadata } : {})
      }
    })
  }

  async upsertToolResultMessage(params: { turnId: string; roomId: string; toolResponses: any[] }) {
    const existing = await prisma.chatMessage.findFirst({
      where: {
        turnId: params.turnId,
        senderId: 'system_tool'
      },
      orderBy: { createdAt: 'asc' }
    })

    if (existing) {
      return await prisma.chatMessage.update({
        where: { id: existing.id },
        data: {
          content: '',
          metadata: {
            ...((existing.metadata as any) || {}),
            toolResponse: params.toolResponses
          } as any
        }
      })
    }

    return await prisma.chatMessage.create({
      data: {
        content: '',
        roomId: params.roomId,
        senderId: 'system_tool',
        seen: {},
        turnId: params.turnId,
        metadata: {
          toolResponse: params.toolResponses
        } as any
      }
    })
  }

  async startLlmUsage(turnId: string, userId: string, promptPreview: string) {
    return await prisma.llmUsage.create({
      data: {
        userId,
        turnId,
        provider: 'gemini',
        model: 'pending',
        operation: 'chat_turn_start',
        entityType: 'ChatTurn',
        entityId: turnId,
        success: false,
        errorType: 'IN_PROGRESS',
        errorMessage: 'Chat turn execution started.',
        promptPreview: promptPreview.substring(0, 500),
        responsePreview: ''
      }
    })
  }

  async findRecoverableTurnForRoom(roomId: string) {
    return await prisma.chatTurn.findFirst({
      where: {
        roomId,
        status: CHAT_TURN_STATUS.INTERRUPTED
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  async findLatestTurnForMessage(userMessageId: string) {
    return await prisma.chatTurn.findFirst({
      where: {
        userMessageId
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  async buildStableRequestMessages(roomId: string, lastMessageId: string, limit = 25) {
    const roomMessages = await prisma.chatMessage.findMany({
      where: { roomId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        createdAt: true,
        senderId: true,
        content: true,
        files: true,
        turnId: true,
        metadata: true,
        turn: {
          select: {
            id: true,
            metadata: true,
            status: true,
            failureReason: true,
            startedAt: true,
            finishedAt: true
          }
        }
      }
    })

    const stableMessages = roomMessages.filter((message) => {
      if (message.id === lastMessageId) {
        return true
      }

      if (shouldExcludeAssistantMessageFromHistory(message)) {
        return false
      }

      if (!message.turn) {
        return true
      }

      return !isActiveChatTurnStatus(message.turn.status)
    })

    return truncateMessages(expandStoredChatMessages(stableMessages), limit)
  }

  private async recoverTurn(
    turn: Awaited<ReturnType<typeof prisma.chatTurn.findFirst>> & {
      messages?: any[]
      toolExecutions?: any[]
    },
    now: Date,
    reason: 'heartbeat_timeout',
    requireStaleHeartbeat = false,
    recoveryClaimant = 'unknown'
  ) {
    if (!turn) return 'skipped' as const

    const metadata = this.getTurnMetadata(turn)
    const recoveryAttempts = Number(metadata.recoveryAttempts || 0)
    const hasUncertainMutation = (turn.toolExecutions || []).some(
      (execution: any) => execution.status === 'STARTED' && isMutatingChatTool(execution.toolName)
    )
    const completedMutation = [...(turn.toolExecutions || [])]
      .reverse()
      .find(
        (execution: any) =>
          execution.status === 'COMPLETED' && isMutatingChatTool(execution.toolName)
      )
    const shouldCompleteFromMutation = !!completedMutation && !hasUncertainMutation
    const shouldRequeue =
      !shouldCompleteFromMutation &&
      !hasUncertainMutation &&
      recoveryAttempts < this.maxRecoveryAttempts
    const interruptionReason = hasUncertainMutation
      ? 'Turn interrupted because a mutating tool may have completed during worker restart.'
      : 'Turn interrupted after recovery attempts were exhausted.'
    const activeStatuses = [
      CHAT_TURN_STATUS.RECEIVED,
      CHAT_TURN_STATUS.RUNNING,
      CHAT_TURN_STATUS.STREAMING,
      CHAT_TURN_STATUS.WAITING_FOR_TOOLS
    ]
    const cutoff = new Date(now.getTime() - CHAT_TURN_HEARTBEAT_TIMEOUT_MS)

    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.chatTurn.updateMany({
        where: {
          id: turn.id,
          status: { in: activeStatuses },
          ...(requireStaleHeartbeat
            ? {
                OR: [
                  { lastHeartbeatAt: { lt: cutoff } },
                  { lastHeartbeatAt: null, createdAt: { lt: cutoff } }
                ]
              }
            : {})
        },
        data: shouldRequeue
          ? {
              status: CHAT_TURN_STATUS.QUEUED,
              runId: null,
              startedAt: null,
              finishedAt: null,
              failureReason: null,
              lastHeartbeatAt: now,
              metadata: this.mergeTurnMetadata(turn, {
                recoveryAttempts: recoveryAttempts + 1,
                recoveryReason: reason,
                previousRunId: turn.runId,
                recoveryClaimant,
                deploymentId: getDeploymentIdentity(),
                executionPhase: 'queued_for_recovery',
                timeoutReason: null,
                finishedAt: null
              })
            }
          : {
              status: shouldCompleteFromMutation
                ? CHAT_TURN_STATUS.COMPLETED
                : CHAT_TURN_STATUS.INTERRUPTED,
              runId: null,
              finishedAt: now,
              failureReason: shouldCompleteFromMutation ? null : interruptionReason,
              lastHeartbeatAt: now,
              metadata: this.mergeTurnMetadata(turn, {
                recoveryAttempts,
                recoveryReason: reason,
                previousRunId: turn.runId,
                recoveryClaimant,
                deploymentId: getDeploymentIdentity(),
                executionPhase: shouldCompleteFromMutation
                  ? 'recovered_from_completed_mutation'
                  : hasUncertainMutation
                    ? 'recovery_blocked_by_started_mutation'
                    : 'recovery_exhausted',
                timeoutReason: CHAT_TURN_TIMEOUT_REASON.HEARTBEAT_TIMEOUT,
                finishedAt: now.toISOString()
              })
            }
      })

      if (claimed.count === 0) return 'skipped' as const

      const draft = turn.messages?.[0]
      if (draft) {
        const draftMetadata = ((draft.metadata as any) || {}) as Record<string, any>
        const terminalMessage = shouldCompleteFromMutation
          ? buildRecoveredMutationConfirmation(completedMutation)
          : typeof draft.content === 'string' && draft.content.trim()
            ? draft.content
            : "I couldn't finish this response after reconnecting. No completed changes were retried; please try the request again."
        await tx.chatMessage.update({
          where: { id: draft.id },
          data: {
            content: shouldRequeue ? ' ' : terminalMessage,
            metadata: {
              ...draftMetadata,
              isDraft: shouldRequeue,
              turnStatus: shouldRequeue
                ? CHAT_TURN_STATUS.QUEUED
                : shouldCompleteFromMutation
                  ? CHAT_TURN_STATUS.COMPLETED
                  : CHAT_TURN_STATUS.INTERRUPTED,
              interrupted: !shouldRequeue && !shouldCompleteFromMutation,
              failureReason:
                shouldRequeue || shouldCompleteFromMutation ? null : interruptionReason,
              timeoutReason: shouldRequeue ? null : CHAT_TURN_TIMEOUT_REASON.HEARTBEAT_TIMEOUT,
              hideUntilContent: shouldRequeue,
              hiddenBecauseEmptyFailure: false,
              recoveryAttempts: shouldRequeue ? recoveryAttempts + 1 : recoveryAttempts
            } as any
          }
        })
      }

      await tx.chatTurnEvent.create({
        data: {
          turnId: turn.id,
          type: shouldRequeue
            ? CHAT_TURN_EVENT_TYPE.SLOW_RESPONSE
            : shouldCompleteFromMutation
              ? CHAT_TURN_EVENT_TYPE.TURN_COMPLETED
              : CHAT_TURN_EVENT_TYPE.TURN_INTERRUPTED,
          data: shouldRequeue
            ? {
                reason: 'turn_requeued_for_recovery',
                recoveryReason: reason,
                recoveryAttempt: recoveryAttempts + 1,
                previousRunId: turn.runId,
                recoveryClaimant,
                deploymentId: getDeploymentIdentity()
              }
            : {
                reason: shouldCompleteFromMutation
                  ? 'recovered_from_completed_mutation'
                  : hasUncertainMutation
                    ? 'recovery_blocked_by_started_mutation'
                    : 'recovery_attempts_exhausted',
                recoveryReason: reason,
                recoveryAttempts,
                previousRunId: turn.runId,
                recoveryClaimant,
                deploymentId: getDeploymentIdentity()
              }
        }
      })

      await tx.llmUsage.updateMany({
        where: {
          turnId: turn.id,
          operation: 'chat_turn_start',
          errorType: 'IN_PROGRESS'
        },
        data: {
          success: shouldCompleteFromMutation,
          errorType: shouldRequeue
            ? 'RECOVERED'
            : shouldCompleteFromMutation
              ? 'RECOVERED_COMPLETED_MUTATION'
              : 'INTERRUPTED',
          errorMessage: shouldRequeue
            ? `Chat turn requeued after ${reason}.`
            : shouldCompleteFromMutation
              ? 'Recovered from a persisted completed mutation.'
              : interruptionReason,
          durationMs:
            turn.startedAt instanceof Date
              ? Math.max(0, now.getTime() - turn.startedAt.getTime())
              : Math.max(0, now.getTime() - turn.createdAt.getTime())
        }
      })

      return shouldRequeue
        ? ('requeued' as const)
        : shouldCompleteFromMutation
          ? ('completed' as const)
          : ('interrupted' as const)
    })

    // Recovery telemetry previously only landed in ChatTurnEvent rows (DB-only, no
    // alerting/searchability). Surface it to Sentry/console so a recurrence is
    // diagnosable without depending on docker log retention (see CW-295).
    if (result === 'requeued' || result === 'interrupted') {
      const elapsedMs =
        turn.startedAt instanceof Date
          ? now.getTime() - turn.startedAt.getTime()
          : now.getTime() - turn.createdAt.getTime()
      const logPayload = {
        turnId: turn.id,
        roomId: turn.roomId,
        userId: turn.userId,
        recoveryReason: reason,
        recoveryAttempts,
        recoveryClaimant,
        previousRunId: turn.runId,
        deploymentId: getDeploymentIdentity(),
        elapsedMs,
        hasUncertainMutation
      }

      if (result === 'interrupted') {
        console.error('[ChatTurn] Turn interrupted after recovery attempts exhausted.', logPayload)
        Sentry.captureMessage('ChatTurn heartbeat-timeout recovery exhausted', {
          level: 'warning',
          tags: { turnId: turn.id, recoveryReason: reason },
          extra: logPayload
        })
      } else {
        console.warn('[ChatTurn] Turn requeued after heartbeat timeout.', logPayload)
      }
    }

    return result
  }

  async recoverStaleTurns(now = new Date(), recoveryClaimant = 'unknown') {
    const cutoff = new Date(now.getTime() - CHAT_TURN_HEARTBEAT_TIMEOUT_MS)
    const turns = await prisma.chatTurn.findMany({
      where: {
        status: {
          in: [
            CHAT_TURN_STATUS.RECEIVED,
            CHAT_TURN_STATUS.RUNNING,
            CHAT_TURN_STATUS.STREAMING,
            CHAT_TURN_STATUS.WAITING_FOR_TOOLS
          ]
        },
        OR: [
          { lastHeartbeatAt: { lt: cutoff } },
          { lastHeartbeatAt: null, createdAt: { lt: cutoff } }
        ]
      },
      include: {
        messages: {
          where: { senderId: 'ai_agent' },
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        toolExecutions: {
          where: { status: { in: ['STARTED', 'COMPLETED'] } },
          orderBy: { createdAt: 'asc' },
          select: { status: true, toolName: true, result: true }
        }
      }
    })

    let recoveredCount = 0
    for (const turn of turns) {
      const result = await this.recoverTurn(turn, now, 'heartbeat_timeout', true, recoveryClaimant)
      if (result !== 'skipped') recoveredCount += 1
    }

    return recoveredCount
  }

  canResumeTurn(status?: string | null) {
    return shouldResumeTurn(status)
  }

  isPendingStatus(status?: string | null) {
    return isActiveChatTurnStatus(status)
  }
}

export const chatTurnService = new ChatTurnService()
