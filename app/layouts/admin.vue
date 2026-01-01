<script setup lang="ts">
const { data, signOut } = useAuth()
const user = computed(() => data.value?.user)
const route = useRoute()

const links = [
  {
    label: 'Admin Home',
    icon: 'i-lucide-layout-dashboard',
    to: '/admin',
  }, {
    label: 'Users Management',
    icon: 'i-lucide-users',
    to: '/admin/users',
  }, {
    label: 'Application Stats',
    icon: 'i-lucide-bar-chart-3',
    to: '/admin/stats',
  }, {
    label: 'Database Health',
    icon: 'i-lucide-database',
    to: '/admin/database',
  }, {
    label: 'Back to Site',
    icon: 'i-lucide-arrow-left',
    to: '/dashboard',
  }
]
</script>

<template>
  <div class="fixed inset-0 flex overflow-hidden bg-gray-50 dark:bg-gray-950">
    <!-- Sidebar -->
    <div class="hidden md:flex md:w-64 md:flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <!-- Header -->
      <div class="flex h-16 shrink-0 items-center px-4 border-b border-gray-200 dark:border-gray-800">
        <span class="text-lg font-bold text-gray-900 dark:text-white">Admin Panel</span>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        <div v-for="link in links" :key="link.to">
          <NuxtLink
            :to="link.to"
            class="group flex items-center gap-x-3 rounded-md p-2 text-sm font-semibold leading-6"
            :class="[
              route.path === link.to
                ? 'bg-gray-50 text-indigo-600 dark:bg-gray-800 dark:text-white'
                : 'text-gray-700 hover:bg-gray-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white',
            ]"
          >
            <UIcon :name="link.icon" class="h-6 w-6 shrink-0" aria-hidden="true" />
            {{ link.label }}
          </NuxtLink>
        </div>
      </nav>

      <!-- User -->
      <div class="border-t border-gray-200 dark:border-gray-800 p-4">
        <div class="flex items-center gap-3">
          <UAvatar :src="user?.image || undefined" :alt="user?.name || ''" size="sm" />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
              {{ user?.name }}
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
              {{ user?.email }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="flex flex-1 flex-col overflow-hidden">
      <!-- Header Mobile -->
      <div class="md:hidden flex h-16 items-center border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4">
        <UButton
          icon="i-heroicons-bars-3"
          color="neutral"
          variant="ghost"
          class="-ml-2"
          @click="$emit('open-sidebar')"
        />
        <span class="ml-2 text-lg font-bold text-gray-900 dark:text-white">Admin Panel</span>
      </div>

      <!-- Page Content -->
      <main class="flex-1 overflow-y-auto p-4 md:p-8">
        <slot />
      </main>
    </div>
  </div>
</template>
