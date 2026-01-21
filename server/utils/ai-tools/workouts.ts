import { tool } from 'ai'
import { z } from 'zod'
import { workoutRepository } from '../repositories/workoutRepository'
import { getStartOfDaysAgoUTC, formatUserDate } from '../../utils/date'

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
        const start = new Date(date)
        const end = new Date(date)
        end.setDate(end.getDate() + 1)
        where.date = { gte: start, lt: end }
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

  get_activity_details: tool({
    description:
      'Get detailed metrics for a specific workout, including intervals, power curve, and heart rate data.',
    inputSchema: z.object({
      workout_id: z.string().describe('The ID of the workout to analyze')
    }),
    execute: async ({ workout_id }) => {
      const workout = await workoutRepository.getById(workout_id, userId)

      if (!workout) return { error: 'Workout not found' }

      return {
        ...workout,
        date: formatUserDate(workout.date, timezone),
        power_curve: 'Not available', // Placeholder
        intervals: [] // Placeholder
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
          'Stream access restricted for performance. Use get_activity_details for summary metrics.'
      }
    }
  })
})
