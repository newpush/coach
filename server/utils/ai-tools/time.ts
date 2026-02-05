import { tool } from 'ai'
import { formatUserDate } from '../date'

export const timeTools = (timezone: string) => ({
  get_current_time: tool({
    description:
      'Returns the current precise time, day of the week, and "time of day" (morning/afternoon/etc.) for the user. Use this when you need precise temporal context for meal or workout planning.',
    parameters: null as any,
    execute: async () => {
      const now = new Date()
      const userTime = formatUserDate(now, timezone, 'EEEE, MMMM d, yyyy h:mm a')
      const hourOfDay = parseInt(
        now.toLocaleString('en-US', { timeZone: timezone, hour: 'numeric', hour12: false })
      )

      let timeOfDay = 'morning'
      if (hourOfDay >= 12 && hourOfDay < 17) timeOfDay = 'afternoon'
      else if (hourOfDay >= 17 && hourOfDay < 21) timeOfDay = 'evening'
      else if (hourOfDay >= 21 || hourOfDay < 5) timeOfDay = 'late night'

      return {
        iso: now.toISOString(),
        local_formatted: userTime,
        timezone,
        hour_24: hourOfDay,
        time_of_day: timeOfDay,
        context_hint: `It is currently ${timeOfDay} for the athlete.`
      }
    }
  })
})
