
import { describe, it, expect } from 'vitest'
import { getWeekSummary } from '~/composables/useWeekSummary'
import type { CalendarActivity } from '~/types/calendar'

describe('getWeekSummary', () => {
  it('should correctly calculate totals for a week with mixed activities', () => {
    const week: { activities: CalendarActivity[] }[] = [
      {
        activities: [
          { source: 'completed', status: 'completed', duration: 3600, distance: 10000, tss: 50, ctl: 10, atl: 15, id: '', title: '', date: '' },
          { source: 'planned', status: 'planned', plannedDuration: 1800, plannedDistance: 5000, plannedTss: 25, id: '', title: '', date: '' },
        ],
      },
      {
        activities: [
          { source: 'completed', status: 'completed', duration: 7200, distance: 20000, tss: 100, ctl: 12, atl: 18, id: '', title: '', date: '' },
        ],
      },
      {
        activities: [
          { source: 'planned', status: 'planned', plannedDuration: 3600, plannedDistance: 10000, plannedTss: 50, id: '', title: '', date: '' },
          { source: 'planned', status: 'completed_plan', plannedDuration: 1000, plannedDistance: 1000, plannedTss: 10, id: '', title: '', date: '' },
        ],
      },
    ]

    const summary = getWeekSummary(week)

    expect(summary.duration).toBe(10800) // 3600 + 7200
    expect(summary.distance).toBe(30000) // 10000 + 20000
    expect(summary.tss).toBe(150) // 50 + 100
    expect(summary.plannedDuration).toBe(5400) // 1800 + 3600
    expect(summary.plannedDistance).toBe(15000) // 5000 + 10000
    expect(summary.plannedTss).toBe(75) // 25 + 50
    expect(summary.ctl).toBe(12) // Last CTL value
    expect(summary.tsb).toBe(-6) // 12 - 18
  })

  it('should return zero for an empty week', () => {
    const week = [{ activities: [] }, { activities: [] }]
    const summary = getWeekSummary(week)

    expect(summary.duration).toBe(0)
    expect(summary.distance).toBe(0)
    expect(summary.tss).toBe(0)
    expect(summary.plannedDuration).toBe(0)
    expect(summary.plannedDistance).toBe(0)
    expect(summary.plannedTss).toBe(0)
    expect(summary.ctl).toBe(null)
    expect(summary.tsb).toBe(null)
  })

  it('should not count completed_plan as planned', () => {
    const week = [
      {
        activities: [
          { source: 'planned', status: 'completed_plan', plannedDuration: 3600, plannedDistance: 10000, plannedTss: 50 },
        ],
      },
    ]

    const summary = getWeekSummary(week)

    expect(summary.plannedDuration).toBe(0)
    expect(summary.plannedDistance).toBe(0)
    expect(summary.plannedTss).toBe(0)
  })
})
