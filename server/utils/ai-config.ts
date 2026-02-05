export type GeminiModel = 'flash' | 'pro'

export const MODEL_NAMES = {
  flash: 'gemini-flash-latest',
  pro: 'gemini-3-flash-preview'
} as const

export const PRICING = {
  'gemini-3-flash-preview': {
    threshold: 128_000,
    base: { input: 0.5, output: 3.0 },
    premium: { input: 0.5, output: 3.0 },
    cacheStorage: 1.0 // $1.00 / 1M tokens / hour
  },
  'gemini-3-pro-preview': {
    threshold: 200_000,
    base: { input: 0.2, output: 12.0 },
    premium: { input: 0.4, output: 18.0 },
    cacheStorage: 4.5 // $4.50 / 1M tokens / hour
  },
  'gemini-pro-latest': {
    threshold: 200_000,
    base: { input: 2.0, output: 12.0 },
    premium: { input: 4.0, output: 18.0 },
    cacheStorage: 4.5
  },
  'gemini-flash-latest': {
    threshold: 1_000_000,
    base: { input: 0.3, output: 2.5 },
    premium: { input: 0.3, output: 2.5 },
    cacheStorage: 1.0
  }
} as const

/**
 * Calculate cost in USD for a Gemini API call, taking into account tiered pricing
 * based on the token context window threshold.
 *
 * Supports cached tokens with a discount (usually 75% for Gemini).
 */
export function calculateLlmCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number = 0
): number {
  const config = PRICING[model as keyof typeof PRICING]

  if (!config) {
    console.warn(`[AI Config] Unknown model for pricing: ${model}`)
    // Fallback to basic flash pricing if unknown
    const uncachedInput = Math.max(0, inputTokens - cachedTokens)
    return (
      (uncachedInput / 1_000_000) * 0.1 +
      (cachedTokens / 1_000_000) * 0.025 +
      (outputTokens / 1_000_000) * 0.4
    )
  }

  // Google pricing tier is usually determined by the length of the prompt (input tokens)
  const isPremium = inputTokens > config.threshold
  const rates = isPremium ? config.premium : config.base

  const uncachedInput = Math.max(0, inputTokens - cachedTokens)
  const inputCost = (uncachedInput / 1_000_000) * rates.input

  // Cached tokens usually get a 75% discount (pay only 25%)
  const cachedCost = (cachedTokens / 1_000_000) * (rates.input * 0.25)

  const outputCost = (outputTokens / 1_000_000) * rates.output

  return inputCost + cachedCost + outputCost
}
