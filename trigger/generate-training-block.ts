import './init'
import { logger, task } from '@trigger.dev/sdk/v3'
import { generateStructuredAnalysis } from '../server/utils/gemini'
import { prisma } from '../server/utils/db'
import { userReportsQueue } from './queues'
import {
  getUserTimezone,
  getStartOfDaysAgoUTC,
  getStartOfDayUTC,
  formatUserDate,
  getUserLocalDate,
  formatDateUTC,
  calculateAge
} from '../server/utils/date'
import { getCurrentFitnessSummary } from '../server/utils/training-stress'
import { getUserAiSettings } from '../server/utils/ai-settings'
import { TRAINING_BLOCK_TYPES, TRAINING_BLOCK_FOCUSES } from '../app/utils/training-constants'

const trainingBlockSchema = {
  type: 'object',
  properties: {
    weeks: {
      type: 'array',
      description: 'List of training weeks in this block',
      items: {
        type: 'object',
        properties: {
          weekNumber: { type: 'integer', description: '1-based index within the block' },
          focus_key: {
            type: 'string',
            description: 'Standardized key (e.g. AEROBIC_ENDURANCE, RECOVERY, VO2_MAX)'
          },
          focus_label: {
            type: 'string',
            description: 'User-facing label (e.g. "Aerobic Endurance & Skills")'
          },
          explanation: {
            type: 'string',
            description: 'Reasoning for this week structure and focus'
          },
          volumeTargetMinutes: { type: 'integer' },
          workouts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                dayOfWeek: { type: 'integer', description: '0=Sunday, 1=Monday, ..., 6=Saturday' },
                title: { type: 'string', description: "Workout title (e.g. '3x10m Sweet Spot')" },
                description: {
                  type: 'string',
                  description: 'Brief description of the workout goal'
                },
                type: {
                  type: 'string',
                  enum: ['Ride', 'Run', 'Swim', 'Gym', 'Rest', 'Active Recovery']
                },
                durationMinutes: { type: 'integer' },
                tssEstimate: { type: 'integer' },
                intensity: {
                  type: 'string',
                  enum: ['recovery', 'easy', 'moderate', 'hard', 'very_hard'],
                  description: 'Overall intensity level'
                }
              },
              required: ['dayOfWeek', 'title', 'type', 'durationMinutes', 'intensity']
            }
          }
        },
        required: ['weekNumber', 'workouts']
      }
    }
  },
  required: ['weeks']
}

