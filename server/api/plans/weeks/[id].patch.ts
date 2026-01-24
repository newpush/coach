import { getServerSession } from '../../../utils/session'
import { prisma } from '../../../utils/db'
import { trainingWeekRepository } from '../../../utils/repositories/trainingWeekRepository'
import { z } from 'zod'

const updateWeekSchema = z.object({
  focusKey: z.string().optional(),
  focusLabel: z.string().optional(),
  volumeTargetMinutes: z.number().int().min(0).optional(),
  tssTarget: z.number().int().min(0).optional(),
  isRecovery: z.boolean().optional()
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

  const weekId = getRouterParam(event, 'id')
  const body = await readBody(event)

  const validation = updateWeekSchema.safeParse(body)
  if (!validation.success) {
    throw createError({ statusCode: 400, message: validation.error.message })
  }

  // Verify ownership
  const week = await trainingWeekRepository.getById(weekId!, {
    include: {
      block: {
        include: {
          plan: { select: { userId: true } }
        }
      }
    }
  })

  if (!week || (week.block.plan as any).userId !== user.id) {
    throw createError({ statusCode: 404, message: 'Week not found' })
  }

  // Update the week
  const updatedWeek = await trainingWeekRepository.update(weekId!, validation.data)

  return {
    success: true,
    week: updatedWeek
  }
})
