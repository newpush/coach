import { logger, task } from '@trigger.dev/sdk/v3'
import { prisma } from '../server/utils/db'
import { generateStructuredAnalysis } from '../server/utils/gemini'

interface ImplementationGuide {
  strategy_summary: string
  key_actions: string[]
  tips_and_tricks: string[]
  common_pitfalls: string[]
  success_metrics: string[]
  llmUsageId?: string
}

export const generateImplementationGuideTask = task({
  id: 'generate-implementation-guide',
  maxDuration: 300,
  run: async (payload: { userId: string; recommendationId: string }) => {
    const { userId, recommendationId } = payload

    logger.log('Starting implementation guide generation', { userId, recommendationId })

    // 1. Fetch Recommendation
    const recommendation = await prisma.recommendation.findUnique({
      where: { id: recommendationId, userId }
    })

    if (!recommendation) {
      throw new Error('Recommendation not found')
    }

    // 2. Construct Prompt
    const prompt = `You are an expert endurance sports coach. Create a detailed, actionable implementation guide for the following recommendation.

RECOMMENDATION:
Title: "${recommendation.title}"
Description: "${recommendation.description}"
Priority: ${recommendation.priority}
Metric: ${recommendation.sourceType} / ${recommendation.metric}

INSTRUCTIONS:
Provide a structured guide to help the athlete achieve this recommendation.
- **Strategy Summary**: A high-level approach (2-3 sentences).
- **Key Actions**: Specific, step-by-step actions the athlete should take (3-5 items).
- **Tips & Tricks**: Practical advice, hacks, or mental cues to make it easier.
- **Common Pitfalls**: What to avoid or watch out for.
- **Success Metrics**: How will they know they've succeeded? (e.g. "HRV increases by 5ms", "RPE feels lower")

OUTPUT SCHEMA:
JSON object matching the structure.`

    const schema = {
      type: 'object',
      properties: {
        strategy_summary: { type: 'string' },
        key_actions: { type: 'array', items: { type: 'string' } },
        tips_and_tricks: { type: 'array', items: { type: 'string' } },
        common_pitfalls: { type: 'array', items: { type: 'string' } },
        success_metrics: { type: 'array', items: { type: 'string' } }
      },
      required: [
        'strategy_summary',
        'key_actions',
        'tips_and_tricks',
        'common_pitfalls',
        'success_metrics'
      ]
    }

    let usageId: string | undefined

    // 3. Generate Analysis
    const guide = await generateStructuredAnalysis<ImplementationGuide>(prompt, schema, 'flash', {
      userId,
      operation: 'generate_implementation_guide',
      entityType: 'Recommendation',
      entityId: recommendationId,
      onUsageLogged: (id) => {
        usageId = id
      }
    })

    // 4. Update Recommendation
    await prisma.recommendation.update({
      where: { id: recommendationId },
      data: {
        implementationGuide: {
          ...guide,
          llmUsageId: usageId
        } as any
      }
    })

    return {
      success: true,
      guide
    }
  }
})
