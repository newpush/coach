<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Queue Status">
        <template #right>
          <UButton
            icon="i-heroicons-arrow-path"
            color="neutral"
            variant="ghost"
            :loading="pending"
            @click="() => refresh()"
          >
            Refresh
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-6 space-y-6">
        <div v-if="pending && !data" class="space-y-4">
          <USkeleton class="h-40 w-full" />
          <USkeleton class="h-40 w-full" />
        </div>

        <div v-else class="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
          <UCard v-for="queue in data?.queues as any[]" :key="queue.name">
            <template #header>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <UIcon name="i-heroicons-queue-list" class="w-5 h-5 text-gray-500" />
                  <h3 class="font-semibold text-gray-900 dark:text-white">{{ queue.name }}</h3>
                </div>
                <UBadge :color="queue.isPaused ? 'error' : 'success'" variant="subtle">
                  {{ queue.isPaused ? 'Paused' : 'Running' }}
                </UBadge>
              </div>
            </template>

            <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div class="flex flex-col">
                <span class="text-xs text-gray-500 uppercase font-semibold">Waiting</span>
                <span class="text-2xl font-bold text-gray-900 dark:text-white">{{
                  queue.counts.waiting
                }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-xs text-gray-500 uppercase font-semibold">Active</span>
                <span class="text-2xl font-bold text-green-600 dark:text-green-400">{{
                  queue.counts.active
                }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-xs text-gray-500 uppercase font-semibold">Workers</span>
                <span class="text-2xl font-bold text-blue-600 dark:text-blue-400">{{
                  queue.workers
                }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-xs text-gray-500 uppercase font-semibold">Completed</span>
                <span class="text-2xl font-bold text-gray-700 dark:text-gray-300">{{
                  queue.counts.completed
                }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-xs text-gray-500 uppercase font-semibold">Failed</span>
                <span class="text-2xl font-bold text-red-600 dark:text-red-400">{{
                  queue.counts.failed
                }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-xs text-gray-500 uppercase font-semibold">Delayed</span>
                <span class="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{{
                  queue.counts.delayed
                }}</span>
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
  definePageMeta({
    layout: 'admin'
  })

  useHead({
    title: 'Queue Status - Admin'
  })

  const { data, pending, refresh } = await useFetch('/api/admin/queues/status', {
    // Refresh every 10 seconds automatically
    // server: false // Can disable server-side fetch if preferred for dashboard-only data
  })

  // Auto-refresh interval
  const timer = ref<NodeJS.Timeout | null>(null)

  onMounted(() => {
    timer.value = setInterval(() => {
      refresh()
    }, 10000)
  })

  onUnmounted(() => {
    if (timer.value) clearInterval(timer.value)
  })
</script>
