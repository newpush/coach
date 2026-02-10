import { toZonedTime, fromZonedTime, format } from 'date-fns-tz'
import { startOfDay, endOfDay, subDays, startOfYear, differenceInYears } from 'date-fns'
import { prisma } from './db'

export const DEFAULT_TIMEZONE = 'UTC'

/**
 * Calculate age from Date of Birth
 */
export function calculateAge(dob: Date | null | undefined): number | null {
  if (!dob) return null
  return differenceInYears(new Date(), new Date(dob))
}

/**
 * Fetch a user's timezone, defaulting to UTC
 */
export async function getUserTimezone(userId: string): Promise<string> {
  if (!userId) return DEFAULT_TIMEZONE

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true }
  })
  return user?.timezone || DEFAULT_TIMEZONE
}

/**
 * Get the start of the day in UTC for a specific timezone.
 * Useful for DB queries: "Give me all records that happened 'today' in Tokyo"
 *
 * Example:
 * If it's 10:00 AM UTC (19:00 Tokyo), getting start of day for Tokyo
 * will return 15:00 UTC previous day (00:00 Tokyo).
 */
export function getStartOfDayUTC(timezone: string, date: Date = new Date()): Date {
  try {
    // Convert UTC date to Zoned Time
    const zonedDate = toZonedTime(date, timezone)
    // Get start of day in that zone (keeps the "face value" time but is just a Date struct)
    const zonedStart = startOfDay(zonedDate)
    // Convert that "face value" start time back to a real UTC timestamp
    return fromZonedTime(zonedStart, timezone)
  } catch (e) {
    console.warn(`[DateUtil] Invalid timezone '${timezone}', falling back to UTC`)
    return startOfDay(date)
  }
}

/**
 * Get the end of the day in UTC for a specific timezone.
 */
export function getEndOfDayUTC(timezone: string, date: Date = new Date()): Date {
  try {
    const zonedDate = toZonedTime(date, timezone)
    const zonedEnd = endOfDay(zonedDate)
    return fromZonedTime(zonedEnd, timezone)
  } catch (e) {
    console.warn(`[DateUtil] Invalid timezone '${timezone}', falling back to UTC`)
    return endOfDay(date)
  }
}

/**
 * Get the start of the day N days ago in UTC for a specific timezone.
 */
export function getStartOfDaysAgoUTC(
  timezone: string,
  days: number,
  date: Date = new Date()
): Date {
  try {
    const zonedDate = toZonedTime(date, timezone)
    const pastDate = subDays(zonedDate, days)
    const zonedStart = startOfDay(pastDate)
    return fromZonedTime(zonedStart, timezone)
  } catch (e) {
    return startOfDay(subDays(date, days))
  }
}

/**
 * Get the start of the current year in UTC for a specific timezone.
 */
export function getStartOfYearUTC(timezone: string, date: Date = new Date()): Date {
  try {
    const zonedDate = toZonedTime(date, timezone)
    const zonedStart = startOfYear(zonedDate)
    return fromZonedTime(zonedStart, timezone)
  } catch (e) {
    return startOfYear(date)
  }
}

/**
 * Format a date in the user's timezone
 */
export function formatUserTime(date: Date, timezone: string, formatStr: string = 'HH:mm'): string {
  try {
    return format(toZonedTime(date, timezone), formatStr)
  } catch (e) {
    return format(date, formatStr)
  }
}

/**
 * Format a full date in the user's timezone
 */
export function formatUserDate(
  date: Date,
  timezone: string,
  formatStr: string = 'yyyy-MM-dd'
): string {
  try {
    return format(toZonedTime(date, timezone), formatStr)
  } catch (e) {
    return format(date, formatStr)
  }
}

/**
 * Format a date in UTC.
 * Useful for displaying dates that are stored as UTC Midnight (e.g. PlannedWorkout.date)
 * without shifting them to the user's timezone.
 */
export function formatDateUTC(date: Date, formatStr: string = 'yyyy-MM-dd'): string {
  return format(date, formatStr, { timeZone: 'UTC' })
}

/**
 * Build a UTC Date from a stored UTC-midnight date and a local HH:mm time.
 * This preserves the user's intended local clock time across timezones.
 */
export function buildZonedDateTimeFromUtcDate(
  date: Date,
  time: string | null | undefined,
  timezone: string,
  fallbackHour: number = 10,
  fallbackMinute: number = 0
): Date {
  let hour = fallbackHour
  let minute = fallbackMinute

  if (time && time.includes(':')) {
    const [h, m] = time.split(':').map(Number)
    if (Number.isFinite(h)) hour = h
    if (Number.isFinite(m)) minute = m
  }

  const dateStr = formatDateUTC(date, 'yyyy-MM-dd')
  const hh = String(hour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  const localDate = new Date(`${dateStr}T${hh}:${mm}:00`)

  try {
    return fromZonedTime(localDate, timezone)
  } catch (e) {
    return localDate
  }
}

/**
 * Get the user's current local date as a Date object set to UTC midnight.
 * This is useful for querying Prisma @db.Date columns.
 */
export function getUserLocalDate(timezone: string = 'UTC', date: Date = new Date()): Date {
  try {
    const dateStr = format(toZonedTime(date, timezone), 'yyyy-MM-dd')
    return new Date(`${dateStr}T00:00:00Z`)
  } catch (e) {
    // Fallback using provided date or now
    const d = date || new Date()
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  }
}
