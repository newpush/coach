import { prisma } from '../../../../utils/db'
import { getServerSession } from '../../../../utils/session'
import { z } from 'zod'

const moveSchema = z.object({
  targetDate: z.string().datetime()
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const workoutId = getRouterParam(event, 'id')
  const body = await readBody(event)
  const validation = moveSchema.safeParse(body)

  if (!validation.success) {
    throw createError({ statusCode: 400, message: 'Invalid target date' })
  }

  const targetDate = new Date(validation.data.targetDate)
  const userId = session.user.id

  // 1. Fetch Source Workout
  const sourceWorkout = await prisma.plannedWorkout.findUnique({
    where: { id: workoutId }
  })

  if (!sourceWorkout || sourceWorkout.userId !== userId) {
    throw createError({ statusCode: 404, message: 'Workout not found' })
  }

  // 2. Check for Target Workout on that date
  // We look for a workout in the same training week? Or just any planned workout for the user on that date?
  // Usually, a user can only have one primary planned workout per day in this system context?
  // Let's assume we are swapping within the plan structure.

  // We should constrain by the same training plan context to be safe, but simple date check is robust enough for now.
  // We check for "PlannedWorkout" on that date.

  // To align dates perfectly (ignoring time if stored as datetime but logically date), we might need range or exact match.
  // The schema says `date DateTime @db.Date`. So Prisma handles it as midnight UTC usually.
  // Let's ensure targetDate is normalized.

  // Find conflicting workout
  const conflictingWorkout = await prisma.plannedWorkout.findFirst({
    where: {
      userId,
      date: targetDate,
      id: { not: workoutId } // Exclude self
    }
  })

  await prisma.$transaction(async (tx) => {
    if (conflictingWorkout) {
      // Swap!
      // Move conflict to source's date
      await tx.plannedWorkout.update({
        where: { id: conflictingWorkout.id },
        data: { date: sourceWorkout.date }
      })
    }

    // Move source to target
    await tx.plannedWorkout.update({
      where: { id: workoutId },
      data: { date: targetDate }
    })
  })

  return { success: true }
})
