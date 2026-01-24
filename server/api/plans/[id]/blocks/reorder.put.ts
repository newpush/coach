import { getServerSession } from '../../../../utils/session'
import { prisma } from '../../../../utils/db'
import { trainingPlanRepository } from '../../../../utils/repositories/trainingPlanRepository'
import { trainingBlockRepository } from '../../../../utils/repositories/trainingBlockRepository'
import { z } from 'zod'

const reorderSchema = z.object({
  blocks: z.array(
    z.object({
      id: z.string(),
      order: z.number().int()
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

  const validation = reorderSchema.safeParse(body)
  if (!validation.success) {
    throw createError({ statusCode: 400, message: validation.error.message })
  }

  const { blocks } = validation.data

  const plan = await trainingPlanRepository.getById(planId!, user.id, {
    include: {
      blocks: {
        include: { weeks: true }
      }
    }
  })

  if (!plan) throw createError({ statusCode: 404, message: 'Plan not found' })

  return await prisma.$transaction(async (tx) => {
    // 1. Update Orders
    for (const b of blocks) {
      await trainingBlockRepository.update(b.id, { order: b.order }, tx)
    }

    // 2. Fetch reordered blocks to recalculate dates
    const updatedBlocks = await trainingBlockRepository.list(planId!, {
      orderBy: { order: 'asc' },
      include: {
        weeks: { orderBy: { weekNumber: 'asc' } }
      }
    })

    const currentCursor = new Date(plan.startDate!)

    for (const block of updatedBlocks) {
      const oldStartDate = new Date(block.startDate)
      const newStartDate = new Date(currentCursor)
      const deltaDays = Math.round(
        (newStartDate.getTime() - oldStartDate.getTime()) / (1000 * 60 * 60 * 24)
      )

      if (deltaDays !== 0) {
        const interval = `${deltaDays} days`

        // Update block start date
        await trainingBlockRepository.update(block.id, { startDate: newStartDate }, tx)

        // Update weeks
        await tx.$executeRawUnsafe(
          `UPDATE "TrainingWeek"
           SET "startDate" = "startDate" + interval '${interval}',
               "endDate" = "endDate" + interval '${interval}'
           WHERE "blockId" = $1`,
          block.id
        )

        // Update workouts
        const weekIds = block.weeks.map((w) => w.id)
        if (weekIds.length > 0) {
          await tx.$executeRawUnsafe(
            `UPDATE "PlannedWorkout"
             SET "date" = "date" + interval '${interval}'
             WHERE "trainingWeekId" = ANY($1)`,
            weekIds
          )
        }
      }

      // Move cursor forward by block duration
      currentCursor.setUTCDate(currentCursor.getUTCDate() + block.durationWeeks * 7)
    }

    return { success: true }
  })
})
