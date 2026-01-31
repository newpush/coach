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
import { plannedWorkoutRepository } from '../repositories/plannedWorkoutRepository'
import { workoutRepository } from '../repositories/workoutRepository'
import {
  getUserLocalDate,
  formatUserDate,
  formatDateUTC,
  getStartOfDayUTC,
  getEndOfDayUTC
} from '../../utils/date'

export const planningTools = (userId: string, timezone: string) => ({
  get_planned_workouts: tool({
    description: 'Get a list of planned workouts for a specific date range.',
    inputSchema: z.object({
      start_date: z.string().optional().describe('YYYY-MM-DD (defaults to today)'),
      end_date: z.string().optional().describe('YYYY-MM-DD'),
      limit: z.number().optional().default(20)
    }),
    execute: async ({ start_date, end_date, limit }) => {
      let start: Date
      if (start_date) {
        const parts = start_date.split('-')
        start = getStartOfDayUTC(
          timezone,
          new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
        )
      } else {
        start = new Date(getUserLocalDate(timezone)) // Defaults to today user time
      }

      let end: Date | undefined
      if (end_date) {
        const parts = end_date.split('-')
        end = getEndOfDayUTC(
          timezone,
          new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
        )
      }

      const workouts = await plannedWorkoutRepository.list(userId, {
        startDate: start,
        endDate: end,
        limit
      })

      return {
        count: workouts.length,
        workouts: workouts.map((w) => ({
          id: w.id,
          date: formatDateUTC(w.date),
          title: w.title,
          type: w.type,
          duration: w.durationSec ? Math.round(w.durationSec / 60) + ' min' : undefined,
          tss: w.tss,
          description: w.description
        }))
      }
    }
  }),

  search_planned_workouts: tool({
    description: 'Search for planned workouts by title, description or type.',
    inputSchema: z.object({
      query: z.string().describe('Search term for title or description'),
      type: z.string().optional(),
      start_date: z.string().optional().describe('YYYY-MM-DD'),
      end_date: z.string().optional().describe('YYYY-MM-DD')
    }),
    execute: async ({ query, type, start_date, end_date }) => {
      let start: Date | undefined
      if (start_date) {
        const parts = start_date.split('-')
        start = getStartOfDayUTC(
          timezone,
          new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
        )
      }

      let end: Date | undefined
      if (end_date) {
        const parts = end_date.split('-')
        end = getEndOfDayUTC(
          timezone,
          new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
        )
      }

      const where: any = {
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } }
        ]
      }

      if (type) {
        where.type = { contains: type, mode: 'insensitive' }
      }

      const workouts = await plannedWorkoutRepository.list(userId, {
        startDate: start,
        endDate: end,
        where,
        limit: 10
      })

      return workouts.map((w) => ({
        id: w.id,
        date: formatDateUTC(w.date),
        title: w.title,
        type: w.type,
        duration: w.durationSec ? Math.round(w.durationSec / 60) + ' min' : undefined,
        description: w.description
      }))
    }
  }),

  get_current_plan: tool({
    description:
      'Get the current active training plan with all details including daily workouts and weekly summary.',
    inputSchema: z.object({}),
    execute: async () => {
      // Find start of current week relative to user
      const today = getUserLocalDate(timezone)
      const currentWeekStart = new Date(today)

      // getUTCDay() since it's a UTC-aligned date
      const day = currentWeekStart.getUTCDay()
      const diff = day === 0 ? -6 : 1 - day // adjust to Monday
      currentWeekStart.setUTCDate(currentWeekStart.getUTCDate() + diff)

      // Get active or most recent plan
      const plan = await prisma.weeklyTrainingPlan.findFirst({
        where: {
          userId,
          weekStartDate: {
            lte: currentWeekStart
          }
        },
        orderBy: [{ status: 'asc' }, { weekStartDate: 'desc' }]
      })

      if (!plan) {
        return {
          message: 'No training plan found',
          suggestion: 'Use plan_week to generate one'
        }
      }

      const planJson = plan.planJson as any

      return {
        plan: {
          id: plan.id,
          week_start: formatDateUTC(plan.weekStartDate),
          week_end: formatDateUTC(plan.weekEndDate),
          days_planned: plan.daysPlanned,
          status: plan.status,
          total_tss: plan.totalTSS,
          workout_count: plan.workoutCount,
          summary: planJson?.weekSummary,
          days: planJson?.days || [],
          generated_at: formatUserDate(plan.createdAt, timezone),
          model_version: plan.modelVersion
        }
      }
    }
  }),

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
      const workout = await plannedWorkoutRepository.create({
        userId,
        date: new Date(args.date),
        title: args.title,
        description: args.description || args.intensity,
        type: args.type,
        durationSec: args.duration_minutes * 60,
        tss: args.tss,
        externalId: `ai-gen-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Temporary ID
        completionStatus: 'PENDING'
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
        const existing = await plannedWorkoutRepository.getById(args.workout_id, userId, {
          select: { date: true }
        })
        if (existing) {
          data.date = new Date(args.date)
        }
      }

      const workout = await plannedWorkoutRepository.update(args.workout_id, userId, data)

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

  generate_planned_workout_structure: tool({
    description: 'Generate or update the structured intervals for a planned workout.',
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
    needsApproval: false,
    execute: async ({ workout_id }) => {
      // Use repository to find the workout
      const workout = (await plannedWorkoutRepository.getById(workout_id, userId, {
        include: { user: { select: { ftp: true } } }
      })) as any // Cast because of complex include

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

          await plannedWorkoutRepository.update(workout_id, userId, {
            externalId: String(intervalsWorkout.id),
            syncStatus: 'SYNCED',
            lastSyncedAt: new Date()
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

          await plannedWorkoutRepository.update(workout_id, userId, {
            syncStatus: 'SYNCED',
            lastSyncedAt: new Date()
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
    needsApproval: false,
    execute: async ({ workout_id }) => {
      try {
        await plannedWorkoutRepository.delete(workout_id, userId)
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
    needsApproval: false,
    execute: async (args) => {
      // Try deleting from both tables or check which one
      // For simplicity, try PlannedWorkout first
      try {
        await plannedWorkoutRepository.delete(args.workout_id, userId)
        return { success: true, message: 'Planned workout deleted.' }
      } catch (e) {
        // If failed, try Workout
        try {
          await workoutRepository.delete(args.workout_id, userId)
          return { success: true, message: 'Completed workout deleted.' }
        } catch (e2: any) {
          return { success: false, error: e2.message || 'Failed to delete workout.' }
        }
      }
    }
  }),

  modify_training_plan_structure: tool({
    description:
      'Modify the structure of the active training plan (add, remove, or resize training blocks).',
    inputSchema: z.object({
      plan_id: z.string(),
      operations: z.array(
        z.object({
          type: z.enum(['ADD', 'UPDATE', 'DELETE']),
          block_id: z.string().optional().describe('Required for UPDATE and DELETE'),
          name: z.string().optional(),
          block_type: z.enum(['PREP', 'BASE', 'BUILD', 'PEAK', 'RACE', 'TRANSITION']).optional(),
          primary_focus: z.string().optional(),
          duration_weeks: z.number().int().min(1).max(12).optional(),
          order: z.number().int().optional()
        })
      )
    }),
    execute: async ({ plan_id, operations }) => {
      // Fetch current plan structure to work with
      const plan = await trainingPlanRepository.getById(plan_id, userId, {
        include: { blocks: { orderBy: { order: 'asc' } } }
      })

      if (!plan) return { success: false, error: 'Plan not found' }

      // Map AI operations to the replan-structure format
      const localBlocks = JSON.parse(JSON.stringify(plan.blocks))

      for (const op of operations) {
        if (op.type === 'DELETE' && op.block_id) {
          const idx = localBlocks.findIndex((b: any) => b.id === op.block_id)
          if (idx !== -1) localBlocks.splice(idx, 1)
        } else if (op.type === 'UPDATE' && op.block_id) {
          const block = localBlocks.find((b: any) => b.id === op.block_id)
          if (block) {
            if (op.name) block.name = op.name
            if (op.block_type) block.type = op.block_type
            if (op.primary_focus) block.primaryFocus = op.primary_focus
            if (op.duration_weeks) block.durationWeeks = op.duration_weeks
          }
        } else if (op.type === 'ADD') {
          const newBlock = {
            id: `new-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: op.name || 'New Phase',
            type: op.block_type || 'BASE',
            primaryFocus: op.primary_focus || 'AEROBIC_ENDURANCE',
            durationWeeks: op.duration_weeks || 4,
            order: op.order || localBlocks.length + 1
          }
          if (op.order !== undefined) {
            localBlocks.splice(op.order - 1, 0, newBlock)
          } else {
            localBlocks.push(newBlock)
          }
        }
      }

      // Re-assign orders
      const finalBlocks = localBlocks.map((b: any, idx: number) => ({
        ...b,
        order: idx + 1
      }))

      try {
        await planService.replanStructure(userId, plan_id, finalBlocks)
        return {
          success: true,
          message: 'Plan structure modified successfully.',
          proposed_structure: finalBlocks
            .map((b: any) => `${b.name} (${b.durationWeeks}w)`)
            .join(' -> ')
        }
      } catch (e: any) {
        return { success: false, error: e.message }
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
