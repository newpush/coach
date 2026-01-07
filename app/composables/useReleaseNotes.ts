export const useReleaseNotes = () => {
  const STORAGE_KEY = 'coach-wattz-last-seen-release'
  const config = useRuntimeConfig()

  // State
  const hasNewRelease = ref(false)
  const currentReleaseContent = ref<string | null>(null)
  const isReleaseModalOpen = ref(false)
  const loading = ref(false)

  // Actions
  async function checkForNewRelease() {
    // Only run on client side because we need localStorage
    if (import.meta.server) return

    loading.value = true
    try {
      const { version, content } = await $fetch<{ version: string; content: string | null }>(
        '/api/releases/current'
      )

      if (!content) {
        hasNewRelease.value = false
        return
      }

      const lastSeenVersion = localStorage.getItem(STORAGE_KEY)

      // If we haven't seen this version yet, mark as new
      if (lastSeenVersion !== version) {
        hasNewRelease.value = true
        currentReleaseContent.value = content
      } else {
        hasNewRelease.value = false
      }
    } catch (error) {
      console.error('Failed to check for release notes:', error)
      hasNewRelease.value = false
    } finally {
      loading.value = false
    }
  }

  function markAsSeen() {
    const version = config.public.version as string
    localStorage.setItem(STORAGE_KEY, version)
    hasNewRelease.value = false
    isReleaseModalOpen.value = false
  }

  function openReleaseModal() {
    isReleaseModalOpen.value = true
  }

  return {
    hasNewRelease,
    currentReleaseContent,
    isReleaseModalOpen,
    loading,
    checkForNewRelease,
    markAsSeen,
    openReleaseModal
  }
}
