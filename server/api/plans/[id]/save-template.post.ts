import { getServerSession } from '../../../utils/session'
import { prisma } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const userId = session.user.id
  const planId = event.context.params?.id
  const body = await readBody(event)
  const { name, description } = body

  if (!planId) {
    throw createError({ statusCode: 400, message: 'Plan ID required' })
  }
  
  if (!name) {
    throw createError({ statusCode: 400, message: 'Template name required' })
  }

  // 1. Fetch original plan with full hierarchy
  const plan = await (prisma as any).trainingPlan.findUnique({
    where: { id: planId },
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

  if (!plan) {
    throw createError({ statusCode: 404, message: 'Plan not found' })
  }

  if (plan.userId !== userId) {
    throw createError({ statusCode: 403, message: 'Not authorized' })
  }

  const template = await (prisma as any).trainingPlan.create({
    data: {
      userId,
      name,
      description,
      isTemplate: true,
      strategy: plan.strategy,
      status: 'ACTIVE',
    }
  })
  
  // Clone Blocks
  for (const block of plan.blocks) {
    const newBlock = await (prisma as any).trainingBlock.create({
      data: {
        trainingPlanId: template.id,
        order: block.order,
        name: block.name,
        type: block.type,
        primaryFocus: block.primaryFocus,
        startDate: new Date(0), 
        durationWeeks: block.durationWeeks,
        recoveryWeekIndex: block.recoveryWeekIndex,
        progressionLogic: block.progressionLogic
      }
    })
    
    // Clone Weeks
    for (const week of block.weeks) {
      const newWeek = await (prisma as any).trainingWeek.create({
        data: {
          blockId: newBlock.id,
          weekNumber: week.weekNumber,
          startDate: new Date(0),
          endDate: new Date(0),
          volumeTargetMinutes: week.volumeTargetMinutes,
          tssTarget: week.tssTarget,
          isRecovery: week.isRecovery,
          focus: week.focus
        }
      })
      
      // Clone Workouts with relative day of week
      for (const workout of week.workouts) {
        const workoutDate = new Date(workout.date)
        const dayOfWeek = workoutDate.getDay() // 0 = Sunday, 1 = Monday...
        
        await (prisma as any).plannedWorkout.create({
          data: {
            userId,
            trainingWeekId: newWeek.id,
            externalId: `tmpl_${template.id}_${Math.random().toString(36).substr(2, 9)}`,
            date: new Date(dayOfWeek * 24 * 60 * 60 * 1000), // Store relative day as timestamp from epoch
            title: workout.title,
            description: workout.description,
            type: workout.type,
            category: workout.category,
            durationSec: workout.durationSec,
            distanceMeters: workout.distanceMeters,
            tss: workout.tss,
            workIntensity: workout.workIntensity,
            structuredWorkout: workout.structuredWorkout as any,
            completionStatus: 'PENDING'
          }
        })
      }
    }
  }

  return {
    success: true,
    templateId: template.id
  }
})
