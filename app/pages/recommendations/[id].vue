<template>
  <UDashboardPanel id="recommendation-detail">
    <template #header>
      <UDashboardNavbar :title="rec?.title || 'Recommendation Detail'">
        <template #leading>
          <UButton
            icon="i-heroicons-arrow-left"
            color="neutral"
            variant="ghost"
            to="/recommendations"
          >
            Back to Recommendations
          </UButton>
        </template>
        <template #right>
          <div v-if="rec" class="flex items-center gap-2">
            <UButton
              :icon="rec.isPinned ? 'i-heroicons-paper-clip-solid' : 'i-heroicons-paper-clip'"
              :color="rec.isPinned ? 'primary' : 'neutral'"
              variant="ghost"
              @click="togglePin"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-3 sm:p-6 space-y-6 sm:space-y-10">
        <div v-if="pending" class="flex justify-center py-12">
          <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
        </div>

        <div v-else-if="rec" class="space-y-8">
          <!-- Main Content Section -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Left: Main Detail (2/3) -->
            <div class="lg:col-span-2 space-y-6">
              <UCard>
                <template #header>
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <UBadge :color="priorityColor" variant="subtle">
                        {{ rec.priority.toUpperCase() }}
                      </UBadge>
                      <UBadge color="neutral" variant="soft">
                        {{ rec.sourceType }} / {{ rec.metric }}
                      </UBadge>
                    </div>
                    <div class="text-xs text-muted">
                      Generated {{ formatDate(rec.generatedAt) }}
                    </div>
                  </div>
                </template>

                <div class="prose dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
                  <p class="whitespace-pre-line text-lg leading-relaxed">{{ rec.description }}</p>
                </div>

                <template #footer>
                  <div class="flex items-center justify-between w-full">
                    <UButton
                      v-if="!rec.implementationGuide"
                      icon="i-heroicons-sparkles"
                      color="primary"
                      variant="soft"
                      :loading="generatingGuide"
                      @click="generateGuide"
                    >
                      Generate Action Plan
                    </UButton>
                    <div v-else class="flex-1"></div>

                    <div class="flex items-center justify-end gap-3">
                      <UButton
                        v-if="rec.status === 'ACTIVE'"
                        color="neutral"
                        variant="ghost"
                        @click="updateStatus('DISMISSED')"
                      >
                        Dismiss
                      </UButton>
                      <UButton
                        v-if="rec.status === 'ACTIVE'"
                        color="success"
                        variant="soft"
                        icon="i-heroicons-check"
                        class="font-bold"
                        @click="updateStatus('COMPLETED')"
                      >
                        Mark Complete
                      </UButton>
                      <UBadge v-else color="neutral" variant="solid" class="font-bold">
                        {{ rec.status }}
                      </UBadge>
                    </div>
                  </div>
                </template>
              </UCard>

              <!-- Action Plan / Implementation Guide -->
              <div v-if="rec.implementationGuide" class="space-y-4">
                <h3
                  class="text-xl font-bold text-gray-900 dark:text-white px-1 flex items-center gap-2"
                >
                  <UIcon
                    name="i-heroicons-clipboard-document-list"
                    class="w-6 h-6 text-primary-500"
                  />
                  Action Plan
                </h3>

                <div class="grid gap-6">
                  <!-- Strategy Summary -->
                  <UCard :ui="{ body: 'p-5' }">
                    <h4
                      class="font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2"
                    >
                      <UIcon name="i-heroicons-light-bulb" class="w-5 h-5 text-yellow-500" />
                      Strategy
                    </h4>
                    <p class="text-gray-700 dark:text-gray-300 leading-relaxed">
                      {{ rec.implementationGuide.strategy_summary }}
                    </p>
                  </UCard>

                  <!-- Key Actions -->
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <UCard :ui="{ body: 'p-5' }" class="h-full">
                      <h4
                        class="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2"
                      >
                        <UIcon name="i-heroicons-play-circle" class="w-5 h-5 text-green-500" />
                        Key Actions
                      </h4>
                      <ul class="space-y-2">
                        <li
                          v-for="(action, i) in rec.implementationGuide.key_actions"
                          :key="i"
                          class="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
                        >
                          <span class="font-bold text-primary-500">{{ i + 1 }}.</span>
                          <span>{{ action }}</span>
                        </li>
                      </ul>
                    </UCard>

                    <UCard :ui="{ body: 'p-5' }" class="h-full">
                      <h4
                        class="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2"
                      >
                        <UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-purple-500" />
                        Pro Tips
                      </h4>
                      <ul class="space-y-2">
                        <li
                          v-for="(tip, i) in rec.implementationGuide.tips_and_tricks"
                          :key="i"
                          class="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
                        >
                          <UIcon
                            name="i-heroicons-check-circle"
                            class="w-4 h-4 text-purple-400 mt-0.5 shrink-0"
                          />
                          <span>{{ tip }}</span>
                        </li>
                      </ul>
                    </UCard>
                  </div>

                  <!-- Pitfalls & Metrics -->
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <UCard
                      :ui="{ body: 'p-5' }"
                      class="bg-red-50/50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30"
                    >
                      <h4
                        class="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2"
                      >
                        <UIcon
                          name="i-heroicons-exclamation-triangle"
                          class="w-5 h-5 text-red-500"
                        />
                        Watch Out For
                      </h4>
                      <ul class="space-y-2">
                        <li
                          v-for="(pitfall, i) in rec.implementationGuide.common_pitfalls"
                          :key="i"
                          class="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
                        >
                          <UIcon
                            name="i-heroicons-x-mark"
                            class="w-4 h-4 text-red-400 mt-0.5 shrink-0"
                          />
                          <span>{{ pitfall }}</span>
                        </li>
                      </ul>
                    </UCard>

                    <UCard
                      :ui="{ body: 'p-5' }"
                      class="bg-green-50/50 dark:bg-green-900/10 border-green-100 dark:border-green-900/30"
                    >
                      <h4
                        class="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2"
                      >
                        <UIcon name="i-heroicons-chart-bar" class="w-5 h-5 text-green-600" />
                        Success Indicators
                      </h4>
                      <ul class="space-y-2">
                        <li
                          v-for="(metric, i) in rec.implementationGuide.success_metrics"
                          :key="i"
                          class="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
                        >
                          <UIcon
                            name="i-heroicons-arrow-trending-up"
                            class="w-4 h-4 text-green-500 mt-0.5 shrink-0"
                          />
                          <span>{{ metric }}</span>
                        </li>
                      </ul>
                    </UCard>
                  </div>
                </div>
              </div>

              <!-- Evolution History -->
              <div v-if="rec.history && rec.history.length > 0" class="space-y-4">
                <h3 class="text-xl font-bold text-gray-900 dark:text-white px-1">
                  Evolution History
                </h3>
                <div
                  class="relative pl-6 border-l-2 border-gray-200 dark:border-gray-700 space-y-8"
                >
                  <div v-for="(item, idx) in sortedHistory" :key="idx" class="relative">
                    <div
                      class="absolute -left-[29px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-gray-900 bg-gray-400"
                    ></div>

                    <div class="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 shadow-sm space-y-3">
                      <div class="flex items-center justify-between">
                        <span class="text-xs font-mono text-muted">
                          {{ formatDate(item.date) }}
                        </span>
                        <UBadge color="neutral" variant="outline" size="xs">
                          Previous Version
                        </UBadge>
                      </div>

                      <div
                        v-if="item.reason"
                        class="text-sm font-semibold text-primary-600 dark:text-primary-400 flex items-center gap-1.5"
                      >
                        <UIcon name="i-heroicons-sparkles" class="w-4 h-4" />
                        Update Reason: {{ item.reason }}
                      </div>

                      <div>
                        <div class="font-bold text-gray-900 dark:text-white text-base">
                          {{ item.title }}
                        </div>
                        <div
                          class="text-sm text-gray-600 dark:text-gray-400 mt-2 whitespace-pre-wrap"
                        >
                          {{ item.description }}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Right: Meta Info (1/3) -->
            <div class="space-y-6">
              <UCard>
                <template #header>
                  <h3 class="font-bold">Meta Details</h3>
                </template>
                <div class="space-y-4">
                  <div>
                    <div class="text-xs font-bold text-muted uppercase tracking-widest mb-1">
                      Priority
                    </div>
                    <UBadge :color="priorityColor" variant="solid" class="font-bold">
                      {{ rec.priority.toUpperCase() }}
                    </UBadge>
                  </div>
                  <div>
                    <div class="text-xs font-bold text-muted uppercase tracking-widest mb-1">
                      Metric
                    </div>
                    <div class="font-medium text-sm">{{ rec.metric }}</div>
                  </div>
                  <div>
                    <div class="text-xs font-bold text-muted uppercase tracking-widest mb-1">
                      Source
                    </div>
                    <div class="font-medium text-sm">{{ rec.sourceType }}</div>
                  </div>
                  <div v-if="rec.period">
                    <div class="text-xs font-bold text-muted uppercase tracking-widest mb-1">
                      Period
                    </div>
                    <div class="font-medium text-sm">{{ rec.period }} Days</div>
                  </div>
                  <div v-if="rec.llmUsageId" class="pt-4 border-t">
                    <AiFeedback :llm-usage-id="rec.llmUsageId" />
                  </div>
                </div>
              </UCard>
            </div>
          </div>
        </div>

        <div v-else class="text-center py-20">
          <UIcon name="i-heroicons-exclamation-circle" class="w-12 h-12 mx-auto text-muted mb-4" />
          <h2 class="text-xl font-bold mb-2">Recommendation Not Found</h2>
          <p class="text-muted mb-6">The requested recommendation could not be found.</p>
          <UButton to="/recommendations"> Go Back </UButton>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
  const route = useRoute()
  const recId = route.params.id as string
  const toast = useToast()
  const { formatDate: format } = useFormat()

  const { data: rec, pending, refresh } = await useFetch<any>(`/api/recommendations/${recId}`)

  const priorityColor = computed(() => {
    switch (rec.value?.priority) {
      case 'high':
        return 'red'
      case 'medium':
        return 'orange'
      case 'low':
        return 'blue'
      default:
        return 'gray'
    }
  })

  const sortedHistory = computed(() => {
    if (!rec.value?.history) return []
    // Sort descending by date (newest first)
    return [...rec.value.history].reverse()
  })

  const formatDate = (d: string) => format(d)

  // Implementation Guide Logic
  const generatingGuide = ref(false)

  async function generateGuide() {
    generatingGuide.value = true
    try {
      await $fetch(`/api/recommendations/${recId}/guide`, {
        method: 'POST'
      })

      toast.add({
        title: 'Generating Action Plan',
        description: 'Coach is creating a detailed guide...',
        color: 'info',
        icon: 'i-heroicons-sparkles'
      })

      // Poll for result
      let attempts = 0
      const maxAttempts = 30 // 60s
      const poll = setInterval(async () => {
        attempts++
        await refresh()

        if (rec.value?.implementationGuide) {
          clearInterval(poll)
          generatingGuide.value = false
          toast.add({ title: 'Action Plan Ready', color: 'success' })
        } else if (attempts >= maxAttempts) {
          clearInterval(poll)
          generatingGuide.value = false
          toast.add({
            title: 'Timeout',
            description: 'Taking longer than expected.',
            color: 'warning'
          })
        }
      }, 2000)
    } catch (e) {
      generatingGuide.value = false
      toast.add({ title: 'Error', color: 'error' })
    }
  }

  async function togglePin() {
    if (!rec.value) return
    const newState = !rec.value.isPinned
    try {
      await $fetch(`/api/recommendations/${recId}`, {
        method: 'PATCH',
        body: { isPinned: newState }
      })
      refresh()
      toast.add({ title: newState ? 'Pinned' : 'Unpinned', color: 'success' })
    } catch (e) {
      toast.add({ title: 'Error', color: 'error' })
    }
  }

  async function updateStatus(status: string) {
    try {
      await $fetch(`/api/recommendations/${recId}`, {
        method: 'PATCH',
        body: { status }
      })
      refresh()
      toast.add({ title: 'Status updated', color: 'success' })
    } catch (e) {
      toast.add({ title: 'Error', color: 'error' })
    }
  }
</script>
