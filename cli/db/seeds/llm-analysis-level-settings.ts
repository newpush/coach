import { prisma } from '../../../server/utils/db'

export const seed = async (options: { force?: boolean } = {}) => {
  console.log('Seeding LLM Analysis Level Settings...')

  const settings = [
    {
      level: 'flash',
      model: 'flash', // Gemini 2.5
      modelId: 'gemini-flash-latest',
      thinkingBudget: 2000,
      thinkingLevel: 'minimal',
      maxSteps: 3
    },
    {
      level: 'pro',
      model: 'pro', // Gemini 3.0
      modelId: 'gemini-3-flash-preview',
      thinkingBudget: 4000,
      thinkingLevel: 'low',
      maxSteps: 10
    },
    {
      level: 'experimental',
      model: 'flash', // Gemini 2.5
      modelId: 'gemini-flash-latest',
      thinkingBudget: 4000,
      thinkingLevel: 'high',
      maxSteps: 10
    }
  ]

  for (const setting of settings) {
    if (options.force) {
      await prisma.llmAnalysisLevelSettings.upsert({
        where: { level: setting.level },
        update: setting,
        create: setting
      })
      console.log(`  Upserted ${setting.level} settings`)
    } else {
      const existing = await prisma.llmAnalysisLevelSettings.findUnique({
        where: { level: setting.level }
      })

      if (existing) {
        console.log(`  Skipping ${setting.level} settings (already exists)`)
        continue
      }

      await prisma.llmAnalysisLevelSettings.create({
        data: setting
      })
      console.log(`  Created ${setting.level} settings`)
    }
  }

  console.log('LLM Analysis Level Settings seeded successfully.')
}
