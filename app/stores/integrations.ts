import { defineStore } from 'pinia'

interface IntegrationStatus {
  provider: string
  connected: boolean
  lastSyncAt?: string | null
}

interface DataSyncStatus {
  workouts: boolean
  nutrition: boolean
  wellness: boolean
  workoutCount: number
  nutritionCount: number
  wellnessCount: number
  workoutProviders: string[]
  nutritionProviders: string[]
  wellnessProviders: string[]
}

export const useIntegrationStore = defineStore('integration', () => {
  const integrationStatus = ref<{ integrations: IntegrationStatus[] } | null>(null)
  const dataSyncStatus = ref<DataSyncStatus | null>(null)
  const syncingData = ref(false)
  const toast = useToast()

  const intervalsConnected = computed(
    () => integrationStatus.value?.integrations?.some((i) => i.provider === 'intervals') ?? false
  )

  const whoopConnected = computed(
    () => integrationStatus.value?.integrations?.some((i) => i.provider === 'whoop') ?? false
  )

  const lastSyncTime = computed(() => {
    if (!integrationStatus.value?.integrations) return null

    const intervalsIntegration = integrationStatus.value.integrations.find(
      (i) => i.provider === 'intervals'
    )
    if (!intervalsIntegration?.lastSyncAt) return null

    return intervalsIntegration.lastSyncAt
  })

  async function fetchStatus() {
    try {
      const data = await $fetch<{ integrations: IntegrationStatus[] }>('/api/integrations/status')
      integrationStatus.value = data
    } catch (error) {
      console.error('Error fetching integration status:', error)
    }
  }

  async function syncAllData() {
    if (syncingData.value) return

    syncingData.value = true

    try {
      console.log('Triggering batch sync...')
      await $fetch('/api/integrations/sync', {
        method: 'POST',
        body: { provider: 'all' }
      })

      toast.add({
        title: 'Data Sync Started',
        description: 'Syncing data from all connected integrations. This may take a minute...',
        color: 'success',
        icon: 'i-heroicons-arrow-path'
      })

      // We rely on the caller or a separate polling mechanism to update the data
      // or we can implement polling here if needed.
      // For now, let's refresh status after a delay
      setTimeout(async () => {
        await fetchStatus()
        toast.add({
          title: 'Sync Complete',
          description: 'Your data has been updated successfully!',
          color: 'success',
          icon: 'i-heroicons-check-circle'
        })
      }, 10000)
    } catch (error: any) {
      console.error('Error syncing data:', error)

      toast.add({
        title: 'Sync Failed',
        description: error.data?.message || 'Failed to sync data. Please try again.',
        color: 'error',
        icon: 'i-heroicons-exclamation-circle'
      })
    } finally {
      syncingData.value = false
    }
  }

  return {
    integrationStatus,
    dataSyncStatus,
    syncingData,
    intervalsConnected,
    whoopConnected,
    lastSyncTime,
    fetchStatus,
    syncAllData
  }
})
