<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { data, signOut } = useAuth()
const user = computed(() => data.value?.user)

const open = ref(false)

const links = [[{
  label: 'Dashboard',
  icon: 'i-lucide-layout-dashboard',
  to: '/dashboard',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Reports',
  icon: 'i-lucide-file-text',
  to: '/reports',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Settings',
  icon: 'i-lucide-settings',
  to: '/settings',
  onSelect: () => {
    open.value = false
  }
}]] satisfies NavigationMenuItem[][]

const groups = computed(() => [{
  id: 'links',
  label: 'Go to',
  items: links.flat()
}])
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="default"
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <div class="flex items-center gap-2 p-4">
          <div v-if="!collapsed" class="flex items-center gap-2">
            <UIcon name="i-lucide-zap" class="size-6" />
            <span class="font-semibold">Coach Watts</span>
          </div>
          <UIcon v-else name="i-lucide-zap" class="size-6" />
        </div>
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[0]"
          orientation="vertical"
          tooltip
        />
      </template>

      <template #footer="{ collapsed }">
        <div class="p-4 flex items-center gap-3">
          <UAvatar
            v-if="user"
            :alt="user.email || ''"
            size="md"
          />
          <div v-if="!collapsed" class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">{{ user?.email }}</p>
            <UButton
              variant="ghost"
              color="neutral"
              size="xs"
              class="mt-1"
              @click="signOut({ callbackUrl: '/login' })"
            >
              Sign Out
            </UButton>
          </div>
        </div>
      </template>
    </UDashboardSidebar>

    <UDashboardSearch :groups="groups" />

    <slot />
  </UDashboardGroup>
</template>