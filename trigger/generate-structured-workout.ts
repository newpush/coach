import './init'
import { logger, task } from '@trigger.dev/sdk/v3'
import { generateStructuredAnalysis, buildWorkoutSummary } from '../server/utils/gemini'
import { prisma } from '../server/utils/db'
import { userReportsQueue } from './queues'
import { syncPlannedWorkoutToIntervals } from '../server/utils/intervals-sync'
import { WorkoutConverter } from '../server/utils/workout-converter'
import { workoutRepository } from '../server/utils/repositories/workoutRepository'
import { sportSettingsRepository } from '../server/utils/repositories/sportSettingsRepository'
import { getUserTimezone, getUserLocalDate } from '../server/utils/date'

const workoutStructureSchema = {
  type: 'object',
  properties: {
    description: {
      type: 'string',
      description:
        'Overall workout strategy in complete sentences. NEVER use bullet points or list the steps here.'
    },
    coachInstructions: {
      type: 'string',
      description: 'Personalized advice on technique, execution, and purpose (2-3 sentences).'
    },
    steps: {
      type: 'array',
      description: 'Linear sequence of workout steps (Ride, Run, Swim)',
      items: {
        type: 'object',
        properties: {
          steps: {
            type: 'array',
            description: 'Nested steps for repeats/loops',
            items: { $ref: '#' }
          },
          reps: {
            type: 'integer',
            description: 'Number of times to repeat these steps (for loops)'
          },
          type: { type: 'string', enum: ['Warmup', 'Active', 'Rest', 'Cooldown'] },
          durationSeconds: { type: 'integer' },
          distance: { type: 'integer', description: 'Distance in meters (Swim/Run)' },
          description: { type: 'string', description: 'Pace or stroke description' },
          power: {
            type: 'object',
            properties: {
              value: { type: 'number', description: 'Target % of FTP (e.g. 0.95)' },
              range: {
                type: 'object',
                properties: { start: { type: 'number' }, end: { type: 'number' } },
                required: ['start', 'end'],
                description: 'For ramps: start and end % of FTP'
              }
            }
          },
          heartRate: {
            type: 'object',
            properties: {
              value: { type: 'number', description: 'Target % of LTHR (e.g. 0.85)' },
              range: {
                type: 'object',
                properties: { start: { type: 'number' }, end: { type: 'number' } },
                required: ['start', 'end'],
                description:
                  'Target range as % of LTHR (e.g. start: 0.70, end: 0.80 for Zone 2 blocks or progression)'
              }
            }
          },
          pace: {
            type: 'object',
            description: 'Target % of threshold pace (e.g. 0.95 = 95%)',
            properties: {
              value: { type: 'number' },
              range: {
                type: 'object',
                properties: {
                  start: { type: 'number' },
                  end: { type: 'number' }
                }
              }
            }
          },
          cadence: {
            type: 'integer',
            description: 'Target cadence in RPM (single integer, no ranges)'
          },
          name: { type: 'string', description: "e.g. '5min @ 95%'" },
          stroke: {
            type: 'string',
            description: 'For swimming: Free, Back, Breast, Fly, IM, Choice, Kick, Pull'
          },
          equipment: {
            type: 'array',
            items: { type: 'string' },
            description: 'For swimming: Fins, Paddles, Snorkel, Pull Buoy'
          }
        },
        required: ['type', 'name']
      }
    },
    exercises: {
      type: 'array',
      description: 'List of exercises for Strength training',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          sets: { type: 'integer' },
          reps: { type: 'string', description: "e.g. '8-12' or 'AMRAP'" },
          weight: { type: 'string', description: "e.g. '70% 1RM' or 'Bodyweight'" },
          duration: { type: 'integer', description: 'Duration in seconds if time-based' },
          rest: { type: 'string', description: "Rest between sets e.g. '90s'" },
          notes: { type: 'string', description: 'Form cues or tempo' }
        },
        required: ['name']
      }
    }
  },
  required: ['coachInstructions']
}

