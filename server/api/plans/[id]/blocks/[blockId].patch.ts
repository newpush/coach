import { getServerSession } from '../../../../utils/session'
import { prisma } from '../../../../utils/db'
import { shiftPlanDates, calculateWeekTargets } from '../../../../utils/plan-logic'
import { trainingBlockRepository } from '../../../../utils/repositories/trainingBlockRepository'
import { trainingWeekRepository } from '../../../../utils/repositories/trainingWeekRepository'
import { z } from 'zod'

const updateBlockSchema = z.object({
  name: z.string().optional(),
  type: z.string().optional(),
  primaryFocus: z.string().optional(),
  durationWeeks: z.number().int().min(1).max(12).optional(),
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
  const blockId = getRouterParam(event, 'blockId')
  const body = await readBody(event)

  const validation = updateBlockSchema.safeParse(body)
  if (!validation.success) {
    throw createError({ statusCode: 400, message: validation.error.message })
  }

  const { name, type, primaryFocus, durationWeeks, recoveryWeekIndex, progressionLogic } =
    validation.data

  // Verify ownership and existence
  const existingBlock = await trainingBlockRepository.getById(blockId!, {
    include: {
      plan: { select: { userId: true } },
      weeks: { orderBy: { weekNumber: 'asc' } }
    }
  })

  if (!existingBlock || (existingBlock.plan as any).userId !== user.id) {
    throw createError({ statusCode: 404, message: 'Block not found' })
  }

  return await prisma.$transaction(async (tx) => {
    let finalDuration = existingBlock.durationWeeks

    // Handle Duration Change
    if (durationWeeks !== undefined && durationWeeks !== existingBlock.durationWeeks) {
      const deltaWeeks = durationWeeks - existingBlock.durationWeeks
      const deltaDays = deltaWeeks * 7
      finalDuration = durationWeeks

      if (deltaWeeks > 0) {
        // 1. Add new weeks
        const lastWeek = existingBlock.weeks[existingBlock.weeks.length - 1]
        const targets = calculateWeekTargets(type || existingBlock.type)

        for (let i = 1; i <= deltaWeeks; i++) {
          const newWeekNumber = existingBlock.durationWeeks + i
          const startDate = new Date(lastWeek.endDate)
          startDate.setUTCDate(startDate.getUTCDate() + (i - 1) * 7 + 1)

          const endDate = new Date(startDate)
          endDate.setUTCDate(endDate.getUTCDate() + 6)

          await trainingWeekRepository.create(
            {
              blockId: existingBlock.id,
              weekNumber: newWeekNumber,
              startDate,
              endDate,
              ...targets
            },
            tx
          )
        }
      } else {
        // 2. Remove extra weeks
        const weeksToDelete = existingBlock.weeks.filter((w) => w.weekNumber > durationWeeks)
        const weekIdsToDelete = weeksToDelete.map((w) => w.id)

        if (weekIdsToDelete.length > 0) {
          await tx.plannedWorkout.deleteMany({
            where: {
              trainingWeekId: { in: weekIdsToDelete },
              managedBy: { not: 'USER' }
            }
          })

          await trainingWeekRepository.deleteMany({ id: { in: weekIdsToDelete } }, tx)
        }
      }

      // 3. Shift all subsequent blocks/weeks/workouts
      await shiftPlanDates(planId!, existingBlock.order, deltaDays)
    }

    // Update the block metadata
    const updatedBlock = await trainingBlockRepository.update(
      blockId!,
      {
        name,
        type,
        primaryFocus,
        durationWeeks: finalDuration,
        recoveryWeekIndex,
        progressionLogic
      },
      tx
    )

    return updatedBlock
  })
})
