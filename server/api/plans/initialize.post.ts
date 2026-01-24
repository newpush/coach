import { prisma } from '../../utils/db'
import { z } from 'zod'
import { tasks } from '@trigger.dev/sdk/v3'
import { getServerSession } from '../../utils/session'
import { getUserTimezone, getUserLocalDate, getStartOfDayUTC } from '../../utils/date'

const initializePlanSchema = z.object({
  goalId: z.string(),
  startDate: z.string().datetime(), // ISO string
  endDate: z.string().datetime().optional(), // ISO string
  volumePreference: z.enum(['LOW', 'MID', 'HIGH']).default('MID'),
  volumeHours: z.number().optional(),
  strategy: z
    .enum(['LINEAR', 'UNDULATING', 'BLOCK', 'POLARIZED', 'REVERSE', 'MAINTENANCE'])
    .default('LINEAR'),
  preferredActivityTypes: z.array(z.string()).default(['Ride']),
  customInstructions: z.string().optional()
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

  const {
    goalId,
    startDate,
    endDate,
    volumePreference,
    volumeHours,
    strategy,
    preferredActivityTypes,
    customInstructions
  } = validation.data
  const userId = (session.user as any).id

  // 1. Fetch Goal to get target date
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: { events: true } // If linked to an event
  })

  if (!goal) {
    throw createError({ statusCode: 404, message: 'Goal not found' })
  }

  let targetDate = endDate ? new Date(endDate) : goal.targetDate || goal.eventDate
  if (!targetDate && goal.events.length > 0 && goal.events[0] && !endDate) {
    targetDate = goal.events[0].date
  }

  if (!targetDate) {
    throw createError({ statusCode: 400, message: 'Goal must have a target date' })
  }

  // 2. Calculate Timeline
  // Force start date to UTC midnight of the calendar day
  const timezone = await getUserTimezone(userId)
  const start = getUserLocalDate(timezone, new Date(startDate))

  const end = new Date(targetDate)
  const totalWeeks = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 7))

  if (totalWeeks < 4) {
    throw createError({ statusCode: 400, message: 'Plan duration too short (min 4 weeks)' })
  }

  // 4. Define Blocks
  const blocks = calculateBlocks(start, totalWeeks, strategy, goal)

  // 5. Create Plan Skeleton
  const plan = await prisma.trainingPlan.create({
    data: {
      userId,
      goalId,
      startDate: start,
      targetDate: end,
      strategy,
      status: 'DRAFT',
      activityTypes: preferredActivityTypes,
      customInstructions,
      blocks: {
        create: blocks.map((block) => ({
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
              weekStart.setUTCDate(weekStart.getUTCDate() + i * 7)
              const weekEnd = new Date(weekStart)
              weekEnd.setUTCDate(weekEnd.getUTCDate() + 6)

              const isRecovery = (i + 1) % (block.recoveryWeekIndex || 4) === 0

              // Determine target volume
              let targetMinutes = 450 // Default MID
              if (volumeHours) {
                targetMinutes = volumeHours * 60
                if (isRecovery) targetMinutes = Math.round(targetMinutes * 0.6) // 60% volume on recovery weeks
              } else {
                // Fallback to bucket logic
                if (volumePreference === 'LOW') targetMinutes = 240
                else if (volumePreference === 'HIGH') targetMinutes = 600

                if (isRecovery) targetMinutes = Math.round(targetMinutes * 0.6)
              }

              // Default TSS estimation (0.6 IF avg => 36 TSS/hr)
              const tssTarget = Math.round((targetMinutes / 60) * 50)

              return {
                weekNumber: i + 1,
                startDate: weekStart,
                endDate: weekEnd,
                isRecovery,
                volumeTargetMinutes: targetMinutes,
                tssTarget: tssTarget
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

  return {
    success: true,
    planId: plan.id,
    plan
  }
})

// Helper function to calculate block structure
function calculateBlocks(startDate: Date, totalWeeks: number, strategy: string, goal?: any) {
  const blocks = []
  const currentDate = new Date(startDate)

  // 1. Analyze Event Demands
  const event = goal?.events?.[0]
  let buildFocus = 'THRESHOLD' // Default
  let peakFocus = 'RACE_SPECIFIC'

  if (event) {
    // Terrain / Event Type Analysis
    if (event.terrain === 'Mountainous' || (event.elevation && event.elevation > 2000)) {
      buildFocus = 'SWEET_SPOT' // Focus on Muscular Endurance for long climbs
    } else if (['Criterium', 'Cyclocross', 'MTB (XC)'].includes(event.subType)) {
      buildFocus = 'VO2_MAX' // Focus on high intensity repeatability
      peakFocus = 'ANAEROBIC_CAPACITY'
    } else if (event.expectedDuration && event.expectedDuration > 6) {
      buildFocus = 'TEMPO' // Focus on efficiency and fatigue resistance
    }
  }

  // 2. Strategy Logic
  if (strategy === 'BLOCK') {
    // Block Periodization: Concentrated loads (shorter blocks)
    // Structure: Accumulation (High Vol) -> Transmutation (High Int) -> Realization (Taper)
    // Typically 2-3 week blocks with high focus

    // Taper
    const taperWeeks = 2
    const workingWeeks = totalWeeks - taperWeeks

    // 3-week blocks are standard for "Block" style
    const blockDuration = 3
    let remainingWeeks = workingWeeks
    let order = 1

    // General Preparation (Aerobic)
    if (remainingWeeks > 6) {
      const baseWeeks = Math.floor(remainingWeeks * 0.4)
      const numBlocks = Math.ceil(baseWeeks / blockDuration)
      for (let i = 0; i < numBlocks; i++) {
        const weeks = Math.min(blockDuration, remainingWeeks)
        blocks.push({
          order: order++,
          name: `Accumulation ${i + 1}`,
          type: 'BASE',
          primaryFocus: 'AEROBIC_ENDURANCE',
          startDate: new Date(currentDate),
          durationWeeks: weeks,
          recoveryWeekIndex: 3 // Recovery every 3rd week in Block usually means 2 ON / 1 OFF or 3 ON / 1 OFF. Let's do 3 week blocks where last week is lighter? No, Block is usually continuous. Let's stick to 3:1 rhythm for simplicity or 2:1.
        })
        currentDate.setUTCDate(currentDate.getUTCDate() + weeks * 7)
        remainingWeeks -= weeks
      }
    }

    // Specific (Intensity)
    while (remainingWeeks > 0) {
      const weeks = Math.min(blockDuration, remainingWeeks)
      blocks.push({
        order: order++,
        name: `Transmutation ${Math.ceil(order / 2)}`,
        type: 'BUILD',
        primaryFocus: buildFocus,
        startDate: new Date(currentDate),
        durationWeeks: weeks,
        recoveryWeekIndex: 3
      })
      currentDate.setUTCDate(currentDate.getUTCDate() + weeks * 7)
      remainingWeeks -= weeks
    }

    // Taper
    blocks.push({
      order: order++,
      name: 'Realization',
      type: 'PEAK',
      primaryFocus: peakFocus,
      startDate: new Date(currentDate),
      durationWeeks: taperWeeks,
      recoveryWeekIndex: 2
    })
  } else if (strategy === 'UNDULATING') {
    // Undulating: Mixes intensities within the week, flat progression
    // Logic: Similar block structure to Linear, but the 'Focus' passed to AI will trigger mixed workouts
    // We handle this mainly in the Prompt later, but structure is similar to Linear

    const taperWeeks = 2
    const trainingWeeks = totalWeeks - taperWeeks

    // Even split
    const phase1 = Math.floor(trainingWeeks / 2)
    const phase2 = trainingWeeks - phase1

    let order = 1

    blocks.push({
      order: order++,
      name: 'General Phase',
      type: 'BASE',
      primaryFocus: 'MIXED', // Prompt will interpret this as DUP
      startDate: new Date(currentDate),
      durationWeeks: phase1,
      recoveryWeekIndex: 4
    })
    currentDate.setUTCDate(currentDate.getUTCDate() + phase1 * 7)

    blocks.push({
      order: order++,
      name: 'Specific Phase',
      type: 'BUILD',
      primaryFocus: buildFocus, // Specific focus for event
      startDate: new Date(currentDate),
      durationWeeks: phase2,
      recoveryWeekIndex: 4
    })
    currentDate.setUTCDate(currentDate.getUTCDate() + phase2 * 7)

    blocks.push({
      order: order++,
      name: 'Taper',
      type: 'PEAK',
      primaryFocus: 'RACE_SPECIFIC',
      startDate: new Date(currentDate),
      durationWeeks: taperWeeks,
      recoveryWeekIndex: 2
    })
  } else if (strategy === 'REVERSE') {
    // Reverse Periodization: Build (Speed) -> Base (Endurance) -> Peak (Specific)
    // Common for long-distance events (Ironman, Ultras)
    const taperWeeks = 2
    const trainingWeeks = totalWeeks - taperWeeks

    let buildWeeks = Math.floor(trainingWeeks * 0.4)
    let baseWeeks = trainingWeeks - buildWeeks
    let order = 1
    let buildCount = 1
    let baseCount = 1

    // Build Phase first (Intensity)
    while (buildWeeks > 0) {
      const duration = buildWeeks >= 6 ? 4 : buildWeeks
      blocks.push({
        order: order++,
        name: `Build Phase ${buildCount++}`,
        type: 'BUILD',
        primaryFocus: buildFocus,
        startDate: new Date(currentDate),
        durationWeeks: duration,
        recoveryWeekIndex: 4
      })
      buildWeeks -= duration
      currentDate.setUTCDate(currentDate.getUTCDate() + duration * 7)
    }

    // Base Phase second (Aerobic Specificity)
    while (baseWeeks > 0) {
      const duration = baseWeeks >= 6 ? 4 : baseWeeks
      blocks.push({
        order: order++,
        name: `Base Phase ${baseCount++}`,
        type: 'BASE',
        primaryFocus: 'AEROBIC_ENDURANCE',
        startDate: new Date(currentDate),
        durationWeeks: duration,
        recoveryWeekIndex: 4
      })
      baseWeeks -= duration
      currentDate.setUTCDate(currentDate.getUTCDate() + duration * 7)
    }

    // Peak/Taper
    blocks.push({
      order: order++,
      name: 'Peak & Taper',
      type: 'PEAK',
      primaryFocus: peakFocus,
      startDate: new Date(currentDate),
      durationWeeks: taperWeeks,
      recoveryWeekIndex: 2
    })
  } else if (strategy === 'MAINTENANCE') {
    // Maintenance: Continuous Base/Tempo load, no tapering
    let remainingWeeks = totalWeeks
    let order = 1
    let count = 1

    while (remainingWeeks > 0) {
      const duration = remainingWeeks >= 6 ? 4 : remainingWeeks
      blocks.push({
        order: order++,
        name: `Maintenance Phase ${count++}`,
        type: 'BASE',
        primaryFocus: 'SWEET_SPOT',
        startDate: new Date(currentDate),
        durationWeeks: duration,
        recoveryWeekIndex: 4
      })
      remainingWeeks -= duration
      currentDate.setUTCDate(currentDate.getUTCDate() + duration * 7)
    }
  } else {
    // Default: LINEAR / POLARIZED
    // (Polarized structure is same as Linear, just intensity distribution differs in execution)

    const taperWeeks = 2
    const trainingWeeks = totalWeeks - taperWeeks

    // Base / Build Split (Approx 60/40)
    let baseWeeks = Math.floor(trainingWeeks * 0.6)
    let buildWeeks = trainingWeeks - baseWeeks

    let order = 1
    let baseCount = 1
    let buildCount = 1

    // Base Phase
    while (baseWeeks > 0) {
      const duration = baseWeeks >= 6 ? 4 : baseWeeks
      blocks.push({
        order: order++,
        name: `Base Phase ${baseCount++}`,
        type: 'BASE',
        primaryFocus: strategy === 'POLARIZED' ? 'AEROBIC_ENDURANCE' : 'SWEET_SPOT', // Polarized is stricter Z2
        startDate: new Date(currentDate),
        durationWeeks: duration,
        recoveryWeekIndex: 4
      })
      baseWeeks -= duration
      currentDate.setUTCDate(currentDate.getUTCDate() + duration * 7)
    }

    // Build Phase
    while (buildWeeks > 0) {
      const duration = buildWeeks >= 6 ? 4 : buildWeeks
      blocks.push({
        order: order++,
        name: `Build Phase ${buildCount++}`,
        type: 'BUILD',
        primaryFocus: buildFocus,
        startDate: new Date(currentDate),
        durationWeeks: duration,
        recoveryWeekIndex: 4
      })
      buildWeeks -= duration
      currentDate.setUTCDate(currentDate.getUTCDate() + duration * 7)
    }

    // Peak/Taper
    blocks.push({
      order: order++,
      name: 'Peak & Taper',
      type: 'PEAK',
      primaryFocus: peakFocus,
      startDate: new Date(currentDate),
      durationWeeks: taperWeeks,
      recoveryWeekIndex: 2
    })
  }

  // 2.5 Clean up names: if only one block of a certain name exists, remove the number
  const nameCounts: Record<string, number> = {}
  for (const b of blocks) {
    const baseName = b.name.replace(/ \d+$/, '')
    nameCounts[baseName] = (nameCounts[baseName] || 0) + 1
  }

  for (const b of blocks) {
    const baseName = b.name.replace(/ \d+$/, '')
    if (nameCounts[baseName] === 1) {
      b.name = baseName
    }
  }

  // 3. Tag blocks with events
  if (goal?.events && goal.events.length > 0) {
    for (const block of blocks) {
      const blockStart = block.startDate.getTime()
      const blockEnd = blockStart + block.durationWeeks * 7 * 24 * 60 * 60 * 1000

      const eventsInBlock = goal.events.filter((e: any) => {
        const eDate = new Date(e.date).getTime()
        // Check if event is within this block's window
        return eDate >= blockStart && eDate < blockEnd
      })

      if (eventsInBlock.length > 0) {
        // Sort by priority or date
        // Just take the first one or join names
        const eventNames = eventsInBlock.map((e: any) => e.title).join(', ')

        // Update block metadata to inform AI
        block.name += ` [Race: ${eventNames}]`

        // If this isn't the final Peak block, marking it as having a race
        // allows the AI (in generate-training-block) to schedule a mini-taper
        if (block.type !== 'PEAK') {
          block.primaryFocus += '_WITH_RACE'
        }
      }
    }
  }

  return blocks
}
