import type {
  Prisma,
  UserMemory,
  UserMemoryCategory,
  UserMemoryScope,
  UserMemorySource,
  UserMemoryStatus
} from '@prisma/client'
import { prisma } from '../db'

export type MemoryCandidate = {
  scope: UserMemoryScope
  roomId?: string | null
  category: UserMemoryCategory
  content: string
  normalizedKey: string
  confidence: number
  source: UserMemorySource
  sensitive: boolean
  pinned?: boolean
  metadata?: Record<string, any>
}

const ACTIVE_MEMORY_STATUS: UserMemoryStatus = 'ACTIVE'
const PROMPT_GLOBAL_LIMIT = 8
const PROMPT_ROOM_LIMIT = 4

/**
 * How long a TEMPORARY memory stays eligible for the prompt.
 *
 * TEMPORARY is the classifier's default bucket, so it collects things that are
 * only true for a few days — "HRV is 45ms today", "sore after Sunday's race",
 * "unavailable 19-25 July". Nothing ever expired them, so they kept their place
 * in the prompt indefinitely and crowded out durable facts: one athlete's
 * memory block still described soreness and a rest period from a race six weeks
 * earlier, which is why the coach kept treating a finished event as current.
 */
const TEMPORARY_MEMORY_TTL_DAYS = 30

