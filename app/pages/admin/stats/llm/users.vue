<script setup lang="ts">
  import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    LineElement,
    PointElement,
    Tooltip,
    Legend
  } from 'chart.js'
  import { Bar, Line } from 'vue-chartjs'

  ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    LineElement,
    PointElement,
    Tooltip,
    Legend
  )

  definePageMeta({
    layout: 'admin',
    middleware: ['auth', 'admin']
  })

  useHead({
    title: 'LLM User Economics'
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

  const { data: stats, pending } = await useFetch('/api/admin/stats/llm/users', {
    query: { period }
  })

  const tierChartData = computed(() => {
    if (!stats.value?.tierStats) return { labels: [], datasets: [] }
    return {
      labels: stats.value.tierStats.map((t) => t.tier),
      datasets: [
        {
          label: 'Avg Cost per User',
          backgroundColor: ['#94a3b8', '#3b82f6', '#ec4899'], // gray, blue, pink
          data: stats.value.tierStats.map((t) => t.avgCostPerUser)
        }
      ]
    }
  })

  const distributionChartData = computed(() => {
    if (!stats.value?.costDistribution) return { labels: [], datasets: [] }
    return {
      labels: Object.keys(stats.value.costDistribution),
      datasets: [
        {
          label: 'Users',
          backgroundColor: '#10b981',
          data: Object.values(stats.value.costDistribution)
        }
      ]
    }
  })

  const dailyUsersChartData = computed(() => {
    if (!stats.value?.dailyActiveUsers) return { labels: [], datasets: [] }
    return {
      labels: stats.value.dailyActiveUsers.map((d) =>
        d.date
          ? new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          : ''
      ),
      datasets: [
        {
          label: 'Active Users',
          borderColor: '#8b5cf6',
          backgroundColor: '#8b5cf633',
          fill: true,
          data: stats.value.dailyActiveUsers.map((d) => d.count),
          tension: 0.3
        }
      ]
    }
  })
</script>

<template>
  <UDashboardPanel>
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
          <!-- Comparison Cards -->
          <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
            <UCard class="bg-gray-50/50 dark:bg-gray-800/50">
              <div class="text-center">
                <div class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">
                  Avg Cost Today
                </div>
                <div class="text-xl font-bold font-mono text-gray-900 dark:text-white">
                  ${{ (stats?.averages?.today?.avgCost || 0).toFixed(4) }}
                </div>
                <div class="text-xs text-gray-500 mt-1">
                  {{ stats?.averages?.today?.userCount || 0 }} users
                </div>
              </div>
            </UCard>
            <UCard class="bg-gray-50/50 dark:bg-gray-800/50">
              <div class="text-center">
                <div class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">
                  Avg Cost Yesterday
                </div>
                <div class="text-xl font-bold font-mono text-gray-900 dark:text-white">
                  ${{ (stats?.averages?.yesterday?.avgCost || 0).toFixed(4) }}
                </div>
                <div class="text-xs text-gray-500 mt-1">
                  {{ stats?.averages?.yesterday?.userCount || 0 }} users
                </div>
              </div>
            </UCard>
            <UCard class="bg-blue-50/50 dark:bg-blue-900/10">
              <div class="text-center">
                <div class="text-xs font-bold text-blue-500 uppercase tracking-widest mb-1">
                  Avg Cost This Week
                </div>
                <div class="text-xl font-bold font-mono text-blue-600 dark:text-blue-400">
                  ${{ (stats?.averages?.thisWeek?.avgCost || 0).toFixed(4) }}
                </div>
                <div class="text-xs text-gray-500 mt-1">
                  {{ stats?.averages?.thisWeek?.userCount || 0 }} users
                </div>
              </div>
            </UCard>
            <UCard class="bg-purple-50/50 dark:bg-purple-900/10">
              <div class="text-center">
                <div class="text-xs font-bold text-purple-500 uppercase tracking-widest mb-1">
                  Avg Cost Last Week
                </div>
                <div class="text-xl font-bold font-mono text-purple-600 dark:text-purple-400">
                  ${{ (stats?.averages?.lastWeek?.avgCost || 0).toFixed(4) }}
                </div>
                <div class="text-xs text-gray-500 mt-1">
                  {{ stats?.averages?.lastWeek?.userCount || 0 }} users
                </div>
              </div>
            </UCard>
          </div>

          <!-- Tier Economics -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <UCard>
              <template #header>
                <div class="flex justify-between items-center">
                  <h3 class="font-semibold">Tier Margins (Avg Cost / User)</h3>
                </div>
              </template>
              <div class="h-64 relative">
                <Bar
                  :key="period"
                  :data="tierChartData"
                  :options="{ responsive: true, maintainAspectRatio: false }"
                />
              </div>
            </UCard>

            <UCard>
              <template #header>
                <div class="flex justify-between items-center">
                  <h3 class="font-semibold">Cost Distribution (User Count)</h3>
                </div>
              </template>
              <div class="h-64 relative">
                <Bar
                  :key="period"
                  :data="distributionChartData"
                  :options="{ responsive: true, maintainAspectRatio: false }"
                />
              </div>
            </UCard>
          </div>

          <!-- Daily Active Users -->
          <UCard>
            <template #header>
              <h3 class="font-semibold">Daily Active Users</h3>
            </template>
            <div class="h-64 relative">
              <Line
                :key="period"
                :data="dailyUsersChartData"
                :options="{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: { y: { beginAtZero: true } }
                }"
              />
            </div>
          </UCard>

          <!-- Top Spenders -->
          <UCard>
            <template #header>
              <div class="flex justify-between items-center">
                <h3 class="font-semibold">Top Spenders</h3>
              </div>
            </template>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                <thead>
                  <tr
                    class="text-left text-xs uppercase text-gray-500 bg-gray-50 dark:bg-gray-900/50"
                  >
                    <th class="py-3 px-4">User</th>
                    <th class="py-3 px-4">Tier</th>
                    <th class="py-3 px-4 text-right">Total Cost</th>
                    <th class="py-3 px-4 text-right">Total Tokens</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                  <tr
                    v-for="user in stats?.topSpenders"
                    :key="user.id || 'unknown'"
                    class="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <td class="py-2 px-4">
                      <div class="font-medium text-gray-900 dark:text-white">
                        {{ user.name || 'Unknown' }}
                      </div>
                      <div class="text-xs text-gray-500">{{ user.email }}</div>
                    </td>
                    <td class="py-2 px-4">
                      <UBadge
                        :color="
                          user.tier === 'PRO'
                            ? 'primary'
                            : user.tier === 'SUPPORTER'
                              ? 'info'
                              : 'neutral'
                        "
                        size="xs"
                      >
                        {{ user.tier }}
                      </UBadge>
                    </td>
                    <td class="py-2 px-4 text-right font-mono text-emerald-600 font-bold">
                      ${{ user.totalCost.toFixed(2) }}
                    </td>
                    <td class="py-2 px-4 text-right font-mono text-xs">
                      {{ user.totalTokens.toLocaleString() }}
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
