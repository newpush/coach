import { trainingPlanRepository } from '../../../utils/repositories/trainingPlanRepository'
import { trainingBlockRepository } from '../../../utils/repositories/trainingBlockRepository'
import { plannedWorkoutRepository } from '../../../utils/repositories/plannedWorkoutRepository'
import { getServerSession } from '../../../utils/session'
import { tasks } from '@trigger.dev/sdk/v3'
import { getUserTimezone, getUserLocalDate, getStartOfDayUTC } from '../../../utils/date'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const planId = getRouterParam(event, 'id')
  const userId = (session.user as any).id

  if (!planId) throw createError({ statusCode: 400, message: 'Plan ID required' })

  const plan = await trainingPlanRepository.getById(planId, userId, {
    include: {
      blocks: {
        orderBy: { order: 'asc' },
        include: {
          weeks: {
            orderBy: { weekNumber: 'asc' },
            include: {
              workouts: true
            }
          }
        }
      }
    }
  })

  if (!plan) {
    throw createError({ statusCode: 404, message: 'Plan not found' })
  }

  if (plan.status !== 'DRAFT' && !plan.isTemplate) {
    return { success: true, message: 'Plan is already active or archived' }
  }

  const body = await readBody(event).catch(() => ({}))
  const timezone = await getUserTimezone(userId)

  let startDate: Date
  if (body?.startDate) {
    const raw = new Date(body.startDate)
    startDate = new Date(Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate()))
  } else {
    startDate = getUserLocalDate(timezone)
  }

  const anchorWorkoutIds = body?.anchorWorkoutIds || []

  // 1. Archive existing active plans and cleanup their workouts
  const activePlans = await trainingPlanRepository.list(userId, { status: 'ACTIVE' })
  const plansToArchive = activePlans.filter((p) => p.id !== planId)

  for (const p of plansToArchive) {
    await trainingPlanRepository.cleanupWorkouts(userId, p.id, startDate)
  }

  await trainingPlanRepository.archiveAllExcept(userId, planId)

  // 2. Handle Template vs Draft
  if (plan.isTemplate) {
    // Clone the template into a new ACTIVE plan
    const newPlan = await trainingPlanRepository.create({
      userId,
      goalId: plan.goalId,
      name: plan.name ? `${plan.name} (Active)` : 'New Plan from Template',
      description: plan.description,
      strategy: plan.strategy,
      status: 'ACTIVE',
      startDate: startDate,
      targetDate: plan.targetDate,
      blocks: {
        create: plan.blocks.map((block: any) => {
          const blockStartDate = new Date(startDate)
          // Calculate block start based on cumulative weeks of previous blocks
          let weeksBefore = 0
          for (const b of plan.blocks) {
            if (b.order < block.order) weeksBefore += b.durationWeeks
          }
          blockStartDate.setUTCDate(blockStartDate.getUTCDate() + weeksBefore * 7)

          return {
            order: block.order,
            name: block.name,
            type: block.type,
            primaryFocus: block.primaryFocus,
            startDate: blockStartDate,
            durationWeeks: block.durationWeeks,
            recoveryWeekIndex: block.recoveryWeekIndex,
            weeks: {
              create: block.weeks.map((week: any) => {
                const weekStartDate = new Date(blockStartDate)
                weekStartDate.setUTCDate(weekStartDate.getUTCDate() + (week.weekNumber - 1) * 7)
                const weekEndDate = new Date(weekStartDate)
                weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6)

                return {
                  weekNumber: week.weekNumber,
                  startDate: weekStartDate,
                  endDate: weekEndDate,
                  volumeTargetMinutes: week.volumeTargetMinutes,
                  tssTarget: week.tssTarget,
                  isRecovery: week.isRecovery,
                  focus: week.focus,
                  workouts: {
                    create: week.workouts.map((workout: any) => {
                      // date in template stores relative day of week as epoch offset
                      const dayOfWeek = new Date(workout.date).getTime() / (24 * 60 * 60 * 1000)
                      const workoutDate = new Date(weekStartDate)
                      workoutDate.setUTCDate(workoutDate.getUTCDate() + Math.round(dayOfWeek))

                      return {
                        userId,
                        externalId: `plan_${Math.random().toString(36).substr(2, 9)}`,
                        date: workoutDate,
                        title: workout.title,
                        description: workout.description,
                        type: workout.type,
                        category: workout.category,
                        durationSec: workout.durationSec,
                        distanceMeters: workout.distanceMeters,
                        tss: workout.tss,
                        workIntensity: workout.workIntensity,
                        structuredWorkout: workout.structuredWorkout,
                        completionStatus: 'PENDING'
                      }
                    })
                  }
                }
              })
            }
          }
        })
      }
    })

    return { success: true, planId: newPlan.id }
  }

  // 3. Activate existing DRAFT Plan
  await trainingPlanRepository.update(planId, userId, {
    status: 'ACTIVE',
    ...(body?.startDate ? { startDate: startDate } : {})
  })

  // 3.5 Unlink Anchored Workouts
  if (anchorWorkoutIds.length > 0) {
    await prisma.plannedWorkout.updateMany({
      where: { id: { in: anchorWorkoutIds } },
      data: { trainingWeekId: null }
    })
  }

  // 4. Trigger Generation for First Block
  if (plan.blocks.length > 0 && !plan.isTemplate) {
    const firstBlock = plan.blocks[0]!
    await tasks.trigger(
      'generate-training-block',
      {
        userId,
        blockId: firstBlock.id,
        anchorWorkoutIds
      },
      {
        tags: [`user:${userId}`]
      }
    )
  }

  return { success: true }
})
