<script setup lang="ts">
  definePageMeta({
    layout: 'admin',
    middleware: ['auth', 'admin']
  })

  const { data: stats } = await useFetch('/api/admin/stats')

  useHead({
    title: 'Admin Dashboard',
    meta: [{ name: 'description', content: 'Coach Watts system administration and overview.' }]
  })

  // Helper to normalize bar heights
  function getBarHeight(val: number, max: number) {
    if (!max || max === 0) return '2px'
    const pct = (val / max) * 100
    // Ensure at least a visible pixel
    return Math.max(pct, 2) + '%'
  }

  // Computed max values for scaling
  const maxUsers = computed(() => {
    if (!stats.value?.usersByDay) return 0
    return Math.max(...stats.value.usersByDay.map((d: any) => d.count))
  })

  const maxWorkouts = computed(() => {
    if (!stats.value?.workoutsByDay) return 0
    return Math.max(...stats.value.workoutsByDay.map((d: any) => d.count))
  })

  const maxAiCost = computed(() => {
    if (!stats.value?.aiCostHistory) return 0
    return Math.max(...stats.value.aiCostHistory.map((d: any) => d.cost))
  })
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Admin Dashboard">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-6 space-y-8">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <NuxtLink to="/admin/stats/users" class="block">
            <UCard
              class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer relative overflow-hidden group"
            >
              <template #header>
                <h3 class="text-xs font-bold text-gray-500 uppercase tracking-widest">
                  Total Users
                </h3>
              </template>
              <p class="text-3xl font-bold text-gray-900 dark:text-white relative z-10">
                {{ stats?.totalUsers || 0 }}
              </p>
              <!-- Chart -->
              <div
                v-if="stats?.usersByDay"
                class="absolute bottom-0 left-0 right-0 h-12 flex items-end justify-between px-1 gap-0.5 opacity-20 group-hover:opacity-40 transition-opacity"
              >
                <div
                  v-for="(day, idx) in stats.usersByDay"
                  :key="idx"
                  class="flex-1 bg-blue-500 rounded-t-sm transition-all duration-300"
                  :style="{ height: getBarHeight(day.count ?? 0, maxUsers) }"
                  :title="`${day.date}: ${day.count} users`"
                />
              </div>
            </UCard>
          </NuxtLink>

          <NuxtLink to="/admin/stats/workouts" class="block">
            <UCard
              class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer relative overflow-hidden group"
            >
              <template #header>
                <h3 class="text-xs font-bold text-gray-500 uppercase tracking-widest">
                  Total Workouts
                </h3>
              </template>
              <p class="text-3xl font-bold text-gray-900 dark:text-white relative z-10">
                {{ stats?.totalWorkouts || 0 }}
              </p>
              <!-- Chart -->
              <div
                v-if="stats?.workoutsByDay"
                class="absolute bottom-0 left-0 right-0 h-12 flex items-end justify-between px-1 gap-0.5 opacity-20 group-hover:opacity-40 transition-opacity"
              >
                <div
                  v-for="(day, idx) in stats.workoutsByDay"
                  :key="idx"
                  class="flex-1 bg-green-500 rounded-t-sm transition-all duration-300"
                  :style="{ height: getBarHeight(day.count ?? 0, maxWorkouts) }"
                  :title="`${day.date}: ${day.count} workouts`"
                />
              </div>
            </UCard>
          </NuxtLink>

          <NuxtLink to="/admin/stats/llm" class="block">
            <UCard
              class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer relative overflow-hidden group"
            >
              <template #header>
                <h3 class="text-xs font-bold text-gray-500 uppercase tracking-widest">
                  AI Cost (30d)
                </h3>
              </template>
              <p class="text-3xl font-bold text-gray-900 dark:text-white relative z-10">
                ${{ stats?.totalAiCost30d?.toFixed(2) || '0.00' }}
              </p>
              <!-- Chart -->
              <div
                v-if="stats?.aiCostHistory"
                class="absolute bottom-0 left-0 right-0 h-12 flex items-end justify-between px-1 gap-0.5 opacity-20 group-hover:opacity-40 transition-opacity"
              >
                <div
                  v-for="(day, idx) in stats.aiCostHistory"
                  :key="idx"
                  class="flex-1 bg-purple-500 rounded-t-sm transition-all duration-300"
                  :style="{ height: getBarHeight(day.cost ?? 0, maxAiCost) }"
                  :title="`${day.date}: $${(day.cost ?? 0).toFixed(4)}`"
                />
              </div>
            </UCard>
          </NuxtLink>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <UCard class="bg-gray-50/50 dark:bg-gray-800/50">
            <div class="text-center">
              <div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                AI Yesterday
              </div>
              <div class="text-xl font-bold font-mono">
                ${{ stats?.aiCostYesterday?.toFixed(3) || '0.000' }}
              </div>
            </div>
          </UCard>
          <UCard class="bg-blue-50/50 dark:bg-blue-900/10">
            <div class="text-center">
              <div class="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1">
                AI Today
              </div>
              <div class="text-xl font-bold font-mono">
                ${{ stats?.aiCostToday?.toFixed(3) || '0.000' }}
              </div>
            </div>
          </UCard>
          <UCard class="bg-indigo-50/50 dark:bg-indigo-900/10">
            <div class="text-center">
              <div class="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-1">
                AI Forecast
              </div>
              <div class="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
                ${{ stats?.aiCostForecastToday?.toFixed(3) || '0.000' }}
              </div>
            </div>
          </UCard>
          <UCard class="bg-purple-50/50 dark:bg-purple-900/10">
            <div class="text-center">
              <div class="text-[10px] font-bold text-purple-500 uppercase tracking-widest mb-1">
                AI MTD
              </div>
              <div class="text-xl font-bold font-mono text-purple-600 dark:text-purple-400">
                ${{ stats?.aiCostMTD?.toFixed(2) || '0.00' }}
              </div>
            </div>
          </UCard>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <NuxtLink to="/admin/subscriptions" class="block">
            <UCard class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
              <template #header>
                <h3 class="text-xs font-bold text-gray-500 uppercase tracking-widest">
                  Est. Monthly Revenue
                </h3>
              </template>
              <p class="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                ${{ stats?.estimatedMRR?.toFixed(2) || '0.00' }}
              </p>
              <p class="text-xs text-gray-500 mt-2">
                Based on {{ stats?.activeSubscribers || 0 }} active subscribers
              </p>
            </UCard>
          </NuxtLink>

          <UCard>
            <template #header>
              <h3 class="text-xs font-bold text-gray-500 uppercase tracking-widest">
                Active Subscribers
              </h3>
            </template>
            <p class="text-3xl font-bold text-gray-900 dark:text-white">
              {{ stats?.activeSubscribers || 0 }}
            </p>
            <div class="mt-2 flex gap-2">
              <UBadge color="neutral" variant="soft" size="xs">Supporter/Pro Only</UBadge>
            </div>
          </UCard>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <UCard>
            <template #header>
              <h2 class="text-xl font-bold uppercase tracking-tight">Recent Premium Users</h2>
            </template>
            <div class="space-y-3">
              <div
                v-for="user in stats?.recentPremiumUsers"
                :key="user.id"
                class="flex items-center justify-between text-sm border-b border-gray-100 dark:border-gray-800 pb-2 last:border-0 last:pb-0"
              >
                <div>
                  <div class="font-medium text-gray-900 dark:text-white">
                    {{ user.name || 'Unknown' }}
                  </div>
                  <div class="text-xs text-gray-500">{{ user.email }}</div>
                </div>
                <div class="text-right">
                  <UBadge
                    :color="user.subscriptionTier === 'PRO' ? 'primary' : 'neutral'"
                    variant="soft"
                    size="xs"
                  >
                    {{ user.subscriptionTier }}
                  </UBadge>
                  <div class="text-[10px] text-gray-400 mt-0.5">{{ user.subscriptionStatus }}</div>
                </div>
              </div>
              <div
                v-if="!stats?.recentPremiumUsers?.length"
                class="text-center text-gray-500 italic py-4"
              >
                No premium users found
              </div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex justify-between items-center">
                <h2 class="text-xl font-bold uppercase tracking-tight">System Status</h2>
                <UButton
                  to="/admin/debug/env"
                  label="Debug Info"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                />
              </div>
            </template>
            <div class="space-y-4">
              <NuxtLink
                to="/admin/debug/database"
                class="flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-800/50 -mx-2 px-2 py-1 rounded transition-colors group"
              >
                <span class="text-sm">Database</span>
                <div class="flex items-center gap-2">
                  <span
                    class="px-2 py-1 rounded text-xs font-semibold"
                    :class="
                      stats?.systemStatus?.database === 'Online'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                    "
                  >
                    {{ stats?.systemStatus?.database || 'Checking...' }}
                  </span>
                  <UIcon
                    name="i-lucide-chevron-right"
                    class="w-4 h-4 text-gray-400 group-hover:text-gray-600"
                  />
                </div>
              </NuxtLink>
              <NuxtLink
                to="/admin/debug/trigger"
                class="flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-800/50 -mx-2 px-2 py-1 rounded transition-colors group"
              >
                <span class="text-sm">Trigger.dev</span>
                <div class="flex items-center gap-2">
                  <span
                    class="px-2 py-1 rounded text-xs font-semibold"
                    :class="
                      stats?.systemStatus?.trigger === 'Connected'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                    "
                  >
                    {{ stats?.systemStatus?.trigger || 'Checking...' }}
                  </span>
                  <UIcon
                    name="i-lucide-chevron-right"
                    class="w-4 h-4 text-gray-400 group-hover:text-gray-600"
                  />
                </div>
              </NuxtLink>
              <NuxtLink
                to="/admin/queues"
                class="flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-800/50 -mx-2 px-2 py-1 rounded transition-colors group"
              >
                <span class="text-sm">BullMQ Queues</span>
                <div class="flex items-center gap-2">
                  <span
                    class="px-2 py-1 rounded text-xs font-semibold"
                    :class="
                      stats?.systemStatus?.queues === 'Running'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                    "
                  >
                    {{ stats?.systemStatus?.queues || 'Checking...' }}
                  </span>
                  <UIcon
                    name="i-lucide-chevron-right"
                    class="w-4 h-4 text-gray-400 group-hover:text-gray-600"
                  />
                </div>
              </NuxtLink>
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
