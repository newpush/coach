import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * CW-294: the Telegram webhook built its prompt from stored chat history without the
 * `sanitizeCoreMessagesForToolApprovals` guard the main chat turn executor applies. No
 * DB-derived history shape reaches `generateText` with a `tool-approval-response` part
 * today, so this is parity hardening rather than a fix for a reproducible crash — these
 * tests pin the guard's presence and its no-op behaviour on valid history.
 */

vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('createError', (err: any) => {
  const error = new Error(err.message || err.statusMessage)
  ;(error as any).statusCode = err.statusCode
  return error
})
vi.stubGlobal('readBody', async (event: any) => event.body)
vi.stubGlobal('getHeader', (event: any, name: string) => event.headers?.[name])

const generateTextMock = vi.fn()
const integrationFindFirst = vi.fn()
const chatRoomFindFirst = vi.fn()
const chatRoomCreate = vi.fn()
const chatMessageFindMany = vi.fn()
const webhookLogCreate = vi.fn()
const prepareAI = vi.fn()
const saveUserMessage = vi.fn()
const saveAiMessage = vi.fn()
const logLlmUsage = vi.fn()
const sendTelegramMessage = vi.fn()
const sendTelegramAction = vi.fn()

/**
 * Records every `sanitizeCoreMessagesForToolApprovals` call the handler makes, with the real
 * implementation still doing the work. Reverting the handler change leaves this spy uncalled,
 * which is what keeps the assertions below honest.
 */
const sanitizeSpy = vi.fn()

/**
 * `transformHistoryToCoreMessages` is shared with the main chat path; overriding it per test
 * pins the contract this ticket is about — whatever model messages the transform produces,
 * the webhook must sanitize them before the prompt is built.
 */
let transformOverride: ((history: any[]) => any[] | Promise<any[]>) | null = null

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    generateText: (...args: any[]) => generateTextMock(...args)
  }
})

vi.mock('../../../../server/utils/ai-history', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    transformHistoryToCoreMessages: async (history: any[]) =>
      transformOverride
        ? transformOverride(history)
        : actual.transformHistoryToCoreMessages(history)
  }
})

vi.mock('../../../../server/api/chat/sanitize-tool-approval', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    sanitizeCoreMessagesForToolApprovals: (messages: any[]) => {
      const output = actual.sanitizeCoreMessagesForToolApprovals(messages)
      sanitizeSpy({ input: messages, output })
      return output
    }
  }
})

vi.mock('../../../../server/utils/db', () => ({
  prisma: {
    integration: { findFirst: integrationFindFirst },
    chatRoom: { findFirst: chatRoomFindFirst, create: chatRoomCreate },
    chatMessage: { findMany: chatMessageFindMany },
    webhookLog: { create: webhookLogCreate }
  }
}))

vi.mock('../../../../server/utils/services/chatService', () => ({
  chatService: {
    prepareAI,
    saveUserMessage,
    saveAiMessage,
    logLlmUsage
  }
}))

vi.mock('../../../../server/utils/telegram', () => ({
  sendTelegramMessage,
  sendTelegramAction
}))

const NOW = new Date('2026-07-27T07:00:00Z')

function telegramEvent(text = 'log my oats') {
  return {
    headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
    body: {
      message: {
        text,
        chat: { id: 12345 }
      }
    }
  } as any
}

async function runWebhook(event = telegramEvent()) {
  const mod = await import('../../../../server/api/integrations/telegram/webhook.post')
  return mod.default(event)
}

function messagesSentToModel() {
  expect(generateTextMock).toHaveBeenCalled()
  return generateTextMock.mock.calls[0][0].messages as any[]
}

function collectParts(messages: any[]) {
  return messages.flatMap((message: any) =>
    Array.isArray(message.content)
      ? message.content.map((part: any) => ({ role: message.role, part }))
      : []
  )
}

