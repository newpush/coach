import { defineEventHandler, createError } from 'h3'
import { getServerSession } from '../../../utils/session'
import { prisma } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  try {
    const [levelSettings, overrides] = await Promise.all([
      prisma.llmAnalysisLevelSettings.findMany({
        orderBy: { updatedAt: 'asc' }
      }),
      prisma.llmOperationOverride.findMany({
        orderBy: { operation: 'asc' }
      })
    ])

    // Join in memory to bypass potential Prisma 'include' schema sync issues
    const settings = levelSettings.map((level) => ({
      ...level,
      overrides: overrides.filter((o) => o.analysisLevelSettingsId === level.id)
    }))

    return settings
  } catch (error: any) {
    console.error('[Admin] Failed to fetch LLM settings:', error)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
