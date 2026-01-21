import { tool } from 'ai'
import { z } from 'zod'
import { recommendationRepository } from '../repositories/recommendationRepository'

export const recommendationTools = (userId: string, timezone: string) => ({
  recommend_workout: tool({
    description: 'Recommend a specific workout based on the users goal and availability.',
    inputSchema: z.object({
      day_of_week: z.number().describe('0=Sunday, 1=Monday...'),
      morning: z.boolean().optional(),
      afternoon: z.boolean().optional(),
      evening: z.boolean().optional(),
      bike_access: z.boolean().optional(),
      gym_access: z.boolean().optional(),
      indoor_only: z.boolean().optional(),
      notes: z.string().optional()
    }),
    execute: async (args) => {
      // Logic to select a workout from a library or generate one
      return {
        recommendation: {
          title: 'Zone 2 Endurance Ride',
          duration_minutes: 90,
          description: 'Steady state ride at 65-75% FTP.',
          tss: 60
        }
      }
    }
  }),

  get_recommendation_details: tool({
    description: 'Get full details of a specific AI recommendation.',
    inputSchema: z.object({
      recommendation_id: z.string()
    }),
    execute: async ({ recommendation_id }) => {
      const rec = await recommendationRepository.findById(recommendation_id, userId)
      return rec || { error: 'Recommendation not found' }
    }
  }),

  list_pending_recommendations: tool({
    description: 'List current pending recommendations for the user.',
    inputSchema: z.object({
      status: z.string().optional().default('ACTIVE'), // Changed default to ACTIVE as pending doesn't exist in schema defaults
      priority: z.string().optional(),
      limit: z.number().optional().default(5)
    }),
    execute: async ({ status = 'ACTIVE', priority, limit = 5 }) => {
      const recs = await recommendationRepository.list(userId, {
        status,
        limit
        // Priority filtering logic is custom in the old code, repo supports some filters but maybe not priority directly?
        // Repo code: if (filters.metric) where.metric = ...
        // Repo code does NOT have priority filter.
        // But we can filter in memory or update repo.
        // Let's check repo again.
      })

      // If priority was requested, filter manually since repo doesn't support it yet
      let filteredRecs = recs
      if (priority) {
        filteredRecs = recs.filter((r) => r.priority === priority)
      }

      return { count: filteredRecs.length, recommendations: filteredRecs }
    }
  })
})
