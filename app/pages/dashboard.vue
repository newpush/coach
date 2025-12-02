<template>
  <UDashboardPanel id="dashboard">
    <template #header>
      <UDashboardNavbar title="Dashboard">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-6 space-y-6">
        <div>
          <h2 class="text-2xl font-bold">Welcome to Coach Watts!</h2>
          <p class="mt-2 text-muted">Your AI-powered cycling coach is ready to help you optimize your training.</p>
        </div>
      
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <UCard>
            <template #header>
              <h3 class="font-semibold">Getting Started</h3>
            </template>
            <p class="text-sm text-muted">
              Connect your Intervals.icu and Whoop accounts to start analyzing your training data.
            </p>
            <template #footer>
              <UButton to="/settings" block>
                Connect Apps
              </UButton>
            </template>
          </UCard>
          
          <UCard>
            <template #header>
              <h3 class="font-semibold">Today's Readiness</h3>
            </template>
            <p class="text-sm text-muted text-center py-4">
              No data available yet. Connect your Whoop account to see your recovery metrics.
            </p>
          </UCard>
          
          <UCard>
            <template #header>
              <h3 class="font-semibold">Recent Activity</h3>
            </template>
            <p class="text-sm text-muted text-center py-4">
              No workouts found. Connect your Intervals.icu account to sync your training data.
            </p>
          </UCard>
        </div>
      
        <UCard>
          <template #header>
            <h3 class="font-semibold">Next Steps</h3>
          </template>
          <ul class="space-y-2 text-sm text-muted">
            <li class="flex items-center gap-2">
              <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-success" />
              Account created successfully
            </li>
            <li class="flex items-center gap-2">
              <UIcon name="i-heroicons-arrow-path" class="w-5 h-5" />
              Connect your fitness apps
            </li>
            <li class="flex items-center gap-2">
              <UIcon name="i-heroicons-arrow-path" class="w-5 h-5" />
              Sync your training data
            </li>
            <li class="flex items-center gap-2">
              <UIcon name="i-heroicons-arrow-path" class="w-5 h-5" />
              Get your first AI coaching report
            </li>
          </ul>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})
</script>