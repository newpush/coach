import { prisma } from './db'

/**
 * Shifts the dates of blocks, weeks, and workouts in a plan.
 * Used when a block's duration changes or a block is added/deleted.
 *
 * @param planId The ID of the training plan
 * @param fromOrder The block order to start shifting from (exclusive)
 * @param daysDelta The number of days to shift (positive or negative)
 */
export async function shiftPlanDates(planId: string, fromOrder: number, daysDelta: number) {
  if (daysDelta === 0) return

  const interval = `${daysDelta} days`

  // 1. Shift subsequent TrainingBlocks
  await prisma.$executeRawUnsafe(
    `UPDATE "TrainingBlock" 
     SET "startDate" = "startDate" + interval '${interval}'
     WHERE "trainingPlanId" = $1 AND "order" > $2`,
    planId,
    fromOrder
  )

  // 2. Shift weeks within those blocks
  // First get the IDs of the blocks being shifted
  const shiftedBlocks = await prisma.trainingBlock.findMany({
    where: {
      trainingPlanId: planId,
      order: { gt: fromOrder }
    },
    select: { id: true }
  })
  const shiftedBlockIds = shiftedBlocks.map((b) => b.id)

  if (shiftedBlockIds.length > 0) {
    await prisma.$executeRawUnsafe(
      `UPDATE "TrainingWeek"
       SET "startDate" = "startDate" + interval '${interval}',
           "endDate" = "endDate" + interval '${interval}'
       WHERE "blockId" = ANY($1)`,
      shiftedBlockIds
    )

    // 3. Shift workouts within those weeks
    const shiftedWeeks = await prisma.trainingWeek.findMany({
      where: {
        blockId: { in: shiftedBlockIds }
      },
      select: { id: true }
    })
    const shiftedWeekIds = shiftedWeeks.map((w) => w.id)

    if (shiftedWeekIds.length > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE "PlannedWorkout"
         SET "date" = "date" + interval '${interval}'
         WHERE "trainingWeekId" = ANY($1)`,
        shiftedWeekIds
      )
    }
  }
}

/**
 * Calculates and updates targets for a week (Volume, TSS).
 * Simple heuristic for now.
 */
export function calculateWeekTargets(blockType: string, volumePreference: string = 'MID') {
  // Determine target volume
  let targetMinutes = 450 // Default MID
  if (volumePreference === 'LOW') targetMinutes = 240
  else if (volumePreference === 'HIGH') targetMinutes = 600

  // Default TSS estimation (0.6 IF avg => 36 TSS/hr)
  const tssTarget = Math.round((targetMinutes / 60) * 50)

  return {
    volumeTargetMinutes: targetMinutes,
    tssTarget: tssTarget
  }
}
