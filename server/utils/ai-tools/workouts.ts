import { tool } from 'ai'
import { z } from 'zod'
import { workoutRepository } from '../repositories/workoutRepository'
import {
  getStartOfDaysAgoUTC,
  formatUserDate,
  getStartOfDayUTC,
  getEndOfDayUTC
} from '../../utils/date'
import { analyzeWorkoutTask } from '../../../trigger/analyze-workout'

export const workoutTools = (userId: string, timezone: string) => ({
  get_recent_workouts: tool({
    description:
      'Get recent workouts with summary metrics (duration, TSS, intensity). Use this to see what the user has done recently.',
    inputSchema: z.object({
      limit: z.number().optional().default(5),
      type: z
        .string()
        .optional()
        .describe('Filter by sport type (Ride, Run, Swim, WeightTraining, etc)'),
      days: z.number().optional().describe('Number of days to look back')
    }),
    execute: async ({ limit = 5, type, days }) => {
      const where: any = {}

      if (type) {
        where.type = { contains: type, mode: 'insensitive' }
      }

      if (days) {
        where.date = { gte: getStartOfDaysAgoUTC(timezone, days) }
      }

      const workouts = await workoutRepository.getForUser(userId, {
        limit,
        orderBy: { date: 'desc' },
        where
      })

      return {
        count: workouts.length,
        workouts: workouts.map((w) => ({
          id: w.id,
          date: formatUserDate(w.date, timezone),
          title: w.title,
          sport: w.source === 'strava' ? w.type : w.type, // Map types if needed
          duration: w.durationSec,
          tss: w.tss,
          intensity: w.intensity,
          rpe: w.rpe,
          feel: w.feel
        }))
      }
    }
  }),

  search_workouts: tool({
    description:
      'Search for specific workouts by title, date, or unique characteristics. Useful for finding a specific session the user is referring to.',
    inputSchema: z.object({
      workout_id: z.string().optional().describe('Specific workout ID if known'),
      title_search: z.string().optional().describe('Partial title match'),
      type: z.string().optional(),
      date: z.string().optional().describe('Specific date (YYYY-MM-DD)'),
      relative_position: z.enum(['last', 'prev', 'next']).optional()
    }),
    execute: async ({ workout_id, title_search, type, date }) => {
      const where: any = {}

      if (workout_id) where.id = workout_id
      if (title_search) where.title = { contains: title_search, mode: 'insensitive' }
      if (type) where.type = { contains: type, mode: 'insensitive' }
      if (date) {
        const parts = date.split('-')
        if (parts.length === 3) {
          // Create local date from parts (Month is 0-indexed)
          const localDate = new Date(
            parseInt(parts[0]!),
            parseInt(parts[1]!) - 1,
            parseInt(parts[2]!)
          )

          where.date = {
            gte: getStartOfDayUTC(timezone, localDate),
            lte: getEndOfDayUTC(timezone, localDate)
          }
        }
      }

      const workouts = await workoutRepository.getForUser(userId, {
        limit: 5,
        orderBy: { date: 'desc' },
        where
      })

      return workouts.map((w) => ({
        id: w.id,
        date: formatUserDate(w.date, timezone),
        title: w.title,
        sport: w.type,
        duration: w.durationSec,
        tss: w.tss
      }))
    }
  }),

  get_workout_details: tool({
    description:
      'Get detailed metrics for a specific workout, including summary scores, planned targets, and metadata.',
    inputSchema: z.object({
      workout_id: z.string().describe('The ID of the workout to analyze')
    }),
    execute: async ({ workout_id }) => {
      const workout = (await workoutRepository.getById(workout_id, userId, {
        include: {
          plannedWorkout: true,
          streams: true
        }
      })) as any

      if (!workout) {
        // Fallback to planned workout
        const planned = await prisma.plannedWorkout.findUnique({
          where: { id: workout_id, userId },
          include: {
            trainingWeek: true
          }
        })

        if (!planned) return { error: 'Workout not found' }

        return {
          ...planned,
          isPlanned: true,
          date: formatUserDate(planned.date, timezone)
        }
      }

      return {
        ...workout,
        date: formatUserDate(workout.date, timezone),
        // Clean up large stream data for context safety while keeping computed metrics
        streams: workout.streams
          ? {
              avgPacePerKm: workout.streams.avgPacePerKm,
              paceVariability: workout.streams.paceVariability,
              hrZoneTimes: workout.streams.hrZoneTimes,
              powerZoneTimes: workout.streams.powerZoneTimes,
              paceZones: workout.streams.paceZones,
              pacingStrategy: workout.streams.pacingStrategy
            }
          : null
      }
    }
  }),

  get_workout_analysis: tool({
    description:
      'Get the deep AI-generated analysis and performance scores for a specific workout. Use this when the user asks "how did I do?" or "show me the analysis for this workout".',
    inputSchema: z.object({
      workout_id: z.string().describe('The ID of the workout to get analysis for')
    }),
    execute: async ({ workout_id }) => {
      const workout = await workoutRepository.getById(workout_id, userId, {
        select: {
          id: true,
          title: true,
          date: true,
          aiAnalysis: true,
          aiAnalysisJson: true,
          aiAnalysisStatus: true,
          overallScore: true,
          technicalScore: true,
          effortScore: true,
          pacingScore: true,
          executionScore: true,
          overallQualityExplanation: true,
          technicalExecutionExplanation: true,
          effortManagementExplanation: true,
          pacingStrategyExplanation: true,
          executionConsistencyExplanation: true
        } as any
      })

      if (!workout) return { error: 'Workout not found' }

      return {
        ...workout,
        date: formatUserDate(workout.date, timezone)
      }
    }
  }),

  analyze_activity: tool({
    description:
      'Force a deep AI analysis of a specific completed activity. Use this when the user asks for a more detailed breakdown or if the initial analysis was missing details.',
    inputSchema: z.object({
      workout_id: z.string().describe('The ID of the workout to analyze')
    }),
    needsApproval: false,
    execute: async ({ workout_id }) => {
      const workout = await workoutRepository.getById(workout_id, userId)
      if (!workout) return { error: 'Workout not found' }

      try {
        await analyzeWorkoutTask.trigger(
          { workoutId: workout_id },
          {
            tags: [`user:${userId}`, `workout:${workout_id}`],
            concurrencyKey: userId
          }
        )
        return {
          success: true,
          message: 'Workout re-analysis has been queued and will be ready in a few moments.'
        }
      } catch (e: any) {
        return { error: `Failed to trigger analysis: ${e.message}` }
      }
    }
  }),

  update_workout_notes: tool({
    description:
      'Update the personal notes/memos for a specific workout. Use this when the user wants to add, correct, or update their personal thoughts about a session.',
    inputSchema: z.object({
      workout_id: z.string().describe('The ID of the workout to update notes for'),
      notes: z.string().describe('The new notes content (Markdown supported)')
    }),
    execute: async ({ workout_id, notes }) => {
      const workout = await workoutRepository.getById(workout_id, userId)
      if (!workout) return { error: 'Workout not found' }

      try {
        await workoutRepository.update(workout_id, {
          notes,
          notesUpdatedAt: new Date()
        })
        return {
          success: true,
          message: 'Workout notes have been updated successfully.'
        }
      } catch (e: any) {
        return { error: `Failed to update notes: ${e.message}` }
      }
    }
  }),

  get_workout_streams: tool({
    description:
      'Get raw stream data (heart rate, power, cadence) for a workout. Use sparingly for deep analysis.',
    inputSchema: z.object({
      workout_id: z.string(),
      include_streams: z
        .array(z.string())
        .optional()
        .describe('List of streams: "watts", "heartrate", "cadence"'),
      sample_rate: z.number().optional().describe('Sample every N seconds (default 1)')
    }),
    execute: async () => {
      return {
        message:
          'Stream access restricted for performance. Use get_workout_details for summary metrics.'
      }
    }
  })
})
