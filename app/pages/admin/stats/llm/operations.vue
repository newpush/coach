<script setup lang="ts">
  import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Tooltip,
    Legend,
    Filler
  } from 'chart.js'
  import { Line, Bar, Pie } from 'vue-chartjs'

  ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Tooltip,
    Legend,
    Filler
  )

  definePageMeta({
    layout: 'admin',
    middleware: ['auth', 'admin']
  })

  useHead({
    title: 'LLM Operations'
  })

  const period = ref('yesterday')
  const periods = [
    { label: 'Today', value: 'today' },
    { label: 'Yesterday', value: 'yesterday' },
    { label: 'This Week', value: 'this_week' },
    { label: 'Past Week', value: 'past_week' },
    { label: 'This Month', value: 'this_month' },
    { label: 'All Time', value: 'all_time' }
  ]

  const { data: stats, pending } = await useFetch('/api/admin/stats/llm/operations', {
    query: { period }
  })

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

  // Reasoning Tokens - Now a Pie Chart showing distribution by operation
  const reasoningChartData = computed(() => {
    if (!stats.value?.operations) return { labels: [], datasets: [] }

    // Aggregate reasoning tokens from the operations table data which respects the period
    const opsWithReasoning = stats.value.operations.filter((op) => op.avgReasoningTokens > 0)

    return {
      labels: opsWithReasoning.map((op) => op.name.replace(/_/g, ' ')),
      datasets: [
        {
          backgroundColor: opsWithReasoning.map((op) => getOperationColor(op.name)),
          data: opsWithReasoning.map((op) => op.avgReasoningTokens * op.requests) // Approximate total reasoning tokens
        }
      ]
    }
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

  const stackedCostOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
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
        ticks: { display: false },
        grid: { display: false }
      },
      y: {
        stacked: true,
        beginAtZero: true
      }
    }
  }

  const dailyCostsChartData = computed(() => {
    if (!stats.value?.dailyCosts) return { labels: [], datasets: [] }

    const data = stats.value.dailyCosts
    const dates = [...new Set(data.map((d) => d.date))].sort()
    const operations = [...new Set(data.map((d) => d.operation))]

    return {
      labels: dates.map((d) =>
        d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''
      ),
      datasets: operations.map((op) => ({
        label: op.replace(/_/g, ' '),
        backgroundColor: getOperationColor(op),
        data: dates.map((date) => {
          const entry = data.find((d) => d.date === date && d.operation === op)
          return entry ? entry.cost : 0
        })
      }))
    }
  })
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="LLM Operations">
        <template #leading>
          <UButton to="/admin/stats" icon="i-lucide-arrow-left" color="neutral" variant="ghost" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-6 space-y-6">
        <div class="flex justify-end">
          <USelectMenu
            v-model="period"
            :items="periods"
            value-key="value"
            label-key="label"
            class="w-40"
          >
            <template #leading>
              <UIcon name="i-lucide-calendar" class="w-4 h-4 text-gray-500" />
            </template>
          </USelectMenu>
        </div>

        <div v-if="pending" class="flex items-center justify-center p-12">
          <UIcon name="i-lucide-loader-2" class="animate-spin h-8 w-8 text-gray-400" />
        </div>

        <template v-else>
          <!-- Charts Row -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <UCard>
              <template #header>
                <h3 class="font-semibold">
                  Cost by Operation ({{ periods.find((p) => p.value === period)?.label }})
                </h3>
              </template>
              <div class="h-64 relative">
                <Bar :key="period" :data="dailyCostsChartData" :options="stackedCostOptions" />
              </div>
            </UCard>

            <UCard>
              <template #header>
                <h3 class="font-semibold">Reasoning Token Distribution</h3>
              </template>
              <div class="h-64 relative">
                <Pie :key="period" :data="reasoningChartData" :options="pieOptions" />
              </div>
            </UCard>
          </div>

          <!-- Operations Table -->
          <UCard>
            <template #header>
              <h3 class="font-semibold">Unit Economics by Operation</h3>
            </template>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                <thead>
                  <tr
                    class="text-left text-xs uppercase text-gray-500 bg-gray-50 dark:bg-gray-900/50"
                  >
                    <th class="py-3 px-4">Operation</th>
                    <th class="py-3 px-4 text-right">Total Cost</th>
                    <th class="py-3 px-4 text-right">Requests</th>
                    <th class="py-3 px-4 text-right">Avg Cost/Run</th>
                    <th class="py-3 px-4 text-right">Avg Cost/User</th>
                    <th class="py-3 px-4 text-right">Avg Tokens</th>
                    <th class="py-3 px-4 text-right">Reasoning</th>
                    <th class="py-3 px-4 text-right">Fail Rate</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                  <tr
                    v-for="op in stats?.operations"
                    :key="op.name"
                    class="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <td class="py-2 px-4 font-medium capitalize">
                      {{ op.name.replace(/_/g, ' ') }}
                    </td>
                    <td
                      class="py-2 px-4 text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold"
                    >
                      ${{ op.totalCost.toFixed(2) }}
                    </td>
                    <td class="py-2 px-4 text-right">{{ op.requests.toLocaleString() }}</td>
                    <td class="py-2 px-4 text-right font-mono text-xs">
                      ${{ op.avgCostPerRequest.toFixed(4) }}
                    </td>
                    <td class="py-2 px-4 text-right font-mono text-xs">
                      ${{ op.avgCostPerUser.toFixed(4) }}
                    </td>
                    <td class="py-2 px-4 text-right font-mono text-xs">
                      {{ op.avgTokens.toLocaleString() }}
                    </td>
                    <td class="py-2 px-4 text-right font-mono text-xs text-purple-500">
                      {{ op.avgReasoningTokens.toLocaleString() }}
                    </td>
                    <td class="py-2 px-4 text-right">
                      <span
                        :class="op.failureRate > 5 ? 'text-red-500 font-bold' : 'text-gray-500'"
                      >
                        {{ op.failureRate.toFixed(1) }}%
                      </span>
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
