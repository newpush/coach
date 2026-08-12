import fs from 'node:fs'
import path from 'node:path'
import { prisma } from './db'
import { formatUserDate, formatDateUTC } from './date'
import { generateText, generateObject, jsonSchema } from 'ai'
import { createGoogle } from '@ai-sdk/google'
import {
  getMoodLabel,
  getStressLabel,
  getFatigueLabel,
  getSorenessLabel,
  getMotivationLabel,
  getHydrationLabel,
  getInjuryLabel,
  normalizeStressScore
} from './wellness'
import { formatPromptDistance } from './ai-prompt-format'
import { metresPerSecondToKmh } from '../../shared/units'

import type { GeminiModel } from './ai-config'
import { MODEL_NAMES, calculateLlmCost, resolveModelId } from './ai-config'
import { getLlmOperationSettings } from './ai-operation-settings'
import { buildWorkoutAnalysisFactsV2 } from './workout-analysis-facts'

const google = createGoogle({
  apiKey: process.env.GEMINI_API_KEY
})

/**
 * Log LLM usage to database for cost tracking and analysis
 */
async function logLlmUsage(params: {
  userId?: string
  model: string
  modelType: GeminiModel
  operation: string
  entityType?: string
  entityId?: string
  promptTokens?: number
  completionTokens?: number
  cachedTokens?: number
  reasoningTokens?: number
  totalTokens?: number
  estimatedCost?: number
  durationMs: number
  retryCount: number
  success: boolean
  errorType?: string
  errorMessage?: string
  promptPreview?: string
  responsePreview?: string
  promptFull?: string
  responseFull?: string
  counted?: boolean
}): Promise<string | undefined> {
  try {
    const usage = await prisma.llmUsage.create({
      data: {
        userId: params.userId,
        provider: 'gemini',
        model: params.model,
        modelType: params.modelType,
        operation: params.operation,
        entityType: params.entityType,
        entityId: params.entityId,
        promptTokens: params.promptTokens,
        completionTokens: params.completionTokens,
        cachedTokens: params.cachedTokens || 0,
        reasoningTokens: params.reasoningTokens || 0,
        totalTokens: params.totalTokens,
        estimatedCost: params.estimatedCost,
        durationMs: params.durationMs,
        retryCount: params.retryCount,
        success: params.success,
        errorType: params.errorType,
        errorMessage: params.errorMessage,
        promptPreview: params.promptPreview,
        responsePreview: params.responsePreview,
        promptFull: params.promptFull,
        responseFull: params.responseFull,
        counted: params.counted ?? true
      }
    })
    return usage.id
  } catch (error) {
    // Don't let logging errors break the main flow
    console.error('[Gemini] Failed to log LLM usage:', error)
    return undefined
  }
}

/**
 * Extract preview text (first 500 chars) for debugging
 */
function getPreview(text: string, maxLength: number = 500): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

type AiSdkUsage = {
  inputTokens?: number
  outputTokens?: number
  inputTokenDetails?: { cacheReadTokens?: number }
  outputTokenDetails?: { reasoningTokens?: number }
}

function normalizeAiSdkUsage(usage?: AiSdkUsage) {
  return {
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    cachedTokens: usage?.inputTokenDetails?.cacheReadTokens ?? 0,
    reasoningTokens: usage?.outputTokenDetails?.reasoningTokens ?? 0
  }
}

/* -------------------------------------------------------------------------- *
 * Deliberate Gemini call policy (CW-328)
 *
 * On 2026-08-02 a ~90 minute upstream incident produced 12 `ConnectTimeoutError`s
 * against generativelanguage.googleapis.com:443 across four background tasks, all
 * funnelling through `generateStructuredAnalysis`. The values below are *chosen*,
 * not inherited from a library default. Change them deliberately.
 *
 * Note on where retries live. There are already two retry layers around every
 * call in this file:
 *   1. the AI SDK's in-process retry (`maxRetries` below), and
 *   2. Trigger.dev's task-level retry (`trigger.config.ts`: maxAttempts 3,
 *      backoff 1s -> 10s), which re-runs the whole task.
 * This module deliberately does NOT add a third. `generateStructuredAnalysis` is
 * shared by ~45 call sites including synchronous HTTP handlers, so a deferral or
 * long backoff here would hang user-facing requests; and stacking retry layers
 * multiplies load against an already-degraded upstream. Riding out a multi-minute
 * outage is the task scheduler's job, not this function's.
 * -------------------------------------------------------------------------- */

/**
 * In-process attempts per call = 1 + GEMINI_MAX_RETRIES.
 *
 * Kept at 3 (4 attempts). The AI SDK applies this uniformly to every error class,
 * and the classes it actually rescues are 429/quota and transient 5xx, where a
 * short in-process retry is much cheaper than rebuilding the prompt and re-running
 * the whole task. Lowering it to reclaim the ~40s burned during a connect-timeout
 * outage would trade a frequent win for a rare one.
 */
export const GEMINI_MAX_RETRIES = 3

/**
 * Connect (TCP+TLS establishment) timeout, in ms.
 *
 * 10s — undici's default, deliberately retained. Failing to establish a connection
 * to Google within 10s means the network path is down rather than slow: raising it
 * would burn proportionally more worker time before the identical failure, and
 * lowering it risks false negatives on cold or marginal egress.
 *
 * IMPORTANT: this constant is currently documentation, not enforcement. Pinning the
 * connect timeout requires passing an undici `Agent` dispatcher to a custom `fetch`,
 * and undici is not a dependency of this project (not even transitively). It is
 * recorded here so the value is a stated intent rather than an accident, and so the
 * next incident starts from a number someone chose.
 */
export const GEMINI_CONNECT_TIMEOUT_MS = 10_000

