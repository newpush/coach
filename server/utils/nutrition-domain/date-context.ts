import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz'
import { isBefore, isAfter, startOfDay } from 'date-fns'

export interface NutritionDateContext {
  dateKey: string // YYYY-MM-DD
  timezone: string
  now: Date
  dayStart: Date
  dayEnd: Date
}

/**
 * Creates a canonical context for nutrition calculations.
 * Ensures all logic uses the same day boundaries and "now" anchor.
 */
export function createNutritionDateContext(
  date: Date | string,
  timezone: string,
  now: Date = new Date()
): NutritionDateContext {
  const dateStr =
    typeof date === 'string' ? date.split('T')[0] : formatInTimeZone(date, timezone, 'yyyy-MM-dd')

  const dayStart = fromZonedTime(`${dateStr}T00:00:00`, timezone)
  const dayEnd = fromZonedTime(`${dateStr}T23:59:59.999`, timezone)

  return {
    dateKey: dateStr,
    timezone,
    now,
    dayStart,
    dayEnd
  }
}

export function isPastLocalDay(ctx: NutritionDateContext): boolean {
  const todayStr = formatInTimeZone(ctx.now, ctx.timezone, 'yyyy-MM-dd')
  return ctx.dateKey < todayStr
}

export function isTodayLocalDay(ctx: NutritionDateContext): boolean {
  const todayStr = formatInTimeZone(ctx.now, ctx.timezone, 'yyyy-MM-dd')
  return ctx.dateKey === todayStr
}

export function isFutureLocalDay(ctx: NutritionDateContext): boolean {
  const todayStr = formatInTimeZone(ctx.now, ctx.timezone, 'yyyy-MM-dd')
  return ctx.dateKey > todayStr
}

/**
 * Helper to get a date string for any Date in a specific timezone.
 */
export function getDateKey(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, 'yyyy-MM-dd')
}
