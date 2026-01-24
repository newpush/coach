import { prisma } from '../db'
import { calculateWeekTargets } from '../plan-logic'
import { trainingPlanRepository } from '../repositories/trainingPlanRepository'
import { trainingBlockRepository } from '../repositories/trainingBlockRepository'
import { trainingWeekRepository } from '../repositories/trainingWeekRepository'

export const planService = {
  /**
   * Declaratively replans the structure of a training plan.
   * Handles adding, deleting, updating blocks and reflowing all dates.
   */
  async replanStructure(userId: string, planId: string, newBlockConfigs: any[]) {
    const plan = await trainingPlanRepository.getById(planId, userId, {
      include: {
        blocks: {
          include: { weeks: true }
        }
      }
    })

    if (!plan) throw new Error('Plan not found')

    return await prisma.$transaction(async (tx) => {
      // 1. Delete blocks that are no longer in the plan
      const newBlockIds = new Set(
        newBlockConfigs.map((b) => b.id).filter((id) => id && !id.startsWith('new-'))
      )
      const blocksToDelete = plan.blocks.filter((b) => !newBlockIds.has(b.id))

      for (const block of blocksToDelete) {
        const weekIds = (block as any).weeks.map((w: any) => w.id)
        if (weekIds.length > 0) {
          await tx.plannedWorkout.deleteMany({
            where: {
              trainingWeekId: { in: weekIds },
              managedBy: { not: 'USER' }
            }
          })
        }
        await trainingBlockRepository.delete(block.id, tx)
      }

      // 2. Process and Order Blocks
      const currentCursor = new Date(plan.startDate!)

      for (const config of newBlockConfigs) {
        let blockId = config.id
        const isNew = !blockId || blockId.startsWith('new-')

        let block: any
        const blockStartDate = new Date(currentCursor)

        if (isNew) {
          block = await trainingBlockRepository.create(
            {
              trainingPlanId: planId,
              name: config.name,
              type: config.type,
              primaryFocus: config.primaryFocus,
              durationWeeks: config.durationWeeks,
              order: config.order,
              startDate: blockStartDate,
              recoveryWeekIndex: config.recoveryWeekIndex,
              progressionLogic: config.progressionLogic
            },
            tx
          )
          blockId = block.id
        } else {
          block = await trainingBlockRepository.update(
            blockId,
            {
              name: config.name,
              type: config.type,
              primaryFocus: config.primaryFocus,
              durationWeeks: config.durationWeeks,
              order: config.order,
              startDate: blockStartDate,
              recoveryWeekIndex: config.recoveryWeekIndex,
              progressionLogic: config.progressionLogic
            },
            tx
          )
        }

        // 3. Handle Weeks for this block
        const existingBlock = plan.blocks.find((b) => b.id === blockId)
        const existingWeeks = isNew ? [] : (existingBlock as any)?.weeks || []
        const oldDuration = existingWeeks.length
        const newDuration = config.durationWeeks

        if (newDuration > oldDuration) {
          const targets = calculateWeekTargets(config.type)
          for (let i = oldDuration + 1; i <= newDuration; i++) {
            const weekStart = new Date(blockStartDate)
            weekStart.setUTCDate(weekStart.getUTCDate() + (i - 1) * 7)
            const weekEnd = new Date(weekStart)
            weekEnd.setUTCDate(weekEnd.getUTCDate() + 6)

            await trainingWeekRepository.create(
              {
                blockId: blockId!,
                weekNumber: i,
                startDate: weekStart,
                endDate: weekEnd,
                ...targets
              },
              tx
            )
          }
        } else if (newDuration < oldDuration) {
          const weeksToDelete = existingWeeks.filter((w: any) => w.weekNumber > newDuration)
          const weekIdsToDelete = weeksToDelete.map((w: any) => w.id)
          if (weekIdsToDelete.length > 0) {
            await tx.plannedWorkout.deleteMany({
              where: { trainingWeekId: { in: weekIdsToDelete }, managedBy: { not: 'USER' } }
            })
            await trainingWeekRepository.deleteMany({ id: { in: weekIdsToDelete } }, tx)
          }
        }

        // 4. Reflow Existing Weeks and Workouts Dates
        if (!isNew) {
          const originalBlock = plan.blocks.find((b) => b.id === blockId)!
          const interval = Math.round(
            (blockStartDate.getTime() - new Date(originalBlock.startDate).getTime()) /
              (1000 * 60 * 60 * 24)
          )
          const intervalStr = `${interval} days`

          if (interval !== 0) {
            await tx.$executeRawUnsafe(
              `UPDATE "TrainingWeek"
               SET "startDate" = "startDate" + interval '${intervalStr}',
                   "endDate" = "endDate" + interval '${intervalStr}'
               WHERE "blockId" = $1`,
              blockId
            )

            const weekIds = (originalBlock as any).weeks.map((w: any) => w.id)
            if (weekIds.length > 0) {
              await tx.$executeRawUnsafe(
                `UPDATE "PlannedWorkout"
                 SET "date" = "date" + interval '${intervalStr}'
                 WHERE "trainingWeekId" = ANY($1)`,
                weekIds
              )
            }
          }
        }

        // Move cursor
        currentCursor.setUTCDate(currentCursor.getUTCDate() + config.durationWeeks * 7)
      }

      // 5. Update Plan End Date
      await trainingPlanRepository.update(planId, userId, { targetDate: currentCursor })

      return { success: true }
    })
  }
}
