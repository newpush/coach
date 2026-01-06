export const useFormatters = () => {
  const { formatDate: baseFormatDate } = useFormat()

  const formatDuration = (seconds: number) => {
    if (!seconds) return '0s'
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    if (minutes > 0) {
      return `${minutes}m`
    }
    return `${secs}s`
  }

  const formatDate = (date: string | Date) => {
    if (!date) return ''
    return baseFormatDate(date, 'EEEE, MMMM d, yyyy')
  }

  return {
    formatDuration,
    formatDate
  }
}
