<template>
  <UDashboardPanel id="recommendations">
    <template #header>
      <UDashboardNavbar title="Coach Recommendations">
        <template #right>
          <div class="flex items-center gap-3">
            <UButton
              icon="i-heroicons-trash"
              color="red"
              variant="soft"
              :loading="clearing"
              @click="clearAll"
            >
              Clear All
            </UButton>
            <UButton
              icon="i-heroicons-arrow-path-rounded-square"
              color="white"
              variant="solid"
              :loading="refreshingAdvice"
              @click="refreshAdvice"
            >
              Refresh Advice
            </UButton>
            <UButton
              icon="i-heroicons-sparkles"
              color="primary"
              variant="solid"
              :loading="generating"
              @click="generateNew"
            >
              Full Analysis
            </UButton>
            <UButton
              icon="i-heroicons-arrow-path"
              color="gray"
              variant="ghost"
              @click="refreshAll"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 sm:p-6 space-y-8">
        <!-- Pinned / Focus Section -->
        <section v-if="pinnedRecs?.length > 0">
          <div class="flex items-center gap-2 mb-4">
            <UIcon name="i-heroicons-paper-clip" class="w-5 h-5 text-primary-500" />
            <h2 class="text-xl font-bold text-gray-900 dark:text-white">Focus Area</h2>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
            <RecommendationCard
              v-for="rec in pinnedRecs"
              :key="rec.id"
              :recommendation="rec"
              @toggle-pin="togglePin"
              @update-status="updateStatus"
            />
          </div>
        </section>

        <!-- Main Content Tabs -->
        <UTabs :items="tabs" class="w-full">
          <template #active>
            <div class="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div v-if="activePending" class="col-span-full py-8 flex justify-center">
                <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-gray-400" />
              </div>
              <template v-else>
                <div
                  v-if="activeRecs?.length === 0"
                  class="col-span-full py-8 text-center text-gray-500"
                >
                  No active recommendations. You're doing great!
                </div>
                <RecommendationCard
                  v-for="rec in activeRecs"
                  :key="rec.id"
                  :recommendation="rec"
                  @toggle-pin="togglePin"
                  @update-status="updateStatus"
                />
              </template>
            </div>
          </template>

          <template #history>
            <div class="mt-4 space-y-4">
              <div v-if="historyPending" class="py-8 flex justify-center">
                <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-gray-400" />
              </div>
              <template v-else>
                <div v-if="historyRecs?.length === 0" class="py-8 text-center text-gray-500">
                  No history found.
                </div>
                <RecommendationCard
                  v-for="rec in historyRecs"
                  :key="rec.id"
                  :recommendation="rec"
                  @toggle-pin="togglePin"
                  @update-status="updateStatus"
                />
              </template>
            </div>
          </template>
        </UTabs>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
  import RecommendationCard from '~/components/recommendations/RecommendationCard.vue'

  definePageMeta({
    middleware: 'auth',
    layout: 'default'
  })

  const toast = useToast()

  // State
  const generating = ref(false) // For Full Analysis
  const refreshingAdvice = ref(false) // For Refresh Advice
  const clearing = ref(false)
  const isPolling = ref(false)
  let pollInterval: NodeJS.Timeout | null = null

  // Polling Logic
  async function checkStatus() {
    try {
      const status: any = await $fetch('/api/recommendations/status')

      if (!status.isRunning) {
        stopPolling()
        await refreshAll()

        // Show completion toast if we were polling
        if (generating.value || refreshingAdvice.value) {
          toast.add({
            title: 'Analysis Complete',
            description: 'New recommendations are ready.',
            color: 'success',
            icon: 'i-heroicons-check-circle'
          })
        }

        generating.value = false
        refreshingAdvice.value = false
      }
    } catch (error) {
      console.error('Polling failed:', error)
      // Don't stop polling on transient errors, but maybe limit retries?
      // For simplicity, we keep polling unless it's a 401/403
    }
  }

  function startPolling() {
    if (isPolling.value) return

    isPolling.value = true
    // Check immediately
    checkStatus()
    // Then every 3 seconds
    pollInterval = setInterval(checkStatus, 3000)
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
    }
    isPolling.value = false
  }

  // Cleanup
  onUnmounted(() => {
    stopPolling()
  })

  // Actions
  async function clearAll() {
    if (!confirm('Are you sure you want to clear ALL recommendations?')) return

    clearing.value = true
    try {
      const res: any = await $fetch('/api/recommendations/clear', {
        method: 'DELETE'
      })

      toast.add({
        title: 'Cleared',
        description: `Removed ${res.count} recommendations.`,
        color: 'success'
      })
      await refreshAll()
    } catch (error: any) {
      toast.add({
        title: 'Error',
        description: 'Failed to clear recommendations',
        color: 'error'
      })
    } finally {
      clearing.value = false
    }
  }

  async function refreshAdvice() {
    if (refreshingAdvice.value || generating.value) return

    refreshingAdvice.value = true
    try {
      await $fetch('/api/recommendations/generate', {
        method: 'POST'
      })

      toast.add({
        title: 'Refreshing Advice',
        description: 'Generating new recommendations based on your recent data...',
        color: 'info',
        icon: 'i-heroicons-arrow-path-rounded-square'
      })

      startPolling()
    } catch (error: any) {
      // If 409 (Already running), we should still start polling to catch the completion
      if (error.statusCode === 409) {
        toast.add({
          title: 'Already Running',
          description: 'Analysis is already in progress. Waiting for completion...',
          color: 'warning'
        })
        startPolling()
      } else {
        toast.add({
          title: 'Error',
          description: error.data?.message || 'Failed to refresh advice',
          color: 'error'
        })
        refreshingAdvice.value = false
      }
    }
  }

  async function generateNew() {
    if (refreshingAdvice.value || generating.value) return

    generating.value = true
    try {
      await $fetch('/api/scores/generate-explanations', {
        method: 'POST'
      })

      toast.add({
        title: 'Full Analysis Started',
        description: 'AI is analyzing your trends. This may take a few minutes.',
        color: 'success',
        icon: 'i-heroicons-sparkles'
      })

      startPolling()
    } catch (error: any) {
      if (error.statusCode === 409) {
        toast.add({
          title: 'Already Running',
          description: 'Analysis is already in progress. Waiting for completion...',
          color: 'warning'
        })
        startPolling()
      } else {
        toast.add({
          title: 'Error',
          description: error.data?.message || 'Failed to start analysis',
          color: 'error'
        })
        generating.value = false
      }
    }
  }

  const tabs = [
    { label: 'Current Advices', slot: 'active' },
    { label: 'History', slot: 'history' }
  ]

  // Fetch Pinned (Always visible at top)
  // Only active pinned ones are shown here.
  const { data: pinnedRecs, refresh: refreshPinned } = await useFetch('/api/recommendations', {
    query: { isPinned: true, status: 'ACTIVE' },
    key: 'pinned-recs'
  })

  // Fetch Active (Unpinned)
  const {
    data: activeRecs,
    pending: activePending,
    refresh: refreshActive
  } = await useFetch('/api/recommendations', {
    query: { status: 'ACTIVE', isPinned: false },
    key: 'active-recs'
  })

  // Fetch History (Completed/Dismissed)
  const {
    data: allHistory,
    pending: historyPending,
    refresh: refreshHistory
  } = await useFetch('/api/recommendations', {
    query: { status: 'ALL' },
    lazy: true,
    key: 'history-recs'
  })

  const historyRecs = computed(() => {
    return allHistory.value?.filter((r: any) => r.status !== 'ACTIVE') || []
  })

  async function refreshAll() {
    await Promise.all([refreshPinned(), refreshActive(), refreshHistory()])
  }

  async function togglePin(rec: any) {
    const newPinnedState = !rec.isPinned

    try {
      await $fetch(`/api/recommendations/${rec.id}`, {
        method: 'PATCH',
        body: { isPinned: newPinnedState }
      })

      toast.add({ title: newPinnedState ? 'Pinned to Focus' : 'Unpinned', color: 'success' })
      refreshAll()
    } catch (e) {
      toast.add({ title: 'Error updating', color: 'error' })
    }
  }

  async function updateStatus(rec: any, status: string) {
    try {
      await $fetch(`/api/recommendations/${rec.id}`, {
        method: 'PATCH',
        body: { status }
      })

      const action = status === 'COMPLETED' ? 'Marked as Done' : 'Dismissed'
      toast.add({ title: action, color: 'success' })
      refreshAll()
    } catch (e) {
      toast.add({ title: 'Error updating status', color: 'error' })
    }
  }
</script>
