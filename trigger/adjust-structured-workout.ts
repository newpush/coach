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
      description: 'Linear sequence of workout steps',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['Warmup', 'Active', 'Rest', 'Cooldown'] },
          durationSeconds: { type: 'integer' },
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
          cadence: { type: 'integer' },
          name: { type: 'string', description: "e.g. '5min @ 95%'" }
        },
        required: ['type', 'durationSeconds', 'name']
      }
    }
  },
  required: ['steps', 'coachInstructions']
}

export const adjustStructuredWorkoutTask = task({
  id: 'adjust-structured-workout',
  queue: userReportsQueue,
  run: async (payload: { plannedWorkoutId: string; adjustments: any }) => {
    const { plannedWorkoutId, adjustments } = payload

    const workout = await prisma.plannedWorkout.findUnique({
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

    // Update workout metadata if provided
    if (adjustments.durationMinutes || adjustments.intensity) {
      await prisma.plannedWorkout.update({
        where: { id: plannedWorkoutId },
        data: {
          durationSec: adjustments.durationMinutes ? adjustments.durationMinutes * 60 : undefined,
          workIntensity: adjustments.intensity
            ? getIntensityScore(adjustments.intensity)
            : undefined
          // If title/description changed, update them too? Assuming title stays.
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

    const prompt = `Adjust this structured cycling workout based on user feedback.
    
    ORIGINAL WORKOUT:
    - Title: ${workout.title}
    - Duration: ${Math.round((workout.durationSec || 3600) / 60)} minutes
    - Intensity: ${adjustments.intensity || 'Same as before'}
    - Description: ${workout.description || 'No specific description'}
    
    USER FEEDBACK / ADJUSTMENTS:
    "${adjustments.feedback || 'Please regenerate with the new duration/intensity parameters.'}"
    
    USER PROFILE:
    - FTP: ${workout.user.ftp || 250}W
    
    INSTRUCTIONS:
    - Create a NEW JSON structure defining the exact steps (Warmup, Intervals, Rest, Cooldown).
    - Ensure total duration matches the NEW target duration (${Math.round((workout.durationSec || 3600) / 60)}m).
    - Respect the user's feedback (e.g. "make intervals harder", "more rest").
    - Use % of FTP for power targets.
    - For ramps, use "range" with "start" and "end" values (ensure correct direction: start < end for ramp up, start > end for cooldown).
    - Include target cadence.
    - Add updated "coachInstructions".
    
    OUTPUT JSON format matching the schema.`

    const structure = await generateStructuredAnalysis(prompt, workoutStructureSchema, 'flash', {
      userId: workout.userId,
      operation: 'adjust_structured_workout',
      entityType: 'PlannedWorkout',
      entityId: plannedWorkoutId
    })

    await prisma.plannedWorkout.update({
      where: { id: plannedWorkoutId },
      data: {
        structuredWorkout: structure as any
      }
    })

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