export const generateTrainingBlockTask = task({
  id: 'generate-training-block',
  queue: userReportsQueue,
  maxDuration: 600, // 10 minutes for complex block generation
  run: async (payload: { userId: string; blockId: string; anchorWorkoutIds?: string[] }) => {
    const { userId, blockId, anchorWorkoutIds } = payload

    logger.log('Starting training block generation', { userId, blockId, anchorWorkoutIds })

    const timezone = await getUserTimezone(userId)
    const aiSettings = await getUserAiSettings(userId)
    const now = new Date()
    const localDate = formatUserDate(now, timezone)
    const userLocalToday = getUserLocalDate(timezone)

    // 1. Fetch Context
    const block = await prisma.trainingBlock.findUnique({
      where: { id: blockId },
      include: {
        plan: {
          include: {
            goal: {
              include: { events: true }
            },
            blocks: {
              orderBy: { order: 'asc' },
              select: {
                id: true,
                order: true,
                name: true,
                type: true,
                durationWeeks: true,
                primaryFocus: true
              }
            }
          }
        },
        weeks: {
          select: {
            weekNumber: true,
            volumeTargetMinutes: true,
            tssTarget: true
          },
          orderBy: { weekNumber: 'asc' }
        }
      }
    })

    if (!block) throw new Error('Block not found')

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { ftp: true, weight: true, maxHr: true, aiPersona: true, dob: true, sex: true }
    })

    const userAge = calculateAge(user?.dob)
    logger.log('[GenerateBlock] Block fetched', {
      name: block.name,
      durationWeeks: block.durationWeeks,
      startDate: block.startDate
    })

    // Fetch Anchored Workouts
    const anchoredWorkouts = anchorWorkoutIds?.length
      ? await prisma.plannedWorkout.findMany({
          where: {
            id: { in: anchorWorkoutIds },
            userId
          },
          select: {
            id: true,
            date: true,
            title: true,
            type: true,
            durationSec: true,
            tss: true
          }
        })
      : []

    // Fetch latest athlete profile
    const athleteProfileReport = await prisma.report.findFirst({
      where: {
        userId,
        type: 'ATHLETE_PROFILE',
        status: 'COMPLETED'
      },
      orderBy: { createdAt: 'desc' },
      select: { analysisJson: true, createdAt: true }
    })

    let athleteProfileContext = ''
    if (athleteProfileReport?.analysisJson) {
      const profile = athleteProfileReport.analysisJson as any
      athleteProfileContext = `
DETAILED ATHLETE ANALYSIS (Generated ${formatUserDate(athleteProfileReport.createdAt, timezone)}):
Training Characteristics:
${profile.training_characteristics?.training_style || 'No data'}
Strengths: ${profile.training_characteristics?.strengths?.join(', ') || 'None listed'}
Areas for Development: ${profile.training_characteristics?.areas_for_development?.join(', ') || 'None listed'}

Recovery Profile: ${profile.recovery_profile?.recovery_pattern || 'Unknown'}
${profile.recovery_profile?.key_observations ? profile.recovery_profile.key_observations.map((o: string) => `- ${o}`).join('\n') : ''}

Recent Performance Trend: ${profile.recent_performance?.trend || 'Unknown'}

Planning Context:
${profile.planning_context?.current_focus ? `Current Focus: ${profile.planning_context.current_focus}` : ''}
${profile.planning_context?.limitations?.length ? `Limitations: ${profile.planning_context.limitations.join(', ')}` : ''}
${profile.planning_context?.opportunities?.length ? `Opportunities: ${profile.planning_context.opportunities.join(', ')}` : ''}
`
    }

    const currentFitness = await getCurrentFitnessSummary(userId)

    // 2. Prepare Context Data
    // Map existing weeks to get volume targets before we delete them
    const volumeTargets = block.weeks
      .map((w) => `Week ${w.weekNumber}: ${w.volumeTargetMinutes} mins (TSS ~${w.tssTarget})`)
      .join('\n')

    // Calculate Global Week Context
    let globalWeekStart = 1
    for (const b of block.plan.blocks) {
      if (b.id === block.id) break
      globalWeekStart += b.durationWeeks
    }
    const globalWeekEnd = globalWeekStart + block.durationWeeks - 1
    const totalPlanWeeks = block.plan.blocks.reduce((sum, b) => sum + b.durationWeeks, 0)

    const planOverview = block.plan.blocks
      .map(
        (b) =>
          `${b.order}. ${b.name} (${b.type}): ${b.durationWeeks} weeks - Focus: ${b.primaryFocus}${b.id === block.id ? ' [CURRENT]' : ''}`
      )
      .join('\n')

    const weekSchedules: {
      weekNumber: number
      startDate: Date
      endDate: Date
      validDays: Date[]
    }[] = []
    // Force to UTC midnight to ensure calendar stability
    const rawCursor = new Date(block.startDate)
    let currentCursor = new Date(
      Date.UTC(rawCursor.getUTCFullYear(), rawCursor.getUTCMonth(), rawCursor.getUTCDate())
    )
    let calendarContext = ''

    for (let i = 0; i < block.durationWeeks; i++) {
      const weekStart = new Date(currentCursor)

      // Find next Sunday (0) using UTC methods for stability
      const currentDay = weekStart.getUTCDay()
      const daysToSunday = currentDay === 0 ? 0 : 7 - currentDay

      const weekEnd = new Date(weekStart)
      weekEnd.setUTCDate(weekEnd.getUTCDate() + daysToSunday)

      // Generate valid days
      const validDays = []
      const loopDate = new Date(weekStart)

      const todayStr = formatUserDate(userLocalToday, timezone)

      for (let d = 0; d <= daysToSunday; d++) {
        const dateStr = formatDateUTC(loopDate)
        if (dateStr >= todayStr) {
          validDays.push(new Date(loopDate))
        }
        loopDate.setUTCDate(loopDate.getUTCDate() + 1)
      }

      weekSchedules.push({
        weekNumber: i + 1,
        startDate: weekStart,
        endDate: weekEnd,
        validDays
      })

      // Format for Prompt
      const daysText = validDays
        .map((d) => {
          const dayName = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
          const dStr = formatDateUTC(d)
          return `${dayName} (${dStr})`
        })
        .join(', ')

      calendarContext += `Week ${i + 1} (${formatDateUTC(weekStart)} to ${formatDateUTC(weekEnd)}): ${daysText || 'All days in this week are in the past. Provide focus/explanation but NO workouts.'}\n`

      // Next week starts next day (Monday)
      currentCursor = new Date(weekEnd)
      currentCursor.setUTCDate(currentCursor.getUTCDate() + 1)
    }

    logger.log('[GenerateBlock] Calendar schedules generated', { count: weekSchedules.length })

    // 3. Build Prompt
    const eventsList =
      block.plan.goal.events && block.plan.goal.events.length > 0
        ? block.plan.goal.events
            .map((e: any) => `- ${e.title}: ${formatDateUTC(e.date)} (${e.type || 'Race'})`)
            .join('\n')
        : `- Primary Event Date: ${formatUserDate(block.plan.goal.eventDate || block.plan.targetDate || new Date(), timezone)}`

    // NEW: Get activity types from plan
    const allowedTypes = (block.plan as any).activityTypes || ['Ride'] // Default to Ride if missing
    const allowedTypesString = Array.isArray(allowedTypes) ? allowedTypes.join(', ') : 'Ride'

    const allowedBlockTypes = TRAINING_BLOCK_TYPES.map(
      (t) => `- ${t.value}: ${t.description}`
    ).join('\n')
    const allowedFocuses = TRAINING_BLOCK_FOCUSES.map((f) => `- ${f.value}: ${f.description}`).join(
      '\n'
    )

    // NEW: Get custom instructions from plan
    const customInstructions = (block.plan as any).customInstructions || ''

    const prompt = `You are a **${aiSettings.aiPersona}** expert endurance coach designing a specific mesocycle (training block) for an athlete.
Adapt your tone and structure reasoning to match your **${aiSettings.aiPersona}** persona.

CURRENT CONTEXT:
- Date: ${localDate}
- Timezone: ${timezone}

ATHLETE PROFILE:
- Age: ${userAge || 'Unknown'}
- Sex: ${user?.sex || 'Unknown'}
- FTP: ${user?.ftp || 'Unknown'} W
- Weight: ${user?.weight || 'Unknown'} kg
- Coach Persona: ${aiSettings.aiPersona}
- Allowed Workout Types: ${allowedTypesString} (ONLY schedule these types + Rest/Recovery)
${athleteProfileContext}

CURRENT FITNESS STATUS (Source of Truth):
- CTL (Fitness): ${currentFitness.ctl.toFixed(1)}
- ATL (Fatigue): ${currentFitness.atl.toFixed(1)}
- TSB (Form): ${currentFitness.tsb.toFixed(1)}
- Status: ${currentFitness.formStatus.description}

${
  customInstructions
    ? `ATHLETE CUSTOM INSTRUCTIONS & CONSTRAINTS (IMPORTANT):
${customInstructions}
NOTE: These instructions take precedence over "Allowed Workout Types" or standard scheduling rules. If the athlete asks for a specific workout type not listed above, include it.
`
    : ''
}
TRAINING GOAL:
- Goal Title: ${block.plan.goal.title}
- Events:
${eventsList}
- Strategy: ${block.plan.strategy}

TRAINING PLAN OVERVIEW (Macrocycle):
Total Duration: ${totalPlanWeeks} weeks
${planOverview}

CURRENT BLOCK CONTEXT:
- Block Name: "${block.name}"
- Phase Type: ${block.type} (e.g. Base, Build, Peak)
- Primary Focus: ${block.primaryFocus}
- Duration: ${block.durationWeeks} weeks
- Global Timeline: Weeks ${globalWeekStart}-${globalWeekEnd} of ${totalPlanWeeks}
- Start Date: ${formatUserDate(block.startDate, timezone)}
- Progression Logic: ${block.progressionLogic || 'Standard linear progression'}
- Recovery Week: Week ${block.recoveryWeekIndex || 4} is a recovery week.

VOLUME TARGETS (Baseline from Plan Wizard):
${volumeTargets}
*Use these targets as a guide. You may adjust slightly (+/- 10%) based on the phase and progression needs, but aim to hit these durations.*

WEEKLY SCHEDULE CONSTRAINTS (Explicit Dates):
${calendarContext}
*Strictly follow this schedule. Only generate workouts for the days listed above for each week. If a week has "No valid training days", generate an empty week or rest.*

LOCKED/ANCHOR WORKOUTS (DO NOT CHANGE OR REPLACE):
${
  anchoredWorkouts.length > 0
    ? anchoredWorkouts
        .map(
          (w) =>
            `- ${formatDateUTC(w.date)}: ${w.title} (${w.type}, ${Math.round((w.durationSec || 0) / 60)}min) - KEEP THIS.`
        )
        .join('\n')
    : 'None'
}

INSTRUCTIONS:
Generate a detailed daily training plan for each week in this block (${block.durationWeeks} weeks).
- **RESPECT LOCKED WORKOUTS**: You MUST include the "LOCKED/ANCHOR WORKOUTS" in your plan on their specific days. Do not schedule conflicting workouts on those days unless it's a multi-session day. Account for their TSS.
- ONLY use the "Allowed Workout Types" listed above, UNLESS the athlete's custom instructions explicitly request otherwise (Custom Instructions take precedence).
- Ensure progressive overload from week 1 to ${block.durationWeeks - 1}.
- Ensure the recovery week (if applicable) has significantly reduced volume and intensity.
- For "Ride" workouts, provide realistic TSS estimates based on duration and intensity.
- Workout types: ${allowedTypesString}, Rest, Active Recovery.
- Start each week on a Monday.
- Provide a summary for each week explaining the focus and volume.
- **Weekly Focus Details:**
  - focus_key: MUST be selected from the "ALLOWED FOCUS KEYS" list below.
  - focus_label: A friendly, descriptive title for the week.

ALLOWED FOCUS KEYS:
${allowedFocuses}

ALLOWED BLOCK TYPES:
${allowedBlockTypes}

OUTPUT FORMAT:
Return valid JSON matching the schema provided.`

    // 4. Generate with Gemini
    logger.log(`[GenerateBlock] Prompting Gemini (${aiSettings.aiModelPreference})...`, {
      blockId,
      userId
    })
    const result = await generateStructuredAnalysis<any>(
      prompt,
      trainingBlockSchema,
      aiSettings.aiModelPreference,
      {
        userId,
        operation: 'generate_training_block',
        entityType: 'TrainingBlock',
        entityId: blockId
      }
    )

    // 5. Persist Results
    logger.log('[GenerateBlock] AI Result received', {
      weeksCount: result?.weeks?.length,
      hasWeeks: !!result?.weeks,
      firstWeekWorkouts: result?.weeks?.[0]?.workouts?.length
    })

    if (!result.weeks || result.weeks.length === 0) {
      logger.error('[GenerateBlock] AI returned NO weeks', { result })
      throw new Error('AI returned no weeks for the block')
    }

    logger.log('[GenerateBlock] Starting DB Transaction', { blockId })

    try {
      await prisma.$transaction(
        async (tx) => {
          // Clear existing generated weeks for this block to avoid duplicates if re-running
          const existingWeeks = await tx.trainingWeek.findMany({
            where: { blockId },
            select: { id: true }
          })

          const weekIds = existingWeeks.map((w) => w.id)
          logger.log('[GenerateBlock] Found existing weeks for cleanup', { count: weekIds.length })

          if (weekIds.length > 0) {
            // 1. Detach anchored workouts
            const unlinkedAnchors = await tx.plannedWorkout.updateMany({
              where: {
                id: { in: anchorWorkoutIds || [] },
                trainingWeekId: { in: weekIds }
              },
              data: { trainingWeekId: null }
            })
            logger.log('[GenerateBlock] Unlinked anchors', { count: unlinkedAnchors.count })

            // 2. Unlink User-Managed Workouts
            const unlinkedUsers = await tx.plannedWorkout.updateMany({
              where: {
                trainingWeekId: { in: weekIds },
                id: { notIn: anchorWorkoutIds || [] },
                managedBy: 'USER'
              },
              data: { trainingWeekId: null }
            })
            logger.log('[GenerateBlock] Unlinked user workouts', { count: unlinkedUsers.count })

            // 3. Delete AI-Managed Workouts
            const deletedAIWorkouts = await tx.plannedWorkout.deleteMany({
              where: {
                trainingWeekId: { in: weekIds },
                id: { notIn: anchorWorkoutIds || [] },
                managedBy: { not: 'USER' }
              }
            })
            logger.log('[GenerateBlock] Deleted AI workouts', { count: deletedAIWorkouts.count })

            // 4. Delete the weeks themselves
            const deletedWeeks = await tx.trainingWeek.deleteMany({
              where: { blockId }
            })
            logger.log('[GenerateBlock] Deleted weeks', { count: deletedWeeks.count })
          }

          // 5. Create New Weeks
          logger.log('[GenerateBlock] Processing weeks for schedule', {
            scheduleCount: weekSchedules.length,
            aiWeeksCount: result.weeks.length
          })

          for (const schedule of weekSchedules) {
            // Find AI data for this specific week
            const weekData = result.weeks.find((w) => Number(w.weekNumber) === schedule.weekNumber)

            // Validate Focus Key
            let focusKey = (weekData?.focus_key || '').toUpperCase()
            const isValidKey = TRAINING_BLOCK_FOCUSES.some((f) => f.value === focusKey)
            if (!isValidKey) {
              // Fallback to block's primary focus
              focusKey = block.primaryFocus.split('_WITH_RACE')[0]
            }

            const focusLabel = weekData?.focus_label || weekData?.focus_key || 'Training Week'

            // Create Week
            const createdWeek = await tx.trainingWeek.create({
              data: {
                blockId,
                weekNumber: schedule.weekNumber,
                startDate: schedule.startDate,
                endDate: schedule.endDate,
                focus: focusLabel,
                focusKey: focusKey,
                focusLabel: focusLabel,
                explanation: weekData?.explanation || 'Weekly progression.',
                volumeTargetMinutes: weekData?.volumeTargetMinutes || 0,
                tssTarget:
                  weekData?.workouts?.reduce(
                    (acc: number, w: any) => acc + (w.tssEstimate || 0),
                    0
                  ) || 0,
                isRecovery: focusKey === 'RECOVERY' || focusKey === 'TAPER'
              }
            })
            logger.log(`[GenerateBlock] Created Week ${schedule.weekNumber}`, {
              id: createdWeek.id,
              hasAiData: !!weekData
            })

            if (!weekData) continue

            // Link Anchored Workouts
            if (anchorWorkoutIds?.length && anchoredWorkouts.length > 0) {
              const weekAnchors = anchoredWorkouts.filter((anchor) => {
                const anchorDateStr = formatDateUTC(anchor.date)
                return schedule.validDays.some((d) => formatDateUTC(d) === anchorDateStr)
              })

              if (weekAnchors.length > 0) {
                await tx.plannedWorkout.updateMany({
                  where: { id: { in: weekAnchors.map((w) => w.id) } },
                  data: { trainingWeekId: createdWeek.id }
                })
                logger.log(
                  `[GenerateBlock] Linked ${weekAnchors.length} anchors to Week ${schedule.weekNumber}`
                )
              }
            }

            // Create Workouts
            if (weekData.workouts && Array.isArray(weekData.workouts)) {
              const workoutsToCreate = weekData.workouts
                .map((workout: any, index: number) => {
                  const targetDate = schedule.validDays.find(
                    (d) => d.getUTCDay() === workout.dayOfWeek
                  )
                  if (!targetDate) return null

                  if (anchorWorkoutIds?.length) {
                    const targetDateStr = formatDateUTC(targetDate)
                    const hasAnchor = anchoredWorkouts.some(
                      (anchor) => formatDateUTC(anchor.date) === targetDateStr
                    )
                    if (hasAnchor) return null
                  }

                  return {
                    userId,
                    trainingWeekId: createdWeek.id,
                    date: targetDate,
                    title: workout.title,
                    description: workout.description,
                    type: workout.type,
                    durationSec: (workout.durationMinutes || 0) * 60,
                    tss: workout.tssEstimate,
                    workIntensity: getIntensityScore(workout.intensity),
                    externalId: `ai-gen-${createdWeek.id}-${workout.dayOfWeek}-${index}-${Date.now()}`,
                    category: 'WORKOUT',
                    managedBy: 'COACH_WATTS'
                  }
                })
                .filter((w: any) => w !== null)

              if (workoutsToCreate.length > 0) {
                const createdWorkouts = await tx.plannedWorkout.createMany({
                  data: workoutsToCreate
                })
                logger.log(
                  `[GenerateBlock] Created ${createdWorkouts.count} workouts for Week ${schedule.weekNumber}`
                )
              }
            }
          }
        },
        {
          timeout: 40000 // Further increase timeout
        }
      )
      logger.log('[GenerateBlock] Transaction committed successfully', { blockId })
    } catch (dbErr: any) {
      logger.error('[GenerateBlock] DB Transaction Failed', {
        error: dbErr.message,
        stack: dbErr.stack,
        blockId
      })
      throw dbErr
    }

    return { success: true, blockId }
  }
})

function getIntensityScore(intensity: string): number {
  switch (intensity) {
    case 'recovery':
      return 0.3
    case 'easy':
      return 0.5
    case 'moderate':
      return 0.7
    case 'hard':
      return 0.85
    case 'very_hard':
      return 0.95
    default:
      return 0.5
  }
}
