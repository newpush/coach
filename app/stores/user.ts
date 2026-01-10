import { defineStore } from 'pinia'

export const useUserStore = defineStore('user', () => {
  const profile = ref<any>(null)
  const loading = ref(false)
  const generating = ref(false)
  const toast = useToast()
  const { poll } = usePolling()

  async function fetchProfile(force = false) {
    if (profile.value && !force) return

    loading.value = true
    try {
      const data = await $fetch('/api/profile/dashboard')
      // @ts-expect-error - data type is unknown
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
      const res: any = await $fetch('/api/profile/generate', { method: 'POST' })
      const jobId = res.jobId

      toast.add({
        title: 'Profile Generation Started',
        description: 'Creating your comprehensive athlete profile. This may take a minute...',
        color: 'success',
        icon: 'i-heroicons-check-circle'
      })

      // Poll for completion
      poll(
        () => $fetch(`/api/profile/status?jobId=${jobId}`),
        // @ts-expect-error - data type is unknown
        (data) => !data.isRunning,
        {
          // @ts-expect-error - data type is unknown
          onSuccess: async () => {
            // Fetch the updated profile
            await fetchProfile(true)
            generating.value = false
            toast.add({
              title: 'Profile Ready',
              description: 'Your athlete profile has been generated',
              color: 'success',
              icon: 'i-heroicons-check-badge'
            })
          },
          onMaxAttemptsReached: () => {
            generating.value = false
            toast.add({
              title: 'Generation Taking Longer',
              description: 'Profile generation is still processing.',
              color: 'warning',
              icon: 'i-heroicons-clock'
            })
          },
          onError: (error) => {
            generating.value = false
            console.error('Profile polling error:', error)
          }
        }
      )
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

  return {
    profile,
    loading,
    generating,
    fetchProfile,
    generateProfile
  }
})
