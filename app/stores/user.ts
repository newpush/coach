import { defineStore } from 'pinia'

export const useUserStore = defineStore('user', () => {
  const profile = ref<any>(null)
  const loading = ref(false)
  const generating = ref(false)
  const toast = useToast()
  const { refresh: refreshRuns } = useUserRuns()
  const { onTaskCompleted } = useUserRunsState()

  async function fetchProfile(force = false) {
    if (profile.value && !force) return

    loading.value = true
    try {
      const data = await $fetch('/api/profile/dashboard')
      profile.value = data?.profile || null
    } catch (error) {
      console.error('Error fetching profile:', error)
    } finally {
      loading.value = false
    }
  }

  async function generateProfile() {
    generating.value = true
    try {
      await $fetch('/api/profile/generate', { method: 'POST' })
      refreshRuns()

      toast.add({
        title: 'Profile Generation Started',
        description: 'Creating your comprehensive athlete profile. This may take a minute...',
        color: 'success',
        icon: 'i-heroicons-check-circle'
      })
    } catch (error: any) {
      generating.value = false
      toast.add({
        title: 'Generation Failed',
        description: error.data?.message || 'Failed to generate profile',
        color: 'error',
        icon: 'i-heroicons-exclamation-circle'
      })
    }
  }

  // Listen for completion
  onTaskCompleted('generate-athlete-profile', async () => {
    await fetchProfile(true)
    generating.value = false
    toast.add({
      title: 'Profile Ready',
      description: 'Your athlete profile has been generated',
      color: 'success',
      icon: 'i-heroicons-check-badge'
    })
  })

  return {
    profile,
    loading,
    generating,
    fetchProfile,
    generateProfile
  }
})
