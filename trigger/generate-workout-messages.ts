import { logger, task } from '@trigger.dev/sdk/v3'
import { generateStructuredAnalysis } from '../server/utils/gemini'
import { prisma } from '../server/utils/db'
import { userReportsQueue } from './queues'

const messageGenerationSchema = {
  type: 'object',
  properties: {
    messages: {
      type: 'array',
      description: 'List of timed messages to be displayed during the workout',
      items: {
        type: 'object',
        properties: {
          timestamp: {
            type: 'integer',
            description: 'Time in seconds from start when message appears'
          },
          text: { type: 'string', description: 'The message content' },
          duration: { type: 'integer', description: 'How long to show the message (default 10s)' }
        },
        required: ['timestamp', 'text']
      }
    }
  },
  required: ['messages']
}

export const generateWorkoutMessagesTask = task({
  id: 'generate-workout-messages',
  queue: userReportsQueue,
  run: async (payload: { plannedWorkoutId: string; tone: string; context?: string }) => {
    const { plannedWorkoutId, tone, context } = payload

    const workout = await prisma.plannedWorkout.findUnique({
      where: { id: plannedWorkoutId },
      include: {
        user: { select: { name: true, aiPersona: true } }
      }
    })

    if (!workout || !workout.structuredWorkout) throw new Error('Workout or structure not found')

    const structure = workout.structuredWorkout as any

    const prompt = `Add engaging coaching messages to this cycling workout.
    
    WORKOUT:
    - Title: ${workout.title}
    - Description: ${workout.description}
    - Structure: ${JSON.stringify(structure.steps)}
    
    PARAMETERS:
    - Tone: ${tone || workout.user.aiPersona || 'Motivational'}
    - Athlete Name: ${workout.user.name || 'Athlete'}
    - Additional Context: ${context || 'Focus on form and consistency.'}
    
    INSTRUCTIONS:
    - Generate a list of timed text messages to display during the workout.
    - Messages should start at specific seconds (timestamp).
    - Include:
      1. Warmup encouragement.
      2. "Heads up" before hard intervals (e.g. "1 min to go! Get ready to push!").
      3. Technical cues during intervals (e.g. "Smooth circles", "Relax shoulders").
      4. Celebration after hard efforts.
      5. Educational tidbits about WHY we are doing this zone/effort.
      6. Fun/Engaging banter to keep them motivated.
    - Ensure messages align with the workout intensity (don't joke during a VO2 max interval, encourage instead).
    
    OUTPUT JSON format matching the schema.`

    const result = await generateStructuredAnalysis<{ messages: any[] }>(
      prompt,
      messageGenerationSchema,
      'flash',
      {
        userId: workout.userId,
        operation: 'generate_workout_messages',
        entityType: 'PlannedWorkout',
        entityId: plannedWorkoutId
      }
    )

    // Merge messages into existing structure
    const updatedStructure = {
      ...structure,
      messages: result.messages
    }

    await prisma.plannedWorkout.update({
      where: { id: plannedWorkoutId },
      data: {
        structuredWorkout: updatedStructure as any
      }
    })

    return { success: true, count: result.messages.length }
  }
})
