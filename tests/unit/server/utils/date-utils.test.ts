import { describe, it, expect } from 'vitest'
import { buildZonedDateTimeFromUtcDate } from '../../../../server/utils/date'

describe('Date Utilities', () => {
  describe('buildZonedDateTimeFromUtcDate', () => {
    // 2026-02-11 UTC Midnight
    const baseDate = new Date('2026-02-11T00:00:00Z')

    it('should correctly handle Australian Eastern Daylight Time (UTC+11)', () => {
      const time = '12:30'
      const timezone = 'Australia/Melbourne'

      const result = buildZonedDateTimeFromUtcDate(baseDate, time, timezone)

      // 12:30 in Melbourne (UTC+11) is 01:30 UTC
      expect(result.toISOString()).toBe('2026-02-11T01:30:00.000Z')
    })

    it('should correctly handle US Eastern Standard Time (UTC-5)', () => {
      const time = '12:30'
      const timezone = 'America/New_York'

      const result = buildZonedDateTimeFromUtcDate(baseDate, time, timezone)

      // 12:30 in New York (UTC-5) is 17:30 UTC
      expect(result.toISOString()).toBe('2026-02-11T17:30:00.000Z')
    })

    it('should correctly handle US Pacific Standard Time (UTC-8)', () => {
      const time = '12:30'
      const timezone = 'America/Los_Angeles'

      const result = buildZonedDateTimeFromUtcDate(baseDate, time, timezone)

      // 12:30 in LA (UTC-8) is 20:30 UTC
      expect(result.toISOString()).toBe('2026-02-11T20:30:00.000Z')
    })

    it('should use fallback values if time is missing or invalid', () => {
      const timezone = 'UTC'
      const result = buildZonedDateTimeFromUtcDate(baseDate, null, timezone, 14, 45)

      expect(result.toISOString()).toBe('2026-02-11T14:45:00.000Z')
    })

    it('should handle midnight correctly', () => {
      const time = '00:00'
      const timezone = 'UTC'
      const result = buildZonedDateTimeFromUtcDate(baseDate, time, timezone)

      expect(result.toISOString()).toBe('2026-02-11T00:00:00.000Z')
    })

    it('should handle 11:59 PM correctly', () => {
      const time = '23:59'
      const timezone = 'UTC'
      const result = buildZonedDateTimeFromUtcDate(baseDate, time, timezone)

      expect(result.toISOString()).toBe('2026-02-11T23:59:00.000Z')
    })
  })
})
