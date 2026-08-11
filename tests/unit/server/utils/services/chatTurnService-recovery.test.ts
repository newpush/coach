import { beforeEach, describe, expect, it, vi } from 'vitest'

import { chatTurnService } from '../../../../../server/utils/services/chatTurnService'

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  messageUpdate: vi.fn(),
  eventCreate: vi.fn(),
  usageUpdateMany: vi.fn(),
  transaction: vi.fn(),
  captureMessage: vi.fn()
}))

vi.mock('../../../../../server/utils/db', () => ({
  prisma: {
    chatTurn: {
      findMany: mocks.findMany,
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany
    },
    $transaction: mocks.transaction
  }
}))

vi.mock('@sentry/nuxt', () => ({
  captureMessage: mocks.captureMessage
}))

const now = new Date('2026-07-12T12:00:00.000Z')

function buildTurn(recoveryAttempts = 0): any {
  return {
    id: 'turn-1',
    roomId: 'room-1',
    userId: 'user-1',
    userMessageId: 'message-1',
    assistantMessageId: 'assistant-1',
    status: 'RUNNING',
    lineageId: 'turn-1',
    retryOfTurnId: null,
    runId: 'app-worker:old-worker:turn-1:1',
    startedAt: new Date('2026-07-12T11:55:00.000Z'),
    finishedAt: null,
    failureReason: null,
    lastHeartbeatAt: new Date('2026-07-12T11:56:00.000Z'),
    providerRequestId: null,
    metadata: { recoveryAttempts },
    createdAt: new Date('2026-07-12T11:54:00.000Z'),
    updatedAt: new Date('2026-07-12T11:56:00.000Z'),
    messages: [
      {
        id: 'assistant-1',
        content: 'partial response',
        metadata: { isDraft: true }
      }
    ],
    toolExecutions: []
  }
}

