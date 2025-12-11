<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-chart-bar" class="w-5 h-5 text-primary" />
          <h2 class="text-xl font-semibold">AI Usage & Cost Analytics</h2>
        </div>
        <UButton
          v-if="!loading && data"
          size="xs"
          variant="ghost"
          @click="refresh"
          :loading="refreshing"
        >
          <UIcon name="i-heroicons-arrow-path" />
        </UButton>
      </div>
    </template>
    
    <div class="space-y-4">
      <!-- Loading State -->
      <div v-if="loading" class="flex items-center justify-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
      </div>

      <!-- Summary Cards -->
      <div v-if="!loading && data" class="space-y-3">
        <!-- Total Cost Card -->
        <div class="relative overflow-hidden rounded-xl border border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950/50 dark:to-emerald-900/50 p-5">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-sm font-medium mb-2">
                <UIcon name="i-heroicons-currency-dollar" class="w-4 h-4" />
                Total Cost (30 days)
              </div>
              <div class="text-3xl font-bold text-emerald-900 dark:text-emerald-100 mb-1">
                ${{ (data.summary.totalCost ?? 0).toFixed(4) }}
              </div>
              <div class="text-sm text-emerald-600 dark:text-emerald-400">
                {{ data.summary.totalCalls ?? 0 }} requests
              </div>
            </div>
            <div class="bg-emerald-500/10 dark:bg-emerald-400/10 rounded-full p-3">
              <UIcon name="i-heroicons-banknotes" class="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
        </div>
        
        <!-- Success Rate Card -->
        <div class="relative overflow-hidden rounded-xl border border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/50 dark:to-blue-900/50 p-5">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-2 text-blue-700 dark:text-blue-400 text-sm font-medium mb-2">
                <UIcon name="i-heroicons-check-circle" class="w-4 h-4" />
                Success Rate
              </div>
              <div class="text-3xl font-bold text-blue-900 dark:text-blue-100 mb-1">
                {{ (data.summary.successRate ?? 0).toFixed(1) }}%
              </div>
              <div class="text-sm text-blue-600 dark:text-blue-400">
                {{ data.summary.successfulCalls ?? 0 }}/{{ data.summary.totalCalls ?? 0 }} successful
              </div>
            </div>
            <div class="bg-blue-500/10 dark:bg-blue-400/10 rounded-full p-3">
              <UIcon name="i-heroicons-chart-bar-square" class="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>
        
        <!-- Response Time Card -->
        <div class="relative overflow-hidden rounded-xl border border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/50 dark:to-purple-900/50 p-5">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-2 text-purple-700 dark:text-purple-400 text-sm font-medium mb-2">
                <UIcon name="i-heroicons-clock" class="w-4 h-4" />
                Avg Response Time
              </div>
              <div class="text-3xl font-bold text-purple-900 dark:text-purple-100 mb-1">
                {{ ((data.summary.avgDuration ?? 0) / 1000).toFixed(2) }}s
              </div>
              <div class="text-sm text-purple-600 dark:text-purple-400">
                {{ formatNumber(data.summary.totalTokens) }} tokens used
              </div>
            </div>
            <div class="bg-purple-500/10 dark:bg-purple-400/10 rounded-full p-3">
              <UIcon name="i-heroicons-bolt" class="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
const loading = ref(true)
const refreshing = ref(false)

const { data, refresh: refreshData } = await useFetch('/api/analytics/llm-usage', {
  query: {
    days: 30,
    groupBy: 'operation'
  },
  lazy: true,
  server: false
})

watchEffect(() => {
  if (data.value) {
    loading.value = false
  }
})

async function refresh() {
  refreshing.value = true
  await refreshData()
  refreshing.value = false
}

function formatNumber(num: number | null | undefined): string {
  if (!num || num === 0) return '0'
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}
</script>