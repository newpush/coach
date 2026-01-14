import { defineStore } from 'pinia'

export const useReportStore = defineStore('report', () => {
  const reports = ref<any[]>([])
  const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')
  const generating = ref(false)
  const toast = useToast()

  // Cache for single reports
  const currentReport = ref<any>(null)

  async function fetchReports() {
    status.value = 'pending'
    try {
      const data = await $fetch<any[]>('/api/reports')
      reports.value = data || []
      status.value = 'success'
    } catch (error) {
      console.error('Error fetching reports:', error)
      status.value = 'error'
    }
  }

  async function fetchReport(id: string) {
    // Return cached if available
    if (currentReport.value?.id === id) return currentReport.value

    try {
      const data = await $fetch(`/api/reports/${id}`)
      currentReport.value = data
      return data
    } catch (error) {
      console.error(`Error fetching report ${id}:`, error)
      throw error
    }
  }

  // Background Task Monitoring
  const { refresh: refreshRuns } = useUserRuns()
  const { onTaskCompleted } = useUserRunsState()

  // Listeners for all report tasks
  const reportTasks = [
    'generate-custom-report',
    'analyze-last-3-workouts',
    'analyze-last-3-nutrition',
    'analyze-last-7-nutrition',
    'generate-weekly-report'
  ]

  reportTasks.forEach((taskId) => {
    onTaskCompleted(taskId, async () => {
      await fetchReports()
      generating.value = false
      toast.add({
        title: 'Report Ready',
        description: 'Your report has been generated successfully.',
        color: 'success',
        icon: 'i-heroicons-check-circle'
      })
    })
  })

  async function generateReport(type: string, config?: any) {
    generating.value = true
    try {
      const body: any = { type }
      if (config) body.config = config

      const result = await $fetch<{ reportId: string }>('/api/reports/generate', {
        method: 'POST',
        body
      })
      refreshRuns()

      toast.add({
        title: 'Report Generation Started',
        description: 'Your report is being generated. This may take a minute.',
        color: 'success',
        icon: 'i-heroicons-check-circle'
      })

      // Refresh list to show new pending report
      await fetchReports()

      return result.reportId
    } catch (error: any) {
      generating.value = false
      toast.add({
        title: 'Generation Failed',
        description: error.data?.message || error.message || 'Failed to start report generation',
        color: 'error',
        icon: 'i-heroicons-exclamation-circle'
      })
      throw error
    }
  }

  return {
    reports,
    status,
    generating,
    currentReport,
    fetchReports,
    fetchReport,
    generateReport
  }
})
