import { describe, expect, it } from 'vitest'
import { isStaleTemporaryMemory } from '../../../../../server/utils/services/userMemoryService'

// CW-589: TEMPORARY memories never expired, so short-lived facts ("sore after
// Sunday's race", "resting until 8 July") stayed in the prompt indefinitely and
// kept a finished event alive in the coach's context weeks later.

const NOW = new Date('2026-08-12T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000)

const memory = (over: Partial<Parameters<typeof isStaleTemporaryMemory>[0]> = {}) =>
  ({
    category: 'TEMPORARY',
    pinned: false,
    lastConfirmedAt: null,
    updatedAt: daysAgo(45),
    ...over
  }) as Parameters<typeof isStaleTemporaryMemory>[0]

describe('isStaleTemporaryMemory (CW-589)', () => {
  it('treats a TEMPORARY memory older than the TTL as stale', () => {
    expect(isStaleTemporaryMemory(memory({ updatedAt: daysAgo(45) }), NOW)).toBe(true)
  })

  it('keeps a recent TEMPORARY memory', () => {
    expect(isStaleTemporaryMemory(memory({ updatedAt: daysAgo(3) }), NOW)).toBe(false)
  })

  it('keeps a TEMPORARY memory that was recently reconfirmed even if updated long ago', () => {
    expect(
      isStaleTemporaryMemory(memory({ updatedAt: daysAgo(90), lastConfirmedAt: daysAgo(2) }), NOW)
    ).toBe(false)
  })

  it('never expires a pinned TEMPORARY memory', () => {
    expect(isStaleTemporaryMemory(memory({ pinned: true, updatedAt: daysAgo(365) }), NOW)).toBe(
      false
    )
  })

  // The durable categories must survive: the athlete who hit this bug had also
  // told the coach to stop mentioning a race, stored as a PREFERENCE.
  it.each(['PREFERENCE', 'CONSTRAINT', 'GOAL', 'PROFILE', 'COMMUNICATION'] as const)(
    'never expires a %s memory regardless of age',
    (category) => {
      expect(isStaleTemporaryMemory(memory({ category, updatedAt: daysAgo(365) }), NOW)).toBe(false)
    }
  )

  it('does not expire a memory with no usable timestamps', () => {
    expect(
      isStaleTemporaryMemory(
        memory({ updatedAt: null as unknown as Date, lastConfirmedAt: null }),
        NOW
      )
    ).toBe(false)
  })
})
