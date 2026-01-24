import { getServerSession } from '../../../../utils/session'
import { prisma } from '../../../../utils/db'
import { shiftPlanDates, calculateWeekTargets } from '../../../../utils/plan-logic'
import { trainingPlanRepository } from '../../../../utils/repositories/trainingPlanRepository'
import { trainingBlockRepository } from '../../../../utils/repositories/trainingBlockRepository'
import { trainingWeekRepository } from '../../../../utils/repositories/trainingWeekRepository'
import { z } from 'zod'

const createBlockSchema = z.object({
  name: z.string(),
  type: z.string(),
  primaryFocus: z.string(),
  durationWeeks: z.number().int().min(1).max(12),
  order: z.number().int().optional(), // 1-based index
  recoveryWeekIndex: z.number().int().nullable().optional(),
  progressionLogic: z.string().nullable().optional()
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

  const validation = createBlockSchema.safeParse(body)
  if (!validation.success) {
    throw createError({ statusCode: 400, message: validation.error.message })
  }

  const { name, type, primaryFocus, durationWeeks, order, recoveryWeekIndex, progressionLogic } =
    validation.data

  const plan = await trainingPlanRepository.getById(planId!, user.id, {
    include: {
      blocks: { orderBy: { order: 'asc' } }
    }
  })

  if (!plan) throw createError({ statusCode: 404, message: 'Plan not found' })

  // Determine target order
  const targetOrder = order || plan.blocks.length + 1
  const deltaDays = durationWeeks * 7

  return await prisma.$transaction(async (tx) => {
    // 1. Shift orders and dates of existing blocks
    if (targetOrder <= plan.blocks.length) {
      // Shift orders
      await trainingBlockRepository.updateMany(
        {
          trainingPlanId: planId,
          order: { gte: targetOrder }
        },
        {
          order: { increment: 1 }
        },
        tx
      )

      // Shift dates
      await shiftPlanDates(planId!, targetOrder - 1, deltaDays)
    }

    // 2. Calculate Start Date for the new block
    let startDate: Date
    if (targetOrder === 1) {
      startDate = plan.startDate || new Date()
    } else {
      const prevBlock = plan.blocks.find((b) => b.order === targetOrder - 1)
      if (!prevBlock) throw new Error('Previous block not found for calculation')

      startDate = new Date(prevBlock.startDate)
      startDate.setUTCDate(startDate.getUTCDate() + prevBlock.durationWeeks * 7)
    }

    // 3. Create the block
    const newBlock = await trainingBlockRepository.create(
      {
        trainingPlanId: planId!,
        name,
        type,
        primaryFocus,
        durationWeeks,
        order: targetOrder,
        recoveryWeekIndex,
        progressionLogic,
        startDate
      },
      tx
    )

    // 4. Create weeks for the new block
    const targets = calculateWeekTargets(type)
    for (let i = 1; i <= durationWeeks; i++) {
      const weekStart = new Date(startDate)
      weekStart.setUTCDate(weekStart.getUTCDate() + (i - 1) * 7)

      const weekEnd = new Date(weekStart)
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 6)

      await trainingWeekRepository.create(
        {
          blockId: newBlock.id,
          weekNumber: i,
          startDate: weekStart,
          endDate: weekEnd,
          ...targets
        },
        tx
      )
    }

    return newBlock
  })
})