function createServiceError(statusCode: number, message: string) {
  const error = new Error(message) as Error & {
    statusCode: number
    statusMessage: string
  }
  error.statusCode = statusCode
  error.statusMessage = message
  return error
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

export function normalizeMemoryKey(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

export function inferMemoryCategory(content: string): UserMemoryCategory {
  const normalized = content.toLowerCase()

  if (
    /\b(prefer|likes?|dislikes?|favorite|usually|tend to|works best|best for me)\b/.test(normalized)
  ) {
    return 'PREFERENCE'
  }

  if (/\b(goal|training for|race|marathon|half marathon|triathlon|target|aim)\b/.test(normalized)) {
    return 'GOAL'
  }

  if (
    /\b(injury|injured|pain|avoid|cannot|can't|limit|sensitive|allergy|vegan|vegetarian)\b/.test(
      normalized
    )
  ) {
    return 'CONSTRAINT'
  }

  if (
    /\b(call me|my name is|i am|i'm|live in|timezone|schedule|coach me|keep replies)\b/.test(
      normalized
    )
  ) {
    return 'PROFILE'
  }

  if (/\b(reply|answers?|explain|tone|concise|brief|detailed|direct)\b/.test(normalized)) {
    return 'COMMUNICATION'
  }

  return 'TEMPORARY'
}

export function isSensitiveMemoryContent(content: string) {
  return /\b(injury|injured|pain|medical|health|surgery|illness|allergy|menstru|pregnan|anxiety|depression)\b/i.test(
    content
  )
}

/**
 * True when a TEMPORARY memory has aged out of usefulness.
 *
 * Only TEMPORARY is subject to this — PREFERENCE, CONSTRAINT, GOAL, PROFILE and
 * COMMUNICATION describe durable facts and instructions and must never expire.
 * That distinction matters: the same athlete whose stale soreness notes caused
 * this bug had also told the coach to stop mentioning a race, and that
 * instruction is a PREFERENCE which has to survive.
 *
 * Pinned memories are exempt — pinning is an explicit "keep this".
 */
export function isStaleTemporaryMemory(
  memory: Pick<UserMemory, 'category' | 'pinned' | 'lastConfirmedAt' | 'updatedAt'>,
  now: Date = new Date()
) {
  if (memory.category !== 'TEMPORARY' || memory.pinned) return false

  const lastTouched = Math.max(
    memory.lastConfirmedAt ? new Date(memory.lastConfirmedAt).getTime() : 0,
    memory.updatedAt ? new Date(memory.updatedAt).getTime() : 0
  )
  if (!lastTouched) return false

  return now.getTime() - lastTouched > TEMPORARY_MEMORY_TTL_DAYS * 24 * 60 * 60 * 1000
}

function rankMemory(
  memory: Pick<UserMemory, 'pinned' | 'confidence' | 'lastConfirmedAt' | 'updatedAt'>
) {
  const confirmationBoost = memory.lastConfirmedAt
    ? new Date(memory.lastConfirmedAt).getTime() / 1e13
    : 0
  const updateBoost = memory.updatedAt ? new Date(memory.updatedAt).getTime() / 1e13 : 0
  return (memory.pinned ? 100 : 0) + memory.confidence * 10 + confirmationBoost + updateBoost
}

export function buildMemoryCandidate(input: {
  content: string
  source: UserMemorySource
  scope?: UserMemoryScope
  roomId?: string | null
  category?: UserMemoryCategory
  confidence?: number
  sensitive?: boolean
  pinned?: boolean
  metadata?: Record<string, any>
}): MemoryCandidate {
  const content = input.content.trim()
  const category = input.category || inferMemoryCategory(content)
  const sensitive = input.sensitive ?? isSensitiveMemoryContent(content)
  return {
    scope: input.scope || 'GLOBAL',
    roomId: input.roomId || null,
    category,
    content,
    normalizedKey: normalizeMemoryKey(content),
    confidence: clampConfidence(input.confidence ?? 0.9),
    source: input.source,
    sensitive,
    pinned: !!input.pinned,
    metadata: input.metadata || {}
  }
}

class UserMemoryService {
  async listMemories(params: {
    userId: string
    scope?: UserMemoryScope
    roomId?: string | null
    includeDeleted?: boolean
  }) {
    return await prisma.userMemory.findMany({
      where: {
        userId: params.userId,
        ...(params.scope ? { scope: params.scope } : {}),
        ...(params.roomId !== undefined
          ? params.roomId
            ? { roomId: params.roomId }
            : { roomId: null }
          : {}),
        ...(params.includeDeleted ? {} : { status: ACTIVE_MEMORY_STATUS })
      },
      orderBy: [{ pinned: 'desc' }, { confidence: 'desc' }, { updatedAt: 'desc' }]
    })
  }

  async getMemoryById(userId: string, memoryId: string) {
    return await prisma.userMemory.findFirst({
      where: {
        id: memoryId,
        userId
      }
    })
  }

  async saveMemory(
    userId: string,
    candidate: MemoryCandidate,
    options: { touchConfirmedAt?: boolean } = {}
  ) {
    const now = new Date()
    const existing = await prisma.userMemory.findFirst({
      where: {
        userId,
        normalizedKey: candidate.normalizedKey,
        scope: candidate.scope,
        ...(candidate.scope === 'ROOM' ? { roomId: candidate.roomId || null } : { roomId: null }),
        status: {
          in: ['ACTIVE', 'ARCHIVED']
        }
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }]
    })

    const data: Prisma.UserMemoryUncheckedCreateInput = {
      userId,
      scope: candidate.scope,
      roomId: candidate.scope === 'ROOM' ? candidate.roomId || null : null,
      category: candidate.category,
      content: candidate.content,
      normalizedKey: candidate.normalizedKey,
      confidence: candidate.confidence,
      source: candidate.source,
      status: 'ACTIVE',
      pinned: !!candidate.pinned,
      sensitive: candidate.sensitive,
      lastConfirmedAt: options.touchConfirmedAt ? now : null,
      metadata: candidate.metadata || {}
    }

    if (!existing) {
      return {
        memory: await prisma.userMemory.create({ data }),
        created: true,
        updated: false
      }
    }

    const memory = await prisma.userMemory.update({
      where: { id: existing.id },
      data: {
        content: candidate.content,
        category: candidate.category,
        confidence: Math.max(existing.confidence, candidate.confidence),
        source: candidate.source,
        status: 'ACTIVE',
        pinned: existing.pinned || !!candidate.pinned,
        sensitive: existing.sensitive || candidate.sensitive,
        roomId: candidate.scope === 'ROOM' ? candidate.roomId || null : null,
        metadata: {
          ...(((existing.metadata as any) || {}) ?? {}),
          ...candidate.metadata
        } as Prisma.InputJsonValue,
        ...(options.touchConfirmedAt ? { lastConfirmedAt: now } : {})
      }
    })

    return {
      memory,
      created: false,
      updated: true
    }
  }

  async updateMemory(
    userId: string,
    memoryId: string,
    patch: Partial<MemoryCandidate> & {
      status?: UserMemoryStatus
    }
  ) {
    const existing = await this.getMemoryById(userId, memoryId)
    if (!existing) {
      throw createServiceError(404, 'Memory not found.')
    }

    const content = typeof patch.content === 'string' ? patch.content.trim() : existing.content

    return await prisma.userMemory.update({
      where: { id: memoryId },
      data: {
        ...(patch.scope ? { scope: patch.scope } : {}),
        ...(patch.scope === 'ROOM'
          ? { roomId: patch.roomId || existing.roomId || null }
          : patch.scope === 'GLOBAL'
            ? { roomId: null }
            : {}),
        ...(patch.category ? { category: patch.category } : {}),
        ...(typeof patch.content === 'string'
          ? {
              content,
              normalizedKey: normalizeMemoryKey(content)
            }
          : {}),
        ...(typeof patch.confidence === 'number'
          ? { confidence: clampConfidence(patch.confidence) }
          : {}),
        ...(patch.source ? { source: patch.source } : {}),
        ...(patch.status ? { status: patch.status } : {}),
        ...(typeof patch.pinned === 'boolean' ? { pinned: patch.pinned } : {}),
        ...(typeof patch.sensitive === 'boolean' ? { sensitive: patch.sensitive } : {}),
        ...(patch.metadata ? { metadata: patch.metadata as Prisma.InputJsonValue } : {}),
        ...(patch.source === 'USER_EXPLICIT' || patch.source === 'MANUAL_UI'
          ? { lastConfirmedAt: new Date() }
          : {})
      }
    })
  }

  async softDeleteMemory(userId: string, memoryId: string) {
    const existing = await this.getMemoryById(userId, memoryId)
    if (!existing) {
      throw createServiceError(404, 'Memory not found.')
    }

    return await prisma.userMemory.update({
      where: { id: memoryId },
      data: {
        status: 'DELETED'
      }
    })
  }

  async forgetByContent(params: { userId: string; content: string; roomId?: string | null }) {
    const normalized = normalizeMemoryKey(params.content)
    const matches = await prisma.userMemory.findMany({
      where: {
        userId: params.userId,
        status: 'ACTIVE',
        AND: [
          {
            OR: [
              { normalizedKey: normalized },
              { content: { contains: params.content, mode: 'insensitive' } }
            ]
          },
          ...(params.roomId
            ? [{ OR: [{ roomId: params.roomId }, { scope: 'GLOBAL' as UserMemoryScope }] }]
            : [])
        ]
      },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }]
    })

    if (matches.length === 0) {
      return { status: 'not_found' as const, matches: [] }
    }

    if (matches.length > 1) {
      return { status: 'ambiguous' as const, matches }
    }

    const memory = await prisma.userMemory.update({
      where: { id: matches[0]!.id },
      data: { status: 'ARCHIVED' }
    })

    return { status: 'archived' as const, matches: [memory] }
  }

  async getRoomMemoryState(userId: string, roomId: string) {
    const [room, memories] = await Promise.all([
      prisma.chatRoom.findFirst({
        where: {
          id: roomId,
          users: {
            some: {
              userId
            }
          }
        },
        select: {
          id: true,
          metadata: true
        }
      }),
      this.listMemories({
        userId,
        scope: 'ROOM',
        roomId
      })
    ])

    if (!room) {
      throw createServiceError(404, 'Room not found or access denied')
    }

    const metadata = (room.metadata as any) || {}
    return {
      historySummary: typeof metadata.historySummary === 'string' ? metadata.historySummary : '',
      lastSummarizedAt:
        typeof metadata.lastSummarizedAt === 'string' ? metadata.lastSummarizedAt : null,
      memories
    }
  }

  async composePromptMemoryBlock(params: {
    userId: string
    roomId?: string | null
    memoryEnabled?: boolean
  }) {
    if (params.memoryEnabled === false) {
      return {
        globalBlock: '',
        roomBlock: ''
      }
    }

    // Stale TEMPORARY memories are dropped from the prompt only. They stay in
    // the store and remain visible to the memory management tools, so nothing
    // the athlete saved silently disappears from their view.
    const now = new Date()
    const promptEligible = (memories: UserMemory[]) =>
      memories.filter((memory) => !isStaleTemporaryMemory(memory, now))

    const globalMemories = promptEligible(
      await this.listMemories({
        userId: params.userId,
        scope: 'GLOBAL',
        roomId: null
      })
    )
      .sort((left, right) => rankMemory(right) - rankMemory(left))
      .slice(0, PROMPT_GLOBAL_LIMIT)

    const roomMemories = params.roomId
      ? promptEligible(
          await this.listMemories({
            userId: params.userId,
            scope: 'ROOM',
            roomId: params.roomId
          })
        )
          .sort((left, right) => rankMemory(right) - rankMemory(left))
          .slice(0, PROMPT_ROOM_LIMIT)
      : []

    if (globalMemories.length > 0 || roomMemories.length > 0) {
      const usedAt = new Date()
      await prisma.userMemory.updateMany({
        where: {
          id: {
            in: [...globalMemories, ...roomMemories].map((memory) => memory.id)
          }
        },
        data: {
          lastUsedAt: usedAt
        }
      })
    }

    return {
      globalBlock: globalMemories.length
        ? ['## Cross-Chat Memory', ...globalMemories.map((memory) => `- ${memory.content}`)].join(
            '\n'
          )
        : '',
      roomBlock: roomMemories.length
        ? ['## This Chat Memory', ...roomMemories.map((memory) => `- ${memory.content}`)].join('\n')
        : ''
    }
  }

  async saveMemoryCandidates(params: { userId: string; candidates: MemoryCandidate[] }) {
    const saved: UserMemory[] = []
    for (const candidate of params.candidates) {
      const result = await this.saveMemory(params.userId, candidate)
      saved.push(result.memory)
    }

    return saved
  }
}

export const userMemoryService = new UserMemoryService()