describe('chat turn restart recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        chatTurn: { updateMany: mocks.updateMany },
        chatMessage: { update: mocks.messageUpdate },
        chatTurnEvent: { create: mocks.eventCreate },
        llmUsage: { updateMany: mocks.usageUpdateMany }
      })
    )
    mocks.updateMany.mockResolvedValue({ count: 1 })
    mocks.messageUpdate.mockResolvedValue({})
    mocks.eventCreate.mockResolvedValue({})
    mocks.usageUpdateMany.mockResolvedValue({ count: 1 })
  })

  it('requeues a stale active turn and clears its partial draft', async () => {
    mocks.findMany.mockResolvedValue([buildTurn()])

    await expect(chatTurnService.recoverStaleTurns(now)).resolves.toBe(1)

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'QUEUED',
          runId: null,
          startedAt: null,
          finishedAt: null,
          failureReason: null
        })
      })
    )
    expect(mocks.messageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: ' ' })
      })
    )
  })

  it('interrupts a stale turn after recovery attempts are exhausted', async () => {
    mocks.findMany.mockResolvedValue([buildTurn(2)])

    await expect(chatTurnService.recoverStaleTurns(now)).resolves.toBe(1)

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'INTERRUPTED',
          runId: null,
          failureReason: 'Turn interrupted after recovery attempts were exhausted.'
        })
      })
    )
    expect(mocks.messageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: 'partial response',
          metadata: expect.objectContaining({
            isDraft: false,
            hiddenBecauseEmptyFailure: false
          })
        })
      })
    )
  })

  it('shows an explicit terminal message when exhausted without partial text', async () => {
    const turn = buildTurn(2)
    turn.messages[0].content = ' '
    mocks.findMany.mockResolvedValue([turn])

    await expect(chatTurnService.recoverStaleTurns(now, 'worker-new')).resolves.toBe(1)

    expect(mocks.messageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: expect.stringContaining("couldn't finish this response"),
          metadata: expect.objectContaining({ isDraft: false, hideUntilContent: false })
        })
      })
    )
    expect(mocks.eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          data: expect.objectContaining({
            previousRunId: 'app-worker:old-worker:turn-1:1',
            recoveryClaimant: 'worker-new',
            deploymentId: expect.any(String)
          })
        })
      })
    )
  })

  it('reports requeue and interruption telemetry to Sentry/console (CW-295)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    mocks.findMany.mockResolvedValue([buildTurn()])
    await chatTurnService.recoverStaleTurns(now)

    expect(warnSpy).toHaveBeenCalledWith(
      '[ChatTurn] Turn requeued after heartbeat timeout.',
      expect.objectContaining({ turnId: 'turn-1', recoveryReason: 'heartbeat_timeout' })
    )
    expect(mocks.captureMessage).not.toHaveBeenCalled()

    vi.clearAllMocks()
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        chatTurn: { updateMany: mocks.updateMany },
        chatMessage: { update: mocks.messageUpdate },
        chatTurnEvent: { create: mocks.eventCreate },
        llmUsage: { updateMany: mocks.usageUpdateMany }
      })
    )
    mocks.updateMany.mockResolvedValue({ count: 1 })
    mocks.messageUpdate.mockResolvedValue({})
    mocks.eventCreate.mockResolvedValue({})
    mocks.usageUpdateMany.mockResolvedValue({ count: 1 })
    mocks.findMany.mockResolvedValue([buildTurn(2)])

    await chatTurnService.recoverStaleTurns(now)

    expect(errorSpy).toHaveBeenCalledWith(
      '[ChatTurn] Turn interrupted after recovery attempts exhausted.',
      expect.objectContaining({ turnId: 'turn-1', recoveryReason: 'heartbeat_timeout' })
    )
    expect(mocks.captureMessage).toHaveBeenCalledWith(
      'ChatTurn heartbeat-timeout recovery exhausted',
      expect.objectContaining({
        level: 'warning',
        tags: { turnId: 'turn-1', recoveryReason: 'heartbeat_timeout' }
      })
    )

    errorSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('does not recover a turn whose heartbeat was concurrently refreshed', async () => {
    mocks.findMany.mockResolvedValue([buildTurn()])
    mocks.updateMany.mockResolvedValue({ count: 0 })

    await expect(chatTurnService.recoverStaleTurns(now)).resolves.toBe(0)

    expect(mocks.messageUpdate).not.toHaveBeenCalled()
    expect(mocks.eventCreate).not.toHaveBeenCalled()
  })

  it('does not replay a turn with an uncertain mutating tool execution', async () => {
    const turn = buildTurn()
    turn.toolExecutions = [{ status: 'STARTED', toolName: 'create_planned_workout' }]
    mocks.findMany.mockResolvedValue([turn])

    await expect(chatTurnService.recoverStaleTurns(now)).resolves.toBe(1)

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'INTERRUPTED',
          runId: null,
          failureReason:
            'Turn interrupted because a mutating tool may have completed during worker restart.'
        })
      })
    )
  })

  it('completes from a persisted successful mutation instead of replaying the turn', async () => {
    const turn = buildTurn()
    turn.messages[0].content = ' '
    turn.toolExecutions = [
      {
        status: 'COMPLETED',
        toolName: 'record_wellness_event',
        result: { message: 'Successfully logged fatigue event.' }
      }
    ]
    mocks.findMany.mockResolvedValue([turn])

    await expect(chatTurnService.recoverStaleTurns(now, 'worker-new')).resolves.toBe(1)

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMPLETED',
          runId: null,
          failureReason: null,
          metadata: expect.objectContaining({
            executionPhase: 'recovered_from_completed_mutation'
          })
        })
      })
    )
    expect(mocks.messageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: 'Successfully logged fatigue event.',
          metadata: expect.objectContaining({ turnStatus: 'COMPLETED', isDraft: false })
        })
      })
    )
  })

  it('heartbeats only the run that currently owns the turn', async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 })

    await expect(
      chatTurnService.heartbeat('turn-1', 'RUNNING' as any, 'run-current')
    ).resolves.toEqual({ count: 0 })

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: 'turn-1', runId: 'run-current' },
      data: { lastHeartbeatAt: expect.any(Date), status: 'RUNNING' }
    })
  })

  it('persists the current execution phase with an owned heartbeat', async () => {
    mocks.findUnique.mockResolvedValue({
      runId: 'run-current',
      metadata: { recoveryAttempts: 0 }
    })
    mocks.updateMany.mockResolvedValue({ count: 1 })

    await expect(
      chatTurnService.heartbeatWithTelemetry('turn-1', 'run-current', {
        executionPhase: 'tool_step',
        deploymentId: 'deploy-1'
      })
    ).resolves.toEqual({ count: 1 })

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: 'turn-1', runId: 'run-current' },
      data: {
        lastHeartbeatAt: expect.any(Date),
        metadata: {
          recoveryAttempts: 0,
          executionPhase: 'tool_step',
          deploymentId: 'deploy-1'
        }
      }
    })
  })

  it('does not write telemetry after ownership changes', async () => {
    mocks.findUnique.mockResolvedValue({ runId: 'run-new', metadata: {} })

    await expect(
      chatTurnService.heartbeatWithTelemetry('turn-1', 'run-old', {
        executionPhase: 'streaming'
      })
    ).resolves.toEqual({ count: 0 })

    expect(mocks.updateMany).not.toHaveBeenCalled()
  })
})
