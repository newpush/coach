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
            :variant="isActive('/settings/coaching') ? 'solid' : 'ghost'"
            :color="isActive('/settings/coaching') ? 'primary' : 'neutral'"
            @click="navigateTo('/settings/coaching')"
          >
            <UIcon name="i-lucide-users-round" class="w-4 h-4 mr-2" />
            Coaching
          </UButton>
          <UButton
            :variant="isActive('/settings/developer') ? 'solid' : 'ghost'"
            :color="isActive('/settings/developer') ? 'primary' : 'neutral'"
            @click="navigateTo('/settings/developer')"
          >
            <UIcon name="i-heroicons-code-bracket" class="w-4 h-4 mr-2" />
            Developer
          </UButton>
          <UButton
            :variant="isActive('/settings/danger') ? 'solid' : 'ghost'"
            :color="isActive('/settings/danger') ? 'primary' : 'neutral'"
            @click="navigateTo('/settings/danger')"
          >
            <UIcon name="i-lucide-alert-triangle" class="w-4 h-4 mr-2" />
            Danger Zone
          </UButton>
          <UButton
            :variant="isActive('/settings/changelog') ? 'solid' : 'ghost'"
            :color="isActive('/settings/changelog') ? 'primary' : 'neutral'"
            @click="navigateTo('/settings/changelog')"
          >
            <UIcon name="i-lucide-list" class="w-4 h-4 mr-2" />
            Changelog
          </UButton>
        </div>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="p-4 sm:p-6" :class="isFullWidth ? 'max-w-full' : 'max-w-4xl mx-auto'">
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

  useHead({
    title: 'Settings',
    meta: [
      {
        name: 'description',
        content: 'Manage your Coach Watts account, connected apps, and AI preferences.'
      }
    ]
  })

  function isActive(path: string): boolean {
    return route.path === path
  }

  const isFullWidth = computed(() => {
    return route.path === '/settings/ai' || route.path.startsWith('/settings/llm')
  })
</script>
