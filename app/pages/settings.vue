<template>
  <UDashboardPanel id="settings">
    <template #header>
      <UDashboardNavbar title="Settings">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <div class="flex gap-2">
          <UButton
            :variant="isActive('/settings/apps') ? 'solid' : 'ghost'"
            :color="isActive('/settings/apps') ? 'primary' : 'neutral'"
            @click="navigateTo('/settings/apps')"
          >
            <UIcon name="i-lucide-plug" class="w-4 h-4 mr-2" />
            Connected Apps
          </UButton>
          <UButton
            :variant="isActive('/settings/ai') ? 'solid' : 'ghost'"
            :color="isActive('/settings/ai') ? 'primary' : 'neutral'"
            @click="navigateTo('/settings/ai')"
          >
            <UIcon name="i-heroicons-sparkles" class="w-4 h-4 mr-2" />
            AI Coach
          </UButton>
          <UButton
            :variant="isActive('/settings/danger') ? 'solid' : 'ghost'"
            :color="isActive('/settings/danger') ? 'primary' : 'neutral'"
            @click="navigateTo('/settings/danger')"
          >
            <UIcon name="i-lucide-alert-triangle" class="w-4 h-4 mr-2" />
            Danger Zone
          </UButton>
        </div>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="p-6" :class="isFullWidth ? 'max-w-full' : 'max-w-4xl mx-auto'">
        <NuxtPage />
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
const route = useRoute()

definePageMeta({
  middleware: 'auth'
})

function isActive(path: string): boolean {
  return route.path === path
}

const isFullWidth = computed(() => {
  return route.path === '/settings/ai' || route.path.startsWith('/settings/llm')
})
</script>