import { describe, it, expect } from 'vitest'
import {
  buildWorkoutSummary,
  buildConciseWorkoutSummary,
  loadFlatFileMock,
  classifyGeminiError,
  GEMINI_MAX_RETRIES,
  GEMINI_CONNECT_TIMEOUT_MS,
  GEMINI_REQUEST_TIMEOUT_MS
} from '../../../../server/utils/gemini'

describe('Gemini Utility & Prompt Formatters', () => {
  it('formats workout summaries correctly in buildWorkoutSummary', () => {
    const mockWorkouts = [
      {
        id: 'w1',
        title: 'Tempo Ride',
        type: 'Ride',
        date: new Date('2026-03-10T10:00:00Z'),
        durationSec: 3600,
        tss: 65,
        averageHr: 145,
        maxHr: 168,
        averagePower: 210,
        maxPower: 350,
        distanceMeters: 40000
      }
    ]

    const summary = buildWorkoutSummary(mockWorkouts, 'UTC')

    expect(summary).toContain('Workout 1: Tempo Ride')
    expect(summary).toContain('- **Type**: Ride')
    expect(summary).toContain('- **Duration**: 60 minutes')
    expect(summary).toContain('- **TSS**: 65')
    expect(summary).toContain('- **Average HR**: 145 bpm')
    expect(summary).toContain('- **Distance**: 40.00 km')
  })

  it('formats workout distance in miles when the athlete prefers Miles', () => {
    const mockWorkouts = [
      {
        id: 'w2',
        title: 'Long Run',
        type: 'Run',
        date: new Date('2026-03-10T10:00:00Z'),
        durationSec: 3600,
        distanceMeters: 16093.44
      }
    ]

    const summary = buildWorkoutSummary(mockWorkouts, 'UTC', 'Miles')

    expect(summary).toContain('- **Distance**: 10.00 mi')
    expect(summary).not.toContain('km')
  })

  it('builds concise workout summaries for AI prompts', () => {
    const mockWorkouts = [
      {
        title: 'Interval Run',
        type: 'Run',
        date: new Date('2026-03-09T08:00:00Z'),
        durationSec: 2700,
        tss: 50
      }
    ]

    const concise = buildConciseWorkoutSummary(mockWorkouts, 'UTC')

    expect(concise).toContain('Run - Interval Run')
    expect(concise).toContain('45m')
    expect(concise).toContain('TSS: 50')
  })

  it('loads flat file mocks with fallback mechanism', () => {
    const mockData = loadFlatFileMock('unknown_operation_xyz')
    expect(mockData).toBeDefined()
  })
})

/**
 * CW-328. On 2026-08-02 a ~90 minute upstream incident produced 12
 * `ConnectTimeoutError`s across four background tasks, all funnelling through
 * `generateStructuredAnalysis`. Every failure was logged as `errorType: 'api_error'`
 * with an identical console line, so a transport outage was indistinguishable from a
 * bad schema or a safety block — which is why one incident was triaged as four
 * separate tickets (CW-329/330/331 were later closed as duplicates).
 *
 * These tests pin the classification. Against the pre-fix code every case below that
 * expects something other than `'api_error'` fails, because `'api_error'` was the only
 * value the old code could produce.
 */
