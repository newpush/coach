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
  const plan = await prisma.trainingPlan.findUnique({
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

  // 2. Clone structure
  // We create a new TrainingPlan with isTemplate = true
  // We copy blocks, weeks, and workouts.
  // Note: We do NOT set dates for templates, or we set relative days?
  // Current schema uses 'date' for PlannedWorkout which is absolute.
  // For a template, we ideally want 'dayOffset' or similar. 
  // However, refactoring PlannedWorkout to support relative scheduling is a big task.
  // A simpler approach for V1:
  // - When saving as template, we ignore dates or store them as-is (they act as relative if we normalize start date to 0).
  // - But 'date' is DateTime.
  // - Maybe we just don't create PlannedWorkouts for templates yet?
  // - But then we lose the workout details.
  // 
  // Alternative: We store the structure as JSON in `description` or a new field?
  // Or we create the entities but with a dummy date (e.g. 1970-01-01 + offset).
  
  // Let's use the 1970-01-01 approach for relative dates in templates.
  // Or better: Use the existing absolute dates but when instantiating, calculate the diff.
  // But wait, if the plan is 12 weeks, the dates span 12 weeks.
  
  // Let's create the Template Plan.
  
  const template = await prisma.trainingPlan.create({
    data: {
      userId,
      name,
      description,
      isTemplate: true,
      strategy: plan.strategy,
      status: 'ACTIVE', // Templates are active
      // No goalId, no startDate, no targetDate
    }
  })
  
  // Clone Blocks
  for (const block of plan.blocks) {
    const newBlock = await prisma.trainingBlock.create({
      data: {
        trainingPlanId: template.id,
        order: block.order,
        name: block.name,
        type: block.type,
        primaryFocus: block.primaryFocus,
        startDate: new Date(0), // Dummy
        durationWeeks: block.durationWeeks,
        recoveryWeekIndex: block.recoveryWeekIndex,
        progressionLogic: block.progressionLogic
      }
    })
    
    // Clone Weeks
    for (const week of block.weeks) {
      const newWeek = await prisma.trainingWeek.create({
        data: {
          blockId: newBlock.id,
          weekNumber: week.weekNumber,
          startDate: new Date(0), // Dummy
          endDate: new Date(0), // Dummy
          volumeTargetMinutes: week.volumeTargetMinutes,
          tssTarget: week.tssTarget,
          isRecovery: week.isRecovery,
          focus: week.focus
        }
      })
      
      // Clone Workouts
      // We need to preserve the "day of week" or relative timing.
      // We can calculate offset from block start?
      // Or just copy properties and let instantiation handle dates.
      
      for (const workout of week.workouts) {
        // Calculate day offset within the week?
        // workout.date
        
        await prisma.plannedWorkout.create({
          data: {
            userId,
            trainingWeekId: newWeek.id,
            externalId: `tmpl_${template.id}_${Math.random().toString(36).substr(2, 9)}`, // Generate unique ID
            date: new Date(0), // Dummy date, we'll rely on week structure + index or similar
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
