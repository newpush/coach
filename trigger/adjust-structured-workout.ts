import './init'
import { logger, task } from '@trigger.dev/sdk/v3'
import { generateStructuredAnalysis, buildWorkoutSummary } from '../server/utils/gemini'
import { prisma } from '../server/utils/db'
import { userReportsQueue } from './queues'
import { calculateAge, getUserTimezone } from '../server/utils/date'
import { sportSettingsRepository } from '../server/utils/repositories/sportSettingsRepository'
import { workoutRepository } from '../server/utils/repositories/workoutRepository'
import { WorkoutConverter } from '../server/utils/workout-converter'
import { syncPlannedWorkoutToIntervals } from '../server/utils/intervals-sync'

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
              units: {
                type: 'string',
                description: 'Target unit. Prefer "%" by default; can also be "w" or zone labels.'
              },
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
              units: {
                type: 'string',
                description: 'Target unit. Use "LTHR" by default; can also be "HR" or "bpm".'
              },
              range: {
                type: 'object',
                properties: { start: { type: 'number' }, end: { type: 'number' } },
                required: ['start', 'end'],
                description: 'For ramps: start and end % of LTHR'
              }
            }
          },
          pace: {
            type: 'object',
            description: 'Target % of threshold pace (e.g. 0.95 = 95%)',
            properties: {
              value: { type: 'number' },
              units: {
                type: 'string',
                description: 'Pace target unit. Use "Pace" for percentages, or an absolute unit like "/km".'
              },
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
            description: 'Target cadence (RPM for Cycling, SPM for Running - single integer)'
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

export const adjustStructuredWorkoutTask = task({
  id: 'adjust-structured-workout',
  queue: userReportsQueue,
  maxDuration: 300,
  run: async (payload: { plannedWorkoutId: string; adjustments: any }) => {
    const { plannedWorkoutId, adjustments } = payload

    const workout = await prisma.plannedWorkout.findUnique({
      where: { id: plannedWorkoutId },
      include: {
        user: {
          select: {
            id: true,
            ftp: true,
            lthr: true,
            aiPersona: true,
            name: true,
            dob: true,
            sex: true,
            maxHr: true
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

    if (!workout) throw new Error('Workout not found')

    // Fetch Sport Specific Settings
    const sportSettings = await sportSettingsRepository.getForActivityType(
      workout.userId,
      workout.type || ''
    )

    // Update workout metadata if provided
    if (adjustments.durationMinutes || adjustments.intensity) {
      await prisma.plannedWorkout.update({
        where: { id: plannedWorkoutId },
        data: {
          durationSec: adjustments.durationMinutes ? adjustments.durationMinutes * 60 : undefined,
          workIntensity: adjustments.intensity
            ? getIntensityScore(adjustments.intensity)
            : undefined
        }
      })
      // Refresh local var
      workout.durationSec = adjustments.durationMinutes
        ? adjustments.durationMinutes * 60
        : workout.durationSec
      workout.workIntensity = adjustments.intensity
        ? getIntensityScore(adjustments.intensity)
        : workout.workIntensity
    }

    const userAge = calculateAge(workout.user.dob)
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

    if (sportSettings?.loadPreference) {
      zoneDefinitions += `\n**Preferred Load Metric:** ${sportSettings.loadPreference}\n`
    }

    const prompt = `Adjust this structured ${workout.type} workout based on user feedback.
    
    ORIGINAL WORKOUT:
    - Title: ${workout.title}
    - Duration: ${Math.round((workout.durationSec || 3600) / 60)} minutes
    - Intensity: ${adjustments.intensity || 'Same as before'}
    - Description: ${workout.description || 'No specific description'}
    
    USER FEEDBACK / ADJUSTMENTS:
    "${adjustments.feedback || 'Please regenerate with the new duration/intensity parameters.'}"
    
    USER PROFILE:
    - Age: ${userAge || 'Unknown'}
    - Sex: ${workout.user.sex || 'Unknown'}
    - FTP: ${ftp}W
    - LTHR: ${lthr} bpm
    
    USER ZONES:
    ${zoneDefinitions}

    RECENT WORKOUTS:
    ${buildWorkoutSummary(recentWorkouts, timezone)}
    
    INSTRUCTIONS:
    - Create a NEW JSON structure defining the exact steps (Warmup, Intervals, Rest, Cooldown).
    - Ensure total duration matches the target duration (${Math.round((workout.durationSec || 3600) / 60)}m).
    - Respect the user's feedback.
    - Preserve the workout's core objective unless the user explicitly requests changing it.
    - Ensure each block has a clear physiological purpose and a logical sequence of stress and recovery.
    - **description**: Use ONLY complete sentences to describe the overall purpose and strategy. **NEVER use bullet points or list the steps here**.
    - **coachInstructions**: Provide an updated personalized message (2-3 sentences) explaining what changed, why it changed, and how to execute the key set.

    FOR CYCLING (Ride/VirtualRide):
    - Use % of FTP for power targets (e.g. 0.95 = 95%).
    - Set \`power.units\` to "%" unless the user explicitly requested watts.
    - Include target cadence (RPM).
    - Keep hard interval work recoverable and repeatable.

    FOR RUNNING (Run):
    - ALWAYS include 'distance' (meters) for each step (estimate if needed).
    - CRITICAL: Use 'heartRate' object with 'value' (target % of LTHR, e.g. 0.85) for intensity.
    - Set \`heartRate.units\` to "LTHR" by default.
    - HIGHLY RECOMMENDED: Include a 'pace' object with 'value' (target % of threshold pace) for active steps.
    - If pace is percentage-based, set \`pace.units\` to "Pace".
    - If user specifies "Zone 2", refer to their HR Zones provided above.
    - Do not stack maximal efforts without sufficient recovery.

    FOR SWIMMING (Swim):
    - ALWAYS include 'distance' (meters) for each step (estimate if needed).
    - Use 'stroke' to specify: Free, Back, Breast, Fly, IM, Choice, Kick, Pull.
    - Use 'equipment' array for gear: Fins, Paddles, Snorkel, Pull Buoy.
    - CRITICAL: You MUST include a 'heartRate' object with 'value' (target % of LTHR, e.g. 0.85) for EVERY step.
    - Set \`heartRate.units\` to "LTHR" unless using explicit bpm.
    - RECOMMENDED: Include a 'pace' object with 'value' (target % of threshold pace) for main set intervals.
    
    FOR STRENGTH (Gym/WeightTraining):
    - Instead of 'steps', provide a list of 'exercises'.
    - Each exercise should include practical loading guidance and rest.
    
    OUTPUT JSON format matching the schema.`

    const structure = (await generateStructuredAnalysis(prompt, workoutStructureSchema, 'flash', {
      userId: workout.userId,
      operation: 'adjust_structured_workout',
      entityType: 'PlannedWorkout',
      entityId: plannedWorkoutId
    })) as any

    const normalizeAndCalculate = (steps: any[], depth = 0, parentStep: any = null) => {
      let distance = 0
      let duration = 0
      let tss = 0

      if (!Array.isArray(steps)) return { distance, duration, tss }

      steps.forEach((step: any) => {
        const recoverTarget = (fieldName: string) => {
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
              step[fieldName] = JSON.parse(JSON.stringify(parentStep[fieldName]))
            }
          }
        }

        if (workout.type === 'Ride' || workout.type === 'VirtualRide') {
          recoverTarget('power')

          if (!step.power || (step.power.value === undefined && !step.power.range)) {
            if (step.type === 'Warmup') step.power = { value: 0.5, units: '%' }
            else if (step.type === 'Rest') step.power = { value: 0.45, units: '%' }
            else if (step.type === 'Cooldown') step.power = { value: 0.4, units: '%' }
            else step.power = { value: 0.75, units: '%' }
          } else if (!step.power.units) {
            step.power.units = '%'
          }

          if (!step.cadence) {
            if (step.type === 'Warmup' || step.type === 'Cooldown') step.cadence = 85
            else if (step.type === 'Rest') step.cadence = 80
            else if (parentStep?.cadence) step.cadence = parentStep.cadence
            else step.cadence = 90
          }

          step.stroke = undefined
          step.equipment = undefined
        } else if (workout.type === 'Run') {
          recoverTarget('heartRate')
          recoverTarget('pace')
          recoverTarget('power')

          const hasHr = step.heartRate && (step.heartRate.value || step.heartRate.range)
          const hasPace = step.pace && (step.pace.value || step.pace.range)
          const hasPower = step.power && (step.power.value || step.power.range)

          if (!hasHr && !hasPace && !hasPower) {
            if (step.type === 'Warmup') step.heartRate = { value: 0.6, units: 'LTHR' }
            else if (step.type === 'Rest') step.heartRate = { value: 0.5, units: 'LTHR' }
            else if (step.type === 'Cooldown') step.heartRate = { value: 0.55, units: 'LTHR' }
            else step.heartRate = { value: 0.75, units: 'LTHR' }
          } else if (step.heartRate && !step.heartRate.units) {
            step.heartRate.units = 'LTHR'
          }

          if (step.pace && !step.pace.units) {
            step.pace.units = 'Pace'
          }

          if (step.distance) step.distance = Number(step.distance)
        }

        if (step.durationSeconds === undefined && step.duration !== undefined) {
          step.durationSeconds = step.duration
        }

        let stepDistance = 0
        let stepDuration = 0
        let stepTSS = 0

        if (step.steps && Array.isArray(step.steps) && step.steps.length > 0) {
          const nested = normalizeAndCalculate(step.steps, depth + 1, step)
          stepDistance = nested.distance
          stepDuration = nested.duration
          stepTSS = nested.tss
        } else {
          stepDistance = step.distance || 0
          stepDuration = step.durationSeconds || 0

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

        const reps = step.reps || 1
        distance += stepDistance * reps
        duration += stepDuration * reps
        tss += stepTSS * reps
      })

      return { distance, duration, tss }
    }

    const totals = normalizeAndCalculate(structure.steps || [])
    const totalDistance = totals.distance
    const totalDuration = totals.duration
    const totalTSS = totals.tss

    const updateData: any = {
      structuredWorkout: structure as any
    }

    if (totalDistance > 0) updateData.distanceMeters = totalDistance
    if (totalDuration > 0) updateData.durationSec = totalDuration
    if (totalTSS > 0) updateData.tss = Math.round(totalTSS)
    if (totalTSS > 0 && totalDuration > 0) {
      updateData.workIntensity = parseFloat(Math.sqrt((36 * totalTSS) / totalDuration).toFixed(2))
    }

    const updatedWorkout = await prisma.plannedWorkout.update({
      where: { id: plannedWorkoutId },
      data: updateData
    })

    // Sync to Intervals.icu
    const isLocal =
      updatedWorkout.syncStatus === 'LOCAL_ONLY' ||
      updatedWorkout.externalId.startsWith('ai_gen_') ||
      updatedWorkout.externalId.startsWith('ai-gen-') ||
      updatedWorkout.externalId.startsWith('adhoc-')

    if (!isLocal) {
      const workoutData = {
        title: updatedWorkout.title,
        description: updatedWorkout.description || '',
        type: updatedWorkout.type || '',
        steps: (structure as any).steps || [],
        exercises: (structure as any).exercises || [],
        messages: [],
        ftp: ftp,
        sportSettings: sportSettings || undefined
      }
      const workoutDoc = WorkoutConverter.toIntervalsICU(workoutData)
      await syncPlannedWorkoutToIntervals(
        'UPDATE',
        {
          ...updatedWorkout,
          workout_doc: workoutDoc
        },
        workout.userId
      )
    }

    return { success: true, plannedWorkoutId }
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
