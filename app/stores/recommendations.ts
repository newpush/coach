import { defineStore } from 'pinia'

export const useRecommendationStore = defineStore('recommendation', () => {
  const todayRecommendation = ref<any>(null)
  const todayWorkout = ref<any>(null)
  const loading = ref(false)
  const loadingWorkout = ref(false)
  const generating = ref(false)
  const generatingAdHoc = ref(false)
  const currentRecommendationId = ref<string | null>(null)
  const toast = useToast()
  const { refresh: refreshRuns } = useUserRuns()
  const { onTaskCompleted } = useUserRunsState()

  // We need to know if intervals is connected to fetch
  const integrationStore = useIntegrationStore()

  async function fetchTodayWorkout() {
    if (!integrationStore.intervalsConnected) return
    loadingWorkout.value = true
    try {
      todayWorkout.value = await $fetch('/api/workouts/planned/today')
    } catch (error) {
      console.error('Failed to fetch today workout:', error)
    } finally {
      loadingWorkout.value = false
    }
  }

  async function fetchTodayRecommendation() {
    // If not connected, don't fetch (or handle appropriately)
    if (!integrationStore.intervalsConnected) return

    loading.value = true
    try {
      const data = await $fetch('/api/recommendations/today')
      todayRecommendation.value = data
    } catch (error: any) {
      // 404 is expected if no recommendation exists
      if (error?.statusCode !== 404) {
        console.error('Error fetching recommendation:', error)
      }
    } finally {
      loading.value = false
    }
  }

  async function generateTodayRecommendation(userFeedback?: string) {
    if (generating.value) return

    generating.value = true
    try {
      await $fetch('/api/recommendations/today', {
        method: 'POST',
        body: { userFeedback }
      })
      refreshRuns()

      toast.add({
        title: userFeedback ? 'Regenerating Recommendation' : 'Analysis Started',
        description: userFeedback
          ? 'Updating plan based on your feedback...'
          : 'Analyzing your recovery and planned workout...',
        color: 'success',
        icon: 'i-heroicons-arrow-path'
      })
    } catch (error: any) {
      generating.value = false
      toast.add({
        title: 'Generation Failed',
        description: error.data?.message || 'Failed to generate recommendation',
        color: 'error',
        icon: 'i-heroicons-exclamation-circle'
      })
    }
  }

  async function generateAdHocWorkout(params: any) {
    generatingAdHoc.value = true
    try {
      const { success } = await $fetch('/api/workouts/generate', {
        method: 'POST',
        body: params
      })

      if (success) {
        refreshRuns()
        toast.add({
          title: 'Generating Workout',
          description: 'AI is designing your workout...',
          color: 'success'
        })
      }
    } catch (error) {
      generatingAdHoc.value = false
      toast.add({ title: 'Generation Failed', color: 'error' })
    }
  }

  // Listeners
  onTaskCompleted('recommend-today-activity', async (run) => {
    // Assuming the task output contains the recommendation or we fetch it
    await fetchTodayRecommendation()
    generating.value = false
    currentRecommendationId.value = null
    toast.add({
      title: 'Analysis Complete',
      description: 'Your training recommendation is ready!',
      color: 'success',
      icon: 'i-heroicons-check-circle'
    })
  })

  onTaskCompleted('generate-ad-hoc-workout', async (run) => {
    await fetchTodayWorkout()
    generatingAdHoc.value = false
    toast.add({ title: 'Workout Ready', color: 'success' })
    // Auto-generate recommendation for the new workout
    await generateTodayRecommendation()
  })

  async function acceptRecommendation(id: string) {
    if (!id) return

    try {
      await $fetch(`/api/recommendations/${id}/accept`, { method: 'POST' })

      toast.add({
        title: 'Plan Updated',
        description: 'The workout has been modified based on the recommendation.',
        color: 'success',
        icon: 'i-heroicons-check-circle'
      })

      // Refresh both recommendation and workout
      await Promise.all([fetchTodayRecommendation(), fetchTodayWorkout()])

      return true
    } catch (error: any) {
      toast.add({
        title: 'Update Failed',
        description: error.data?.message || 'Failed to accept recommendation',
        color: 'error',
        icon: 'i-heroicons-exclamation-circle'
      })
      return false
    }
  }

  return {
    todayRecommendation,
    todayWorkout,
    loading,
    loadingWorkout,
    generating,
    generatingAdHoc,
    fetchTodayRecommendation,
    fetchTodayWorkout,
    generateTodayRecommendation,
    generateAdHocWorkout,
    acceptRecommendation
  }
})
