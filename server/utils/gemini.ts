import { prisma } from './db'
import { formatUserDate } from './date'
import { generateText, generateObject, jsonSchema } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import {
  getMoodLabel,
  getStressLabel,
  getFatigueLabel,
  getSorenessLabel,
  getMotivationLabel,
  getHydrationLabel,
  getInjuryLabel
} from './wellness'

import type { GeminiModel } from './ai-config'
import { MODEL_NAMES, calculateLlmCost } from './ai-config'

const google = createGoogleGenerativeAI({
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
        responseFull: params.responseFull
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
    promptTokens: number
    completionTokens: number
    cachedTokens?: number
    reasoningTokens?: number
  }
  success: boolean
  error?: any
}) {
  const durationMs = 0 // SDK doesn't always expose this directly in a simple way here
  const estimatedCost = calculateLlmCost(
    params.modelId,
    params.usage.promptTokens,
    params.usage.completionTokens,
    params.usage.cachedTokens || 0
  )

  await logLlmUsage({
    userId: params.userId,
    model: params.modelId,
    modelType: params.modelType,
    operation: params.operation,
    entityType: params.entityType,
    entityId: params.entityId,
    promptTokens: params.usage.promptTokens,
    completionTokens: params.usage.completionTokens,
    cachedTokens: params.usage.cachedTokens || 0,
    reasoningTokens: params.usage.reasoningTokens || 0,
    totalTokens: params.usage.promptTokens + params.usage.completionTokens,
    estimatedCost,
    durationMs,
    retryCount: 0,
    success: params.success,
    errorType: params.error ? 'api_error' : undefined,
    errorMessage: params.error?.message,
    promptPreview: getPreview(params.prompt),
    responsePreview: params.text ? getPreview(params.text) : undefined,
    promptFull: params.prompt,
    responseFull: params.text
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
            ? calculateLlmCost(trackingParams.model, promptTokens, completionTokens, cachedTokens)
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
}

export async function generateCoachAnalysis(
  prompt: string,
  modelType: GeminiModel = 'flash',
  trackingContext?: LlmTrackingContext
): Promise<string> {
  const modelName = MODEL_NAMES[modelType]

  try {
    const { text, usage } = await generateText({
      model: google(modelName),
      prompt: prompt,
      maxRetries: 3
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
        usage: {
          promptTokens: usage.inputTokens || 0,
          completionTokens: usage.outputTokens || 0,
          cachedTokens: usage.inputTokenDetails?.cacheReadTokens || 0,
          reasoningTokens: (usage as any).outputTokenDetails?.reasoningTokens || 0
        },
        success: true
      })
    }

    return text
  } catch (error: any) {
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
          promptTokens: 0,
          completionTokens: 0
        },
        success: false,
        error
      })
    }
    throw error
  }
}

export async function generateStructuredAnalysis<T>(
  prompt: string,
  schema: any,
  modelType: GeminiModel = 'flash',
  trackingContext?: LlmTrackingContext
): Promise<T> {
  const modelName = MODEL_NAMES[modelType]

  try {
    const { object, usage } = await generateObject({
      model: google(modelName),
      prompt: prompt,
      schema: jsonSchema(schema),
      maxRetries: 3
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
        usage: {
          promptTokens: usage.inputTokens || 0,
          completionTokens: usage.outputTokens || 0,
          cachedTokens: usage.inputTokenDetails?.cacheReadTokens || 0,
          reasoningTokens: (usage as any).outputTokenDetails?.reasoningTokens || 0
        },
        success: true
      })
    }

    return object as T
  } catch (error: any) {
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
          promptTokens: 0,
          completionTokens: 0
        },
        success: false,
        error
      })
    }
    throw error
  }
}

export function buildWorkoutSummary(workouts: any[], timezone?: string): string {
  return workouts
    .map((w, idx) => {
      const dateStr = timezone
        ? formatUserDate(w.date, timezone, 'MMM d, yyyy')
        : w.date.toISOString().split('T')[0]

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
      if (w.distanceMeters) lines.push(`- **Distance**: ${(w.distanceMeters / 1000).toFixed(1)} km`)
      if (w.elevationGain) lines.push(`- **Elevation**: ${w.elevationGain}m`)
      if (w.averageSpeed) lines.push(`- **Avg Speed**: ${(w.averageSpeed * 3.6).toFixed(1)} km/h`)

      // Performance metrics
      if (w.variabilityIndex)
        lines.push(`- **Variability Index**: ${w.variabilityIndex.toFixed(2)}`)
      if (w.powerHrRatio) lines.push(`- **Power/HR Ratio**: ${w.powerHrRatio.toFixed(2)}`)
      if (w.efficiencyFactor)
        lines.push(`- **Efficiency Factor**: ${w.efficiencyFactor.toFixed(2)}`)
      if (w.decoupling !== null && w.decoupling !== undefined)
        lines.push(`- **Decoupling**: ${w.decoupling.toFixed(1)}%`)

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
      if (w.lrBalance) lines.push(`- **L/R Balance**: ${w.lrBalance.toFixed(1)}%`)

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

export function buildMetricsSummary(metrics: any[], timezone?: string): string {
  return metrics
    .map((m) => {
      const dateStr = timezone
        ? formatUserDate(m.date, timezone, 'MMM d, yyyy')
        : m.date.toISOString().split('T')[0]

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
      if (m.stress !== null) parts.push(`Stress ${m.stress}/10 (${getStressLabel(m.stress)})`)
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
 */
export function buildComprehensiveWorkoutSummary(
  workouts: any[],
  includeRawJson = false,
  timezone?: string
): string {
  const summary = buildWorkoutSummary(workouts, timezone)

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
