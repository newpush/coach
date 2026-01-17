import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getUserLocalDate,
  getStartOfDayUTC,
  getEndOfDayUTC,
  formatUserDate,
  formatDateUTC,
  getUserTimezone,
  getStartOfDaysAgoUTC,
  getStartOfYearUTC,
  formatUserTime
} from './date'

import { prisma } from './db'

// Mock the db module
vi.mock('./db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn()
    }
  }
}))

describe('Date Utils', () => {
  // Mock system time to a known fixed point for consistent testing
  // 2026-01-15T12:00:00Z (Noon UTC)
  const SYSTEM_TIME = new Date('2026-01-15T12:00:00Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(SYSTEM_TIME)
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('getUserTimezone', () => {
    it('returns user timezone when found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ timezone: 'Europe/Paris' } as any)
      const tz = await getUserTimezone('user-123')
      expect(tz).toBe('Europe/Paris')
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: { timezone: true }
      })
    })

    it('returns UTC when user not found or no timezone', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
      const tz = await getUserTimezone('user-123')
      expect(tz).toBe('UTC')
    })

    it('returns UTC when userId is missing', async () => {
      const tz = await getUserTimezone('')
      expect(tz).toBe('UTC')
      expect(prisma.user.findUnique).not.toHaveBeenCalled()
    })
  })

  describe('getUserLocalDate', () => {
    it('returns 2026-01-15T00:00:00Z for UTC user', () => {
      const result = getUserLocalDate('UTC')
      expect(result.toISOString()).toBe('2026-01-15T00:00:00.000Z')
    })

    it('returns 2026-01-15T00:00:00Z for New York (UTC-5) at Noon UTC (7am NY)', () => {
      // 12:00 UTC is 07:00 NY. Same day.
      const result = getUserLocalDate('America/New_York')
      expect(result.toISOString()).toBe('2026-01-15T00:00:00.000Z')
    })

    it('returns 2026-01-15T00:00:00Z for Tokyo (UTC+9) at Noon UTC (9pm Tokyo)', () => {
      // 12:00 UTC is 21:00 Tokyo. Same day.
      const result = getUserLocalDate('Asia/Tokyo')
      expect(result.toISOString()).toBe('2026-01-15T00:00:00.000Z')
    })

    it('handles day boundary: 23:00 UTC (Next day in Tokyo)', () => {
      vi.setSystemTime(new Date('2026-01-15T23:00:00Z'))
      // 23:00 UTC is 08:00 Tokyo on Jan 16
      const result = getUserLocalDate('Asia/Tokyo')
      expect(result.toISOString()).toBe('2026-01-16T00:00:00.000Z')
    })

    it('handles day boundary: 01:00 UTC (Previous day in NY)', () => {
      vi.setSystemTime(new Date('2026-01-15T01:00:00Z'))
      // 01:00 UTC is 20:00 NY on Jan 14
      const result = getUserLocalDate('America/New_York')
      expect(result.toISOString()).toBe('2026-01-14T00:00:00.000Z')
    })

    it('uses provided date explicitly', () => {
      const explicitDate = new Date('2025-12-25T12:00:00Z')
      const result = getUserLocalDate('UTC', explicitDate)
      expect(result.toISOString()).toBe('2025-12-25T00:00:00.000Z')
    })
  })

  describe('getStartOfDayUTC', () => {
    it('returns correct UTC start time for New York', () => {
      // Start of Jan 15 in NY is Jan 15 00:00 EST -> Jan 15 05:00 UTC
      const date = new Date('2026-01-15T12:00:00Z')
      const result = getStartOfDayUTC('America/New_York', date)
      expect(result.toISOString()).toBe('2026-01-15T05:00:00.000Z')
    })

    it('returns correct UTC start time for Tokyo', () => {
      // Start of Jan 15 in Tokyo is Jan 15 00:00 JST -> Jan 14 15:00 UTC
      const date = new Date('2026-01-15T12:00:00Z')
      const result = getStartOfDayUTC('Asia/Tokyo', date)
      expect(result.toISOString()).toBe('2026-01-14T15:00:00.000Z')
    })
  })

  describe('getEndOfDayUTC', () => {
    it('returns correct UTC end time for New York', () => {
      // End of Jan 15 in NY is Jan 15 23:59:59.999 EST -> Jan 16 04:59:59.999 UTC
      const date = new Date('2026-01-15T12:00:00Z')
      const result = getEndOfDayUTC('America/New_York', date)
      expect(result.toISOString()).toBe('2026-01-16T04:59:59.999Z')
    })
  })

  describe('getStartOfDaysAgoUTC', () => {
    it('returns start of day 3 days ago in NY', () => {
      // Today: Jan 15. 3 days ago: Jan 12.
      // Start of Jan 12 in NY -> Jan 12 05:00 UTC
      const date = new Date('2026-01-15T12:00:00Z')
      const result = getStartOfDaysAgoUTC('America/New_York', 3, date)
      expect(result.toISOString()).toBe('2026-01-12T05:00:00.000Z')
    })
  })

  describe('getStartOfYearUTC', () => {
    it('returns start of year in NY', () => {
      // Start of 2026 in NY -> 2026-01-01 00:00 EST -> 2026-01-01 05:00 UTC
      const date = new Date('2026-06-15T12:00:00Z')
      const result = getStartOfYearUTC('America/New_York', date)
      expect(result.toISOString()).toBe('2026-01-01T05:00:00.000Z')
    })
  })

  describe('formatUserDate', () => {
    it('formats correctly for New York', () => {
      const date = new Date('2026-01-15T12:00:00Z') // 7am NY
      const result = formatUserDate(date, 'America/New_York', 'yyyy-MM-dd HH:mm')
      expect(result).toBe('2026-01-15 07:00')
    })

    it('formats correctly for Tokyo', () => {
      const date = new Date('2026-01-15T12:00:00Z') // 9pm Tokyo
      const result = formatUserDate(date, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm')
      expect(result).toBe('2026-01-15 21:00')
    })

    it('formats correctly with default format (yyyy-MM-dd)', () => {
      const date = new Date('2026-01-15T12:00:00Z') // 7am NY
      const result = formatUserDate(date, 'America/New_York')
      expect(result).toBe('2026-01-15')
    })
  })

  describe('formatUserTime', () => {
    it('formats time correctly for New York', () => {
      const date = new Date('2026-01-15T12:00:00Z') // 7am NY
      const result = formatUserTime(date, 'America/New_York', 'HH:mm')
      expect(result).toBe('07:00')
    })

    it('formats time correctly with default format (HH:mm)', () => {
      const date = new Date('2026-01-15T12:00:00Z') // 7am NY
      const result = formatUserTime(date, 'America/New_York')
      expect(result).toBe('07:00')
    })
  })

  describe('formatDateUTC', () => {
    it('formats UTC midnight date without shifting', () => {
      // 2026-01-15T00:00:00Z
      const date = new Date('2026-01-15T00:00:00Z')
      // Even if run in a different timezone context, this should format strictly on the Date object's values
      // But formatDateUTC is implemented as format(date, ..., { timeZone: 'UTC' })
      const result = formatDateUTC(date, 'yyyy-MM-dd')
      expect(result).toBe('2026-01-15')
    })
  })
})
