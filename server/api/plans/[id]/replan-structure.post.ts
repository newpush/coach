import { getServerSession } from '../../../utils/session'
import { prisma } from '../../../utils/db'
import { planService } from '../../../utils/services/planService'
import { z } from 'zod'

const replanSchema = z.object({
  blocks: z.array(
    z.object({
      id: z.string().optional(),
      name: z.string(),
      type: z.string(),
      primaryFocus: z.string(),
      durationWeeks: z.number().int().min(1).max(12),
      order: z.number().int(),
      recoveryWeekIndex: z.number().int().nullable().optional(),
      progressionLogic: z.string().nullable().optional()
    })
  )
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user?.email) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true }
  })
  if (!user) throw createError({ statusCode: 401, message: 'User not found' })

  const planId = getRouterParam(event, 'id')
  const body = await readBody(event)

  const validation = replanSchema.safeParse(body)
  if (!validation.success) {
    throw createError({ statusCode: 400, message: validation.error.message })
  }

  const { blocks: newBlockConfigs } = validation.data

  try {
    return await planService.replanStructure(user.id, planId!, newBlockConfigs)
  } catch (error: any) {
    throw createError({ statusCode: 400, message: error.message })
  }
})