/**
 * Overall per-call timeout, in ms.
 *
 * 240s. Previously there was effectively NO bound at all on `generateObject`:
 * `trackingContext.timeoutMs` was opt-in, none of the four tasks in the incident
 * passed it, and — see the comment at the `generateObject` call — the option it fed
 * was silently inert, so even the callers that did pass a budget ran unbounded. A
 * hung socket was therefore limited only by Trigger.dev's `maxDuration` (300s for
 * most tasks), which kills the run with no classified error and no usage row.
 *
 * 240s sits deliberately *below* that 300s platform budget so we time out first and
 * fail with a logged, classified `timeout`, and comfortably above both the slowest
 * legitimate generation (Pro + high thinking on a large prompt) and the explicit
 * per-call budgets callers already set (20s–60s elsewhere in the codebase). It
 * exists to bound a stuck connection, not to pace the model. Callers needing a
 * tighter or looser bound still pass `timeoutMs`.
 */
export const GEMINI_REQUEST_TIMEOUT_MS = 240_000

/**
 * Failure classes for a Gemini call.
 *
 * The point of this union is triage: a transport failure and a bad model response
 * are different incidents with different owners, and before CW-328 both were logged
 * as `api_error` with an identical `console.error` line. That is the mechanical
 * reason one upstream blip produced four separate tickets.
 *
 * `transient` classes are upstream/infrastructure and are expected to clear on their
 * own; the rest indicate our prompt, our schema, or the model's output and will not
 * improve by retrying.
 */
export type GeminiErrorType =
  /** TCP+TLS to the API never established (undici UND_ERR_CONNECT_TIMEOUT). Transient. */
  | 'connect_timeout'
  /** Connection established but the call exceeded its time budget, or was aborted. Transient. */
  | 'timeout'
  /** DNS / socket / reset / `fetch failed`. Transient. */
  | 'network'
  /** 429 or quota exhaustion. Transient. */
  | 'rate_limit'
  /** Upstream 5xx. Transient. */
  | 'server_error'
  /** 401/403, missing or rejected API key. Not transient — a config problem. */
  | 'auth'
  /** 400: the request itself is malformed (prompt or schema). Not transient. */
  | 'invalid_request'
  /** Model returned no object, or output that failed schema/JSON validation. Not transient. */
  | 'schema_validation'
  /** Blocked by safety filters, recitation, or another content policy. Not transient. */
  | 'content_filter'
  /** Nothing matched — inspect `errorMessage`, and consider adding a class. */
  | 'api_error'

export interface GeminiErrorClassification {
  type: GeminiErrorType
  /** Upstream/infrastructure fault expected to clear on its own. */
  transient: boolean
  /** HTTP status, when the call actually reached the API. */
  statusCode?: number
  /** In-process attempts the AI SDK made before giving up, when it reports them. */
  attempts?: number
  /** Low-cardinality summary safe to put in a log prefix or a Sentry tag. */
  detail: string
}

const TRANSIENT_GEMINI_ERROR_TYPES: ReadonlySet<GeminiErrorType> = new Set<GeminiErrorType>([
  'connect_timeout',
  'timeout',
  'network',
  'rate_limit',
  'server_error'
])

/**
 * Flatten an error's cause chain.
 *
 * The decisive error is usually buried: the AI SDK throws `AI_RetryError`, which
 * holds the final `APICallError` in `lastError`, which in turn wraps undici's
 * `ConnectTimeoutError` in `cause`. Classifying only the outermost error is exactly
 * how a connect timeout ends up indistinguishable from a schema failure.
 */
function collectErrorChain(error: unknown, maxDepth = 10): any[] {
  const chain: any[] = []
  let current: any = error

  while (current && typeof current === 'object' && chain.length < maxDepth) {
    chain.push(current)
    const next = current.lastError ?? current.cause
    if (!next || typeof next !== 'object' || chain.includes(next)) break
    current = next
  }

  return chain
}

/**
 * Classify a Gemini/AI SDK failure into a stable, queryable bucket.
 *
 * Matching is duck-typed on `name`/`code`/`statusCode` rather than `instanceof` so it
 * survives bundling (Trigger.dev, Nitro) duplicating the AI SDK's error classes.
 */
export function classifyGeminiError(error: unknown): GeminiErrorClassification {
  const chain = collectErrorChain(error)

  const names = new Set(chain.map((e) => String(e?.name ?? '')))
  const codes = new Set(chain.map((e) => String(e?.code ?? '')))
  const messages = chain.map((e) => String(e?.message ?? '')).join(' | ')
  const haystack = messages.toLowerCase()

  const statusCode = chain.find((e) => typeof e?.statusCode === 'number')?.statusCode as
    number | undefined

  // AI SDK RetryError exposes every attempt it made; fall back to parsing its message.
  const attemptsFromErrors = chain.find((e) => Array.isArray(e?.errors))?.errors?.length
  const attemptsFromMessage = messages.match(/after (\d+) attempts?/i)?.[1]
  const attempts =
    attemptsFromErrors ?? (attemptsFromMessage ? Number(attemptsFromMessage) : undefined)

  const has = (...needles: string[]) => needles.some((n) => haystack.includes(n))

  const build = (type: GeminiErrorType, detail: string): GeminiErrorClassification => ({
    type,
    transient: TRANSIENT_GEMINI_ERROR_TYPES.has(type),
    statusCode,
    attempts,
    detail
  })

  const looksLikeContentFilter = () =>
    has('safety', 'prohibited_content', 'recitation', 'content policy', 'blocked by')

  /* --- Pass 1: structured signals (error codes, class names, HTTP status).
     These are unambiguous, so they win over any message text. --- */

  // Transport. These never reached the model.
  if (codes.has('UND_ERR_CONNECT_TIMEOUT') || names.has('ConnectTimeoutError')) {
    return build('connect_timeout', `could not connect within ${GEMINI_CONNECT_TIMEOUT_MS}ms`)
  }

  if (
    codes.has('UND_ERR_HEADERS_TIMEOUT') ||
    codes.has('UND_ERR_BODY_TIMEOUT') ||
    codes.has('ETIMEDOUT') ||
    names.has('TimeoutError') ||
    names.has('AbortError')
  ) {
    return build('timeout', 'call exceeded its time budget')
  }

  if (
    codes.has('ENOTFOUND') ||
    codes.has('EAI_AGAIN') ||
    codes.has('ECONNREFUSED') ||
    codes.has('ECONNRESET') ||
    codes.has('EPIPE') ||
    codes.has('EHOSTUNREACH') ||
    codes.has('ENETUNREACH') ||
    codes.has('UND_ERR_SOCKET')
  ) {
    return build('network', 'network failure reaching the API')
  }

  // Model output problems. These carry no HTTP status, so they cannot collide below.
  if (
    names.has('AI_NoObjectGeneratedError') ||
    names.has('NoObjectGeneratedError') ||
    names.has('AI_TypeValidationError') ||
    names.has('TypeValidationError') ||
    names.has('AI_JSONParseError') ||
    names.has('JSONParseError')
  ) {
    return looksLikeContentFilter()
      ? build('content_filter', 'response withheld by a content filter')
      : build('schema_validation', 'model output did not satisfy the schema')
  }

  if (names.has('AI_LoadAPIKeyError') || names.has('LoadAPIKeyError')) {
    return build('auth', 'credentials rejected or missing')
  }

  // HTTP status.
  if (statusCode === 429) return build('rate_limit', 'rate limited or out of quota')
  if (statusCode === 401 || statusCode === 403) {
    return build('auth', 'credentials rejected or missing')
  }
  if (typeof statusCode === 'number' && statusCode >= 500) {
    return build('server_error', `upstream returned ${statusCode}`)
  }
  if (statusCode === 400) {
    return looksLikeContentFilter()
      ? build('content_filter', 'response withheld by a content filter')
      : build('invalid_request', 'request rejected as malformed')
  }

  /* --- Pass 2: message heuristics, only once no structured signal survived the
     wrapping. Ordered most- to least-distinctive. --- */

  if (has('quota', 'rate limit', 'resource_exhausted', 'too many requests')) {
    return build('rate_limit', 'rate limited or out of quota')
  }
  if (has('api key', 'permission denied', 'unauthenticated')) {
    return build('auth', 'credentials rejected or missing')
  }
  if (looksLikeContentFilter()) {
    return build('content_filter', 'response withheld by a content filter')
  }
  if (has('connect timeout')) {
    return build('connect_timeout', `could not connect within ${GEMINI_CONNECT_TIMEOUT_MS}ms`)
  }
  if (has('timed out', 'timeout', 'aborted')) {
    return build('timeout', 'call exceeded its time budget')
  }
  if (has('fetch failed', 'socket hang up', 'network error')) {
    return build('network', 'network failure reaching the API')
  }
  if (has('invalid argument', 'invalid_argument')) {
    return build('invalid_request', 'request rejected as malformed')
  }

  return build('api_error', 'unclassified failure')
}

