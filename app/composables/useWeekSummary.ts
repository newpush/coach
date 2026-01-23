
import type { CalendarActivity } from '~/types/calendar'

export function getWeekSummary(weekDays: { activities: CalendarActivity[] }[]) {
  let lastCTL: number | null = null
  let lastATL: number | null = null
  let lastTSB: number | null = null

  return weekDays.reduce(
    (acc, day) => {
      day.activities.forEach((act) => {
        if (act.source === 'completed') {
          acc.duration += act.duration || 0
          acc.distance += act.distance || 0
          acc.tss += act.tss ?? act.trimp ?? 0
          if (act.ctl !== null && act.ctl !== undefined) lastCTL = act.ctl
          if (act.atl !== null && act.atl !== undefined) lastATL = act.atl
        } else if (act.source === 'planned' && act.status !== 'completed_plan') {
          acc.plannedDuration += act.plannedDuration || 0
          acc.plannedDistance += act.plannedDistance || 0
          acc.plannedTss += act.plannedTss || 0
        }
      })

      if (lastCTL !== null && lastATL !== null) {
        lastTSB = lastCTL - lastATL
      }

      return {
        ...acc,
        ctl: lastCTL,
        atl: lastATL,
        tsb: lastTSB,
      }
    },
    {
      duration: 0,
      distance: 0,
      tss: 0,
      plannedDuration: 0,
      plannedDistance: 0,
      plannedTss: 0,
      ctl: null as number | null,
      atl: null as number | null,
      tsb: null as number | null,
    }
  )
}
