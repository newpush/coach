<template>
  <div class="min-h-screen bg-gray-50">
    <nav class="bg-white shadow">
      <div class="container mx-auto px-4">
        <div class="flex justify-between items-center h-16">
          <h1 class="text-xl font-bold">Coach Watts</h1>
          <div class="flex items-center gap-4">
            <span class="text-sm text-gray-600">{{ user?.email }}</span>
            <UButton color="gray" @click="signOut({ callbackUrl: '/login' })">
              Sign Out
            </UButton>
          </div>
        </div>
      </div>
    </nav>
    
    <div class="container mx-auto p-6">
      <div class="mb-6">
        <h2 class="text-2xl font-bold text-gray-900">Welcome to Coach Watts!</h2>
        <p class="mt-2 text-gray-600">Your AI-powered cycling coach is ready to help you optimize your training.</p>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <UCard>
          <template #header>
            <h3 class="font-semibold">Getting Started</h3>
          </template>
          <p class="text-sm text-gray-600">
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
          <p class="text-sm text-gray-600 text-center py-4">
            No data available yet. Connect your Whoop account to see your recovery metrics.
          </p>
        </UCard>
        
        <UCard>
          <template #header>
            <h3 class="font-semibold">Recent Activity</h3>
          </template>
          <p class="text-sm text-gray-600 text-center py-4">
            No workouts found. Connect your Intervals.icu account to sync your training data.
          </p>
        </UCard>
      </div>
      
      <div class="mt-8">
        <UCard>
          <template #header>
            <h3 class="font-semibold">Next Steps</h3>
          </template>
          <ul class="space-y-2 text-sm text-gray-600">
            <li class="flex items-center gap-2">
              <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-green-500" />
              Account created successfully
            </li>
            <li class="flex items-center gap-2">
              <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 text-gray-400" />
              Connect your fitness apps
            </li>
            <li class="flex items-center gap-2">
              <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 text-gray-400" />
              Sync your training data
            </li>
            <li class="flex items-center gap-2">
              <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 text-gray-400" />
              Get your first AI coaching report
            </li>
          </ul>
        </UCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { data, signOut } = useAuth()
const user = computed(() => data.value?.user)

definePageMeta({
  middleware: 'auth'
})
</script>