/**
 * Emit a triage-shaped log line and tag the error for Sentry.
 *
 * The `[Gemini][<type>]` prefix is stable and low-cardinality, so a connect timeout
 * and a schema failure land in different Sentry groups and are greppable apart in
 * Trigger.dev logs — which is the whole point of CW-328.
 *
 * The original error is rethrown unchanged by callers: ~45 call sites already catch
 * these, so this deliberately does not wrap or re-type the error, only annotate it.
 */
function reportGeminiFailure(params: {
  fn: string
  error: any
  operation?: string
  modelId: string
  durationMs: number
}): GeminiErrorClassification {
  const classification = classifyGeminiError(params.error)

  const fields = [
    `operation=${params.operation ?? 'unknown'}`,
    `model=${params.modelId}`,
    `transient=${classification.transient}`,
    classification.statusCode !== undefined ? `status=${classification.statusCode}` : undefined,
    classification.attempts !== undefined ? `attempts=${classification.attempts}` : undefined,
    `durationMs=${params.durationMs}`
  ]
    .filter(Boolean)
    .join(' ')

  console.error(
    `[Gemini][${classification.type}] ${params.fn} failed — ${classification.detail} (${fields})`,
    params.error
  )

  // Surface the classification as error properties so Sentry captures it as context
  // without this module taking a dependency on a Sentry SDK (it runs in both the
  // Nitro server and the Trigger.dev worker bundles).
  try {
    Object.assign(params.error, {
      geminiErrorType: classification.type,
      geminiErrorTransient: classification.transient,
      geminiOperation: params.operation
    })
  } catch {
    // Error object frozen or a primitive — classification still reached logs and LlmUsage.
  }

  return classification
}

/**
 * Internal helper to log usage from Vercel AI SDK events
 */
async function logUsage(params: {
  userId?: string
  modelId: string
  modelType: GeminiModel
  operation: string
  entityType?: string
  entityId?: string
  prompt: string
  text?: string
  usage: {
    inputTokens: number
    outputTokens: number
    cachedTokens?: number
    reasoningTokens?: number
  }
  success: boolean
  error?: any
  /** Pre-computed classification from `reportGeminiFailure`; derived from `error` if omitted. */
  errorType?: GeminiErrorType
  durationMs?: number
  counted?: boolean
}) {
  const durationMs = params.durationMs || 0
  const usage = params.usage ?? {
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    reasoningTokens: 0
  }
  const reasoningTokens = usage.reasoningTokens ?? 0
  const estimatedCost = calculateLlmCost(
    params.modelId,
    params.usage.inputTokens,
    params.usage.outputTokens + reasoningTokens,
    params.usage.cachedTokens || 0
  )

  await logLlmUsage({
    userId: params.userId,
    model: params.modelId,
    modelType: params.modelType,
    operation: params.operation,
    entityType: params.entityType,
    entityId: params.entityId,
    promptTokens: params.usage.inputTokens,
    completionTokens: params.usage.outputTokens,
    cachedTokens: params.usage.cachedTokens || 0,
    reasoningTokens,
    totalTokens: params.usage.inputTokens + params.usage.outputTokens + reasoningTokens,
    estimatedCost,
    durationMs,
    retryCount: 0,
    success: params.success,
    // CW-328: previously hardcoded to 'api_error', which made every failure — connect
    // timeout, bad schema, rate limit — indistinguishable in LlmUsage.
    errorType: params.error
      ? (params.errorType ?? classifyGeminiError(params.error).type)
      : undefined,
    errorMessage: params.error?.message,
    promptPreview: getPreview(params.prompt),
    responsePreview: params.text ? getPreview(params.text) : undefined,
    promptFull: params.prompt,
    responseFull: params.text,
    counted: params.counted
  })
}