describe('classifyGeminiError (CW-328)', () => {
  /** Build an error with a specific `name`, plus any extra own properties. */
  function err(name: string, message: string, extra: Record<string, any> = {}) {
    const e: any = new Error(message)
    e.name = name
    Object.assign(e, extra)
    return e
  }

  /**
   * The exact 2026-08-02 wrapping. This nesting is the whole reason the incident was
   * unreadable: the decisive error sits three levels down, so anything that inspects
   * only the outermost error sees `AI_RetryError` and learns nothing about the cause.
   */
  function buildIncidentError() {
    const connect = err('ConnectTimeoutError', 'Connect Timeout Error', {
      code: 'UND_ERR_CONNECT_TIMEOUT'
    })
    const apiCall = err('AI_APICallError', 'Cannot connect to API', {
      cause: connect,
      url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash'
    })
    return err('AI_RetryError', 'Failed after 4 attempts. Last error: Cannot connect to API', {
      lastError: apiCall,
      errors: [apiCall, apiCall, apiCall, apiCall]
    })
  }

  it('unwraps the 2026-08-02 incident error to connect_timeout', () => {
    const result = classifyGeminiError(buildIncidentError())

    expect(result.type).toBe('connect_timeout')
    expect(result.transient).toBe(true)
    // Surfacing the attempt count is what makes "we already retried 4 times" visible
    // in the log line instead of buried in the AI SDK's message.
    expect(result.attempts).toBe(4)
  })

  it('does not stop at the outermost error when classifying', () => {
    // Guards the actual regression: reading only `error.name` yields 'AI_RetryError',
    // which carries no cause information and would fall through to 'api_error'.
    const incident = buildIncidentError()
    expect(incident.name).toBe('AI_RetryError')
    expect(classifyGeminiError(incident).type).not.toBe('api_error')
  })

  const cases: Array<{
    label: string
    error: any
    expected: string
    transient: boolean
  }> = [
    {
      label: 'bare undici connect timeout',
      error: err('ConnectTimeoutError', 'Connect Timeout Error', {
        code: 'UND_ERR_CONNECT_TIMEOUT'
      }),
      expected: 'connect_timeout',
      transient: true
    },
    {
      label: 'AbortSignal.timeout firing (our own request budget)',
      error: err('TimeoutError', 'The operation was aborted due to timeout'),
      expected: 'timeout',
      transient: true
    },
    {
      label: 'undici headers timeout',
      error: err('HeadersTimeoutError', 'Headers Timeout Error', {
        code: 'UND_ERR_HEADERS_TIMEOUT'
      }),
      expected: 'timeout',
      transient: true
    },
    {
      label: 'DNS failure wrapped in fetch failed',
      error: err('TypeError', 'fetch failed', {
        cause: err('Error', 'getaddrinfo ENOTFOUND generativelanguage.googleapis.com', {
          code: 'ENOTFOUND'
        })
      }),
      expected: 'network',
      transient: true
    },
    {
      label: 'socket reset',
      error: err('Error', 'read ECONNRESET', { code: 'ECONNRESET' }),
      expected: 'network',
      transient: true
    },
    {
      label: 'model returned no object',
      error: err('AI_NoObjectGeneratedError', 'No object generated: response did not match schema'),
      expected: 'schema_validation',
      transient: false
    },
    {
      label: 'schema type validation failure',
      error: err('AI_TypeValidationError', 'Type validation failed at path .sections[0].status'),
      expected: 'schema_validation',
      transient: false
    },
    {
      label: 'malformed JSON from the model',
      error: err('AI_JSONParseError', 'JSON parsing failed: Unexpected end of JSON input'),
      expected: 'schema_validation',
      transient: false
    },
    {
      label: 'HTTP 429',
      error: err('AI_APICallError', 'Too Many Requests', { statusCode: 429 }),
      expected: 'rate_limit',
      transient: true
    },
    {
      label: 'quota message with no status code',
      error: err('Error', 'You exceeded your current quota, please check your plan'),
      expected: 'rate_limit',
      transient: true
    },
    {
      label: 'HTTP 403',
      error: err('AI_APICallError', 'Forbidden', { statusCode: 403 }),
      expected: 'auth',
      transient: false
    },
    {
      label: 'missing API key',
      error: err('AI_LoadAPIKeyError', 'Google Generative AI API key is missing'),
      expected: 'auth',
      transient: false
    },
    {
      label: 'upstream 503',
      error: err('AI_APICallError', 'Service Unavailable', { statusCode: 503 }),
      expected: 'server_error',
      transient: true
    },
    {
      label: 'the bare Gemini 400',
      error: err('AI_APICallError', 'Request contains an invalid argument.', { statusCode: 400 }),
      expected: 'invalid_request',
      transient: false
    },
    {
      label: 'safety block reported as a generation failure',
      error: err('AI_NoObjectGeneratedError', 'Response was blocked by safety filters'),
      expected: 'content_filter',
      transient: false
    },
    {
      label: 'unrecognised failure',
      error: err('Error', 'something odd happened'),
      expected: 'api_error',
      transient: false
    }
  ]

  it.each(cases)('classifies $label as $expected', ({ error, expected, transient }) => {
    const result = classifyGeminiError(error)
    expect(result.type).toBe(expected)
    expect(result.transient).toBe(transient)
  })

  it('treats exactly the upstream/infrastructure classes as transient', () => {
    // `transient` is what a future caller would branch on to decide "worth waiting out".
    // Getting this set wrong is how a permanent schema bug becomes an infinite retry.
    const transientTypes = cases
      .concat([{ label: 'incident', error: buildIncidentError(), expected: '', transient: true }])
      .filter((c) => classifyGeminiError(c.error).transient)
      .map((c) => classifyGeminiError(c.error).type)

    expect(new Set(transientTypes)).toEqual(
      new Set(['connect_timeout', 'timeout', 'network', 'rate_limit', 'server_error'])
    )
  })

  it('reports the HTTP status when the call reached the API', () => {
    expect(
      classifyGeminiError(err('AI_APICallError', 'nope', { statusCode: 429 })).statusCode
    ).toBe(429)
    // A transport failure never reached the API, so there is no status to report.
    expect(classifyGeminiError(buildIncidentError()).statusCode).toBeUndefined()
  })

  it('lets structured signals win over message text', () => {
    // A 429 whose message happens to mention a timeout must not be classified as one:
    // rate limiting and a dead network want completely different responses.
    const ambiguous = err('AI_APICallError', 'Rate limit exceeded after request timeout', {
      statusCode: 429
    })
    expect(classifyGeminiError(ambiguous).type).toBe('rate_limit')
  })

  it('survives malformed, cyclic and empty inputs', () => {
    expect(classifyGeminiError(null).type).toBe('api_error')
    expect(classifyGeminiError(undefined).type).toBe('api_error')
    expect(classifyGeminiError('a string').type).toBe('api_error')

    // A self-referential cause must terminate rather than hang the worker.
    const cyclic: any = err('Error', 'loop')
    cyclic.cause = cyclic
    expect(classifyGeminiError(cyclic).type).toBe('api_error')
  })
})

