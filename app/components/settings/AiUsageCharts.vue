<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-chart-pie" class="w-5 h-5 text-primary" />
        <h2 class="text-xl font-semibold">Usage Analytics</h2>
      </div>
    </template>

    <div class="space-y-6">
      <!-- Loading State -->
      <div v-if="loading" class="flex items-center justify-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
      </div>

      <template v-if="!loading && data">
        <!-- Operations Pie Chart -->
        <div>
          <h3 class="text-sm font-medium text-muted mb-3">Operations Distribution</h3>
          <div class="space-y-2">
            <div
              v-for="(item, index) in operationData"
              :key="item.operation"
              class="flex items-center gap-3"
            >
              <div class="flex items-center gap-2 flex-1">
                <div
                  class="w-3 h-3 rounded-full flex-shrink-0"
                  :style="{ backgroundColor: getColor(index) }"
                />
                <div class="flex-1 min-w-0">
                  <div class="text-sm truncate">{{ formatOperation(item.operation) }}</div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <div class="text-sm font-medium">{{ item.percentage }}%</div>
                <div class="text-xs text-muted">({{ item.calls }})</div>
              </div>
            </div>
          </div>

          <!-- Pie Chart Visualization -->
          <div class="mt-4">
            <svg viewBox="0 0 200 200" class="w-full max-w-[200px] mx-auto">
              <circle
                cx="100"
                cy="100"
                r="90"
                fill="none"
                stroke="currentColor"
                stroke-width="1"
                class="text-gray-200 dark:text-gray-700"
              />
              <g v-for="(segment, index) in pieSegments" :key="index">
                <path
                  :d="segment.path"
                  :fill="getColor(index)"
                  :opacity="0.8"
                  class="hover:opacity-100 transition-opacity cursor-pointer"
                />
              </g>
            </svg>
          </div>
        </div>

        <!-- Daily Usage Bar Chart -->
        <div>
          <h3 class="text-sm font-medium text-muted mb-3">Daily Usage (Last 7 Days)</h3>
          <div class="space-y-3">
            <div v-for="day in dailyData" :key="day.date" class="space-y-1">
              <div class="flex items-center justify-between text-xs">
                <span class="text-muted">{{ day.dateLabel }}</span>
                <span class="font-medium">{{ day.calls }} calls</span>
              </div>
              <div class="flex items-center gap-2">
                <div class="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    class="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all"
                    :style="{ width: `${day.percentage}%` }"
                  />
                </div>
              </div>
              <div class="text-xs text-muted">{{ formatNumber(day.tokens) }} tokens</div>
            </div>
          </div>
        </div>

        <!-- Token Usage Chart -->
        <div>
          <h3 class="text-sm font-medium text-muted mb-3">Token Usage Trend</h3>
          <div class="relative h-32">
            <svg viewBox="0 0 300 100" class="w-full h-full" preserveAspectRatio="none">
              <!-- Grid lines -->
              <line
                x1="0"
                y1="25"
                x2="300"
                y2="25"
                stroke="currentColor"
                stroke-width="0.5"
                class="text-gray-200 dark:text-gray-700"
              />
              <line
                x1="0"
                y1="50"
                x2="300"
                y2="50"
                stroke="currentColor"
                stroke-width="0.5"
                class="text-gray-200 dark:text-gray-700"
              />
              <line
                x1="0"
                y1="75"
                x2="300"
                y2="75"
                stroke="currentColor"
                stroke-width="0.5"
                class="text-gray-200 dark:text-gray-700"
              />

              <!-- Bar chart -->
              <g v-for="(day, index) in dailyData" :key="index">
                <rect
                  :x="index * (300 / dailyData.length) + 5"
                  :y="100 - (day.tokens / maxTokens) * 90"
                  :width="300 / dailyData.length - 10"
                  :height="(day.tokens / maxTokens) * 90"
                  class="fill-purple-500 dark:fill-purple-400"
                  opacity="0.7"
                />
              </g>
            </svg>
          </div>
          <div class="flex justify-between text-xs text-muted mt-2">
            <span>{{ dailyData[0]?.dateLabel }}</span>
            <span>{{ dailyData[dailyData.length - 1]?.dateLabel }}</span>
          </div>
        </div>
      </template>
    </div>
  </UCard>