// Retry configuration
const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000 // 1 second base delay
const MAX_DELAY_MS = 60000 // 60 seconds max delay

/**
 * Sleep for a given duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Parse retry delay from Google API error response
 */
function parseRetryDelay(error: any): number | null {
  try {
    // Check if error message contains RetryInfo
    const errorString = error.message || JSON.stringify(error)
    const retryInfoMatch = errorString.match(/"retryDelay":"(\d+)s"/)
    if (retryInfoMatch && retryInfoMatch[1]) {
      return parseInt(retryInfoMatch[1], 10) * 1000 // Convert seconds to milliseconds
    }
  } catch (e) {
    // If parsing fails, return null
  }
  return null
}

/**
 * Check if error is a rate limit error (429)
 */
function isRateLimitError(error: any): boolean {
  const errorString = error.message || JSON.stringify(error)
  return (
    errorString.includes('[429') ||
    errorString.includes('quota') ||
    errorString.includes('rate limit')
  )
}

/**
 * Wrapper function that retries API calls with exponential backoff and tracks usage
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  context: string = 'API call',
  trackingParams?: {
    userId?: string
    model: string
    modelType: GeminiModel
    operation: string
    entityType?: string
    entityId?: string
    prompt: string
    onUsageLogged?: (usageId: string) => void | Promise<void>
  }
): Promise<T> {
  let lastError: any
  const startTime = Date.now()
  let retryCount = 0
  let result: T | undefined

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      result = await fn()

      // Log successful usage if tracking is enabled
      if (trackingParams && result) {
        const durationMs = Date.now() - startTime

        // Extract token usage from response if available
        let promptTokens: number | undefined
        let completionTokens: number | undefined
        let cachedTokens: number | undefined
        let reasoningTokens: number | undefined
        let totalTokens: number | undefined
        let responseText: string = ''

        // Try to extract usage metadata from the result
        if (typeof result === 'object' && result !== null) {
          const anyResult = result as any

          // For generateContent responses - check response.usageMetadata
          if (anyResult.response?.usageMetadata) {
            promptTokens = anyResult.response.usageMetadata.promptTokenCount
            completionTokens = anyResult.response.usageMetadata.candidatesTokenCount
            totalTokens = anyResult.response.usageMetadata.totalTokenCount
            cachedTokens = anyResult.response.usageMetadata.cachedContentTokenCount
            reasoningTokens = anyResult.response.usageMetadata.thoughtsTokenCount
          }
          // Direct usageMetadata (for some response types)
          else if (anyResult.usageMetadata) {
            promptTokens = anyResult.usageMetadata.promptTokenCount
            completionTokens = anyResult.usageMetadata.candidatesTokenCount
            totalTokens = anyResult.usageMetadata.totalTokenCount
            cachedTokens = anyResult.usageMetadata.cachedContentTokenCount
            reasoningTokens = anyResult.usageMetadata.thoughtsTokenCount
          }

          // Try to get response text for preview
          if (typeof anyResult === 'string') {
            responseText = anyResult
          } else if (anyResult.text && typeof anyResult.text === 'function') {
            try {
              responseText = anyResult.text()
            } catch (e) {
              // Ignore errors getting text
            }
          } else if (anyResult.response?.text && typeof anyResult.response.text === 'function') {
            try {
              responseText = anyResult.response.text()
            } catch (e) {
              // Ignore errors getting text
            }
          } else if (typeof anyResult === 'object') {
            responseText = JSON.stringify(anyResult)
          }
        } else if (typeof result === 'string') {
          responseText = result
        }

        // Calculate estimated cost
        const estimatedCost =
          promptTokens && completionTokens
            ? calculateLlmCost(
                trackingParams.model,
                promptTokens,
                completionTokens + (reasoningTokens || 0),
                cachedTokens
              )
            : undefined

        const usageId = await logLlmUsage({
          userId: trackingParams.userId,
          model: trackingParams.model,
          modelType: trackingParams.modelType,
          operation: trackingParams.operation,
          entityType: trackingParams.entityType,
          entityId: trackingParams.entityId,
          promptTokens,
          completionTokens,
          cachedTokens,
          reasoningTokens,
          totalTokens,
          estimatedCost,
          durationMs,
          retryCount,
          success: true,
          promptPreview: getPreview(trackingParams.prompt),
          responsePreview: getPreview(responseText),
          promptFull: trackingParams.prompt,
          responseFull: responseText
        })

        if (usageId && trackingParams.onUsageLogged) {
          await trackingParams.onUsageLogged(usageId)
        }
      }

      return result
    } catch (error: any) {
      lastError = error
      retryCount++

      // If it's not a rate limit error, throw immediately (after logging)
      if (!isRateLimitError(error)) {
        // Log failed usage if tracking is enabled
        if (trackingParams) {
          const durationMs = Date.now() - startTime
          await logLlmUsage({
            userId: trackingParams.userId,
            model: trackingParams.model,
            modelType: trackingParams.modelType,
            operation: trackingParams.operation,
            entityType: trackingParams.entityType,
            entityId: trackingParams.entityId,
            durationMs,
            retryCount: retryCount - 1,
            success: false,
            errorType: 'api_error',
            errorMessage: error.message || String(error),
            promptPreview: getPreview(trackingParams.prompt),
            promptFull: trackingParams.prompt
          })
        }
        throw error
      }

      // If we've exhausted retries, throw (after logging)
      if (attempt === MAX_RETRIES) {
        console.error(`[Gemini] ${context} failed after ${MAX_RETRIES} retries`)

        // Log rate limit failure if tracking is enabled
        if (trackingParams) {
          const durationMs = Date.now() - startTime
          await logLlmUsage({
            userId: trackingParams.userId,
            model: trackingParams.model,
            modelType: trackingParams.modelType,
            operation: trackingParams.operation,
            entityType: trackingParams.entityType,
            entityId: trackingParams.entityId,
            durationMs,
            retryCount,
            success: false,
            errorType: 'rate_limit',
            promptFull: trackingParams.prompt,
            errorMessage: error.message || String(error),
            promptPreview: getPreview(trackingParams.prompt)
          })
        }
        throw error
      }

      // Calculate delay
      let delayMs: number

      // Try to parse the retry delay from the error
      const suggestedDelay = parseRetryDelay(error)
      if (suggestedDelay !== null) {
        delayMs = Math.min(suggestedDelay, MAX_DELAY_MS)
        console.log(
          `[Gemini] Rate limited. Using suggested delay of ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
        )
      } else {
        // Use exponential backoff: baseDelay * 2^attempt with jitter
        const exponentialDelay = BASE_DELAY_MS * Math.pow(2, attempt)
        const jitter = Math.random() * 1000 // Add up to 1 second of jitter
        delayMs = Math.min(exponentialDelay + jitter, MAX_DELAY_MS)
        console.log(
          `[Gemini] Rate limited. Retrying after ${Math.round(delayMs)}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
        )
      }

      await sleep(delayMs)
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError
}

export interface LlmTrackingContext {
  userId?: string
  operation: string
  entityType?: string
  entityId?: string
  onUsageLogged?: (usageId: string) => void | Promise<void>
  counted?: boolean
  disableThinking?: boolean
  maxRetries?: number
  modelOverride?: string
  thinkingLevelOverride?: 'minimal' | 'low' | 'medium' | 'high'
  thinkingBudgetOverride?: number
  timeoutMs?: number
}

/**
 * Build Google Provider Options based on model constraints
 */
