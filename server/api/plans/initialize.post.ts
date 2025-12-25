import { prisma } from '../../utils/db'
import { z } from 'zod'
import { tasks } from "@trigger.dev/sdk/v3"

const initializePlanSchema = z.object({
  goalId: z.string(),
  startDate: z.string().datetime(), // ISO string
  volumePreference: z.enum(['LOW', 'MID', 'HIGH']).default('MID'),
  strategy: z.enum(['LINEAR', 'UNDULATING', 'BLOCK', 'POLARIZED']).default('LINEAR')
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const body = await readBody(event)
  const validation = initializePlanSchema.safeParse(body)
  
  if (!validation.success) {
    throw createError({ statusCode: 400, message: validation.error.message })
  }

  const { goalId, startDate, volumePreference, strategy } = validation.data
  const userId = session.user.id
  
  // 1. Fetch Goal to get target date
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: { events: true } // If linked to an event
  })

  if (!goal) {
    throw createError({ statusCode: 404, message: 'Goal not found' })
  }

  let targetDate = goal.targetDate || goal.eventDate
  if (!targetDate && goal.events.length > 0) {
    targetDate = goal.events[0].date
  }

  if (!targetDate) {
    throw createError({ statusCode: 400, message: 'Goal must have a target date' })
  }

  // 2. Calculate Timeline
  const start = new Date(startDate)
  const end = new Date(targetDate)
  const totalWeeks = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 7))

  if (totalWeeks < 4) {
    throw createError({ statusCode: 400, message: 'Plan duration too short (min 4 weeks)' })
  }

  // 3. Define Blocks (Simple Linear Periodization Logic for now)
  // This logic can be moved to a utility function for reuse/testing
  const blocks = calculateBlocks(start, totalWeeks)

  // 4. Create Plan Skeleton
  const plan = await prisma.trainingPlan.create({
    data: {
      userId,
      goalId,
      startDate: start,
      targetDate: end,
      strategy,
      status: 'ACTIVE',
      blocks: {
        create: blocks.map(block => ({
          order: block.order,
          name: block.name,
          type: block.type,
          primaryFocus: block.primaryFocus,
          startDate: block.startDate,
          durationWeeks: block.durationWeeks,
          recoveryWeekIndex: block.recoveryWeekIndex,
          weeks: {
            create: Array.from({ length: block.durationWeeks }).map((_, i) => {
              const weekStart = new Date(block.startDate)
              weekStart.setDate(weekStart.getDate() + (i * 7))
              const weekEnd = new Date(weekStart)
              weekEnd.setDate(weekEnd.getDate() + 6)
              
              const isRecovery = (i + 1) % (block.recoveryWeekIndex || 4) === 0
              
              return {
                weekNumber: i + 1,
                startDate: weekStart,
                endDate: weekEnd,
                isRecovery,
                volumeTargetMinutes: isRecovery ? 300 : 450, // Placeholder
                tssTarget: isRecovery ? 200 : 350 // Placeholder
              }
            })
          }
        }))
      }
    },
    include: {
      blocks: {
        include: {
          weeks: true
        }
      }
    }
  })

  // 5. Trigger generation for the first block
  if (plan.blocks.length > 0) {
    const firstBlock = plan.blocks[0]
    await tasks.trigger('generate-training-block', {
      userId,
      blockId: firstBlock.id
    })
  }

  return {
    success: true,
    planId: plan.id,
    plan
  }
})

// Helper function to calculate block structure
function calculateBlocks(startDate: Date, totalWeeks: number) {
  const blocks = []
  let currentWeek = 0
  let currentDate = new Date(startDate)

  // Reverse engineer from event date? Or forward from start?
  // Let's go forward for simplicity in this MVP.
  
  // Taper (Last 2 weeks)
  const taperWeeks = 2
  const trainingWeeks = totalWeeks - taperWeeks
  
  // Base / Build Split (Approx 60/40)
  let baseWeeks = Math.floor(trainingWeeks * 0.6)
  let buildWeeks = trainingWeeks - baseWeeks
  
  // Ensure blocks are roughly 4 weeks (3+1)
  // Logic: Fill Base blocks
  let order = 1
  
  // Base Phase
  while (baseWeeks > 0) {
    const duration = baseWeeks >= 6 ? 4 : baseWeeks // Prefer 4 week blocks
    blocks.push({
      order: order++,
      name: `Base Phase ${order}`,
      type: 'BASE',
      primaryFocus: 'AEROBIC_ENDURANCE',
      startDate: new Date(currentDate),
      durationWeeks: duration,
      recoveryWeekIndex: 4
    })
    baseWeeks -= duration
    currentDate.setDate(currentDate.getDate() + (duration * 7))
  }

  // Build Phase
  while (buildWeeks > 0) {
    const duration = buildWeeks >= 6 ? 4 : buildWeeks
    blocks.push({
      order: order++,
      name: `Build Phase ${order - blocks.length}`, // e.g. Build 1
      type: 'BUILD',
      primaryFocus: 'THRESHOLD',
      startDate: new Date(currentDate),
      durationWeeks: duration,
      recoveryWeekIndex: 4
    })
    buildWeeks -= duration
    currentDate.setDate(currentDate.getDate() + (duration * 7))
  }

  // Peak/Taper
  blocks.push({
    order: order++,
    name: 'Peak & Taper',
    type: 'PEAK',
    primaryFocus: 'RACE_SPECIFIC',
    startDate: new Date(currentDate),
    durationWeeks: taperWeeks,
    recoveryWeekIndex: 2
  })

  return blocks
}