</template>

<script setup lang="ts">
  const loading = ref(true)
  const { formatDate } = useFormat()

  const { data } = await useFetch('/api/analytics/llm-usage', {
    query: {
      days: 30,
      groupBy: 'operation'
    },
    lazy: true,
    server: false
  })

  // Also fetch daily data
  const { data: dailyDataRaw } = await useFetch('/api/analytics/llm-usage', {
    query: {
      days: 7,
      groupBy: 'date'
    },
    lazy: true,
    server: false
  })

  watchEffect(() => {
    if (data.value && dailyDataRaw.value) {
      loading.value = false
    }
  })

  // Process operation data
  const operationData = computed(() => {
    if (!data.value?.groupedData) return []
    const total = data.value.groupedData.reduce((sum: number, item: any) => sum + item.calls, 0)
    return data.value.groupedData
      .map((item: any) => ({
        operation: item.operation,
        calls: item.calls,
        percentage: total > 0 ? Math.round((item.calls / total) * 100) : 0
      }))
      .sort((a: any, b: any) => b.calls - a.calls)
      .slice(0, 5) // Top 5 operations
  })

  // Process daily data
  const dailyData = computed(() => {
    if (!dailyDataRaw.value?.groupedData) return []
    const items = [...dailyDataRaw.value.groupedData]
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-7) // Last 7 days

    const maxCalls = Math.max(...items.map((item: any) => item.calls), 1)

    return items.map((item: any) => ({
      date: item.date,
      dateLabel: formatDateLabel(item.date),
      calls: item.calls,
      tokens: item.tokens || 0,
      percentage: (item.calls / maxCalls) * 100
    }))
  })

  const maxTokens = computed(() => {
    return Math.max(...dailyData.value.map((d) => d.tokens), 1)
  })

  // Generate pie chart segments
  const pieSegments = computed(() => {
    const segments: any[] = []
    let currentAngle = -90 // Start at top

    operationData.value.forEach((item, index) => {
      const percentage = item.percentage / 100
      const angle = percentage * 360
      const endAngle = currentAngle + angle

      const x1 = 100 + 90 * Math.cos((currentAngle * Math.PI) / 180)
      const y1 = 100 + 90 * Math.sin((currentAngle * Math.PI) / 180)
      const x2 = 100 + 90 * Math.cos((endAngle * Math.PI) / 180)
      const y2 = 100 + 90 * Math.sin((endAngle * Math.PI) / 180)

      const largeArc = angle > 180 ? 1 : 0

      const path = [`M 100 100`, `L ${x1} ${y1}`, `A 90 90 0 ${largeArc} 1 ${x2} ${y2}`, `Z`].join(
        ' '
      )

      segments.push({ path, color: getColor(index) })
      currentAngle = endAngle
    })

    return segments
  })

  function getColor(index: number): string {
    const colors = [
      '#3b82f6', // blue
      '#8b5cf6', // purple
      '#ec4899', // pink
      '#f59e0b', // amber
      '#10b981', // emerald
      '#06b6d4', // cyan
      '#f97316' // orange
    ]
    return colors[index % colors.length] || '#3b82f6'
  }

  function formatOperation(op: string): string {
    return op
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  function formatDateLabel(dateStr: string): string {
    const formatted = formatDate(dateStr, 'MMM d')
    const today = formatDate(new Date(), 'MMM d')
    const yesterday = formatDate(new Date(Date.now() - 86400000), 'MMM d')

    if (formatted === today) return 'Today'
    if (formatted === yesterday) return 'Yesterday'

    return formatted
  }

  function formatNumber(num: number | null | undefined): string {
    if (!num || num === 0) return '0'
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M'
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K'
    }
    return num.toLocaleString()
  }
</script>
