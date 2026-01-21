import { tool } from 'ai'
import { z } from 'zod'
import { workoutRepository } from '../repositories/workoutRepository'

export const analysisTools = (userId: string, timezone: string) => ({
  analyze_training_load: tool({
    description:
      'Analyze training load (ATL, CTL, TSB) and progression over a time range. Use this to assess fatigue, fitness, and form.',
    inputSchema: z.object({
      start_date: z.string().describe('Start date (YYYY-MM-DD)'),
      end_date: z.string().optional().describe('End date (YYYY-MM-DD)')
    }),
    execute: async ({ start_date, end_date }) => {
      const start = new Date(start_date)
      const end = end_date ? new Date(end_date) : new Date()

      const workouts = await workoutRepository.getForUser(userId, {
        startDate: start,
        endDate: end,
        orderBy: { date: 'asc' },
        select: {
          date: true,
          tss: true,
          durationSec: true
        } as any // Cast because repo types might be slightly strict on select vs include
      })

      // Simple aggregation (in reality would fetch pre-calculated metrics)
      const totalTSS = workouts.reduce((sum: number, w: any) => sum + (w.tss || 0), 0)
      const avgTSS = totalTSS / (workouts.length || 1)

      return {
        period: { start: start_date, end: end_date || 'now' },
        total_workouts: workouts.length,
        total_tss: Math.round(totalTSS),
        avg_tss: Math.round(avgTSS),
        // TODO: Implement actual ATL/CTL/TSB calculation or fetch from DB
        metrics: 'Detailed ATL/CTL/TSB requires historical processing.'
      }
    }
  }),

  create_chart: tool({
    description: 'Generate a chart visualization for the chat UI.',
    inputSchema: z.object({
      type: z.enum(['line', 'bar', 'doughnut', 'scatter']).describe('Type of chart'),
      title: z.string(),
      labels: z.array(z.string()).describe('X-axis labels'),
      datasets: z.array(
        z.object({
          label: z.string(),
          data: z.array(z.number()),
          backgroundColor: z.string().optional(),
          borderColor: z.string().optional()
        })
      )
    }),
    execute: async (args) => {
      return { success: true, ...args }
    }
  })
})
