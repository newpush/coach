import { tool } from 'ai'
import { z } from 'zod'
import { prisma } from '../../utils/db'
import {
  getStartOfDayUTC,
  getEndOfDayUTC,
  formatUserDate,
  formatDateUTC,
  getStartOfLocalDateUTC,
  getEndOfLocalDateUTC
} from '../../utils/date'

export const wellnessTools = (userId: string, timezone: string) => ({
  get_wellness_metrics: tool({
    description:
      'Fetch wellness and recovery metrics (HRV, sleep, recovery score, etc.). Use this when user asks about recovery, sleep, or how they are feeling.',
    inputSchema: z.object({
      start_date: z.string().describe('Start date in ISO format (YYYY-MM-DD)'),
      end_date: z
        .string()
        .optional()
        .describe('End date in ISO format (YYYY-MM-DD). If not provided, defaults to start_date')
    }),
    execute: async ({ start_date, end_date }) => {
      const start = getStartOfLocalDateUTC(timezone, start_date)

      let end: Date
      if (end_date) {
        end = getEndOfLocalDateUTC(timezone, end_date)
      } else {
        end = getEndOfLocalDateUTC(timezone, start_date)
      }

      const wellness = await prisma.wellness.findMany({
        where: {
          userId,
          date: {
            gte: start,
            lte: end
          }
        },
        orderBy: { date: 'desc' },
        select: {
          id: true,
          date: true,
          recoveryScore: true,
          hrv: true,
          restingHr: true,
          sleepHours: true,
          sleepScore: true,
          spO2: true,
          readiness: true,
          fatigue: true,
          soreness: true,
          stress: true,
          mood: true
        }
      })

      if (wellness.length === 0) {
        return { message: 'No wellness data found for the specified date range' }
      }

      return {
        count: wellness.length,
        date_range: {
          start: start_date,
          end: end_date || start_date
        },
        metrics: wellness.map((w) => ({
          date: formatDateUTC(w.date),
          recovery: {
            recovery_score: w.recoveryScore,
            hrv: w.hrv,
            resting_hr: w.restingHr,
            readiness: w.readiness
          },
          sleep: {
            hours: w.sleepHours,
            score: w.sleepScore,
            spo2: w.spO2
          },
          subjective: {
            fatigue: w.fatigue,
            soreness: w.soreness,
            stress: w.stress,
            mood: w.mood
          }
        }))
      }
    }
  })
})
