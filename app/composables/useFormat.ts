import { format, toZonedTime, fromZonedTime } from 'date-fns-tz'
import { formatDistanceToNow } from 'date-fns'

export const useFormat = () => {
  const { data } = useAuth()

  // Reactive timezone
  const timezone = computed(() => {
    return (
      (data.value?.user as any)?.timezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      'UTC'
    )
  })

  // Helper to convert date to Zoned Date
  const toZoned = (date: string | Date) => {
    return toZonedTime(new Date(date), timezone.value)
  }

  const formatDate = (date: string | Date, formatStr: string | any = 'MMM d, yyyy') => {
    if (!date) return ''
    try {
      // If formatStr is an object (legacy Intl options), ignore it or map it.
      if (typeof formatStr === 'object') {
        return new Date(date).toLocaleDateString('en-US', {
          ...(formatStr as any),
          timeZone: timezone.value
        })
      }

      return format(toZoned(date), formatStr)
    } catch (e) {
      return ''
    }
  }

  /**
   * Format a date in UTC without timezone shifting.
   * Useful for @db.Date columns which are stored as UTC midnight.
   */
  const formatDateUTC = (date: string | Date, formatStr: string = 'MMM d, yyyy') => {
    if (!date) return ''
    try {
      // Explicitly convert to UTC zone first to ensure format respects it
      // regardless of environment fallback behavior
      const utcDate = toZonedTime(new Date(date), 'UTC')
      return format(utcDate, formatStr, { timeZone: 'UTC' })
    } catch (e) {
      return ''
    }
  }

  const formatShortDate = (date: string | Date) => {
    return formatDate(date, 'MMM d')
  }

  const formatDateTime = (date: string | Date, formatStr: string = 'MMM d, yyyy h:mm a') => {
    return formatDate(date, formatStr)
  }

  const formatRelativeTime = (date: string | Date) => {
    if (!date) return ''
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true })
    } catch (e) {
      return ''
    }
  }

  /**
   * Format a date with a specific timezone (manual override)
   */
  const formatUserDate = (date: string | Date, tz: string, formatStr: string = 'yyyy-MM-dd') => {
    if (!date) return ''
    try {
      return format(toZonedTime(new Date(date), tz), formatStr)
    } catch (e) {
      return ''
    }
  }

  /**
   * Get the user's current local date as a Date object set to UTC midnight.
   * Useful for comparing with DB dates stored at UTC midnight.
   */
  const getUserLocalDate = (): Date => {
    try {
      const dateStr = format(toZoned(new Date()), 'yyyy-MM-dd')
      return new Date(`${dateStr}T00:00:00Z`)
    } catch (e) {
      const now = new Date()
      return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
    }
  }

  /**
   * Get the user's current local time as a string (HH:mm)
   */
  const getUserLocalTime = (): string => {
    try {
      return format(toZoned(new Date()), 'HH:mm')
    } catch (e) {
      const now = new Date()
      return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    }
  }

  /**
   * Construct a Date object from a local date string (YYYY-MM-DD) and time string (HH:mm:ss)
   * interpreted in the user's timezone. Returns a standard Date object (which renders as UTC in ISO string).
   */
  const getUserDateFromLocal = (dateStr: string, timeStr: string = '00:00:00'): Date => {
    try {
      return fromZonedTime(`${dateStr}T${timeStr}`, timezone.value)
    } catch (e) {
      // Fallback to simple UTC construction if invalid
      return new Date(`${dateStr}T${timeStr}Z`)
    }
  }

  return {
    formatDate,
    formatDateUTC,
    formatShortDate,
    formatDateTime,
    formatRelativeTime,
    formatUserDate,
    getUserLocalDate,
    getUserLocalTime,
    getUserDateFromLocal,
    timezone
  }
}
