<script setup lang="ts">
  import {
    Chart as ChartJS,
    ArcElement,
    Tooltip,
    Legend,
    BarElement,
    CategoryScale,
    LinearScale,
    LineElement,
    PointElement,
    Filler
  } from 'chart.js'
  import { Pie, Bar, Line } from 'vue-chartjs'

  ChartJS.register(
    ArcElement,
    Tooltip,
    Legend,
    BarElement,
    CategoryScale,
    LinearScale,
    LineElement,
    PointElement,
    Filler
  )

  definePageMeta({
    layout: 'admin',
    middleware: ['auth', 'admin']
  })

  const { data: stats, pending } = await useFetch('/api/admin/stats/llm/overview')

  useHead({
    title: 'LLM Intelligence Stats'
  })

  const spenderTab = ref('today')

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
        labels: {
          boxWidth: 12
        }
      }
    }
  }

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          precision: 0
        }
      }
    }
  }

  const stackedBarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const,
        labels: {
          boxWidth: 12,
          padding: 15
        }
      }
    },
    scales: {
      x: {
        stacked: true,
        grid: {
          display: false
        }
      },
      y: {
        stacked: true,
        beginAtZero: true
      }
    }
  }

  const stackedBarNoLegendOptions = {
    ...stackedBarOptions,
    plugins: {
      ...stackedBarOptions.plugins,
      legend: {
        display: false
      }
    }
  }

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const
      }
    },
    scales: {
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
          display: true,
          text: 'Requests'
        },
        beginAtZero: true,
        ticks: {
          precision: 0
        }
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        title: {
          display: true,
          text: 'Unique Users'
        },
        beginAtZero: true,
        ticks: {
          precision: 0
        },
        grid: {
          drawOnChartArea: false // only want the grid lines for one axis
        }
      }
    }
  }

  // Helper to generate consistent colors for models
  const getModelColor = (model: string) => {
    const colors: Record<string, string> = {
      'gemini-2.0-flash-exp': '#3b82f6', // Blue
      'gemini-1.5-flash': '#60a5fa', // Light Blue
      'gemini-1.5-pro': '#8b5cf6', // Purple
      'gpt-4o': '#10b981', // Emerald
      'gpt-4o-mini': '#34d399', // Light Emerald
      'claude-3-5-sonnet': '#f59e0b', // Amber
      'gemini-2.0-flash-thinking-exp': '#ec4899' // Pink
    }
    // Hash string to hex color fallback
    if (!colors[model]) {
      let hash = 0
      for (let i = 0; i < model.length; i++) {
        hash = model.charCodeAt(i) + ((hash << 5) - hash)
      }
      const c = (hash & 0x00ffffff).toString(16).toUpperCase()
      return '#' + '00000'.substring(0, 6 - c.length) + c
    }
    return colors[model]
  }

  // Helper to generate consistent colors for operations
  const getOperationColor = (operation: string) => {
    const colors: Record<string, string> = {
      chat: '#3b82f6', // Blue
      recommend_today_activity: '#10b981', // Emerald
      analyze_workout: '#f59e0b', // Amber
      analyze_nutrition: '#ef4444', // Red
      daily_checkin: '#8b5cf6', // Purple
      generate_weekly_plan: '#ec4899', // Pink
      generate_training_block: '#6366f1' // Indigo
    }
    if (!colors[operation]) {
      let hash = 0
      for (let i = 0; i < operation.length; i++) {
        hash = operation.charCodeAt(i) + ((hash << 5) - hash)
      }
      const c = (hash & 0x00ffffff).toString(16).toUpperCase()
      return '#' + '00000'.substring(0, 6 - c.length) + c
    }
    return colors[operation]
  }

  // Helper to generate consistent colors for tools
  const getToolColor = (tool: string) => {
    let hash = 0
    for (let i = 0; i < tool.length; i++) {
      hash = tool.charCodeAt(i) + ((hash << 5) - hash)
    }
    const c = (hash & 0x00ffffff).toString(16).toUpperCase()
    return '#' + '00000'.substring(0, 6 - c.length) + c
  }

  const dailyCostsChartData = computed(() => {
    if (!stats.value?.dailyCostsByModel) return { labels: [], datasets: [] }

    const data = stats.value.dailyCostsByModel
    // Get unique dates sorted
    const dates = [...new Set(data.map((d) => d.date))].sort()
    // Get unique models
    const models = [...new Set(data.map((d) => d.model))]

    return {
      labels: dates.map((d) =>
        new Date(d!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      ),
      datasets: models.map((model) => {
        return {
          label: model,
          backgroundColor: getModelColor(model),
          data: dates.map((date) => {
            const entry = data.find((d) => d.date === date && d.model === model)
            return entry ? entry.cost : 0
          })
        }
      })
    }
  })

  const dailyUsersChartData = computed(() => {
    if (!stats.value?.dailyUsersByModel) return { labels: [], datasets: [] }

    const data = stats.value.dailyUsersByModel
    // Get unique dates sorted
    const dates = [...new Set(data.map((d) => d.date))].sort()
    // Get unique models
    const models = [...new Set(data.map((d) => d.model))]

    return {
      labels: dates.map((d) =>
        new Date(d!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      ),
      datasets: models.map((model) => {
        return {
          label: model,
          backgroundColor: getModelColor(model),
          data: dates.map((date) => {
            const entry = data.find((d) => d.date === date && d.model === model)
            return entry ? entry.count : 0
          })
        }
      })
    }
  })

  const dailyToolCallsChartData = computed(() => {
    if (!stats.value?.dailyToolUsage) return { labels: [], datasets: [] }

    const data = stats.value.dailyToolUsage
    // Get unique dates sorted
    const dates = [...new Set(data.map((d) => d.date))].sort()
    // Get unique tools
    const tools = [...new Set(data.map((d) => d.name))]

    return {
      labels: dates.map((d) =>
        new Date(d!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      ),
      datasets: tools.map((tool) => {
        return {
          label: tool,
          backgroundColor: getToolColor(tool),
          data: dates.map((date) => {
            const entry = data.find((d) => d.date === date && d.name === tool)
            return entry ? entry.count : 0
          })
        }
      })
    }
  })

  const dailyTokensByModelChartData = computed(() => {
    if (!stats.value?.dailyTokensByModel) return { labels: [], datasets: [] }

    const data = stats.value.dailyTokensByModel
    const dates = [...new Set(data.map((d) => d.date))].sort()
    const models = [...new Set(data.map((d) => d.model))]

    return {
      labels: dates.map((d) =>
        new Date(d!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      ),
      datasets: models.map((model) => ({
        label: model,
        backgroundColor: getModelColor(model),
        data: dates.map((date) => {
          const entry = data.find((d) => d.date === date && d.model === model)
          return entry ? entry.count : 0
        })
      }))
    }
  })

  const dailyTokensByOperationChartData = computed(() => {
    if (!stats.value?.dailyTokensByOperation) return { labels: [], datasets: [] }

    const data = stats.value.dailyTokensByOperation
    const dates = [...new Set(data.map((d) => d.date))].sort()
    const operations = [...new Set(data.map((d) => d.operation))]

    return {
      labels: dates.map((d) =>
        new Date(d!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      ),
      datasets: operations.map((op) => ({
        label: op.replace(/_/g, ' '),
        backgroundColor: getOperationColor(op),
        data: dates.map((date) => {
          const entry = data.find((d) => d.date === date && d.operation === op)
          return entry ? entry.count : 0
        })
      }))
    }
  })

  const dailyCountsByOperationChartData = computed(() => {
    if (!stats.value?.dailyCountsByOperation) return { labels: [], datasets: [] }

    const data = stats.value.dailyCountsByOperation
    const dates = [...new Set(data.map((d) => d.date))].sort()
    const operations = [...new Set(data.map((d) => d.operation))]

    return {
      labels: dates.map((d) =>
        new Date(d!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      ),
      datasets: operations.map((op) => ({
        label: op.replace(/_/g, ' '),
        backgroundColor: getOperationColor(op),
        data: dates.map((date) => {
          const entry = data.find((d) => d.date === date && d.operation === op)
          return entry ? entry.count : 0
        })
      }))
    }
  })

  const dailyFailuresByOperationChartData = computed(() => {
    if (!stats.value?.dailyFailuresByOperation) return { labels: [], datasets: [] }

    const data = stats.value.dailyFailuresByOperation
    const dates = [...new Set(data.map((d) => d.date))].sort()
    const operations = [...new Set(data.map((d) => d.operation))]

    return {
      labels: dates.map((d) =>
        new Date(d!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      ),
      datasets: operations.map((op) => ({
        label: op.replace(/_/g, ' '),
        backgroundColor: getOperationColor(op),
        data: dates.map((date) => {
          const entry = data.find((d) => d.date === date && d.operation === op)
          return entry ? entry.count : 0
        })
      }))
    }
  })

  const dailyTotalRequestsChartData = computed(() => {
    if (!stats.value?.dailyTotalRequests) return { labels: [], datasets: [] }

    const data = stats.value.dailyTotalRequests
    const dates = data.map((d) => d.date).sort()

    return {
      labels: dates.map((d) =>
        new Date(d!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      ),
      datasets: [
        {
          label: 'Total Requests',
          borderColor: '#3b82f6',
          backgroundColor: '#3b82f633',
          fill: true,
          data: dates.map((date) => {
            const entry = data.find((d) => d.date === date)
            return entry ? entry.count : 0
          }),
          tension: 0.3
        }
      ]
    }
  })

  const dailyTotalUsersChartData = computed(() => {
    if (!stats.value?.dailyTotalUsers) return { labels: [], datasets: [] }

    const data = stats.value.dailyTotalUsers
    const dates = data.map((d) => d.date).sort()

    return {
      labels: dates.map((d) =>
        new Date(d!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      ),
      datasets: [
        {
          label: 'Total Unique Users',
          borderColor: '#10b981', // Emerald
          backgroundColor: '#10b98133', // Emerald with transparency
          fill: true,
          data: dates.map((date) => {
            const entry = data.find((d) => d.date === date)
            return entry ? entry.count : 0
          }),
          tension: 0.3
        }
      ]
    }
  })

  const dailyChatRequestsChartData = computed(() => {
    if (!stats.value?.dailyChatRequests) return { labels: [], datasets: [] }

    const data = stats.value.dailyChatRequests
    const dates = data.map((d) => d.date).sort()

    return {
      labels: dates.map((d) =>
        new Date(d!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      ),
      datasets: [
        {
          label: 'Requests',
          borderColor: '#8b5cf6', // Purple
          backgroundColor: '#8b5cf6',
          data: dates.map((date) => {
            const entry = data.find((d) => d.date === date)
            return entry ? entry.count : 0
          }),
          tension: 0.3,
          yAxisID: 'y'
        },
        {
          label: 'Unique Users',
          borderColor: '#10b981', // Emerald
          backgroundColor: '#10b981',
          data: dates.map((date) => {
            const entry = data.find((d) => d.date === date)
            return entry ? entry.userCount : 0
          }),
          tension: 0.3,
          yAxisID: 'y1'
        }
      ]
    }
  })

  // Hourly Chart Data (Last 48 Hours)
  const hourlyChartLabels = computed(() => {
    if (!stats.value?.hourlyStats) return []
    const hours = [...new Set(stats.value.hourlyStats.map((h) => h.hour))].sort()
    return hours.map((h) => {
      const d = new Date(h)
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      })
    })
  })

  const hourlyCostChartData = computed(() => {
    if (!stats.value?.hourlyStats) return { labels: [], datasets: [] }

    const data = stats.value.hourlyStats
    const hours = [...new Set(data.map((h) => h.hour))].sort()
    const models = [...new Set(data.map((h) => h.model))]

    return {
      labels: hourlyChartLabels.value,
      datasets: models.map((model) => ({
        label: model,
        backgroundColor: getModelColor(model),
        data: hours.map((hour) => {
          const entry = data.find((d) => d.hour === hour && d.model === model)
          return entry ? entry.cost : 0
        })
      }))
    }
  })

  const modelChartData = computed(() => {
    if (!stats.value?.usageByModel) return { labels: [], datasets: [] }
    return {
      labels: stats.value.usageByModel.map((m) => m.model),
      datasets: [
        {
          backgroundColor: stats.value.usageByModel.map((m) => getModelColor(m.model)),
          data: stats.value.usageByModel.map((m) => m.count)
        }
      ]
    }
  })

  const operationChartData = computed(() => {
    if (!stats.value?.usageByOperation) return { labels: [], datasets: [] }
    return {
      labels: stats.value.usageByOperation.map((o) => o.operation.replace(/_/g, ' ')),
      datasets: [
        {
          backgroundColor: [
            '#3b82f6',
            '#10b981',
            '#f59e0b',
            '#ef4444',
            '#8b5cf6',
            '#ec4899',
            '#6366f1'
          ],
          data: stats.value.usageByOperation.map((o) => o.count)
        }
      ]
    }
  })

  const toolChartData = computed(() => {
    if (!stats.value?.usageByTool) return { labels: [], datasets: [] }
    return {
      labels: stats.value.usageByTool.map((t) => t.name),
      datasets: [
        {
          label: 'Tool Calls',
          backgroundColor: '#0ea5e9', // Sky blue
          data: stats.value.usageByTool.map((t) => t.count),
          borderRadius: 4
        }
      ]
    }
  })

  const feedbackChartData = computed(() => {
    if (!stats.value?.feedback?.history) return { labels: [], datasets: [] }
    return {
      labels: stats.value.feedback.history.map((h) => h.date),
      datasets: [
        {
          label: 'Feedback Responses',
          backgroundColor: '#8b5cf6',
          data: stats.value.feedback.history.map((h) => h.count),
          borderRadius: 4
        }
      ]
    }
  })
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="LLM Intelligence Stats">
        <template #leading>
          <UButton to="/admin/stats" icon="i-lucide-arrow-left" color="neutral" variant="ghost" />
        </template>
        <template #trailing>
          <UButton
            to="/admin/stats/llm/quotas"
            label="Quota Monitoring"
            icon="i-lucide-gauge"
            variant="ghost"
            color="neutral"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-6 space-y-6">
        <div v-if="pending" class="flex items-center justify-center p-12">
          <UIcon name="i-lucide-loader-2" class="animate-spin h-8 w-8 text-gray-400" />
        </div>

        <template v-else>
          <!-- Tokens Breakdown -->
          <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
            <UCard class="bg-blue-50/50 dark:bg-blue-900/10">
              <div class="text-center">
                <div class="text-xs font-bold text-blue-500 uppercase tracking-widest mb-1">
                  Total Tokens
                </div>
                <div class="text-2xl font-bold font-mono">
                  {{ stats?.totals?.tokens?.total?.toLocaleString() ?? '0' }}
                </div>
              </div>
            </UCard>
            <UCard class="bg-indigo-50/50 dark:bg-indigo-900/10">
              <div class="text-center">
                <div class="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-1">
                  Prompt Tokens
                </div>
                <div class="text-2xl font-bold font-mono">
                  {{ stats?.totals?.tokens?.prompt?.toLocaleString() ?? '0' }}
                </div>
                <div class="text-xs text-gray-500 mt-1">
                  {{
                    (
                      ((stats?.totals?.tokens?.prompt || 0) / (stats?.totals?.tokens?.total || 1)) *
                      100
                    ).toFixed(0)
                  }}% of total
                </div>
              </div>
            </UCard>
            <UCard
              class="bg-emerald-50/50 dark:bg-emerald-900/10 hover:border-emerald-500 transition-colors cursor-pointer"
              @click="navigateTo('/admin/stats/llm/caching')"
            >
              <div class="text-center">
                <div
                  class="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-1 flex items-center justify-center gap-1"
                >
                  Cached Tokens <UIcon name="i-lucide-external-link" class="w-3 h-3" />
                </div>
                <div class="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {{ stats?.totals?.tokens?.cached?.toLocaleString() || '0' }}
                </div>
                <div class="text-xs text-gray-500 mt-1">
                  {{
                    (
                      ((stats?.totals?.tokens?.cached || 0) /
                        (stats?.totals?.tokens?.prompt || 1)) *
                      100
                    ).toFixed(0)
                  }}% of input
                </div>
              </div>
            </UCard>
            <UCard class="bg-purple-50/50 dark:bg-purple-900/10">
              <div class="text-center">
                <div class="text-xs font-bold text-purple-500 uppercase tracking-widest mb-1">
                  Completion Tokens
                </div>
                <div class="text-2xl font-bold font-mono">
                  {{ stats?.totals?.tokens?.completion?.toLocaleString() ?? '0' }}
                </div>
                <div class="text-xs text-gray-500 mt-1">
                  {{
                    (
                      ((stats?.totals?.tokens?.completion || 0) /
                        (stats?.totals?.tokens?.total || 1)) *
                      100
                    ).toFixed(0)
                  }}% of total
                </div>
              </div>
            </UCard>
          </div>

          <!-- NEW: Daily Trends -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <UCard>
              <template #header>
                <h3 class="font-semibold">Daily Costs by Model</h3>
              </template>
              <div class="h-64 relative">
                <Bar :data="dailyCostsChartData" :options="stackedBarOptions" />
              </div>
            </UCard>

            <UCard>
              <template #header>
                <h3 class="font-semibold">Daily Active Users by Model</h3>
              </template>
              <div class="h-64 relative">
                <Bar :data="dailyUsersChartData" :options="stackedBarOptions" />
              </div>
            </UCard>
          </div>

          <!-- NEW: Daily Tokens and Operations per Type -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <UCard>
              <template #header>
                <h3 class="font-semibold">Daily Tokens per Operation</h3>
              </template>
              <div class="h-64 relative">
                <Bar :data="dailyTokensByOperationChartData" :options="stackedBarNoLegendOptions" />
              </div>
            </UCard>

            <UCard>
              <template #header>
                <h3 class="font-semibold">Daily Operations per Type</h3>
              </template>
              <div class="h-64 relative">
                <Bar :data="dailyCountsByOperationChartData" :options="stackedBarNoLegendOptions" />
              </div>
            </UCard>
          </div>

          <!-- NEW: Daily Total Tokens per Model -->
          <div class="grid grid-cols-1 gap-6">
            <UCard>
              <template #header>
                <h3 class="font-semibold">Daily Total Tokens by Model</h3>
              </template>
              <div class="h-64 relative">
                <Bar :data="dailyTokensByModelChartData" :options="stackedBarOptions" />
              </div>
            </UCard>
          </div>

          <!-- NEW: Hourly Trends (Past 48 Hours) -->
          <div class="space-y-6">
            <div class="flex items-center gap-2 mt-4">
              <UIcon name="i-lucide-clock" class="w-5 h-5 text-gray-400" />
              <h2 class="text-lg font-semibold">Hourly Trends (Past 48 Hours)</h2>
            </div>

            <div class="grid grid-cols-1 gap-6">
              <UCard>
                <template #header>
                  <h3 class="font-semibold">Hourly Costs by Model</h3>
                </template>
                <div class="h-64 relative">
                  <Bar :data="hourlyCostChartData" :options="stackedBarOptions" />
                </div>
              </UCard>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <UCard>
              <template #header>
                <h3 class="font-semibold">Total Daily Requests (All Operations)</h3>
              </template>
              <div class="h-64 relative">
                <Line :data="dailyTotalRequestsChartData" :options="barOptions" />
              </div>
            </UCard>

            <UCard>
              <template #header>
                <h3 class="font-semibold">Total Unique Users per Day (All LLM Operations)</h3>
              </template>
              <div class="h-64 relative">
                <Line :data="dailyTotalUsersChartData" :options="barOptions" />
              </div>
            </UCard>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Usage by Model -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Usage by Model</h3>
              </template>
              <div class="h-64 relative">
                <Pie :data="modelChartData" :options="pieOptions" />
              </div>
              <div class="mt-4 space-y-2 border-t border-gray-100 dark:border-gray-800 pt-4">
                <div
                  v-for="item in stats?.usageByModel.slice(0, 3)"
                  :key="item.model"
                  class="flex justify-between text-xs"
                >
                  <span class="font-medium">{{ item.model }}</span>
                  <span class="text-gray-500 font-mono">${{ (item.cost || 0).toFixed(4) }}</span>
                </div>
              </div>
            </UCard>

            <!-- Usage by Operation -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Usage by Operation</h3>
              </template>
              <div class="h-64 relative">
                <Pie :data="operationChartData" :options="pieOptions" />
              </div>
              <div class="mt-4 space-y-2 border-t border-gray-100 dark:border-gray-800 pt-4">
                <div
                  v-for="item in stats?.usageByOperation.slice(0, 3)"
                  :key="item.operation"
                  class="flex justify-between text-xs"
                >
                  <span class="font-medium capitalize">{{
                    item.operation.replace(/_/g, ' ')
                  }}</span>
                  <span class="text-gray-500 font-mono">${{ (item.cost || 0).toFixed(4) }}</span>
                </div>
              </div>
            </UCard>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Usage by Tool -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Top Tool Usage</h3>
              </template>
              <div class="h-64 relative">
                <Bar :data="toolChartData" :options="barOptions" />
              </div>
              <div class="mt-4 space-y-2 border-t border-gray-100 dark:border-gray-800 pt-4">
                <div
                  v-for="item in stats?.usageByTool.slice(0, 3)"
                  :key="item.name"
                  class="flex justify-between text-xs"
                >
                  <span class="font-medium font-mono text-xs">{{ item.name }}</span>
                  <span class="text-gray-500">{{ item.count }} calls</span>
                </div>
              </div>
            </UCard>

            <!-- NEW: Daily Tool Calls -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Daily Tool Calls per Tool</h3>
              </template>
              <div class="h-64 relative">
                <Bar :data="dailyToolCallsChartData" :options="stackedBarNoLegendOptions" />
              </div>
            </UCard>
          </div>

          <!-- Feedback Analysis -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <UCard class="lg:col-span-1">
              <template #header>
                <h3 class="font-semibold">User Feedback</h3>
              </template>
              <div class="flex flex-col items-center justify-center h-48 gap-6">
                <div class="flex items-center gap-3">
                  <UIcon name="i-lucide-thumbs-up" class="w-8 h-8 text-green-500" />
                  <span class="text-2xl font-bold">{{
                    stats?.feedback.summary.find((f) => f.type === 'THUMBS_UP')?.count || 0
                  }}</span>
                </div>
                <div class="flex items-center gap-3">
                  <UIcon name="i-lucide-thumbs-down" class="w-8 h-8 text-red-500" />
                  <span class="text-2xl font-bold">{{
                    stats?.feedback.summary.find((f) => f.type === 'THUMBS_DOWN')?.count || 0
                  }}</span>
                </div>
              </div>
            </UCard>

            <UCard class="lg:col-span-2">
              <template #header>
                <h3 class="font-semibold">Feedback Volume (Daily)</h3>
              </template>
              <div class="h-64">
                <Bar :data="feedbackChartData" :options="barOptions" />
              </div>
            </UCard>
          </div>

          <div class="grid grid-cols-1 gap-6">
            <UCard>
              <template #header>
                <h3 class="font-semibold">Daily LLM Requests from Chat</h3>
              </template>
              <div class="h-64 relative">
                <Line :data="dailyChatRequestsChartData" :options="lineOptions" />
              </div>
            </UCard>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Daily Failures Chart -->
            <UCard>
              <template #header>
                <div class="flex justify-between items-center">
                  <h3 class="font-semibold text-red-500">Daily Failures by Operation</h3>
                  <UButton
                    to="/admin/ai/failed-requests"
                    label="View Details"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    icon="i-lucide-external-link"
                  />
                </div>
              </template>
              <div class="h-64 relative">
                <Bar
                  :data="dailyFailuresByOperationChartData"
                  :options="stackedBarNoLegendOptions"
                />
              </div>
            </UCard>

            <!-- Top Spenders -->
            <UCard>
              <template #header>
                <div class="flex justify-between items-center">
                  <h3 class="font-semibold">Top Spenders</h3>
                  <div class="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                    <UButton
                      size="xs"
                      :color="spenderTab === 'today' ? 'primary' : 'neutral'"
                      :variant="spenderTab === 'today' ? 'solid' : 'ghost'"
                      @click="spenderTab = 'today'"
                    >
                      Today
                    </UButton>
                    <UButton
                      size="xs"
                      :color="spenderTab === 'yesterday' ? 'primary' : 'neutral'"
                      :variant="spenderTab === 'yesterday' ? 'solid' : 'ghost'"
                      @click="spenderTab = 'yesterday'"
                    >
                      Yesterday
                    </UButton>
                    <UButton
                      size="xs"
                      :color="spenderTab === '30d' ? 'primary' : 'neutral'"
                      :variant="spenderTab === '30d' ? 'solid' : 'ghost'"
                      @click="spenderTab = '30d'"
                    >
                      30d
                    </UButton>
                  </div>
                </div>
              </template>
              <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead>
                    <tr class="text-left text-xs uppercase text-gray-500">
                      <th class="py-2">User</th>
                      <th class="py-2 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody
                    v-if="spenderTab === 'today'"
                    class="divide-y divide-gray-200 dark:divide-gray-700"
                  >
                    <tr
                      v-for="(user, index) in stats?.topSpendersToday"
                      :key="user.userId || index"
                    >
                      <td class="py-2 text-sm">
                        <div class="font-medium">{{ user.name || 'Unknown' }}</div>
                        <div class="text-xs text-gray-500">{{ user.email }}</div>
                      </td>
                      <td
                        class="py-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400"
                      >
                        ${{ (user.cost || 0).toFixed(4) }}
                      </td>
                    </tr>
                    <tr v-if="!stats?.topSpendersToday?.length">
                      <td colspan="2" class="py-8 text-center text-gray-400 text-sm italic">
                        No spenders today
                      </td>
                    </tr>
                  </tbody>
                  <tbody
                    v-else-if="spenderTab === 'yesterday'"
                    class="divide-y divide-gray-200 dark:divide-gray-700"
                  >
                    <tr
                      v-for="(user, index) in stats?.topSpendersYesterday"
                      :key="user.userId || index"
                    >
                      <td class="py-2 text-sm">
                        <div class="font-medium">{{ user.name || 'Unknown' }}</div>
                        <div class="text-xs text-gray-500">{{ user.email }}</div>
                      </td>
                      <td
                        class="py-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400"
                      >
                        ${{ (user.cost || 0).toFixed(4) }}
                      </td>
                    </tr>
                    <tr v-if="!stats?.topSpendersYesterday?.length">
                      <td colspan="2" class="py-8 text-center text-gray-400 text-sm italic">
                        No spenders yesterday
                      </td>
                    </tr>
                  </tbody>
                  <tbody v-else class="divide-y divide-gray-200 dark:divide-gray-700">
                    <tr v-for="(user, index) in stats?.topSpenders" :key="user.userId || index">
                      <td class="py-2 text-sm">
                        <div class="font-medium">{{ user.name || 'Unknown' }}</div>
                        <div class="text-xs text-gray-500">{{ user.email }}</div>
                      </td>
                      <td
                        class="py-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400"
                      >
                        ${{ (user.cost || 0).toFixed(4) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </UCard>
          </div>

          <!-- Recent Usage Table -->
          <UCard>
            <template #header>
              <h3 class="font-semibold">Recent Usage Logs</h3>
            </template>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                <thead>
                  <tr
                    class="text-left text-xs uppercase text-gray-500 bg-gray-50 dark:bg-gray-900/50"
                  >
                    <th class="py-3 px-4">Time</th>
                    <th class="py-3 px-4">User</th>
                    <th class="py-3 px-4">Operation</th>
                    <th class="py-3 px-4">Model</th>
                    <th class="py-3 px-4 text-right">Tokens</th>
                    <th class="py-3 px-4 text-right">Cached</th>
                    <th class="py-3 px-4 text-right">Cost</th>
                    <th class="py-3 px-4 text-center">Status</th>
                    <th class="py-3 px-4 text-right"></th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                  <tr
                    v-for="log in stats?.recentUsage"
                    :key="log.id"
                    class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td class="py-2 px-4 whitespace-nowrap text-gray-500">
                      {{ new Date(log.createdAt).toLocaleString() }}
                    </td>
                    <td class="py-2 px-4 text-gray-900 dark:text-white">
                      {{ log.user?.email || 'System' }}
                    </td>
                    <td class="py-2 px-4">
                      <UBadge color="neutral" variant="soft" size="xs" class="capitalize">
                        {{ log.operation.replace(/_/g, ' ') }}
                      </UBadge>
                    </td>
                    <td class="py-2 px-4 text-xs font-mono text-gray-500">
                      {{ log.model }}
                    </td>
                    <td class="py-2 px-4 text-right font-mono text-xs">
                      {{ log.totalTokens?.toLocaleString() || '-' }}
                    </td>
                    <td class="py-2 px-4 text-right font-mono text-xs text-emerald-600">
                      {{ log.cachedTokens?.toLocaleString() || '-' }}
                    </td>
                    <td
                      class="py-2 px-4 text-right font-mono text-xs text-emerald-600 dark:text-emerald-400"
                    >
                      ${{ log.estimatedCost?.toFixed(5) || '0.00' }}
                    </td>
                    <td class="py-2 px-4 text-center">
                      <UIcon
                        :name="log.success ? 'i-lucide-check-circle' : 'i-lucide-x-circle'"
                        :class="log.success ? 'text-green-500' : 'text-red-500'"
                        class="w-4 h-4"
                      />
                    </td>
                    <td class="py-2 px-4 text-right">
                      <UButton
                        :to="`/admin/llm/logs/${log.id}`"
                        color="neutral"
                        variant="ghost"
                        icon="i-lucide-eye"
                        size="xs"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </UCard>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