export function buildGoogleProviderOptions(
  modelId: string,
  thinkingLevel: string,
  thinkingBudget: number
) {
  const resolvedModelId = resolveModelId(modelId)
  const providerOptions: any = {}

  if (resolvedModelId.includes('gemini-3')) {
    // Gemini 3 uses level.
    // Gemini 3 Pro supports 'low' and 'high'
    // Gemini 3 Flash supports 'minimal', 'low', 'medium', 'high'
    let level = thinkingLevel
    if (resolvedModelId.includes('pro') && !['low', 'high'].includes(level)) {
      level = level === 'minimal' ? 'low' : 'high' // Map minimal/medium for Pro
    }

    providerOptions.google = {
      thinkingConfig: {
        thinkingLevel: level,
        includeThoughts: true
      }
    }
  } else {
    // For 2.5/Latest models, budget is the driver
    if (thinkingBudget > 0) {
      providerOptions.google = {
        thinkingConfig: {
          thinkingBudget: thinkingBudget,
          includeThoughts: true
        }
      }
    }
  }

  return providerOptions
}

export async function generateCoachAnalysis(
  prompt: string,
  modelType: GeminiModel = 'flash',
  trackingContext?: LlmTrackingContext
): Promise<string> {
  const opSettings = await getLlmOperationSettings(
    trackingContext?.userId,
    trackingContext?.operation
  )
  const modelName = resolveModelId(trackingContext?.modelOverride || opSettings.modelId)
  const thinkingLevel = trackingContext?.thinkingLevelOverride || opSettings.thinkingLevel
  const thinkingBudget = trackingContext?.thinkingBudgetOverride || opSettings.thinkingBudget
  const startTime = Date.now()

  // Configure thinking based on model version and tier settings
  const providerOptions = trackingContext?.disableThinking
    ? {}
    : buildGoogleProviderOptions(modelName, thinkingLevel, thinkingBudget)

  try {
    const { text, usage } = await generateText({
      model: google(modelName),
      prompt: prompt,
      // CW-328: deliberate policy — see GEMINI_MAX_RETRIES / GEMINI_REQUEST_TIMEOUT_MS.
      maxRetries: trackingContext?.maxRetries ?? GEMINI_MAX_RETRIES,
      timeout: { totalMs: trackingContext?.timeoutMs ?? GEMINI_REQUEST_TIMEOUT_MS },
      providerOptions
    })
    if (trackingContext) {
      await logUsage({
        userId: trackingContext.userId,
        modelId: modelName,
        modelType,
        operation: trackingContext.operation,
        entityType: trackingContext.entityType,
        entityId: trackingContext.entityId,
        prompt: prompt,
        text: text,
        usage: normalizeAiSdkUsage(usage),
        success: true,
        durationMs: Date.now() - startTime
      })
    }

    return text
  } catch (error: any) {
    const classification = reportGeminiFailure({
      fn: 'generateCoachAnalysis',
      error,
      operation: trackingContext?.operation,
      modelId: modelName,
      durationMs: Date.now() - startTime
    })
    if (trackingContext) {
      await logUsage({
        userId: trackingContext.userId,
        modelId: modelName,
        modelType,
        operation: trackingContext.operation,
        entityType: trackingContext.entityType,
        entityId: trackingContext.entityId,
        prompt: prompt,
        usage: {
          inputTokens: 0,
          outputTokens: 0
        },
        success: false,
        error,
        errorType: classification.type,
        durationMs: Date.now() - startTime
      })
    }
    throw error
  }
}

/**
 * Reads a flat-file JSON mock fixture from tests/fixtures/llm-mocks/${operation}.json
 */
export function loadFlatFileMock<T = any>(operation?: string): T {
  const normalizedOp = (operation || 'default_structured')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, '_')

  const baseDir = path.resolve(process.cwd(), 'tests/fixtures/llm-mocks')
  const specificPath = path.join(baseDir, `${normalizedOp}.json`)
  const fallbackPath = path.join(baseDir, 'default_structured.json')

  try {
    if (fs.existsSync(specificPath)) {
      const content = fs.readFileSync(specificPath, 'utf-8')
      console.log(`[MockLLM] Loaded fixture: tests/fixtures/llm-mocks/${normalizedOp}.json`)
      return JSON.parse(content) as T
    }

    if (fs.existsSync(fallbackPath)) {
      const content = fs.readFileSync(fallbackPath, 'utf-8')
      console.log(`[MockLLM] Loaded fallback: tests/fixtures/llm-mocks/default_structured.json`)
      return JSON.parse(content) as T
    }
  } catch (err) {
    console.error('[MockLLM] Error reading flat-file mock fixture:', err)
  }

  return {
    title: 'Mocked Response',
    executive_summary: 'Default mock response',
    success: true
  } as any
}

