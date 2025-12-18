<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { data, signOut } = useAuth()
const user = computed(() => data.value?.user)
const route = useRoute()

const open = ref(false)

const links = computed<NavigationMenuItem[][]>(() => [[{
  label: 'Dashboard',
  icon: 'i-lucide-layout-dashboard',
  to: '/dashboard',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Activities',
  icon: 'i-lucide-calendar-days',
  to: '/activities',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Performance',
  icon: 'i-lucide-trending-up',
  to: '/performance',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Training Plan',
  icon: 'i-lucide-calendar',
  to: '/plan',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Workouts',
  icon: 'i-lucide-activity',
  to: '/workouts',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Nutrition',
  icon: 'i-lucide-utensils',
  to: '/nutrition',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Fitness',
  icon: 'i-lucide-heart-pulse',
  to: '/fitness',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Goals',
  icon: 'i-lucide-trophy',
  to: '/profile/goals',
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
  label: 'Coaching',
  icon: 'i-lucide-users',
  to: '/coaching',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'AI Chat',
  icon: 'i-lucide-message-circle',
  to: '/chat',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Data',
  icon: 'i-lucide-database',
  to: '/data',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Settings',
  icon: 'i-lucide-settings',
  to: '/settings',
  onSelect: () => {
    open.value = false
  },
  children: [{
    label: 'Profile',
    icon: 'i-lucide-user',
    to: '/profile/settings',
    active: route.path === '/profile/settings',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Connected Apps',
    icon: 'i-lucide-plug',
    to: '/settings/apps',
    active: route.path === '/settings/apps',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'AI Coach',
    icon: 'i-lucide-sparkles',
    to: '/settings/ai',
    active: route.path === '/settings/ai',
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Danger Zone',
    icon: 'i-lucide-alert-triangle',
    to: '/settings/danger',
    active: route.path === '/settings/danger',
    onSelect: () => {
      open.value = false
    }
  }]
}]])

const groups = computed(() => [{
  id: 'links',
  label: 'Go to',
  items: links.value.flat()
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