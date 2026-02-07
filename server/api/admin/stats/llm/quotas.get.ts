import { defineEventHandler, createError } from 'h3'
import { getServerSession } from '../../../../utils/session'
import { prisma } from '../../../../utils/db'
import { QUOTA_REGISTRY, QuotaOperation } from '../../../../utils/quotas/registry'
import type { SubscriptionTier } from '@prisma/client'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const query = getQuery(event)
  const showAll = query.all === 'true'
  const results: any[] = []

  const validDbTiers = ['FREE', 'SUPPORTER', 'PRO']

  // Iterate through tiers and operations to find users near limits
  for (const tier of Object.keys(QUOTA_REGISTRY) as SubscriptionTier[]) {
    if (!validDbTiers.includes(tier)) continue

    const tierQuotas = QUOTA_REGISTRY[tier]

    for (const [op, def] of Object.entries(tierQuotas)) {
      if (!def) continue

      // Find users of this tier who have usage >= threshold
      // Default threshold is 80%, if showAll is true then 1 record is enough
      const threshold = showAll ? 1 : Math.max(1, Math.floor(def.limit * 0.8))

      const nearLimitUsers = await prisma.$queryRaw<any[]>`
        SELECT 
          u.id as "userId", 
          u.email, 
          u.name,
          COUNT(l.id)::int as used
        FROM "User" u
        JOIN "LlmUsage" l ON l."userId" = u.id
        WHERE u."subscriptionTier"::text = ${tier}
          AND l.operation = ${op}
          AND l.success = true
          AND l."createdAt" >= NOW() - CAST(${def.window} AS interval)
        GROUP BY u.id, u.email, u.name
        HAVING COUNT(l.id) >= ${threshold}
        ORDER BY used DESC
      `

      if (nearLimitUsers.length > 0) {
        results.push({
          tier,
          operation: op,
          limit: def.limit,
          window: def.window,
          users: nearLimitUsers
        })
      }
    }
  }

  return {
    nearLimits: results,
    showAll
  }
})
