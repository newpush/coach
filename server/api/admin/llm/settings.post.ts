import { defineEventHandler, createError, readBody } from 'h3'
import { getServerSession } from '../../../utils/session'
import { prisma } from '../../../utils/db'
import { refreshLlmSettingsCache } from '../../../utils/ai-operation-settings'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const body = await readBody(event)
  const {
    action,
    levelId,
    overrideId,
    operation,
    model,
    modelId,
    thinkingBudget,
    thinkingLevel,
    maxSteps
  } = body

  try {
    if (action === 'update_level') {
      await prisma.llmAnalysisLevelSettings.update({
        where: { id: levelId },
        data: {
          model,
          modelId,
          thinkingBudget: parseInt(thinkingBudget, 10),
          thinkingLevel,
          maxSteps: parseInt(maxSteps, 10)
        }
      })
    } else if (action === 'upsert_override') {
      if (overrideId) {
        await prisma.llmOperationOverride.update({
          where: { id: overrideId },
          data: {
            model,
            modelId,
            thinkingBudget:
              thinkingBudget !== undefined
                ? thinkingBudget === null
                  ? null
                  : parseInt(thinkingBudget, 10)
                : undefined,
            thinkingLevel,
            maxSteps:
              maxSteps !== undefined
                ? maxSteps === null
                  ? null
                  : parseInt(maxSteps, 10)
                : undefined
          }
        })
      } else {
        await prisma.llmOperationOverride.create({
          data: {
            analysisLevelSettingsId: levelId,
            operation,
            model,
            modelId,
            thinkingBudget:
              thinkingBudget !== undefined
                ? thinkingBudget === null
                  ? null
                  : parseInt(thinkingBudget, 10)
                : null,
            thinkingLevel,
            maxSteps:
              maxSteps !== undefined ? (maxSteps === null ? null : parseInt(maxSteps, 10)) : null
          }
        })
      }
    } else if (action === 'delete_override') {
      await prisma.llmOperationOverride.delete({
        where: { id: overrideId }
      })
    } else {
      throw createError({ statusCode: 400, statusMessage: 'Invalid action' })
    }

    // Refresh the in-memory cache so changes take effect immediately
    await refreshLlmSettingsCache()

    return { success: true }
  } catch (error: any) {
    console.error('[Admin] Failed to update LLM settings:', error)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
