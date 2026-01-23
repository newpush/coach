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
    PointElement
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
    PointElement
  )

  definePageMeta({
    layout: 'admin',
    middleware: ['auth', 'admin']
  })

  const { data: stats, pending } = await useFetch('/api/admin/stats/llm')

  useHead({
    title: 'LLM Intelligence Stats'
  })

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
      'claude-3-5-sonnet': '#f59e0b' // Amber
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
  <div class="flex-1 overflow-y-auto">
    <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-4">
      <UButton to="/admin/stats" icon="i-lucide-arrow-left" color="neutral" variant="ghost" />
      <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">LLM Intelligence Stats</h1>
    </div>

    <div class="p-6 space-y-6">
      <div v-if="pending" class="flex items-center justify-center p-12">
        <UIcon name="i-lucide-loader-2" class="animate-spin h-8 w-8 text-gray-400" />
      </div>

      <template v-else>
        <!-- Tokens Breakdown -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <UCard class="bg-blue-50/50 dark:bg-blue-900/10">
            <div class="text-center">
              <div class="text-xs font-bold text-blue-500 uppercase tracking-widest mb-1">
                Total Tokens
              </div>
              <div class="text-2xl font-bold font-mono">
                {{ stats?.tokens.total.toLocaleString() }}
              </div>
            </div>
          </UCard>
          <UCard class="bg-indigo-50/50 dark:bg-indigo-900/10">
            <div class="text-center">
              <div class="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-1">
                Prompt Tokens
              </div>
              <div class="text-2xl font-bold font-mono">
                {{ stats?.tokens.prompt.toLocaleString() }}
              </div>
              <div class="text-xs text-gray-500 mt-1">
                {{ (((stats?.tokens.prompt || 0) / (stats?.tokens.total || 1)) * 100).toFixed(0) }}%
                of total
              </div>
            </div>
          </UCard>
          <UCard class="bg-purple-50/50 dark:bg-purple-900/10">
            <div class="text-center">
              <div class="text-xs font-bold text-purple-500 uppercase tracking-widest mb-1">
                Completion Tokens
              </div>
              <div class="text-2xl font-bold font-mono">
                {{ stats?.tokens.completion.toLocaleString() }}
              </div>
              <div class="text-xs text-gray-500 mt-1">
                {{
                  (((stats?.tokens.completion || 0) / (stats?.tokens.total || 1)) * 100).toFixed(0)
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
                <span class="font-medium capitalize">{{ item.operation.replace(/_/g, ' ') }}</span>
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
              <Bar :data="dailyToolCallsChartData" :options="stackedBarOptions" />
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

        <UCard>
          <template #header>
            <h3 class="font-semibold">Daily LLM Requests from Chat</h3>
          </template>
          <div class="h-64 relative">
            <Line :data="dailyChatRequestsChartData" :options="lineOptions" />
          </div>
        </UCard>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Recent Failures -->
          <UCard>
            <template #header>
              <h3 class="font-semibold text-red-500">Recent Failures</h3>
            </template>
            <div class="space-y-3">
              <div
                v-for="fail in stats?.recentFailures"
                :key="fail.id"
                class="text-sm p-3 bg-red-50 dark:bg-red-900/10 rounded-lg"
              >
                <div class="flex justify-between mb-1">
                  <span class="font-bold font-mono text-xs">{{
                    fail.errorType || 'Unknown Error'
                  }}</span>
                  <span class="text-xs text-gray-500">{{
                    new Date(fail.createdAt).toLocaleDateString()
                  }}</span>
                </div>
                <div class="text-gray-700 dark:text-gray-300 line-clamp-2 text-xs italic">
                  {{ fail.errorMessage }}
                </div>
                <div class="mt-2 flex gap-2">
                  <UBadge size="xs" color="neutral">{{ fail.operation }}</UBadge>
                  <UBadge size="xs" color="neutral">{{ fail.model }}</UBadge>
                </div>
              </div>
              <div v-if="!stats?.recentFailures.length" class="text-center text-gray-400 py-4">
                No recent failures
              </div>
            </div>
          </UCard>

          <!-- Top Spenders -->
          <UCard>
            <template #header>
              <h3 class="font-semibold">Top Spenders (30d)</h3>
            </template>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr class="text-left text-xs uppercase text-gray-500">
                    <th class="py-2">User</th>
                    <th class="py-2 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
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
  </div>
</template>
