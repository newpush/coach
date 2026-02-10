<script setup lang="ts">
  import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
  import { Pie } from 'vue-chartjs'

  ChartJS.register(ArcElement, Tooltip, Legend)

  definePageMeta({
    layout: 'admin',
    middleware: ['auth', 'admin']
  })

  const { data: stats, pending } = await useFetch('/api/admin/stats/users')

  useHead({
    title: 'User Statistics'
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

  // Generate consistent colors for countries
  const getCountryColor = (country: string) => {
    // Simple hash to color
    let hash = 0
    for (let i = 0; i < country.length; i++) {
      hash = country.charCodeAt(i) + ((hash << 5) - hash)
    }
    const c = (hash & 0x00ffffff).toString(16).toUpperCase()
    return '#' + '00000'.substring(0, 6 - c.length) + c
  }

  const countryChartData = computed(() => {
    if (!stats.value?.usersByCountry) return { labels: [], datasets: [] }
    return {
      labels: stats.value.usersByCountry.map((c: any) => c.country),
      datasets: [
        {
          backgroundColor: stats.value.usersByCountry.map((c: any) => getCountryColor(c.country)),
          data: stats.value.usersByCountry.map((c: any) => c.count)
        }
      ]
    }
  })
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="User Statistics">
        <template #leading>
          <UButton to="/admin/stats" icon="i-lucide-arrow-left" color="neutral" variant="ghost" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-6 space-y-6">
        <div v-if="pending" class="flex items-center justify-center p-12">
          <UIcon name="i-lucide-loader-2" class="animate-spin h-8 w-8 text-gray-400" />
        </div>

        <template v-else>
          <!-- Top Level Cards -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <UCard>
              <div class="text-center">
                <div class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">
                  Total Users
                </div>
                <div class="text-3xl font-bold">{{ stats?.activity.totalUsers }}</div>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <div
                  class="flex items-center justify-center gap-1 text-xs font-bold text-green-500 uppercase tracking-widest mb-1"
                >
                  Active (30d)
                  <UTooltip text="Users who logged at least one workout in the last 30 days">
                    <UIcon name="i-lucide-info" class="w-3.5 h-3.5 text-gray-400" />
                  </UTooltip>
                </div>
                <div class="text-3xl font-bold">{{ stats?.activity.activeLast30Days }}</div>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <div
                  class="flex items-center justify-center gap-1 text-xs font-bold text-indigo-500 uppercase tracking-widest mb-1"
                >
                  Recurring
                  <UTooltip text="Users with LLM activity on 3+ distinct days in the last 7 days">
                    <UIcon name="i-lucide-info" class="w-3.5 h-3.5 text-gray-400" />
                  </UTooltip>
                </div>
                <div class="text-3xl font-bold">{{ stats?.activity.recurringUsers }}</div>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <div
                  class="flex items-center justify-center gap-1 text-xs font-bold text-red-500 uppercase tracking-widest mb-1"
                >
                  Inactive
                  <UTooltip text="Users who have not logged a workout in the last 30 days">
                    <UIcon name="i-lucide-info" class="w-3.5 h-3.5 text-gray-400" />
                  </UTooltip>
                </div>
                <div class="text-3xl font-bold">{{ stats?.activity.inactiveUsers }}</div>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <div
                  class="flex items-center justify-center gap-1 text-xs font-bold text-blue-500 uppercase tracking-widest mb-1"
                >
                  Retention
                  <UTooltip
                    text="Percentage of total users who are active (logged a workout in the last 30 days)"
                  >
                    <UIcon name="i-lucide-info" class="w-3.5 h-3.5 text-gray-400" />
                  </UTooltip>
                </div>
                <div class="text-3xl font-bold">
                  {{ stats?.activity.retentionRate.toFixed(1) }}%
                </div>
              </div>
            </UCard>
          </div>

          <!-- Daily Charts -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <UCard>
              <template #header>
                <div class="flex justify-between items-center">
                  <h2 class="text-lg font-bold uppercase tracking-tight text-purple-500">
                    New Users
                  </h2>
                  <span class="text-xs text-gray-500">Last 30 Days</span>
                </div>
              </template>
              <div class="h-48">
                <div v-if="stats" class="flex items-end justify-between h-full pt-4 gap-1">
                  <div
                    v-for="day in stats.activity.usersByDay"
                    :key="day.date"
                    class="group relative flex-1 bg-purple-500 rounded-t transition-all hover:bg-purple-600"
                    :style="{
                      height: `${(day.count / (Math.max(...stats.activity.usersByDay.map((d: any) => d.count)) || 1)) * 100}%`
                    }"
                  >
                    <div
                      class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10"
                    >
                      {{ day.date }}: {{ day.count }} users
                    </div>
                  </div>
                </div>
              </div>
            </UCard>

            <UCard>
              <template #header>
                <div class="flex justify-between items-center">
                  <h2 class="text-lg font-bold uppercase tracking-tight text-amber-500">
                    Active Users
                  </h2>
                  <span class="text-xs text-gray-500">Last 30 Days</span>
                </div>
              </template>
              <div class="h-48">
                <div v-if="stats" class="flex items-end justify-between h-full pt-4 gap-1">
                  <div
                    v-for="day in stats.activity.activeUsersByDay"
                    :key="day.date"
                    class="group relative flex-1 bg-amber-500 rounded-t transition-all hover:bg-amber-600"
                    :style="{
                      height: `${(day.count / (Math.max(...stats.activity.activeUsersByDay.map((d: any) => d.count)) || 1)) * 100}%`
                    }"
                  >
                    <div
                      class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10"
                    >
                      {{ day.date }}: {{ day.count }} active
                    </div>
                  </div>
                </div>
              </div>
            </UCard>

            <UCard>
              <template #header>
                <div class="flex justify-between items-center">
                  <h2 class="text-lg font-bold uppercase tracking-tight text-emerald-500">
                    Daily Check-ins
                  </h2>
                  <span class="text-xs text-gray-500">Last 30 Days</span>
                </div>
              </template>
              <div class="h-48">
                <div v-if="stats" class="flex items-end justify-between h-full pt-4 gap-1">
                  <div
                    v-for="day in stats.activity.dailyCheckinsByDay"
                    :key="day.date"
                    class="group relative flex-1 bg-emerald-500 rounded-t transition-all hover:bg-emerald-600"
                    :style="{
                      height: `${(day.count / (Math.max(...stats.activity.dailyCheckinsByDay.map((d: any) => d.count)) || 1)) * 100}%`
                    }"
                  >
                    <div
                      class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10"
                    >
                      {{ day.date }}: {{ day.count }} check-ins
                    </div>
                  </div>
                </div>
              </div>
            </UCard>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Integrations -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Integrations</h3>
              </template>
              <div class="space-y-4">
                <div v-for="item in stats?.integrations" :key="item.provider" class="space-y-1">
                  <div class="flex justify-between text-sm">
                    <span class="capitalize">{{ item.provider }}</span>
                    <span class="font-bold">{{ item.count }}</span>
                  </div>
                  <UProgress
                    :model-value="Number(item.count)"
                    :max="Math.max(Number(stats?.activity.totalUsers || 0), 1)"
                    color="primary"
                  />
                </div>
                <div v-if="!stats?.integrations.length" class="text-center text-gray-400 py-4">
                  No integrations data
                </div>
              </div>
            </UCard>

            <!-- Sharing -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Sharing Activity</h3>
              </template>
              <div class="space-y-4">
                <div
                  class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <span class="font-medium">Total Shared Items</span>
                  <span class="text-2xl font-bold">{{ stats?.sharing.total }}</span>
                </div>
                <div class="space-y-2">
                  <div
                    v-for="item in stats?.sharing.byType"
                    :key="item.type"
                    class="flex justify-between text-sm border-b border-gray-100 dark:border-gray-800 py-2 last:border-0"
                  >
                    <span class="capitalize">{{ item.type.toLowerCase().replace('_', ' ') }}</span>
                    <span class="font-mono">{{ item.count }}</span>
                  </div>
                </div>
              </div>
            </UCard>
          </div>

          <!-- Demographics & Auth -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Auth Providers -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Authentication Methods</h3>
              </template>
              <div class="flex gap-4 flex-wrap">
                <div
                  v-for="item in stats?.authProviders"
                  :key="item.provider"
                  class="px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg flex flex-col items-center min-w-[100px]"
                >
                  <span class="font-bold text-lg">{{ item.count }}</span>
                  <span class="text-xs text-gray-500 uppercase">{{ item.provider }}</span>
                </div>
              </div>
            </UCard>

            <!-- Users by Country -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Users by Country</h3>
              </template>
              <div class="h-64 relative">
                <Pie :data="countryChartData" :options="pieOptions" />
              </div>
              <div class="mt-4 space-y-2 border-t border-gray-100 dark:border-gray-800 pt-4">
                <div
                  v-for="item in stats?.usersByCountry.slice(0, 3)"
                  :key="item.country"
                  class="flex justify-between text-xs"
                >
                  <span class="font-medium truncate">{{ item.country }}</span>
                  <span class="text-gray-500 font-mono">{{ item.count }} users</span>
                </div>
              </div>
            </UCard>
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
