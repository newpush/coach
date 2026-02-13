<template>
  <UDashboardPanel id="recommendations">
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <span class="hidden sm:inline">Coach Recommendations</span>
          <span class="sm:hidden">Recommendations</span>
        </template>
        <template #right>
          <div class="flex items-center gap-3">
            <ClientOnly>
              <DashboardTriggerMonitorButton />
            </ClientOnly>
            <UButton
              icon="i-heroicons-trash"
              color="neutral"
              variant="outline"
              size="sm"
              class="font-bold"
              :loading="clearing"
              @click="showClearModal = true"
            >
              <span class="hidden sm:inline">Clear All</span>
              <span class="sm:hidden">Clear</span>
            </UButton>
            <UButton
              icon="i-heroicons-sparkles"
              color="primary"
              variant="solid"
              size="sm"
              class="font-bold"
              :loading="refreshingAdvice"
              @click="refreshAdvice"
            >
              <span class="hidden sm:inline">Update Recommendations</span>
              <span class="sm:hidden">Update</span>
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 sm:p-6 space-y-8">
        <!-- Pinned / Focus Section -->
        <section>
          <div class="flex items-center gap-2 mb-4">
            <UIcon name="i-heroicons-paper-clip" class="w-5 h-5 text-primary-500" />
            <h2 class="text-xl font-bold text-gray-900 dark:text-white">Focus Area</h2>
          </div>
          <div
            v-if="sortedPinnedRecs && sortedPinnedRecs.length > 0"
            class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4"
          >
            <RecommendationCard
              v-for="rec in sortedPinnedRecs"
              :key="rec.id"
              :recommendation="rec"
              @toggle-pin="togglePin"
              @update-status="updateStatus"
            />
          </div>
          <div v-else class="py-8 text-center text-gray-500 dark:text-gray-400 italic">
            Pin recommendations to guide the AI. Focused items inform your daily coaching advice,
            ensuring the AI knows what you're actively working on.
          </div>
        </section>

        <!-- Filter Toolbar -->
        <div
          class="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800"
        >
          <div class="flex items-center gap-2">
            <USelectMenu
              v-model="selectedCategory"
              :items="categories"
              placeholder="All Categories"
              class="w-48"
              clear
            />
          </div>
        </div>

        <!-- Current Advices Section -->
        <section>
          <div class="flex items-center gap-2 mb-4">
            <UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-primary-500" />
            <h2 class="text-xl font-bold text-gray-900 dark:text-white">Current Advices</h2>
          </div>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div v-if="activePending" class="col-span-full py-8 flex justify-center">
              <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-gray-400" />
            </div>
            <template v-else>
              <div
                v-if="sortedActiveRecs?.length === 0"
                class="col-span-full py-8 text-center text-gray-500"
              >
                No active recommendations. You're doing great!
              </div>
              <RecommendationCard
                v-for="rec in sortedActiveRecs"
                :key="rec.id"
                :recommendation="rec"
                @toggle-pin="togglePin"
                @update-status="updateStatus"
              />
            </template>
          </div>
        </section>

        <!-- History Section -->
        <section v-if="sortedHistoryRecs?.length > 0 || historyPending">
          <div
            class="flex items-center justify-between gap-2 mb-4 pt-4 border-t border-gray-100 dark:border-gray-800 cursor-pointer select-none"
            @click="isHistoryOpen = !isHistoryOpen"
          >
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-clock" class="w-5 h-5 text-gray-400" />
              <h2 class="text-xl font-bold text-gray-900 dark:text-white">History</h2>
              <UBadge
                v-if="sortedHistoryRecs?.length > 0"
                color="neutral"
                variant="subtle"
                size="sm"
              >
                {{ sortedHistoryRecs.length }}
              </UBadge>
            </div>
            <UButton
              color="neutral"
              variant="ghost"
              :icon="isHistoryOpen ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
              size="sm"
            />
          </div>

          <div v-if="isHistoryOpen" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div v-if="historyPending" class="col-span-full py-8 flex justify-center">
              <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-gray-400" />
            </div>
            <template v-else>
              <RecommendationCard
                v-for="rec in sortedHistoryRecs"
                :key="rec.id"
                :recommendation="rec"
                @toggle-pin="togglePin"
                @update-status="updateStatus"
              />
            </template>
          </div>
        </section>

        <!-- Clear Confirmation Modal -->
        <UModal v-model:open="showClearModal">
          <template #content>
            <UCard :ui="{ root: 'divide-y divide-gray-100 dark:divide-gray-800' }">
              <template #header>
                <div class="flex items-center justify-between">
                  <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-white">
                    Clear All Recommendations?
                  </h3>
                  <UButton
                    color="neutral"
                    variant="ghost"
                    icon="i-heroicons-x-mark-20-solid"
                    class="-my-1"
                    @click="showClearModal = false"
                  />
                </div>
              </template>

              <div class="p-4">
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  Are you sure you want to delete all active and historical recommendations? This
                  action cannot be undone.
                </p>
              </div>

              <template #footer>
                <div class="flex justify-end gap-3">
                  <UButton color="neutral" variant="ghost" @click="showClearModal = false"
                    >Cancel</UButton
                  >
                  <UButton
                    color="error"
                    variant="solid"
                    :loading="clearing"
                    @click="confirmClearAll"
                    >Yes, Clear All</UButton
                  >
                </div>
              </template>
            </UCard>
          </template>
        </UModal>
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

  useHead({
    title: 'Coach Recommendations',
    meta: [
      {
        name: 'description',
        content:
          'Personalized AI-generated recommendations to optimize your training and performance.'
      }
    ]
  })

  const toast = useToast()

  // State
  const isHistoryOpen = ref(false)
  const refreshingAdvice = ref(false) // For Refresh Advice
  const clearing = ref(false)
  const showClearModal = ref(false)
  const selectedCategory = ref<string | undefined>(undefined)

  const { onTaskCompleted } = useUserRunsState()
  const { refresh: refreshUserRuns } = useUserRuns()

  // Global listener for ANY recommendation generation completing
  // This works even if the page was refreshed or opened in another tab
  onTaskCompleted('generate-recommendations', async () => {
    // Add a small delay to ensure DB write consistency
    setTimeout(async () => {
      await refreshAll()
      toast.add({
        title: 'New Recommendations',
        description: 'Analysis complete. Your recommendations have been updated.',
        color: 'success',
        icon: 'i-heroicons-check-circle'
      })
      refreshingAdvice.value = false
    }, 1000)
  })

  // Fetch Categories
  const { data: categories, refresh: refreshCategories } = await useFetch(
    '/api/recommendations/categories'
  )

  // Actions
  async function confirmClearAll() {
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
      showClearModal.value = false
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
    if (refreshingAdvice.value) return

    refreshingAdvice.value = true
    try {
      const res: any = await $fetch('/api/recommendations/generate', {
        method: 'POST'
      })

      toast.add({
        title: 'Update Started',
        description: 'Generating new recommendations based on your recent data...',
        color: 'info',
        icon: 'i-heroicons-arrow-path-rounded-square'
      })

      // Refresh global monitor list to show the new run immediately
      refreshUserRuns()
    } catch (error: any) {
      // If 409 (Already running), we should still monitor if we get a jobId
      if (error.statusCode === 409) {
        toast.add({
          title: 'Already Running',
          description: 'Analysis is already in progress. Waiting for completion...',
          color: 'warning'
        })
        // Fallback if no jobId returned, wait a bit and refresh
        setTimeout(refreshAll, 5000)
        refreshingAdvice.value = false
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
    query: { status: 'ACTIVE', isPinned: false, category: selectedCategory },
    key: 'active-recs',
    watch: [selectedCategory]
  })

  // Fetch History (Completed/Dismissed)
  const {
    data: allHistory,
    pending: historyPending,
    refresh: refreshHistory
  } = await useFetch('/api/recommendations', {
    query: { status: 'ALL', category: selectedCategory },
    lazy: true,
    key: 'history-recs',
    watch: [selectedCategory]
  })

  // Sorting Logic
  const priorityWeight = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'high':
        return 3
      case 'medium':
        return 2
      case 'low':
        return 1
      default:
        return 0
    }
  }

  const sortRecommendations = (recs: any[] | null | undefined) => {
    if (!recs) return []
    return [...recs].sort((a, b) => {
      // First by priority
      const weightA = priorityWeight(a.priority)
      const weightB = priorityWeight(b.priority)
      if (weightA !== weightB) return weightB - weightA

      // Then by date (newest first)
      return new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
    })
  }

  const sortedPinnedRecs = computed(() => sortRecommendations(pinnedRecs.value))
  const sortedActiveRecs = computed(() => sortRecommendations(activeRecs.value))

  const sortedHistoryRecs = computed(() => {
    const history = allHistory.value?.filter((r: any) => r.status !== 'ACTIVE') || []
    return sortRecommendations(history)
  })

  async function refreshAll() {
    await Promise.all([refreshPinned(), refreshActive(), refreshHistory(), refreshCategories()])
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

      let action = 'Updated'
      if (status === 'COMPLETED') action = 'Marked as Done'
      else if (status === 'DISMISSED') action = 'Dismissed'
      else if (status === 'ACTIVE') action = 'Restored'

      toast.add({ title: action, color: 'success' })
      await refreshAll()
    } catch (e) {
      toast.add({ title: 'Error updating status', color: 'error' })
    }
  }
</script>