describe('Gemini call policy (CW-328)', () => {
  async function readGeminiSource(): Promise<string> {
    const fs = await import('node:fs')
    return fs.readFileSync(new URL('../../../../server/utils/gemini.ts', import.meta.url), 'utf-8')
  }

  it('keeps the request budget below the standard Trigger.dev maxDuration', () => {
    // 300s is the maxDuration most tasks declare. Timing out first is what produces a
    // classified error and an LlmUsage row instead of the platform killing the run.
    expect(GEMINI_REQUEST_TIMEOUT_MS).toBeLessThan(300_000)
    expect(GEMINI_CONNECT_TIMEOUT_MS).toBeLessThan(GEMINI_REQUEST_TIMEOUT_MS)
    expect(GEMINI_MAX_RETRIES).toBeGreaterThan(0)
  })

  /**
   * The latent bug this ticket uncovered, and the more serious half of it.
   *
   * `generateObject` is typed `Omit<RequestOptions, 'timeout'>` — unlike `generateText`
   * it accepts no `timeout` option at all. The previous
   * `...(timeoutMs ? { timeout: { totalMs } } : {})` compiled only because a conditional
   * spread skips excess-property checking, and was discarded at runtime, so every caller
   * passing `timeoutMs` (45s, 60s and 20s budgets) was in fact unbounded.
   *
   * `tsc` now catches a plainly-written `timeout:` property, but NOT one hidden inside a
   * conditional spread — which is exactly how the original slipped in. Hence a source
   * assertion, matching the approach already used in workout-analysis-prompt.test.ts.
   */
  /** The `generateObject({ ... })` call, with `//` comments stripped so prose about the
   *  discarded `timeout` option cannot satisfy or defeat an assertion about the code. */
  async function readGenerateObjectCall(): Promise<string> {
    const source = await readGeminiSource()
    const call = source.match(/await generateObject\(\{[\s\S]*?\n {4}\}\)/)
    expect(call).not.toBeNull()
    return call![0].replace(/^\s*\/\/.*$/gm, '')
  }

  it('bounds generateObject with abortSignal, never the timeout option it discards', async () => {
    const call = await readGenerateObjectCall()

    expect(call).toContain('abortSignal')
    expect(call).not.toMatch(/\btimeout\s*:/)
  })

  it('applies the deliberate defaults rather than inline literals', async () => {
    const call = await readGenerateObjectCall()

    expect(call).toContain('GEMINI_MAX_RETRIES')
    expect(call).toContain('GEMINI_REQUEST_TIMEOUT_MS')
  })
})
