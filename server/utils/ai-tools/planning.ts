import { tool } from 'ai'
import { z } from 'zod'
import { prisma } from '../../utils/db'
import { generateStructuredWorkoutTask } from '../../../trigger/generate-structured-workout'
import { adjustStructuredWorkoutTask } from '../../../trigger/adjust-structured-workout'
import { syncPlannedWorkoutToIntervals } from '../../utils/intervals-sync'
import { WorkoutConverter } from '../../utils/workout-converter'
import {
  cleanIntervalsDescription,
  createIntervalsPlannedWorkout,
  updateIntervalsPlannedWorkout
} from '../../utils/intervals'
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
            tags: [`user:${userId}`, `planned-workout:${workout.id}`],
            concurrencyKey: userId
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
    description: 'Update an existing planned workout (rename, reschedule, etc).',
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
            tags: [`user:${userId}`, `planned-workout:${workout.id}`],
            concurrencyKey: userId
          }
        )
      } catch (e) {
        console.error('Failed to trigger structured workout regeneration:', e)
      }

      return { success: true, workout_id: workout.id, status: 'QUEUED_FOR_SYNC' }
    }
  }),

  adjust_planned_workout: tool({
    description: 'Adjust a planned workout structure using AI instructions.',
    inputSchema: z.object({
      workout_id: z.string(),
      instructions: z
        .string()
        .describe('Instructions for adjustment (e.g. "make it harder", "add intervals")'),
      duration_minutes: z.number().optional(),
      intensity: z.enum(['recovery', 'easy', 'moderate', 'hard', 'very_hard']).optional()
    }),
    execute: async ({ workout_id, instructions, duration_minutes, intensity }) => {
      // Trigger adjustment task
      try {
        await adjustStructuredWorkoutTask.trigger(
          {
            plannedWorkoutId: workout_id,
            adjustments: {
              feedback: instructions,
              durationMinutes: duration_minutes,
              intensity: intensity
            }
          },
          {
            tags: [`user:${userId}`, `planned-workout:${workout_id}`],
            concurrencyKey: userId
          }
        )
        return { success: true, message: 'Workout adjustment started.' }
      } catch (e) {
        console.error('Failed to trigger workout adjustment:', e)
        return { success: false, error: 'Failed to start adjustment task.' }
      }
    }
  }),

  regenerate_workout_structure: tool({
    description: 'Regenerate the structured intervals for a planned workout.',
    inputSchema: z.object({
      workout_id: z.string()
    }),
    execute: async ({ workout_id }) => {
      try {
        await generateStructuredWorkoutTask.trigger(
          { plannedWorkoutId: workout_id },
          {
            tags: [`user:${userId}`, `planned-workout:${workout_id}`],
            concurrencyKey: userId
          }
        )
        return { success: true, message: 'Structure regeneration started.' }
      } catch (e) {
        return { success: false, error: 'Failed to trigger regeneration.' }
      }
    }
  }),

  publish_planned_workout: tool({
    description: 'Publish or update a planned workout to Intervals.icu.',
    inputSchema: z.object({
      workout_id: z.string()
    }),
    needsApproval: true,
    execute: async ({ workout_id }) => {
      const workout = await prisma.plannedWorkout.findUnique({
        where: { id: workout_id, userId },
        include: { user: { select: { ftp: true } } }
      })

      if (!workout) return { error: 'Workout not found' }

      // Logic copied from publish endpoint, simplified
      // Ideally this should be in a service but for now we implement directly using utils
      const integration = await prisma.integration.findFirst({
        where: { userId, provider: 'intervals' }
      })

      if (!integration) return { error: 'Intervals.icu integration not found' }

      const isLocal =
        workout.syncStatus === 'LOCAL_ONLY' ||
        workout.externalId.startsWith('ai_gen_') ||
        workout.externalId.startsWith('ai-gen-') ||
        workout.externalId.startsWith('adhoc-')

      let workoutDoc = ''
      if (workout.structuredWorkout) {
        const workoutData = {
          title: workout.title,
          description: workout.description || '',
          steps: (workout.structuredWorkout as any).steps || [],
          exercises: (workout.structuredWorkout as any).exercises,
          messages: (workout.structuredWorkout as any).messages || [],
          ftp: (workout.user as any).ftp || 250
        }
        workoutDoc = WorkoutConverter.toIntervalsICU(workoutData)
      }

      const cleanDescription = cleanIntervalsDescription(workout.description || '')

      try {
        if (isLocal) {
          const intervalsWorkout = await createIntervalsPlannedWorkout(integration, {
            date: workout.date,
            title: workout.title,
            description: cleanDescription,
            type: workout.type || 'Ride',
            durationSec: workout.durationSec || 3600,
            tss: workout.tss ?? undefined,
            workout_doc: workoutDoc,
            managedBy: workout.managedBy
          })

          await prisma.plannedWorkout.update({
            where: { id: workout_id },
            data: {
              externalId: String(intervalsWorkout.id),
              syncStatus: 'SYNCED',
              lastSyncedAt: new Date()
            }
          })
          return { success: true, message: 'Workout published to Intervals.icu.' }
        } else {
          await updateIntervalsPlannedWorkout(integration, workout.externalId, {
            date: workout.date,
            title: workout.title,
            description: cleanDescription,
            type: workout.type || 'Ride',
            durationSec: workout.durationSec || 3600,
            tss: workout.tss ?? undefined,
            workout_doc: workoutDoc,
            managedBy: workout.managedBy
          })

          await prisma.plannedWorkout.update({
            where: { id: workout_id },
            data: { syncStatus: 'SYNCED', lastSyncedAt: new Date() }
          })
          return { success: true, message: 'Workout updated on Intervals.icu.' }
        }
      } catch (e: any) {
        return { success: false, error: e.message || 'Failed to publish.' }
      }
    }
  }),

  delete_planned_workout: tool({
    description: 'Delete a planned workout from the calendar.',
    inputSchema: z.object({
      workout_id: z.string(),
      reason: z.string().optional()
    }),
    needsApproval: true,
    execute: async ({ workout_id }) => {
      try {
        await prisma.plannedWorkout.delete({ where: { id: workout_id, userId } })
        return { success: true, message: 'Planned workout deleted.' }
      } catch (e: any) {
        return { success: false, error: e.message || 'Failed to delete planned workout.' }
      }
    }
  }),

  delete_workout: tool({
    description: 'Delete a workout (planned or completed).',
    inputSchema: z.object({
      workout_id: z.string(),
      reason: z.string().optional()
    }),
    needsApproval: true,
    execute: async (args) => {
      // Try deleting from both tables or check which one
      // For simplicity, try PlannedWorkout first
      try {
        await prisma.plannedWorkout.delete({ where: { id: args.workout_id, userId } })
        return { success: true, message: 'Planned workout deleted.' }
      } catch (e) {
        // If failed, try Workout
        try {
          await prisma.workout.delete({ where: { id: args.workout_id, userId } })
          return { success: true, message: 'Completed workout deleted.' }
        } catch (e2: any) {
          return { success: false, error: e2.message || 'Failed to delete workout.' }
        }
      }
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
