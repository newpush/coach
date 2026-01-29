import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { useFormat } from './useFormat'

// Mock useAuth and computed which are normally auto-imported by Nuxt
vi.stubGlobal('useAuth', () => ({
  data: {
    value: {
      user: {
        timezone: 'America/Chicago'
      }
    }
  }
}))

vi.stubGlobal('computed', (fn: any) => ({ value: fn() }))

describe('useFormat', () => {
  beforeEach(() => {
    // Attempt to force timezone to Chicago for the test process
    vi.stubEnv('TZ', 'America/Chicago')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('formatDateUTC', () => {
    // 2026-01-20T00:00:00.000Z
    // In Chicago (UTC-6), this is 2026-01-19 18:00:00
    const TEST_DATE_ISO = '2026-01-20T00:00:00.000Z'

    it('formats strict UTC date correctly regardless of user timezone', () => {
      const { formatDateUTC } = useFormat()

      // We want "Jan 20, 2026", NOT "Jan 19, 2026"
      // If the bug exists and we are successfully simulating Chicago, this might return Jan 19
      const formatted = formatDateUTC(TEST_DATE_ISO, 'MMM d, yyyy')

      console.log(`Formatted: ${formatted}`)
      expect(formatted).toBe('Jan 20, 2026')
    })
  })
})
