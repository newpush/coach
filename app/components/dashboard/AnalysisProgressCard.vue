<template>
  <UCard
    v-if="!hasReports && integrationStore.intervalsConnected"
    class="bg-primary-50 dark:bg-primary-900/10 ring-primary-500/20"
  >
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon
          name="i-heroicons-list-bullet"
          class="w-5 h-5 text-primary-600 dark:text-primary-400"
        />
        <h3 class="font-bold text-sm tracking-tight uppercase">Analysis Progress</h3>
      </div>
    </template>
    <ul class="space-y-4">
      <li class="flex items-start gap-3">
        <UIcon
          name="i-heroicons-check-circle"
          class="w-5 h-5 text-primary-500 mt-0.5 flex-shrink-0"
        />
        <span class="text-sm font-bold text-gray-700 dark:text-gray-200">Account Connected</span>
      </li>
      <li class="flex items-start gap-3">
        <UIcon
          :name="
            integrationStore.intervalsConnected
              ? 'i-heroicons-check-circle'
              : 'i-heroicons-arrow-path'
          "
          :class="
            integrationStore.intervalsConnected
              ? 'text-primary-500 w-5 h-5 mt-0.5 flex-shrink-0'
              : 'w-5 h-5 mt-0.5 flex-shrink-0 animate-spin text-gray-400'
          "
        />
        <span
          class="text-sm font-bold"
          :class="
            integrationStore.intervalsConnected
              ? 'text-gray-700 dark:text-gray-200'
              : 'text-gray-500'
          "
          >Data Sync</span
        >
      </li>
      <li class="flex items-start gap-3">
        <UIcon
          :name="
            integrationStore.intervalsConnected
              ? 'i-heroicons-check-circle'
              : 'i-heroicons-arrow-path'
          "
          :class="
            integrationStore.intervalsConnected
              ? 'text-primary-500 w-5 h-5 mt-0.5 flex-shrink-0'
              : 'w-5 h-5 mt-0.5 flex-shrink-0 text-gray-400'
          "
        />
        <span
          class="text-sm font-bold"
          :class="
            integrationStore.intervalsConnected
              ? 'text-gray-700 dark:text-gray-200'
              : 'text-gray-500'
          "
          >Processing History</span
        >
      </li>
    </ul>
  </UCard>
</template>

<script setup lang="ts">
  const integrationStore = useIntegrationStore()
  const userStore = useUserStore()

  const hasReports = computed(() => userStore.profile?.hasReports ?? false)
</script>
