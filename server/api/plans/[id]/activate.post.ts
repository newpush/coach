import { prisma } from '../../../utils/db'
import { getServerSession } from '../../../utils/session'
import { tasks } from "@trigger.dev/sdk/v3"

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
  const requestedStartDate = body?.startDate ? new Date(body.startDate) : null
  const startDate = requestedStartDate || new Date()

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
            blockStartDate.setDate(blockStartDate.getDate() + (weeksBefore * 7))

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
                  weekStartDate.setDate(weekStartDate.getDate() + ((week.weekNumber - 1) * 7))
                  const weekEndDate = new Date(weekStartDate)
                  weekEndDate.setDate(weekEndDate.getDate() + 6)

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
                        workoutDate.setDate(workoutDate.getDate() + Math.round(dayOfWeek))

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
      ...(requestedStartDate ? { startDate: requestedStartDate } : {})
    }
  })

  // 4. Trigger Generation for First Block (only for DRAFT plans that were generated empty)
  if (plan.blocks.length > 0 && !plan.isTemplate) {
    const firstBlock = plan.blocks[0]
    await tasks.trigger('generate-training-block', {
      userId,
      blockId: firstBlock.id
    })
  }

  return { success: true }
})