export async function generateStructuredAnalysis<T>(
  prompt: string,
  schema: any,
  modelType: GeminiModel = 'flash',
  trackingContext?: LlmTrackingContext
): Promise<T> {
  if (process.env.MOCK_LLM_RESPONSES === 'true') {
    return loadFlatFileMock<T>(trackingContext?.operation)
  }
  const opSettings = await getLlmOperationSettings(
    trackingContext?.userId,
    trackingContext?.operation
  )
  const modelName = resolveModelId(trackingContext?.modelOverride || opSettings.modelId)
  const thinkingLevel = trackingContext?.thinkingLevelOverride || opSettings.thinkingLevel
  const thinkingBudget = trackingContext?.thinkingBudgetOverride || opSettings.thinkingBudget
  const startTime = Date.now()

  // Configure thinking based on model version and tier settings
  const providerOptions = trackingContext?.disableThinking
    ? {}
    : buildGoogleProviderOptions(modelName, thinkingLevel, thinkingBudget)

  try {
    const { object, usage } = await generateObject({
      model: google(modelName),
      prompt: prompt,
      schema: jsonSchema(schema),
      // CW-328: deliberate policy — see GEMINI_MAX_RETRIES / GEMINI_REQUEST_TIMEOUT_MS.
      maxRetries: trackingContext?.maxRetries ?? GEMINI_MAX_RETRIES,
      // `generateObject` is typed `Omit<RequestOptions, 'timeout'>` — unlike
      // `generateText` it accepts no `timeout` option. The previous
      // `...(timeoutMs ? { timeout: { totalMs } } : {})` spread therefore compiled
      // (conditional spreads skip excess-property checking) but did nothing, so every
      // caller passing `timeoutMs` was in fact running unbounded. `abortSignal` is the
      // supported mechanism and bounds total wall clock across all retries.
      abortSignal: AbortSignal.timeout(trackingContext?.timeoutMs ?? GEMINI_REQUEST_TIMEOUT_MS),
      providerOptions
    })
    if (trackingContext) {
      await logUsage({
        userId: trackingContext.userId,
        modelId: modelName,
        modelType,
        operation: trackingContext.operation,
        entityType: trackingContext.entityType,
        entityId: trackingContext.entityId,
        prompt: prompt,
        text: JSON.stringify(object),
        usage: normalizeAiSdkUsage(usage),
        success: true,
        durationMs: Date.now() - startTime,
        counted: trackingContext.counted
      })
    }

    return object as T
  } catch (error: any) {
    const classification = reportGeminiFailure({
      fn: 'generateStructuredAnalysis',
      error,
      operation: trackingContext?.operation,
      modelId: modelName,
      durationMs: Date.now() - startTime
    })
    if (trackingContext) {
      await logUsage({
        userId: trackingContext.userId,
        modelId: modelName,
        modelType,
        operation: trackingContext.operation,
        entityType: trackingContext.entityType,
        entityId: trackingContext.entityId,
        prompt: prompt,
        usage: {
          inputTokens: 0,
          outputTokens: 0
        },
        success: false,
        error,
        errorType: classification.type,
        durationMs: Date.now() - startTime,
        counted: trackingContext.counted
      })
    }
    // Rethrown unchanged: the caller (and, for background tasks, Trigger.dev's own
    // task-level retry) decides what happens next. See the policy note above for why
    // this function deliberately does not defer or re-enqueue.
    throw error
  }
}

