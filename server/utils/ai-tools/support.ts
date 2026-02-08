import { tool } from 'ai'
import { z } from 'zod'
import { prisma } from '../db'

export const supportTools = (userId: string, chatRoomId?: string) => ({
  report_bug: tool({
    description:
      'Report a bug or technical issue to the developers. Use this when the user describes something that is not working as expected.',
    inputSchema: z.object({
      title: z.string().describe('Short, descriptive title of the bug'),
      description: z
        .string()
        .describe('Detailed description of what went wrong, including expected vs actual behavior'),
      context: z
        .any()
        .optional()
        .describe('Any relevant technical context or session state that might help debug the issue')
    }),
    execute: async ({ title, description, context }) => {
      try {
        const bugReport = await prisma.bugReport.create({
          data: {
            userId,
            chatRoomId,
            title,
            description,
            context,
            status: 'OPEN'
          }
        })
        return {
          success: true,
          message: `Bug report successfully submitted. Internal ID: ${bugReport.id}`,
          id: bugReport.id
        }
      } catch (error: any) {
        return {
          success: false,
          error: `Failed to submit bug report: ${error.message}`
        }
      }
    }
  }),

  find_bug_reports: tool({
    description:
      'Find existing bug reports submitted by the user. Use this when the user asks about the status of their reports or wants to modify one.',
    inputSchema: z.object({
      status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
      limit: z.number().optional().default(5)
    }),
    execute: async ({ status, limit = 5 }) => {
      try {
        const reports = await prisma.bugReport.findMany({
          where: {
            userId,
            ...(status ? { status } : {})
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: {
            id: true,
            title: true,
            status: true,
            createdAt: true,
            description: true
          }
        })

        return {
          count: reports.length,
          reports
        }
      } catch (error: any) {
        return { error: `Failed to fetch bug reports: ${error.message}` }
      }
    }
  }),

  update_bug_report: tool({
    description:
      'Update the details or status of an existing bug report. Use this when the user wants to add more info or close a report.',
    inputSchema: z.object({
      report_id: z.string().describe('The ID of the bug report to update'),
      title: z.string().optional(),
      description: z.string().optional(),
      status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional()
    }),
    execute: async ({ report_id, title, description, status }) => {
      try {
        const existing = await prisma.bugReport.findFirst({
          where: { id: report_id, userId }
        })

        if (!existing) return { error: 'Bug report not found or access denied.' }

        const updated = await prisma.bugReport.update({
          where: { id: report_id },
          data: {
            ...(title ? { title } : {}),
            ...(description ? { description } : {}),
            ...(status ? { status } : {})
          }
        })

        return {
          success: true,
          message: 'Bug report updated successfully.',
          report: {
            id: updated.id,
            title: updated.title,
            status: updated.status
          }
        }
      } catch (error: any) {
        return { error: `Failed to update bug report: ${error.message}` }
      }
    }
  })
})
