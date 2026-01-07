export const useScoreColor = () => {
  const getScoreColor = (score: number | null): 'error' | 'warning' | 'success' | 'neutral' => {
    if (!score) return 'neutral'
    if (score >= 8) return 'success'
    if (score >= 6) return 'warning'
    return 'error'
  }

  const getTrendColor = (trend: string): 'success' | 'info' | 'warning' | 'neutral' => {
    const colors: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
      improving: 'success',
      stable: 'info',
      declining: 'warning',
      variable: 'neutral'
    }
    return colors[trend] || 'neutral'
  }

  const getTrendLabel = (trend: string): string => {
    const labels: Record<string, string> = {
      improving: '↗ Improving',
      stable: '→ Stable',
      declining: '↘ Declining',
      variable: '↕ Variable'
    }
    return labels[trend] || trend
  }

  return {
    getScoreColor,
    getTrendColor,
    getTrendLabel
  }
}
