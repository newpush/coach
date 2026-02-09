import { prisma } from '../db'
import type { QuotaOperation } from './registry'
import { QUOTA_REGISTRY, mapOperationToQuota } from './registry'
import { SubscriptionTier, type User } from '@prisma/client'

export interface QuotaStatus {
  allowed: boolean
  used: number
  limit: number
  remaining: number
  window: string
  resetsAt: Date | null
  enforcement: 'STRICT' | 'MEASURE'
}

/**
 * Get current usage and limit status for a user and operation
 */
export async function getQuotaStatus(
  userId: string,
  operation: string
): Promise<QuotaStatus | null> {
  const canonicalOp = mapOperationToQuota(operation)
  if (!canonicalOp) return null

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true }
  })

  if (!user) return null

  const tier = user.subscriptionTier
  const quotaDef = QUOTA_REGISTRY[tier][canonicalOp]

  if (!quotaDef) return null

  // Calculate usage within the window
  // Using raw query for flexible interval support
  const usageCount: any[] = await prisma.$queryRawUnsafe(
    `
    SELECT COUNT(*)::int as count, MIN("createdAt") as "firstUsedAt"
    FROM "LlmUsage"
    WHERE "userId" = $1
      AND "operation" = $2
      AND "success" = true
      AND "createdAt" >= NOW() - CAST($3 AS interval)
  `,
    userId,
    operation,
    quotaDef.window
  )

  const used = usageCount[0]?.count || 0
  const remaining = Math.max(0, quotaDef.limit - used)

  // Estimate reset time based on the oldest record in the window
  let resetsAt = null
  if (used > 0 && usageCount[0]?.firstUsedAt) {
    const firstUsedAt = new Date(usageCount[0].firstUsedAt)
    // This is an approximation. Real reset happens record-by-record in a rolling window.
    // For simplicity, we show when the NEXT slot might open up if they are capped.
    resetsAt = new Date(firstUsedAt.getTime() + parseIntervalToMs(quotaDef.window))
  }

  return {
    allowed: quotaDef.enforcement === 'MEASURE' || used < quotaDef.limit,
    used,
    limit: quotaDef.limit,
    remaining,
    window: quotaDef.window,
    resetsAt,
    enforcement: quotaDef.enforcement
  }
}

/**
 * Check if a user is allowed to perform an operation and throw if not
 */
export async function checkQuota(userId: string, operation: string): Promise<QuotaStatus> {
  const status = await getQuotaStatus(userId, operation)

  if (!status) {
    // If no quota defined, we allow it but log it
    return {
      allowed: true,
      used: 0,
      limit: Infinity,
      remaining: Infinity,
      window: 'none',
      resetsAt: null,
      enforcement: 'MEASURE'
    }
  }

  if (!status.allowed && status.enforcement === 'STRICT') {
    throw createError({
      statusCode: 429,
      statusMessage: `Quota exceeded for ${operation}. Upgrade your plan for higher limits.`
    })
  }

  return status
}

/**
 * Helper to convert PG interval strings to ms (basic support)
 */
function parseIntervalToMs(interval: string): number {
  const parts = interval.split(' ')
  if (parts.length < 2) return 0
  const value = parseInt(parts[0] || '0')
  const unit = (parts[1] || '').toLowerCase()

  if (unit.includes('hour')) return value * 60 * 60 * 1000
  if (unit.includes('day')) return value * 24 * 60 * 60 * 1000
  if (unit.includes('week')) return value * 7 * 24 * 60 * 60 * 1000
  if (unit.includes('month')) return value * 30 * 24 * 60 * 60 * 1000

  return value * 60 * 1000 // default to minutes
}

/**
 * Get all quota statuses for a user
 */
export async function getQuotaSummary(userId: string): Promise<QuotaStatus[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true }
  })

  if (!user) return []

  const tier = user.subscriptionTier
  const ops = Object.keys(QUOTA_REGISTRY[tier]) as QuotaOperation[]

  const results = await Promise.all(ops.map((op) => getQuotaStatus(userId, op)))
  return results.filter((r): r is QuotaStatus => r !== null)
}
