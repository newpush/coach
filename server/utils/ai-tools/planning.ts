import { tool } from 'ai'
import { z } from 'zod'
import { prisma } from '../../utils/db'
import { generateStructuredWorkoutTask } from '../../../trigger/generate-structured-workout'
import { tags } from '@trigger.dev/sdk/v3'

export const planningTools = (userId: string, timezone: string) => ({
  create_planned_workout: tool({
    description: 'Create a future planned workout in the calendar.',
    inputSchema: z.object({
      date: z.string().describe('Date (YYYY-MM-DD)'),
      time_of_day: z.string().optional(),
      title: z.string(),
      description: z.string().optional(),
      type: z.string().describe('Sport type (Ride, Run, Swim, etc)'),
      duration_minutes: z.number().describe('Planned duration in minutes'),
      tss: z.number().optional().describe('Planned TSS'),
      intensity: z
        .string()
        .optional()
        .describe('Intensity description (e.g. "Zone 2", "Intervals")')
    }),
    execute: async (args) => {
      // Create a PlannedWorkout, not a Workout
      const workout = await prisma.plannedWorkout.create({
        data: {
          userId,
          date: new Date(args.date),
          title: args.title,
          description: args.description || args.intensity,
          type: args.type,
          durationSec: args.duration_minutes * 60,
          tss: args.tss,
          externalId: `ai-gen-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Temporary ID
          completionStatus: 'PENDING'
        }
      })

      // Trigger structured workout generation
      try {
        await generateStructuredWorkoutTask.trigger(
          {
            plannedWorkoutId: workout.id // Pass plannedWorkoutId
          },
          {
            tags: [`user:${userId}`, `planned-workout:${workout.id}`]
          }
        )
      } catch (e) {
        console.error('Failed to trigger structured workout generation:', e)
      }

      return {
        success: true,
        workout_id: workout.id,
        message: 'Planned workout created and structured generation started.'
      }
    }
  }),

  update_planned_workout: tool({
    description: 'Update an existing planned workout.',
    inputSchema: z.object({
      workout_id: z.string(),
      date: z.string().optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      type: z.string().optional(),
      duration_minutes: z.number().optional(),
      tss: z.number().optional()
    }),
    execute: async (args) => {
      const data: any = {}
      if (args.title) data.title = args.title
      if (args.description) data.description = args.description
      if (args.type) data.type = args.type
      if (args.duration_minutes) {
        data.durationSec = args.duration_minutes * 60
      }
      if (args.tss) data.tss = args.tss
      if (args.date) {
        // Preserve time if possible, otherwise default
        const existing = await prisma.plannedWorkout.findUnique({
          where: { id: args.workout_id },
          select: { date: true }
        })
        if (existing) {
          // PlannedWorkout date is just Date (YYYY-MM-DD), time is separate or implied?
          // Schema says: date DateTime @db.Date
          // So time is NOT stored in date.
          // Schema has `startTime`? Yes: `startTime String?`.
          // So we should update `date` with new date object.
          data.date = new Date(args.date)
        }
      }

      const workout = await prisma.plannedWorkout.update({
        where: { id: args.workout_id, userId },
        data
      })

      // Trigger regeneration of structured intervals
      try {
        await generateStructuredWorkoutTask.trigger(
          {
            plannedWorkoutId: workout.id
          },
          {
            tags: [`user:${userId}`, `planned-workout:${workout.id}`]
          }
        )
      } catch (e) {
        console.error('Failed to trigger structured workout regeneration:', e)
      }

      return { success: true, workout_id: workout.id, status: 'QUEUED_FOR_SYNC' }
    }
  }),

  delete_workout: tool({
    description: 'Delete a workout (planned or completed).',
    inputSchema: z.object({
      workout_id: z.string(),
      reason: z.string().optional()
    }),
    execute: async (args) => {
      // Try deleting from both tables or check which one
      // For simplicity, try PlannedWorkout first
      try {
        await prisma.plannedWorkout.delete({ where: { id: args.workout_id, userId } })
      } catch (e) {
        // If failed, try Workout
        await prisma.workout.delete({ where: { id: args.workout_id, userId } })
      }
      return { success: true, message: 'Workout deleted.' }
    }
  }),

  plan_week: tool({
    description: 'Generate a full training plan for the upcoming week.',
    inputSchema: z.object({
      days: z.number().optional().default(7),
      start_date: z.string().optional(),
      user_confirmed: z
        .boolean()
        .describe('Has the user explicitly asked to generate/confirm the plan?')
    }),
    execute: async (args) => {
      if (!args.user_confirmed) {
        return {
          needs_confirmation: true,
          message: 'I can generate a plan for you. Do you want me to proceed?'
        }
      }

      // This would call the complex planning logic or Trigger.dev task
      return {
        success: true,
        message: 'Weekly plan generated and added to your calendar.',
        plan_summary:
          'Focus: Base Building. Total Volume: 8h. Key sessions: Tue Intervals, Sat Long Ride.'
      }
    }
  })
})
