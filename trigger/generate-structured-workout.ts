import { logger, task } from '@trigger.dev/sdk/v3'
import { generateStructuredAnalysis } from '../server/utils/gemini'
import { prisma } from '../server/utils/db'
import { userReportsQueue } from './queues'

const workoutStructureSchema = {
  type: 'object',
  properties: {
    description: { type: 'string', description: 'Overall workout strategy description' },
    coachInstructions: {
      type: 'string',
      description: 'Personalized coaching advice based on athlete profile'
    },
    steps: {
      type: 'array',
      description: 'Linear sequence of workout steps (Ride, Run, Swim)',
      items: {
        type: 'object',
        properties: {
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
                description: 'For ramps: start and end % of LTHR'
              }
            }
          },
          cadence: { type: 'integer' },
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
  run: async (payload: { plannedWorkoutId: string }) => {
    const { plannedWorkoutId } = payload

    const workout = await (prisma as any).plannedWorkout.findUnique({
      where: { id: plannedWorkoutId },
      include: {
        user: { select: { ftp: true, aiPersona: true, name: true } },
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

    // Build context
    const persona = workout.user.aiPersona || 'Supportive'
    const goal =
      workout.trainingWeek?.block.plan.goal?.title ||
      workout.trainingWeek?.block.plan.name ||
      'General Fitness'
    const phase = workout.trainingWeek?.block.type || 'General'
    const focus = workout.trainingWeek?.block.primaryFocus || 'Fitness'

    const prompt = `Design a structured ${workout.type} workout for ${workout.user.name || 'Athlete'}.
    
    TITLE: ${workout.title}
    DURATION: ${Math.round((workout.durationSec || 3600) / 60)} minutes
    INTENSITY: ${workout.workIntensity || 'Moderate'}
    DESCRIPTION: ${workout.description || 'No specific description'}
    USER FTP: ${workout.user.ftp || 250}W
    TYPE: ${workout.type}
    
    CONTEXT:
    - Goal: ${goal}
    - Phase: ${phase}
    - Focus: ${focus}
    - Coach Persona: ${persona}
    
    INSTRUCTIONS:
    - Create a JSON structure defining the exact steps (Warmup, Intervals, Rest, Cooldown).
    - Ensure total duration matches the target duration exactly.
    - Add "coachInstructions": A personalized message (2-3 sentences) explaining WHY this workout matters for their goal (${goal}) and how to execute it (e.g. "Focus on smooth cadence during the efforts"). Use the '${persona}' persona tone.

    FOR CYCLING (Ride/VirtualRide):
    - Use % of FTP for power targets (e.g. 0.95 = 95%).
    - For ramps (Warmup/Cooldown), use "range" with "start" and "end" values (e.g. start: 0.50, end: 0.75 for warmup).
    - Include target "cadence" (RPM) for each step (e.g. 85-95 for intervals, 60-80 for rest).

    FOR RUNNING (Run):
    - Steps should have 'type', 'durationSeconds', 'name'.
    - ALWAYS include 'distance' (meters) for each step. If duration-based, ESTIMATE the distance based on the intensity/pace.
    - Use 'power' object if it's a power-based run (e.g. Stryd).
    - CRITICAL: You MUST include a 'heartRate' object with 'value' (target % of LTHR, e.g. 0.85) for EVERY step (except Rest where it's optional but recommended).
    - DO NOT rely solely on description for intensity. Even for "Easy Jog", provide an estimated HR intensity (e.g. 0.70).
    - If pace based, put pace in 'description' AND provide the equivalent HR intensity in 'heartRate.value' (e.g. 5k pace ~ 1.05 intensity).
    
    FOR SWIMMING (Swim):
    - Steps should ideally have 'distance' (meters) instead of or in addition to duration. If using duration, estimate distance.
    - Use 'stroke' to specify: Free, Back, Breast, Fly, IM, Choice, Kick, Pull.
    - Use 'equipment' array for gear: Fins, Paddles, Snorkel, Pull Buoy.
    - Include 'stroke' type in description if applicable.

    FOR STRENGTH (Gym/WeightTraining):
    - Instead of 'steps', provide a list of 'exercises'.
    - Each exercise should have 'name', 'sets', 'reps', 'weight' (optional description like "Heavy" or %1RM), 'rest' (e.g. "90s"), and 'notes'.
    - Structure it as Warmup -> Main Lifts -> Accessories -> Cooldown if possible.
    
    OUTPUT JSON format matching the schema.`

    const structure = await generateStructuredAnalysis(prompt, workoutStructureSchema, 'flash', {
      userId: workout.userId,
      operation: 'generate_structured_workout',
      entityType: 'PlannedWorkout',
      entityId: plannedWorkoutId
    })

    // Calculate total metrics from steps
    let totalDistance = 0
    let totalDuration = 0
    let totalTSS = 0

    if (structure.steps && Array.isArray(structure.steps)) {
      structure.steps.forEach((step: any) => {
        // Distance
        totalDistance += step.distance || 0

        // Duration
        const duration = step.durationSeconds || 0
        totalDuration += duration

        // Estimate TSS
        // TSS = (sec * IF^2) / 3600 * 100
        let intensity = 0.5 // Default fallback

        if (step.power) {
          if (typeof step.power.value === 'number') {
            intensity = step.power.value
          } else if (step.power.range) {
            intensity = (step.power.range.start + step.power.range.end) / 2
          }
        } else if (step.heartRate) {
          // HR intensity roughly proxies power intensity for TSS estimation
          if (typeof step.heartRate.value === 'number') {
            intensity = step.heartRate.value
          } else if (step.heartRate.range) {
            intensity = (step.heartRate.range.start + step.heartRate.range.end) / 2
          }
        } else {
          // Infer from type
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
              break // Moderate default
          }
        }

        // Add step TSS
        if (duration > 0) {
          totalTSS += ((duration * intensity * intensity) / 3600) * 100
        }
      })
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

    await (prisma as any).plannedWorkout.update({
      where: { id: plannedWorkoutId },
      data: updateData
    })

    return { success: true, plannedWorkoutId }
  }
})
