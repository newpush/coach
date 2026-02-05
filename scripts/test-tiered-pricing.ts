import { calculateLlmCost } from '../server/utils/ai-config'

function test() {
  console.log('--- Testing Tiered AI Pricing ---')

  // Flash tests
  console.log('\n[Gemini 3 Flash Preview]')
  const flashBase = calculateLlmCost('gemini-3-flash-preview', 100000, 1000)
  console.log(`Fixed Rate (100k): 100k in, 1k out -> $${flashBase.toFixed(4)} (Expected 0.0530)`)

  const flashPremium = calculateLlmCost('gemini-3-flash-preview', 150000, 1000)
  console.log(`Fixed Rate (150k): 150k in, 1k out -> $${flashPremium.toFixed(4)} (Expected 0.0780)`)

  // Pro tests
  console.log('\n[Gemini 3 Pro Preview]')
  const proBase = calculateLlmCost('gemini-3-pro-preview', 150000, 1000)
  console.log(`Base (< 200k): 150k in, 1k out -> $${proBase.toFixed(4)} (Expected 0.3120)`)

  const proPremium = calculateLlmCost('gemini-3-pro-preview', 250000, 1000)
  console.log(`Premium (> 200k): 250k in, 1k out -> $${proPremium.toFixed(4)} (Expected 1.0180)`)

  const proCached = calculateLlmCost('gemini-3-pro-preview', 250000, 1000, 200000)
  console.log(
    `Cached: 250k total (200k cached), 1k out -> $${proCached.toFixed(4)} (Expected 0.4180)`
  )
  console.log(
    `  Calc details: (50k * 4.0) + (200k * 1.0) + (1k * 18.0) / 1M = (0.2 + 0.2 + 0.018) = 0.4180`
  )
  // Wait, I should re-calculate my manual math based on the rates.
  // gemini-3-pro-preview premium rates: input 4.0, output 18.0. Cached = 4.0 * 0.25 = 1.0.
  // 50,000 * (4.0 / 1,000,000) = 0.2
  // 200,000 * (1.0 / 1,000,000) = 0.2
  // 1,000 * (18.0 / 1,000,000) = 0.018
  // Total = 0.4180

  // Legacy tests
  console.log('\n[Gemini Flash Latest (Legacy)]')
  const flashLegacy = calculateLlmCost('gemini-flash-latest', 100000, 1000)
  console.log(`Fixed Rate: 100k in, 1k out -> $${flashLegacy.toFixed(4)} (Expected 0.0325)`)
}

test()