export function buildWorkoutSummary(
  workouts: any[],
  timezone?: string,
  distanceUnits?: string | null
): string {
  return workouts
    .map((w, idx) => {
      const dateStr = timezone
        ? formatUserDate(w.date, timezone, 'MMM d, yyyy')
        : formatDateUTC(w.date, 'MMM d, yyyy')
      const analysisFacts = buildWorkoutAnalysisFactsV2({ workout: w })

      const lines = [
        `### Workout ${idx + 1}: ${w.title}`,
        `- **Date**: ${dateStr}`,
        `- **Duration**: ${Math.round(w.durationSec / 60)} minutes`,
        `- **Type**: ${w.type || 'Unknown'}`
      ]

      // Power metrics
      if (w.averageWatts) lines.push(`- **Average Power**: ${w.averageWatts}W`)
      if (w.normalizedPower) lines.push(`- **Normalized Power**: ${w.normalizedPower}W`)
      if (w.maxWatts) lines.push(`- **Max Power**: ${w.maxWatts}W`)
      if (w.weightedAvgWatts) lines.push(`- **Weighted Avg Power**: ${w.weightedAvgWatts}W`)

      // Heart rate metrics
      if (w.averageHr) lines.push(`- **Average HR**: ${w.averageHr} bpm`)
      if (w.maxHr) lines.push(`- **Max HR**: ${w.maxHr} bpm`)

      // Cadence
      if (w.averageCadence) lines.push(`- **Average Cadence**: ${w.averageCadence} rpm`)
      if (w.maxCadence) lines.push(`- **Max Cadence**: ${w.maxCadence} rpm`)

      // Training load & intensity
      if (w.tss) lines.push(`- **TSS**: ${Math.round(w.tss)}`)
      if (w.trainingLoad) lines.push(`- **Training Load**: ${Math.round(w.trainingLoad)}`)
      if (w.intensity) lines.push(`- **Intensity Factor**: ${w.intensity.toFixed(2)}`)
      if (w.kilojoules) lines.push(`- **Energy**: ${w.kilojoules} kJ`)

      // Distance & elevation
      if (w.distanceMeters)
        lines.push(`- **Distance**: ${formatPromptDistance(w.distanceMeters, distanceUnits)}`)
      if (w.elevationGain) lines.push(`- **Elevation**: ${w.elevationGain}m`)
      if (w.averageSpeed)
        lines.push(`- **Avg Speed**: ${metresPerSecondToKmh(w.averageSpeed).toFixed(1)} km/h`)

      // Performance metrics
      if (w.variabilityIndex)
        lines.push(`- **Variability Index**: ${w.variabilityIndex.toFixed(2)}`)
      if (w.powerHrRatio) lines.push(`- **Power/HR Ratio**: ${w.powerHrRatio.toFixed(2)}`)
      if (w.efficiencyFactor)
        lines.push(`- **Efficiency Factor**: ${w.efficiencyFactor.toFixed(2)}`)
      if (analysisFacts.performanceSignals.decoupling.interpretable) {
        if (
          w.decoupling !== null &&
          w.decoupling !== undefined &&
          analysisFacts.performanceSignals.decoupling.effective !== null
        ) {
          lines.push(
            `- **Decoupling**: ${analysisFacts.performanceSignals.decoupling.effective.toFixed(1)}%`
          )
        }
      } else if (analysisFacts.performanceSignals.decoupling.reason) {
        lines.push(
          `- **Decoupling Guardrail**: Ignore classic decoupling for this workout. ${analysisFacts.performanceSignals.decoupling.reason}`
        )
      }

      // Fitness tracking
      if (w.ctl) lines.push(`- **CTL (Fitness)**: ${Math.round(w.ctl)}`)
      if (w.atl) lines.push(`- **ATL (Fatigue)**: ${Math.round(w.atl)}`)

      // Subjective metrics
      if (w.rpe) lines.push(`- **RPE**: ${w.rpe}/10`)
      if (w.sessionRpe) lines.push(`- **Session RPE**: ${w.sessionRpe}`)
      // Feel is stored as 1-5 (Intervals standard), but AI understands 1-10 better.
      // 1 (Weak) -> 2/10, 5 (Strong) -> 10/10
      if (w.feel) lines.push(`- **Feel**: ${w.feel * 2}/10 (10=Strong, 2=Weak)`)

      // Environmental
      if (w.avgTemp !== null && w.avgTemp !== undefined)
        lines.push(`- **Avg Temperature**: ${w.avgTemp.toFixed(1)}°C`)
      if (w.trainer) lines.push(`- **Indoor Trainer**: Yes`)

      // Balance
      if (w.lrBalance !== null && w.lrBalance !== undefined) {
        const lrGuardrails = analysisFacts.guardrails.lrBalance
        if (lrGuardrails.sourceSemantics === 'human_vs_motor') {
          lines.push(
            `- **Balance Signal Semantics**: Human vs motor contribution signal detected, not true left/right pedaling balance.`
          )
          if (
            lrGuardrails.correctedLeftPct !== null &&
            lrGuardrails.correctedRightPct !== null &&
            lrGuardrails.interpretationMode === 'corrected'
          ) {
            lines.push(
              `- **Human/Motor Balance (Corrected)**: ${lrGuardrails.correctedLeftPct.toFixed(1)}/${lrGuardrails.correctedRightPct.toFixed(1)}`
            )
          } else if (lrGuardrails.correctionReason) {
            lines.push(`- **Balance Guardrail**: ${lrGuardrails.correctionReason}`)
          }
        } else if (lrGuardrails.interpretationMode === 'normal') {
          const rightPct = lrGuardrails.correctedRightPct ?? w.lrBalance
          const leftPct = lrGuardrails.correctedLeftPct ?? 100 - rightPct
          lines.push(
            `- **L/R Balance (Left%/Right%)**: ${leftPct.toFixed(1)}/${rightPct.toFixed(1)}`
          )
          lines.push(
            `- **L/R Dominance**: ${rightPct > 50 ? 'Right' : rightPct < 50 ? 'Left' : 'Even'}`
          )
        } else if (lrGuardrails.correctionReason) {
          lines.push(`- **Balance Guardrail**: ${lrGuardrails.correctionReason}`)
        }
      }

      // Zone Data (from Streams)
      if (w.streams) {
        const hasStreamData = (data: any): boolean => {
          if (!data) return false
          if (Array.isArray(data)) return data.length > 0
          if (typeof data === 'string') {
            return data.length > 2 // minimal JSON array "[]" is 2 chars
          }
          return false
        }

        const availableStreams = []
        if (hasStreamData(w.streams.heartrate)) availableStreams.push('Heart Rate')
        if (hasStreamData(w.streams.watts)) availableStreams.push('Power')
        if (hasStreamData(w.streams.cadence)) availableStreams.push('Cadence')
        if (hasStreamData(w.streams.velocity)) availableStreams.push('Velocity')
        if (hasStreamData(w.streams.latlng)) availableStreams.push('GPS/Location')
        if (hasStreamData(w.streams.altitude)) availableStreams.push('Elevation')
        if (hasStreamData(w.streams.grade)) availableStreams.push('Grade')
        if (hasStreamData(w.streams.temp)) availableStreams.push('Temperature')
        if (hasStreamData(w.streams.torque)) availableStreams.push('Torque')
        if (hasStreamData(w.streams.leftRightBalance)) availableStreams.push('L/R Balance')
        if (hasStreamData(w.streams.hrv)) availableStreams.push('HRV')
        if (hasStreamData(w.streams.respiration)) availableStreams.push('Respiration')

        if (availableStreams.length > 0) {
          lines.push(`- **Available Data Streams**: ${availableStreams.join(', ')}`)
        }

        if (w.streams.hrZoneTimes && Array.isArray(w.streams.hrZoneTimes)) {
          const times = w.streams.hrZoneTimes as number[]
          const totalTime = times.reduce((a, b) => a + b, 0)
          if (totalTime > 0) {
            lines.push(`\n**Heart Rate Zones**:`)
            times.forEach((time, i) => {
              if (time > 0) {
                const pct = ((time / totalTime) * 100).toFixed(1)
                lines.push(`- Z${i + 1}: ${pct}%`)
              }
            })
          }
        }

        if (w.streams.powerZoneTimes && Array.isArray(w.streams.powerZoneTimes)) {
          const times = w.streams.powerZoneTimes as number[]
          const totalTime = times.reduce((a, b) => a + b, 0)
          if (totalTime > 0) {
            lines.push(`\n**Power Zones**:`)
            times.forEach((time, i) => {
              if (time > 0) {
                const pct = ((time / totalTime) * 100).toFixed(1)
                lines.push(`- Z${i + 1}: ${pct}%`)
              }
            })
          }
        }
      }

      // Description
      if (w.description) lines.push(`\n**Description**: ${w.description}`)

      // Athlete Notes
      if (w.notes) lines.push(`\n**Athlete Notes**: ${w.notes}`)

      // Plan Adherence (if linked)
      if (w.plannedWorkout) {
        lines.push(`\n**Plan Adherence**:`)
        lines.push(`- **Planned Title**: ${w.plannedWorkout.title}`)
        if (w.plannedWorkout.durationSec) {
          const plannedDur = Math.round(w.plannedWorkout.durationSec / 60)
          const actualDur = Math.round(w.durationSec / 60)
          const diff = actualDur - plannedDur
          lines.push(
            `- **Duration**: ${plannedDur}m (Actual: ${actualDur}m, ${diff > 0 ? '+' : ''}${diff}m)`
          )
        }
        if (w.plannedWorkout.tss) {
          const plannedTSS = Math.round(w.plannedWorkout.tss)
          const actualTSS = Math.round(w.tss || 0)
          const diff = actualTSS - plannedTSS
          lines.push(
            `- **TSS**: ${plannedTSS} (Actual: ${actualTSS}, ${diff > 0 ? '+' : ''}${diff})`
          )
        }
      }

      // AI Analysis Summary (if available)
      if (w.aiAnalysisJson) {
        const analysis = w.aiAnalysisJson as any
        lines.push(`\n**AI Analysis Insights**:`)

        if (analysis.strengths && analysis.strengths.length > 0) {
          lines.push(`- **Strengths**: ${analysis.strengths.join(', ')}`)
        }

        if (analysis.weaknesses && analysis.weaknesses.length > 0) {
          lines.push(`- **Areas for Improvement**: ${analysis.weaknesses.join(', ')}`)
        }

        if (analysis.recommendations && analysis.recommendations.length > 0) {
          lines.push(`- **Previous Recommendations**:`)
          analysis.recommendations.slice(0, 3).forEach((rec: any) => {
            const title = typeof rec === 'string' ? rec : rec.title
            const desc = typeof rec === 'object' ? `: ${rec.description}` : ''
            lines.push(`  * ${title}${desc}`)
          })
        }
      }

      return lines.join('\n')
    })
    .join('\n\n')
}