export const generateStructuredWorkoutTask = task({
  id: 'generate-structured-workout',
  queue: userReportsQueue,
  maxDuration: 300,
  run: async (payload: { plannedWorkoutId: string }) => {
    const { plannedWorkoutId } = payload

    const workout = await (prisma as any).plannedWorkout.findUnique({
      where: { id: plannedWorkoutId },
      include: {
        user: {
          select: {
            ftp: true,
            lthr: true,
            aiPersona: true,
            name: true,
            maxHr: true,
            subscriptionTier: true,
            isAdmin: true
          }
        },
        trainingWeek: {
          include: {
            block: {
              include: {
                plan: {
                  include: {
                    goal: true
                  }
                }
              }
            }
          }
        }
      }
    })

    if (!workout) {
      logger.warn('Workout not found, skipping structured generation', { plannedWorkoutId })
      return { success: false, error: 'Workout not found' }
    }

    // Fetch Sport Specific Settings
    const sportSettings = await sportSettingsRepository.getForActivityType(
      workout.userId,
      workout.type || ''
    )

    // Build context
    const persona = workout.user.aiPersona || 'Supportive'
    const goal =
      workout.trainingWeek?.block.plan.goal?.title ||
      workout.trainingWeek?.block.plan.name ||
      'General Fitness'
    const phase = workout.trainingWeek?.block.type || 'General'
    const focus = workout.trainingWeek?.block.primaryFocus || 'Fitness'

    // Fetch user timezone
    const timezone = await getUserTimezone(workout.userId)

    // Fetch recent workouts for context
    const recentWorkouts = await workoutRepository.getForUser(workout.userId, {
      limit: 5,
      orderBy: { date: 'desc' },
      include: {
        streams: {
          select: {
            hrZoneTimes: true,
            powerZoneTimes: true
          }
        }
      }
    })

    // Resolve Metrics
    const ftp = sportSettings?.ftp || workout.user.ftp || 250
    const lthr = sportSettings?.lthr || workout.user.lthr || 160
    const maxHr = sportSettings?.maxHr || workout.user.maxHr || 190

    // Subscription Limit Check
    // Free users cannot generate structured workouts more than 4 weeks (28 days) in the future
    if (workout.user.subscriptionTier === 'FREE') {
      const today = getUserLocalDate(timezone)
      const fourWeeksFromNow = new Date(today)
      fourWeeksFromNow.setUTCDate(today.getUTCDate() + 28)

      // Compare dates (both are UTC midnight aligned)
      if (workout.date > fourWeeksFromNow) {
        logger.log('Skipping structured workout generation: Free tier limit (4 weeks)', {
          userId: workout.userId,
          workoutDate: workout.date,
          limitDate: fourWeeksFromNow
        })
        return {
          success: true,
          skipped: true,
          message: 'Structured workout generation is limited to 4 weeks in advance for free users.'
        }
      }
    }

    // Build zone definitions
    let zoneDefinitions = ''
    if (sportSettings?.hrZones && Array.isArray(sportSettings.hrZones)) {
      zoneDefinitions += `**${workout.type} Heart Rate Zones:**\n`
      sportSettings.hrZones.forEach((z: any) => {
        zoneDefinitions += `- ${z.name}: ${z.min}-${z.max} bpm\n`
      })
    }

    if (sportSettings?.powerZones && Array.isArray(sportSettings.powerZones)) {
      zoneDefinitions += `\n**${workout.type} Power Zones:**\n`
      sportSettings.powerZones.forEach((z: any) => {
        zoneDefinitions += `- ${z.name}: ${z.min}-${z.max} Watts\n`
      })
    }

    if (lthr) {
      zoneDefinitions += `\n**Reference LTHR:** ${lthr} bpm\n`
    }
    if (ftp) {
      zoneDefinitions += `**Reference FTP:** ${ftp} Watts\n`
    }
    if (sportSettings?.loadPreference) {
      zoneDefinitions += `**Preferred Load Metric:** ${sportSettings.loadPreference}\n`
    }

    const prompt = `Design a structured ${workout.type} workout for ${workout.user.name || 'Athlete'}.
    
    TITLE: ${workout.title}
    DURATION: ${Math.round((workout.durationSec || 3600) / 60)} minutes
    INTENSITY: ${workout.workIntensity || 'Moderate'}
    DESCRIPTION: ${workout.description || 'No specific description'}
    USER FTP: ${ftp}W
    USER LTHR: ${lthr} bpm
    TYPE: ${workout.type}
    
    CONTEXT:
    - Goal: ${goal}
    - Phase: ${phase}
    - Focus: ${focus}
    - Coach Persona: ${persona}

    RECENT WORKOUTS:
    ${buildWorkoutSummary(recentWorkouts, timezone)}

    CRITICAL: ALWAYS use the user's specific zones defined below for this activity type.

    ${zoneDefinitions}

    When generating "[Zone 2]" workouts, target ONLY the user's defined Z2 range for this specific sport. Never use generic percentages - always reference the provided zones first.
    
    INSTRUCTIONS:
    - Create a JSON structure defining the exact steps (Warmup, Intervals, Rest, Cooldown).
    - Ensure total duration matches the target duration exactly.
    - **steps**: All rules below (targets, etc.) apply to BOTH top-level steps AND nested steps inside repeats.
    - **description**: Use ONLY complete sentences to describe the overall purpose and strategy. **NEVER use bullet points or list the steps here**.
    - **coachInstructions**: Provide a personalized message (2-3 sentences) explaining WHY this workout matters for their goal (${goal}) and how to execute it (e.g. "Focus on smooth cadence during the efforts"). Use the '${persona}' persona tone.

    FOR CYCLING (Ride/VirtualRide):
    - MANDATORY: Use % of FTP for power targets (e.g. 0.95 = 95%) for EVERY step.
    - For ramps (Warmup/Cooldown), use "range" with "start" and "end" values (e.g. start: 0.50, end: 0.75 for warmup).
    - MANDATORY: Include target "cadence" (RPM) for EVERY step (including Warmup/Rest). Use 85-95 for active, 80 for rest.

    FOR RUNNING (Run):
    - Steps should have 'type', 'durationSeconds', 'name'.
    - ALWAYS include 'distance' (meters) for each step. If duration-based, ESTIMATE the distance based on the intensity/pace.
    - Use 'power' object if it's a power-based run (e.g. Stryd).
    - CRITICAL: You MUST include a 'heartRate' object for EVERY step (except Rest where it's optional but recommended).
    - Prefer 'heartRate.range' for steady aerobic/endurance/tempo blocks (e.g. Zone 2 -> start: 0.70, end: 0.80). Use 'heartRate.value' mainly for short precise efforts.
    - HIGHLY RECOMMENDED: Include a 'pace' object with 'value' (target % of threshold pace) for active steps. Providing both 'heartRate' and 'pace' is preferred for running.
    - DO NOT rely solely on description for intensity. Even for "Easy Jog", provide an estimated HR intensity (e.g. 0.70).
    - If pace based, put pace in 'description' AND provide the equivalent HR intensity in 'heartRate.value' or 'heartRate.range' (e.g. 5k pace ~ 1.05 intensity).
    
    FOR SWIMMING (Swim):
    - Steps should ideally have 'distance' (meters) instead of or in addition to duration. If using duration, estimate distance.
    - Use 'stroke' to specify: Free, Back, Breast, Fly, IM, Choice, Kick, Pull.
    - Use 'equipment' array for gear: Fins, Paddles, Snorkel, Pull Buoy.
    - Include 'stroke' type in description if applicable.
    - CRITICAL: You MUST include a 'heartRate' object with 'value' (target % of LTHR, e.g. 0.85) for EVERY step. Even if it's a technical drill, provide an estimated HR intensity.
    - RECOMMENDED: Include a 'pace' object with 'value' (target % of threshold pace) for main set intervals.

    FOR STRENGTH (Gym/WeightTraining):
    - Instead of 'steps', provide a list of 'exercises'.
    - Each exercise should have 'name', 'sets', 'reps', 'weight' (optional description like "Heavy" or %1RM), 'rest' (e.g. "90s"), and 'notes'.
    - Structure it as Warmup -> Main Lifts -> Accessories -> Cooldown if possible.
    
    OUTPUT JSON format matching the schema.`

    const structure = (await generateStructuredAnalysis(prompt, workoutStructureSchema, 'flash', {
      userId: workout.userId,
      operation: 'generate_structured_workout',
      entityType: 'PlannedWorkout',
      entityId: plannedWorkoutId
    })) as any

    const normalizeAndCalculate = (steps: any[], depth = 0, parentStep: any = null) => {
      let distance = 0
      let duration = 0
      let tss = 0

      if (!Array.isArray(steps)) return { distance, duration, tss }

      steps.forEach((step: any) => {
        // 1. Recover misplaced targets (AI sometimes puts 'value' or 'range' at top level)
        const recoverTarget = (fieldName: string) => {
          // If it's a string like "range", it's invalid AI junk, clear it
          if (typeof step[fieldName] === 'string') {
            step[fieldName] = undefined
          }

          const hasOwnTarget = step.range || step.value

          if (
            !step[fieldName] ||
            (typeof step[fieldName] === 'object' && Object.keys(step[fieldName]).length === 0)
          ) {
            if (step.range) {
              step[fieldName] = { range: step.range }
              delete step.range
            } else if (step.value) {
              step[fieldName] = { value: step.value }
              delete step.value
            } else if (!hasOwnTarget && parentStep?.[fieldName]) {
              // Inherit from parent ONLY if child has NO intensity targets of its own
              step[fieldName] = JSON.parse(JSON.stringify(parentStep[fieldName]))
            }
          }
        }

        // 2. Sport-Specific Normalization (Recursive)
        if (workout.type === 'Ride' || workout.type === 'VirtualRide') {
          recoverTarget('power')

          // Ensure Power exists for charts
          if (!step.power || (step.power.value === undefined && !step.power.range)) {
            if (step.type === 'Warmup') step.power = { value: 0.5 }
            else if (step.type === 'Rest') step.power = { value: 0.45 }
            else if (step.type === 'Cooldown') step.power = { value: 0.4 }
            else step.power = { value: 0.75 }
          }

          // Ensure Cadence exists
          if (!step.cadence) {
            if (step.type === 'Warmup' || step.type === 'Cooldown') step.cadence = 85
            else if (step.type === 'Rest') step.cadence = 80
            else if (parentStep?.cadence) step.cadence = parentStep.cadence
            else step.cadence = 90
          }

          // Strip swimming artifacts
          step.stroke = undefined
          step.equipment = undefined
        } else if (workout.type === 'Run') {
          recoverTarget('heartRate')
          recoverTarget('pace')
          recoverTarget('power')

          // Ensure at least one target exists for runs (HR preferred)
          // Only apply defaults if ALL targets are truly missing/empty after recovery
          const hasHr = step.heartRate && (step.heartRate.value || step.heartRate.range)
          const hasPace = step.pace && (step.pace.value || step.pace.range)
          const hasPower = step.power && (step.power.value || step.power.range)

          if (!hasHr && !hasPace && !hasPower) {
            if (step.type === 'Warmup') step.heartRate = { value: 0.6 }
            else if (step.type === 'Rest') step.heartRate = { value: 0.5 }
            else if (step.type === 'Cooldown') step.heartRate = { value: 0.55 }
            else step.heartRate = { value: 0.75 }
          }

          // Ensure distance is a number
          if (step.distance) step.distance = Number(step.distance)
        }

        // 3. Structural Fixes
        if (step.durationSeconds === undefined && step.duration !== undefined) {
          step.durationSeconds = step.duration
        }

        // 4. Recurse and Calculate
        let stepDistance = 0
        let stepDuration = 0
        let stepTSS = 0

        if (step.steps && Array.isArray(step.steps) && step.steps.length > 0) {
          const nested = normalizeAndCalculate(step.steps, depth + 1, step)
          stepDistance = nested.distance
          stepDuration = nested.duration
          stepTSS = nested.tss
        } else {
          // Distance
          stepDistance = step.distance || 0

          // Duration
          stepDuration = step.durationSeconds || 0

          // Estimate TSS
          let intensity = 0.5
          if (step.heartRate) {
            if (typeof step.heartRate.value === 'number') {
              intensity = step.heartRate.value
            } else if (step.heartRate.range) {
              intensity = (step.heartRate.range.start + step.heartRate.range.end) / 2
            }
          } else if (step.power) {
            if (typeof step.power.value === 'number') {
              intensity = step.power.value
            } else if (step.power.range) {
              intensity = (step.power.range.start + step.power.range.end) / 2
            }
          } else {
            switch (step.type) {
              case 'Warmup':
                intensity = 0.5
                break
              case 'Cooldown':
                intensity = 0.4
                break
              case 'Rest':
                intensity = 0.4
                break
              case 'Active':
                intensity = 0.75
                break
            }
          }

          if (stepDuration > 0) {
            stepTSS = ((stepDuration * intensity * intensity) / 3600) * 100
          }
        }

        const reps = Number(step.reps) || 1
        distance += stepDistance * reps
        duration += stepDuration * reps
        tss += stepTSS * reps
      })

      return { distance, duration, tss }
    }

    const totals = normalizeAndCalculate(structure.steps || [])
    const totalDistance = totals.distance
    let totalDuration = totals.duration
    let totalTSS = totals.tss

    // Calculate metrics from Exercises (if present)
    if (structure.exercises && Array.isArray(structure.exercises)) {
      let gymDuration = 0
      structure.exercises.forEach((ex: any) => {
        let exDuration = 0

        // If explicit duration
        if (ex.duration) {
          exDuration = ex.duration
        } else {
          // Estimate
          const sets = ex.sets || 1
          // Parse reps (could be '8-12' or 'AMRAP')
          let reps = 10
          if (typeof ex.reps === 'number') reps = ex.reps
          else if (typeof ex.reps === 'string') {
            const match = ex.reps.match(/\d+/)
            if (match) reps = parseInt(match[0], 10)
          }

          const repDuration = 5 // seconds (controlled tempo)
          const workTime = sets * reps * repDuration

          // Rest
          let restTimePerSet = 90 // seconds default (standard strength rest)
          if (ex.rest) {
            // Parse "90s", "2m", "1.5 min"
            const restStr = String(ex.rest).toLowerCase()
            if (restStr.includes('m') && !restStr.includes('ms')) {
              const mins = parseFloat(restStr) || 0
              restTimePerSet = mins * 60
            } else {
              const secs = parseFloat(restStr) || 90
              restTimePerSet = secs
            }
          }

          // Total time including transition
          const totalRest = sets * restTimePerSet
          exDuration = workTime + totalRest
        }

        gymDuration += exDuration
      })

      totalDuration += gymDuration

      // Estimate TSS for Strength (approx 40 TSS/hr)
      // Only add if no TSS calculated from steps (avoid double counting if mixed)
      if (gymDuration > 0 && totalTSS === 0) {
        const strengthTSS = (gymDuration / 3600) * 40
        totalTSS += strengthTSS
      }
    }

    const updateData: any = {
      structuredWorkout: structure as any
    }

    if (totalDistance > 0) {
      updateData.distanceMeters = totalDistance
    }

    if (totalDuration > 0) {
      updateData.durationSec = totalDuration
    }

    if (totalTSS > 0) {
      updateData.tss = Math.round(totalTSS)
    }

    // Calculate Intensity Factor (IF)
    // IF = sqrt((36 * TSS) / duration)
    if (totalTSS > 0 && totalDuration > 0) {
      const calculatedIntensity = Math.sqrt((36 * totalTSS) / totalDuration)
      // Ensure it's a reasonable number (e.g. 0.0 to 1.5)
      if (!isNaN(calculatedIntensity) && calculatedIntensity > 0) {
        updateData.workIntensity = parseFloat(calculatedIntensity.toFixed(2))
      }
    }

    const updatedWorkout = await (prisma as any).plannedWorkout.update({
      where: { id: plannedWorkoutId },
      data: updateData
    })

    // Sync to Intervals.icu if it's already published (not local-only)
    const isLocal =
      updatedWorkout.syncStatus === 'LOCAL_ONLY' ||
      updatedWorkout.externalId.startsWith('ai_gen_') ||
      updatedWorkout.externalId.startsWith('ai-gen-') ||
      updatedWorkout.externalId.startsWith('adhoc-')

    if (!isLocal) {
      logger.log('Syncing updated structure to Intervals.icu', { plannedWorkoutId })

      // Convert structure to Intervals.icu format (text/string)
      // We must reconstruct the workout data object for the converter
      const workoutData = {
        title: updatedWorkout.title,
        description: updatedWorkout.description || '',
        type: updatedWorkout.type || '',
        steps: structure.steps || [],
        exercises: structure.exercises, // Add this
        messages: [],
        ftp: workout.user.ftp || 250,
        sportSettings: sportSettings || undefined
      }

      const workoutDoc = WorkoutConverter.toIntervalsICU(workoutData)

      const syncResult = await syncPlannedWorkoutToIntervals(
        'UPDATE',
        {
          id: updatedWorkout.id,
          externalId: updatedWorkout.externalId,
          date: updatedWorkout.date,
          title: updatedWorkout.title,
          description: updatedWorkout.description,
          type: updatedWorkout.type,
          durationSec: updatedWorkout.durationSec,
          tss: updatedWorkout.tss,
          workout_doc: workoutDoc, // Pass the converted string
          managedBy: updatedWorkout.managedBy
        },
        workout.userId
      )

      if (syncResult.synced) {
        await (prisma as any).plannedWorkout.update({
          where: { id: plannedWorkoutId },
          data: {
            syncStatus: 'SYNCED',
            lastSyncedAt: new Date(),
            syncError: null
          }
        })
      } else {
        await (prisma as any).plannedWorkout.update({
          where: { id: plannedWorkoutId },
          data: {
            syncError: syncResult.error || 'Failed to sync structured intervals'
          }
        })
      }
    }

    return { success: true, plannedWorkoutId }
  }
})