describe('POST /api/integrations/telegram/webhook tool-approval sanitization (CW-294)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    transformOverride = null
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret'

    integrationFindFirst.mockResolvedValue({ userId: 'user-1', provider: 'telegram' })
    chatRoomFindFirst.mockResolvedValue({
      id: 'room-1',
      createdAt: NOW,
      messages: [{ createdAt: new Date() }]
    })
    chatMessageFindMany.mockResolvedValue([])
    webhookLogCreate.mockResolvedValue({})
    saveUserMessage.mockResolvedValue({ id: 'msg-user' })
    saveAiMessage.mockResolvedValue({ id: 'msg-ai' })
    logLlmUsage.mockResolvedValue(undefined)
    sendTelegramMessage.mockResolvedValue(undefined)
    sendTelegramAction.mockResolvedValue(undefined)
    prepareAI.mockResolvedValue({
      google: (modelName: string) => ({ modelId: modelName }),
      modelName: 'gemini-flash',
      tools: {},
      systemInstruction: 'You are Coach Watts.'
    })
    generateTextMock.mockResolvedValue({
      text: 'Logged your oats.',
      toolCalls: [],
      toolResults: [],
      usage: { inputTokens: 10, outputTokens: 5 },
      response: { messages: [] }
    })
  })

  it('strips malformed tool-approval-response parts before the prompt reaches generateText', async () => {
    transformOverride = () => [
      { role: 'user', content: [{ type: 'text', text: 'log my oats' }] },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Logging that now.' },
          // Only tool-role messages may carry approval responses; anywhere else this
          // crashes standardizePrompt.
          { type: 'tool-approval-response', toolCallId: 'call_1', approved: true }
        ]
      },
      {
        role: 'assistant',
        content: [{ type: 'tool-approval-response', approved: 'yes' }]
      }
    ]

    const result = await runWebhook()

    expect(result).toEqual({ status: 'processed' })

    const messages = messagesSentToModel()
    const approvalParts = collectParts(messages).filter(
      ({ part }) => part.type === 'tool-approval-response'
    )

    expect(approvalParts).toEqual([])
    expect(messages[1].content).toEqual([{ type: 'text', text: 'Logging that now.' }])
    // An assistant message emptied by sanitization must still carry content
    expect(messages[2].content).toEqual([{ type: 'text', text: ' ' }])
    expect(webhookLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSED' }) })
    )
  })

  it('runs the transformed history through the sanitizer, repairing recoverable tool-role responses', async () => {
    transformOverride = () => [
      {
        role: 'tool',
        content: [
          // Repairable: toolCallId stands in for approvalId, stringy `approved` is coerced
          { type: 'tool-approval-response', toolCallId: 'call_1', approved: 'true' },
          // Irreparable: no id at all
          { type: 'tool-approval-response', approved: true }
        ]
      },
      { role: 'user', content: [{ type: 'text', text: 'and my sleep?' }] }
    ]

    await runWebhook()

    // Asserted at the sanitizer boundary inside the handler, not on the messages that reach
    // generateText: normalizeCoreMessagesForGemini keeps only `tool-result` parts in tool
    // messages, so a post-normalization assertion about approval parts would be vacuously
    // true whether or not the handler sanitizes anything.
    expect(sanitizeSpy).toHaveBeenCalledTimes(1)
    const { input, output } = sanitizeSpy.mock.calls[0][0]

    // The handler hands the sanitizer the transform output, unmodified
    expect(input[0].content).toHaveLength(2)

    // Recoverable response repaired (approvalId filled in, `approved` coerced to boolean),
    // irreparable one dropped — the turn itself survives.
    expect(output[0].content).toEqual([
      {
        type: 'tool-approval-response',
        approvalId: 'call_1',
        toolCallId: 'call_1',
        approved: true
      }
    ])
    expect(output[1]).toEqual({ role: 'user', content: [{ type: 'text', text: 'and my sleep?' }] })

    // ...and the sanitized array is what the prompt is built from
    expect(messagesSentToModel().at(-1)).toEqual({ role: 'user', content: 'and my sleep?' })
  })

  it('leaves valid tool-call history untouched on the Telegram path', async () => {
    chatMessageFindMany.mockResolvedValue(
      [
        {
          id: 'm1',
          senderId: 'user-1',
          content: 'how did I train?',
          files: [],
          metadata: {},
          createdAt: NOW
        },
        {
          id: 'm2',
          senderId: 'ai_agent',
          content: 'Here you go',
          files: [],
          createdAt: NOW,
          metadata: {
            toolCalls: [
              {
                toolCallId: 'call_1',
                name: 'get_recent_workouts',
                args: { days: 7 },
                response: { workouts: [{ type: 'Ride' }] }
              }
            ]
          }
        },
        {
          id: 'm3',
          senderId: 'system_tool',
          content: '',
          files: [],
          createdAt: NOW,
          metadata: {
            toolResponse: [
              {
                type: 'tool-result',
                toolCallId: 'call_1',
                toolName: 'get_recent_workouts',
                result: { workouts: [{ type: 'Ride' }] }
              }
            ]
          }
        },
        {
          id: 'm4',
          senderId: 'user-1',
          content: 'and my sleep?',
          files: [],
          metadata: {},
          createdAt: NOW
        }
        // findMany orders newest-first; the handler reverses it back to chronological order
      ].reverse()
    )

    await runWebhook(telegramEvent('and my sleep?'))

    const messages = messagesSentToModel()

    expect(messages.map((message: any) => message.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'user'
    ])

    const toolCalls = messages[1].content.filter((part: any) => part.type === 'tool-call')
    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0]).toMatchObject({
      toolCallId: 'call_1',
      toolName: 'get_recent_workouts',
      input: { days: 7 }
    })

    expect(messages[2].content).toEqual([
      {
        type: 'tool-result',
        toolCallId: 'call_1',
        toolName: 'get_recent_workouts',
        output: { type: 'json', value: { workouts: [{ type: 'Ride' }] } }
      }
    ])
    expect(sendTelegramMessage).toHaveBeenCalledWith('12345', 'Logged your oats.')

    // The guard ran and was a strict no-op on this history — a sanitizer that eats valid
    // tool-call history would be worse than the gap it closes.
    expect(sanitizeSpy).toHaveBeenCalledTimes(1)
    const { input, output } = sanitizeSpy.mock.calls[0][0]
    expect(output).toEqual(input)
  })
})
