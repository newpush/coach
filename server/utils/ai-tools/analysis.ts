import { tool } from 'ai'
import { z } from 'zod'
import { workoutRepository } from '../repositories/workoutRepository'
import { ingestAllTask } from '../../../trigger/ingest-all'
import { generateReportTask } from '../../../trigger/generate-report'
import { prisma } from '../../utils/db'
import { getStartOfDaysAgoUTC, formatUserDate } from '../../utils/date'

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

  sync_data: tool({
    description:
      'Sync training and wellness data from all connected services (Strava, Whoop, Intervals.icu, Yazio, etc). Use this when the user says they just finished a workout or their data is out of date.',
    inputSchema: z.object({
      days: z.number().optional().default(3).describe('Number of days to sync back (default 3)')
    }),
    needsApproval: false,
    execute: async ({ days = 3 }) => {
      const startDate = formatUserDate(getStartOfDaysAgoUTC(timezone, days), timezone, 'yyyy-MM-dd')
      const endDate = formatUserDate(new Date(), timezone, 'yyyy-MM-dd')

      try {
        await ingestAllTask.trigger(
          { userId, startDate, endDate },
          {
            tags: [`user:${userId}`, 'manual-sync'],
            concurrencyKey: userId
          }
        )
        return {
          success: true,
          message: `Data synchronization for the last ${days} days has been started.`
        }
      } catch (e: any) {
        return { error: `Failed to trigger sync: ${e.message}` }
      }
    }
  }),

  generate_report: tool({
    description:
      'Trigger the generation of a detailed analysis report. Use this when the user wants a structured summary of their progress.',
    inputSchema: z.object({
      type: z
        .enum(['WEEKLY_TRAINING', 'LAST_3_WORKOUTS', 'LAST_3_NUTRITION', 'WEEKLY_NUTRITION'])
        .describe('The type of report to generate')
    }),
    needsApproval: false,
    execute: async ({ type }) => {
      const TEMPLATE_MAP: Record<string, string> = {
        LAST_3_WORKOUTS: '00000000-0000-0000-0000-000000000001',
        WEEKLY_TRAINING: '00000000-0000-0000-0000-000000000002',
        LAST_3_NUTRITION: '00000000-0000-0000-0000-000000000003',
        WEEKLY_NUTRITION: '00000000-0000-0000-0000-000000000004'
      }

      const templateId = TEMPLATE_MAP[type]
      if (!templateId) return { error: `Invalid report type: ${type}` }

      // Create report record
      const report = await prisma.report.create({
        data: {
          userId,
          type: type.includes('NUTRITION') ? 'NUTRITION_ANALYSIS' : 'TRAINING_ANALYSIS',
          status: 'PENDING',
          dateRangeStart: getStartOfDaysAgoUTC(timezone, type.includes('WEEKLY') ? 7 : 30),
          dateRangeEnd: new Date(),
          templateId
        }
      })

      try {
        await generateReportTask.trigger(
          { userId, reportId: report.id, templateId },
          {
            tags: [`user:${userId}`, `report:${report.id}`],
            concurrencyKey: userId
          }
        )
        return {
          success: true,
          report_id: report.id,
          message: `${type.replace('_', ' ')} report generation has started and will be available in your reports section shortly.`
        }
      } catch (e: any) {
        return { error: `Failed to trigger report generation: ${e.message}` }
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
