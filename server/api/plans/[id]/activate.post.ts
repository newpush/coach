import { prisma } from '../../../utils/db'
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

  const plan = await (prisma as any).trainingPlan.findUnique({
    where: { id: planId },
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

  if (plan.userId !== userId) {
    throw createError({ statusCode: 403, message: 'Forbidden' })
  }

  if (plan.status !== 'DRAFT' && !plan.isTemplate) {
    return { success: true, message: 'Plan is already active or archived' }
  }

  const body = await readBody(event).catch(() => ({}))
  const timezone = await getUserTimezone(userId)

  let startDate: Date
  if (body?.startDate) {
    const raw = new Date(body.startDate)
    // If string was just YYYY-MM-DD, raw is UTC midnight. If ISO with time, it's that time.
    // We want the start of that day in user timezone, UTC normalized.
    // Actually, plan start date is usually a calendar date.
    // If we assume body.startDate is YYYY-MM-DD string:
    // new Date('2026-01-01') -> 2026-01-01T00:00:00Z.
    // getUserLocalDate(timezone) returns UTC-midnight date for today.
    // We should ensure startDate is treated as UTC midnight.
    // getStartOfDayUTC might shift it if we pass a random time.
    // Let's assume it's valid UTC midnight date or convert.
    startDate = new Date(Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate()))
  } else {
    startDate = getUserLocalDate(timezone)
  }

  const anchorWorkoutIds = body?.anchorWorkoutIds || []

  // 1. Archive existing active plans
  await (prisma as any).trainingPlan.updateMany({
    where: {
      userId,
      status: 'ACTIVE',
      id: { not: planId }
    },
    data: {
      status: 'ARCHIVED'
    }
  })

  // 2. Handle Template vs Draft
  if (plan.isTemplate) {
    // Clone the template into a new ACTIVE plan
    const newPlan = await (prisma as any).trainingPlan.create({
      data: {
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
      },
      include: {
        blocks: {
          include: {
            weeks: {
              include: {
                workouts: true
              }
            }
          }
        }
      }
    })

    return { success: true, planId: newPlan.id }
  }

  // 3. Activate existing DRAFT Plan
  await (prisma as any).trainingPlan.update({
    where: { id: planId },
    data: {
      status: 'ACTIVE',
      ...(body?.startDate ? { startDate: startDate } : {})
    }
  })

  // 3.5 Unlink Anchored Workouts
  // This ensures they become "Independent" and visible in the new plan dashboard,
  // and protects them from being hidden in archived plans.
  if (anchorWorkoutIds.length > 0) {
    await (prisma as any).plannedWorkout.updateMany({
      where: { id: { in: anchorWorkoutIds } },
      data: { trainingWeekId: null }
    })
  }

  // 4. Trigger Generation for First Block (only for DRAFT plans that were generated empty)
  if (plan.blocks.length > 0 && !plan.isTemplate) {
    const firstBlock = plan.blocks[0]
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
