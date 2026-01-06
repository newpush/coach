import { format, toZonedTime } from 'date-fns-tz'
import { formatDistanceToNow } from 'date-fns'

export const useFormat = () => {
  const { data } = useAuth()

  // Reactive timezone
  const timezone = computed(() => {
    return (data.value?.user as any)?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  })

  // Helper to convert date to Zoned Date
  const toZoned = (date: string | Date) => {
    return toZonedTime(new Date(date), timezone.value)
  }

  const formatDate = (date: string | Date, formatStr: string = 'MMM d, yyyy') => {
    if (!date) return ''
    try {
      // If formatStr is an object (legacy Intl options), ignore it or map it.
      // Since we are replacing the implementation, we assume callers can adapt or we stick to string formats.
      // The previous implementation allowed Intl.DateTimeFormatOptions.
      // To be safe, we can check type.
      if (typeof formatStr === 'object') {
        return new Date(date).toLocaleDateString('en-US', { ...formatStr, timeZone: timezone.value })
      }
      
      return format(toZoned(date), formatStr, { timeZone: timezone.value })
    } catch (e) {
      return ''
    }
  }

  const formatShortDate = (date: string | Date) => {
    return formatDate(date, 'MMM d')
  }

  const formatDateTime = (date: string | Date) => {
    return formatDate(date, 'MMM d, yyyy h:mm a')
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
   * Get the user's current local date as a Date object set to UTC midnight.
   * Useful for comparing with DB dates stored at UTC midnight.
   */
  const getUserLocalDate = (): Date => {
    try {
      const dateStr = format(toZoned(new Date()), 'yyyy-MM-dd', { timeZone: timezone.value })
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
      return format(toZoned(new Date()), 'HH:mm', { timeZone: timezone.value })
    } catch (e) {
      const now = new Date()
      return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    }
  }

  return {
    formatDate,
    formatShortDate,
    formatDateTime,
    formatRelativeTime,
    getUserLocalDate,
    getUserLocalTime,
    timezone
  }
}
