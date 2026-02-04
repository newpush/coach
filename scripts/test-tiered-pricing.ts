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
}

test()