/**
 * Build a very compact summary of workouts for context in planning tasks.
 */
export function buildConciseWorkoutSummary(workouts: any[], timezone?: string): string {
  return workouts
    .map((w, idx) => {
      const dateStr = formatDateUTC(w.date, 'MMM d')
      const duration = Math.round(w.durationSec / 60)
      const intensity = w.intensity ? ` (IF: ${w.intensity.toFixed(2)})` : ''
      const tss = w.tss ? ` TSS: ${Math.round(w.tss)}` : ''
      const power = w.averageWatts ? ` ${w.averageWatts}W` : ''

      return `${idx + 1}. ${dateStr}: ${w.type} - ${w.title} [${duration}m${tss}${intensity}${power}]`
    })
    .join('\n')
}

export function buildMetricsSummary(metrics: any[], timezone?: string): string {
  return metrics
    .map((m) => {
      const dateStr = formatDateUTC(m.date, 'MMM d, yyyy')

      const parts = [`**${dateStr}**:`]

      // Recovery metrics
      if (m.recoveryScore !== null) parts.push(`Recovery ${m.recoveryScore}%`)
      if (m.hrv !== null) parts.push(`HRV (rMSSD) ${m.hrv}ms`)
      if (m.hrvSdnn !== null && m.hrvSdnn !== undefined) parts.push(`HRV (SDNN) ${m.hrvSdnn}ms`)
      if (m.restingHr !== null) parts.push(`Resting HR ${m.restingHr}bpm`)

      // Sleep metrics
      if (m.sleepHours !== null) parts.push(`Sleep ${m.sleepHours.toFixed(1)}h`)
      if (m.sleepScore !== null) parts.push(`Sleep Score ${m.sleepScore}%`)

      // Additional metrics
      if (m.spO2 !== null) parts.push(`SpO2 ${m.spO2}%`)
      if (m.respiration !== null) parts.push(`Respiration ${m.respiration}br/min`)
      if (m.readiness !== null) parts.push(`Readiness ${m.readiness}/10`)

      // Subjective wellness
      if (m.fatigue !== null) parts.push(`Fatigue ${m.fatigue}/10 (${getFatigueLabel(m.fatigue)})`)
      if (m.soreness !== null)
        parts.push(`Soreness ${m.soreness}/10 (${getSorenessLabel(m.soreness)})`)
      if (m.stress !== null)
        parts.push(`Stress ${normalizeStressScore(m.stress)}/10 (${getStressLabel(m.stress)})`)
      if (m.mood !== null) parts.push(`Mood ${m.mood}/10 (${getMoodLabel(m.mood)})`)
      if (m.motivation !== null)
        parts.push(`Motivation ${m.motivation}/10 (${getMotivationLabel(m.motivation)})`)
      if (m.hydration !== null)
        parts.push(`Hydration ${m.hydration} (${getHydrationLabel(m.hydration)})`)
      if (m.injury !== null) parts.push(`Injury ${m.injury} (${getInjuryLabel(m.injury)})`)

      return parts.join(', ')
    })
    .join('\n')
}

/**
 * Build a comprehensive workout summary including raw JSON data if available.
 * Use this when you want the AI to have access to ALL available data including
 * fields that might not be normalized yet.
 *
 * @param workouts Array of workout objects
 * @param includeRawJson Whether to include the complete rawJson field (default: false)
 * @param timezone Optional timezone for date formatting
 * @param distanceUnits Optional athlete distance unit preference ('Miles' or 'Kilometers')
 */
export function buildComprehensiveWorkoutSummary(
  workouts: any[],
  includeRawJson = false,
  timezone?: string,
  distanceUnits?: string | null
): string {
  const summary = buildWorkoutSummary(workouts, timezone, distanceUnits)

  if (!includeRawJson) {
    return summary
  }

  // Add raw JSON data for workouts that have it
  const rawDataSection = workouts
    .filter((w) => w.rawJson)
    .map((w, idx) => {
      return `\n### Raw Data for Workout ${idx + 1}:\n\`\`\`json\n${JSON.stringify(w.rawJson, null, 2)}\n\`\`\``
    })
    .join('\n')

  return rawDataSection ? `${summary}\n\n## Complete Raw Data\n${rawDataSection}` : summary
}
