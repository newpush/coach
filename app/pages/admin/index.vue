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
</script>

<template>
  <div class="flex-1 overflow-y-auto">
    <!-- Header -->
    <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
      <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">Admin Dashboard</h1>
    </div>

    <!-- Body -->
    <div class="p-6 space-y-8">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <UCard>
          <template #header>
            <h3 class="text-xs font-bold text-gray-500 uppercase tracking-widest">Total Users</h3>
          </template>
          <p class="text-3xl font-bold text-gray-900 dark:text-white">
            {{ stats?.totalUsers || 0 }}
          </p>
        </UCard>

        <UCard>
          <template #header>
            <h3 class="text-xs font-bold text-gray-500 uppercase tracking-widest">
              Total Workouts
            </h3>
          </template>
          <p class="text-3xl font-bold text-gray-900 dark:text-white">
            {{ stats?.totalWorkouts || 0 }}
          </p>
        </UCard>

        <UCard>
          <template #header>
            <h3 class="text-xs font-bold text-gray-500 uppercase tracking-widest">AI Cost (MTD)</h3>
          </template>
          <p class="text-3xl font-bold text-gray-900 dark:text-white">
            ${{ stats?.totalAiCost?.toFixed(2) || '0.00' }}
          </p>
        </UCard>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <UCard>
          <template #header>
            <h2 class="text-xl font-bold uppercase tracking-tight">Recent Activity</h2>
          </template>
          <!-- Placeholder for activity list -->
          <div class="text-sm text-gray-500 italic">
            Recent system-wide events will appear here...
          </div>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="text-xl font-bold uppercase tracking-tight">System Status</h2>
          </template>
          <div class="space-y-4">
            <div class="flex justify-between items-center">
              <span class="text-sm">Database</span>
              <span
                class="px-2 py-1 rounded text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                >Online</span
              >
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm">Trigger.dev</span>
              <span
                class="px-2 py-1 rounded text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                >Connected</span
              >
            </div>
          </div>
        </UCard>
      </div>
    </div>
  </div>
</template>
